import {
  DEVTOOLS_PROTOCOL_VERSION,
  serialize,
  type AppSnapshot,
  type ComponentDetailSnapshot,
  type ComponentNodeSnapshot,
  type DevtoolsSnapshot,
  type SerializedValue,
  type SourceLocation,
  type TimelineEvent,
} from "@elfui/devtools-shared";

export interface DevtoolsComponentInput {
  id?: string;
  host: HTMLElement;
  appId?: string | null;
  parentId?: string | null;
  parentHost?: HTMLElement | null;
  tag: string;
  displayName?: string;
  shadowMode?: "open" | "closed" | "none";
  source?: SourceLocation;
  props?: () => Record<string, unknown>;
  attrs?: () => Record<string, unknown>;
  setup?: () => Record<string, unknown>;
  exposed?: () => Record<string, unknown>;
}

export type ElfUIRuntimeEvent =
  | {
      type: "app:mount";
      app: { id: string; label: string; root: HTMLElement };
    }
  | { type: "app:unmount"; appId: string }
  | { type: "component:mount"; component: DevtoolsComponentInput }
  | { type: "component:update"; host: HTMLElement }
  | { type: "component:unmount"; host: HTMLElement }
  | { type: "component:error"; host: HTMLElement; error: unknown }
  | {
      type: "component:emit";
      host: HTMLElement;
      event: string;
      args: unknown[];
    };

export type ElfUIReactivityEvent =
  | {
      type: "reactivity:trigger";
      id: string;
      parentTriggerId: string | null;
      targetId: string;
      targetName?: string;
      key: string;
      effects: Array<{
        effectId: string;
        componentId: string | null;
        debug?: EffectDebugInfo;
      }>;
    }
  | {
      type: "reactivity:effect";
      triggerId: string;
      effectId: string;
      componentId: string | null;
      debug?: EffectDebugInfo;
      duration: number;
    };

interface EffectDebugInfo {
  kind: string;
  name?: string;
  source?: { line: number; column: number };
}

export interface DevtoolsBridgeOptions {
  now?: () => number;
  maxTimelineEvents?: number;
  maxTimelineEventsPerWindow?: number;
  timelineWindowMs?: number;
  aggregateWindowMs?: number;
}

export interface TimelineStatus {
  paused: boolean;
  droppedEvents: number;
  aggregatedEvents: number;
}

export type DevtoolsListener = (event: TimelineEvent) => void;

interface AppRecord {
  id: string;
  label: string;
  rootIds: Set<string>;
}

interface ComponentRecord {
  id: string;
  appId: string;
  parentId: string | null;
  host: WeakRef<HTMLElement>;
  input: Omit<DevtoolsComponentInput, "host" | "parentHost">;
  mounted: boolean;
  children: Set<string>;
  updateCount: number;
  lastUpdatedAt: number | null;
  error: unknown | null;
}

const elementParent = (element: HTMLElement): HTMLElement | null => {
  let current: Node | null = element.parentNode;
  while (current) {
    if (current instanceof HTMLElement) return current;
    if (current instanceof ShadowRoot && current.host instanceof HTMLElement)
      return current.host;
    current = current.parentNode;
  }
  return null;
};

const snapshotValue = (
  read?: () => Record<string, unknown>,
): SerializedValue => {
  try {
    return serialize(read?.() ?? {});
  } catch (error) {
    return serialize(error instanceof Error ? error : new Error(String(error)));
  }
};

export class ElfUIDevtoolsBridge {
  private readonly apps = new Map<string, AppRecord>();
  private readonly components = new Map<string, ComponentRecord>();
  private readonly componentIds = new WeakMap<HTMLElement, string>();
  private readonly listeners = new Set<DevtoolsListener>();
  private readonly timeline: TimelineEvent[] = [];
  private readonly now: () => number;
  private readonly maxTimelineEvents: number;
  private readonly maxTimelineEventsPerWindow: number;
  private readonly timelineWindowMs: number;
  private readonly aggregateWindowMs: number;
  private timelinePaused = false;
  private droppedTimelineEvents = 0;
  private aggregatedTimelineEvents = 0;
  private timelineWindowStartedAt = 0;
  private timelineWindowEventCount = 0;
  private lastAggregationKey: string | null = null;
  private lastAggregationCount = 1;
  private nextAppId = 1;
  private nextComponentId = 1;
  private nextEventId = 1;

