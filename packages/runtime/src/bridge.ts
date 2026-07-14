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
  host: HTMLElement;
  appId?: string | null;
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

export interface DevtoolsBridgeOptions {
  now?: () => number;
  maxTimelineEvents?: number;
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
  input: DevtoolsComponentInput;
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
  private nextAppId = 1;
  private nextComponentId = 1;
  private nextEventId = 1;

  public constructor(options: DevtoolsBridgeOptions = {}) {
    this.now = options.now ?? Date.now;
    this.maxTimelineEvents = options.maxTimelineEvents ?? 1000;
  }

  public registerComponent(input: DevtoolsComponentInput): string {
    const existingId = this.componentIds.get(input.host);
    if (existingId) return existingId;

    const parentId = this.findParentId(input.host, input.parentHost);
    const parent = parentId ? this.components.get(parentId) : undefined;
    const appId =
      parent?.appId ??
      input.appId ??
      this.createApp(input.displayName ?? input.tag);
    this.ensureApp(appId, input.displayName ?? input.tag);
    const id = `component:${this.nextComponentId++}`;
    const record: ComponentRecord = {
      id,
      appId,
      parentId,
      input,
      mounted: true,
      children: new Set(),
      updateCount: 0,
      lastUpdatedAt: null,
      error: null,
    };
    this.components.set(id, record);
    this.componentIds.set(input.host, id);
    if (parent) parent.children.add(id);
    else this.apps.get(appId)?.rootIds.add(id);
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
    const record = this.components.get(id);
    if (!record) return;

    const parent = record.parentId
      ? this.components.get(record.parentId)
      : undefined;
    if (parent) parent.children.delete(id);
    else this.apps.get(record.appId)?.rootIds.delete(id);
    this.components.delete(id);
    this.componentIds.delete(host);
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
      if (component.appId === id)
        this.unregisterComponent(component.input.host);
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
    const timelineEvent: TimelineEvent = {
      id: `event:${this.nextEventId++}`,
      at: this.now(),
      ...event,
    };
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