  public constructor(options: DevtoolsBridgeOptions = {}) {
    this.now = options.now ?? Date.now;
    this.maxTimelineEvents = options.maxTimelineEvents ?? 1000;
    this.maxTimelineEventsPerWindow = options.maxTimelineEventsPerWindow ?? 500;
    this.timelineWindowMs = options.timelineWindowMs ?? 1000;
    this.aggregateWindowMs = options.aggregateWindowMs ?? 16;
  }

  public registerComponent(input: DevtoolsComponentInput): string {
    const existingId = this.componentIds.get(input.host);
    if (existingId) return existingId;

    const parentId =
      input.parentId !== undefined
        ? input.parentId
        : this.findParentId(input.host, input.parentHost);
    const parent = parentId ? this.components.get(parentId) : undefined;
    const appId =
      parent?.appId ??
      input.appId ??
      this.createApp(input.displayName ?? input.tag);
    this.ensureApp(appId, input.displayName ?? input.tag);
    const requestedId = input.id;
    const id =
      requestedId && !this.components.has(requestedId)
        ? requestedId
        : `component:${this.nextComponentId++}`;
    const { host, parentHost: _parentHost, ...storedInput } = input;
    void _parentHost;
    const record: ComponentRecord = {
      id,
      appId,
      parentId,
      host: new WeakRef(host),
      input: storedInput,
      mounted: true,
      children: new Set(),
      updateCount: 0,
      lastUpdatedAt: null,
      error: null,
    };
    this.components.set(id, record);
    this.componentIds.set(host, id);
    if (parent) parent.children.add(id);
    else if (!parentId) this.apps.get(appId)?.rootIds.add(id);
    for (const child of this.components.values()) {
      if (child.parentId === id) record.children.add(child.id);
    }
    this.emit({
      appId,
      componentId: id,
      layer: "component",
      type: "mount",
      summary: `${input.tag} mounted`,
    });
    return id;
  }

  public unregisterComponent(host: HTMLElement): void {
    const id = this.componentIds.get(host);
    if (!id) return;
    this.removeComponent(id);
  }

  private removeComponent(id: string): void {
    const record = this.components.get(id);
    if (!record) return;

    for (const childId of Array.from(record.children)) {
      this.removeComponent(childId);
    }
    const parent = record.parentId
      ? this.components.get(record.parentId)
      : undefined;
    if (parent) parent.children.delete(id);
    else this.apps.get(record.appId)?.rootIds.delete(id);
    this.components.delete(id);
    const host = record.host.deref();
    if (host) this.componentIds.delete(host);
    this.emit({
      appId: record.appId,
      componentId: id,
      layer: "component",
      type: "unmount",
      summary: `${record.input.tag} unmounted`,
    });
  }

  public notifyUpdate(host: HTMLElement): void {
    const record = this.findComponent(host);
    if (!record) return;
    record.updateCount += 1;
    record.lastUpdatedAt = this.now();
    this.emit({
      appId: record.appId,
      componentId: record.id,
      layer: "component",
      type: "update",
      summary: `${record.input.tag} updated`,
    });
  }

  public notifyError(host: HTMLElement, error: unknown): void {
    const record = this.findComponent(host);
    if (!record) return;
    record.error = error;
    this.emit({
      appId: record.appId,
      componentId: record.id,
      layer: "component",
      type: "error",
      summary: `${record.input.tag} error`,
      data: serialize(
        error instanceof Error ? error : new Error(String(error)),
      ),
    });
  }

  public registerApp(id: string, label: string): void {
    this.ensureApp(id, label);
  }

  public unregisterApp(id: string): void {
    for (const component of Array.from(this.components.values())) {
      if (component.appId === id) this.removeComponent(component.id);
    }
    this.apps.delete(id);
  }

  public emitRuntimeEvent(event: ElfUIRuntimeEvent): void {
    switch (event.type) {
      case "app:mount":
        this.registerApp(event.app.id, event.app.label);
        break;
      case "app:unmount":
        this.unregisterApp(event.appId);
        break;
      case "component:mount":
        this.registerComponent(event.component);
        break;
      case "component:update":
        this.notifyUpdate(event.host);
        break;
      case "component:unmount":
        this.unregisterComponent(event.host);
        break;
      case "component:error":
        this.notifyError(event.host, event.error);
        break;
      case "component:emit": {
        const component = this.findComponent(event.host);
        if (!component) break;
        this.emit({
          appId: component.appId,
          componentId: component.id,
          layer: "events",
          type: event.event,
          summary: `${component.input.tag} emitted ${event.event}`,
          data: serialize(event.args),
        });
        break;
      }
    }
  }

  public emitReactivityEvent(event: ElfUIReactivityEvent): void {
    const componentIds =
      event.type === "reactivity:trigger"
        ? event.effects.flatMap((effect) =>
            effect.componentId ? [effect.componentId] : [],
          )
        : event.componentId
          ? [event.componentId]
          : [];
    const component = componentIds
      .map((id) => this.components.get(id))
      .find((record) => record !== undefined);
    if (!component) return;

    const firstDebug =
      event.type === "reactivity:trigger"
        ? event.effects.find((effect) => effect.debug)?.debug
        : event.debug;
    const binding = firstDebug?.name ? ` → ${firstDebug.name}` : "";
    const location = firstDebug?.source
      ? ` @ ${component.input.source?.file ? `${component.input.source.file}:` : ""}${firstDebug.source.line}:${firstDebug.source.column}`
      : "";
    const summary =
      event.type === "reactivity:trigger"
        ? `${event.targetName ?? event.targetId}.${event.key}${binding} triggered ${event.effects.length} effect${event.effects.length === 1 ? "" : "s"}${location}`
        : `${firstDebug?.name ?? event.effectId} ran in ${event.duration.toFixed(2)}ms${location}`;
    this.emit({
      appId: component.appId,
      componentId: component.id,
      layer: "reactivity",
      type: event.type === "reactivity:trigger" ? "trigger" : "effect",
      summary,
      data: serialize(event),
    });
  }

  public getSnapshot(): DevtoolsSnapshot {
    return {
      protocolVersion: DEVTOOLS_PROTOCOL_VERSION,
      apps: Array.from(this.apps.values(), (app) => this.toAppSnapshot(app)),
      components: Array.from(this.components.values(), (component) =>
        this.toNodeSnapshot(component),
      ),
    };
  }

  public getComponentDetail(id: string): ComponentDetailSnapshot | null {
    const component = this.components.get(id);
    if (!component) return null;
    return {
      ...this.toNodeSnapshot(component),
      props: snapshotValue(component.input.props),
      attrs: snapshotValue(component.input.attrs),
      setup: snapshotValue(component.input.setup),
      exposed: snapshotValue(component.input.exposed),
      lifecycle: {
        updateCount: component.updateCount,
        lastUpdatedAt: component.lastUpdatedAt,
        error: component.error === null ? null : serialize(component.error),
      },
    };
  }

  public getComponentId(host: HTMLElement): string | null {
    return this.componentIds.get(host) ?? null;
  }

  public getTimeline(): readonly TimelineEvent[] {
    return this.timeline;
  }

  public isTimelineRecording(): boolean {
    return !this.timelinePaused;
  }

  public getTimelineStatus(): TimelineStatus {
    return {
      paused: this.timelinePaused,
      droppedEvents: this.droppedTimelineEvents,
      aggregatedEvents: this.aggregatedTimelineEvents,
    };
  }

  public setTimelinePaused(paused: boolean): void {
    this.timelinePaused = paused;
  }

  public clearTimeline(): void {
    this.timeline.length = 0;
    this.droppedTimelineEvents = 0;
    this.aggregatedTimelineEvents = 0;
    this.timelineWindowEventCount = 0;
    this.timelineWindowStartedAt = this.now();
    this.lastAggregationKey = null;
    this.lastAggregationCount = 1;
  }

  public on(listener: DevtoolsListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private createApp(label: string): string {
    const id = `app:${this.nextAppId++}`;
    this.apps.set(id, { id, label, rootIds: new Set() });
    return id;
  }

  private ensureApp(id: string, label: string): AppRecord {
    const existing = this.apps.get(id);
    if (existing) return existing;
    const app = { id, label, rootIds: new Set<string>() };
    this.apps.set(id, app);
    return app;
  }

  private findParentId(
    host: HTMLElement,
    explicitParent?: HTMLElement | null,
  ): string | null {
    if (explicitParent) {
      const explicitId = this.componentIds.get(explicitParent);
      if (explicitId) return explicitId;
    }
    let parent = elementParent(host);
    while (parent) {
      const id = this.componentIds.get(parent);
      if (id) return id;
      parent = elementParent(parent);
    }
    return null;
  }

  private findComponent(host: HTMLElement): ComponentRecord | null {
    const id = this.componentIds.get(host);
    return id ? (this.components.get(id) ?? null) : null;
  }

  private toAppSnapshot(app: AppRecord): AppSnapshot {
    return { id: app.id, label: app.label, rootIds: Array.from(app.rootIds) };
  }

  private toNodeSnapshot(component: ComponentRecord): ComponentNodeSnapshot {
    return {
      id: component.id,
      appId: component.appId,
      parentId: component.parentId,
      tag: component.input.tag,
      displayName: component.input.displayName ?? component.input.tag,
      mounted: component.mounted,
      shadowMode: component.input.shadowMode ?? "open",
      children: Array.from(component.children),
      ...(component.input.source ? { source: component.input.source } : {}),
    };
  }

  private emit(event: Omit<TimelineEvent, "id" | "at">): void {
    if (this.timelinePaused) {
      this.droppedTimelineEvents += 1;
      return;
    }
    const at = this.now();
    if (at - this.timelineWindowStartedAt >= this.timelineWindowMs) {
      this.timelineWindowStartedAt = at;
      this.timelineWindowEventCount = 0;
    }
    if (this.timelineWindowEventCount >= this.maxTimelineEventsPerWindow) {
      this.droppedTimelineEvents += 1;
      return;
    }
    this.timelineWindowEventCount += 1;

    const aggregateKey =
      event.layer === "reactivity"
        ? `${event.appId}:${event.componentId ?? ""}:${event.type}:${event.summary.replace(/\d+(?:\.\d+)?ms/g, "<duration>")}`
        : null;
    const previous = this.timeline.at(-1);
    if (
      aggregateKey &&
      aggregateKey === this.lastAggregationKey &&
      previous &&
      at - previous.at <= this.aggregateWindowMs
    ) {
      this.lastAggregationCount += 1;
      this.aggregatedTimelineEvents += 1;
      previous.at = at;
      previous.summary = `${event.summary} ×${this.lastAggregationCount}`;
      if (event.data) previous.data = event.data;
      for (const listener of this.listeners) listener(previous);
      return;
    }

    const timelineEvent: TimelineEvent = {
      id: `event:${this.nextEventId++}`,
      at,
      ...event,
    };
    this.lastAggregationKey = aggregateKey;
    this.lastAggregationCount = 1;
    this.timeline.push(timelineEvent);
    if (this.timeline.length > this.maxTimelineEvents)
      this.timeline.splice(0, this.timeline.length - this.maxTimelineEvents);
    for (const listener of this.listeners) listener(timelineEvent);
  }
}

export const createDevtoolsBridge = (
  options?: DevtoolsBridgeOptions,
): ElfUIDevtoolsBridge => new ElfUIDevtoolsBridge(options);

export const DEVTOOLS_GLOBAL_HOOK = "__ELFUI_DEVTOOLS_GLOBAL_HOOK__";

export const installGlobalDevtoolsBridge = (
  bridge: ElfUIDevtoolsBridge,
  target: Record<string, unknown> = globalThis,
): (() => void) => {
  const previous = target[DEVTOOLS_GLOBAL_HOOK];
  target[DEVTOOLS_GLOBAL_HOOK] = bridge;
  return () => {
    if (target[DEVTOOLS_GLOBAL_HOOK] !== bridge) return;
    if (previous === undefined) delete target[DEVTOOLS_GLOBAL_HOOK];
    else target[DEVTOOLS_GLOBAL_HOOK] = previous;
  };
};
