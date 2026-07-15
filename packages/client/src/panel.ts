import type {
  ComponentDetailSnapshot,
  DevtoolsSnapshot,
  SerializedValue,
  TimelineEvent,
  TimelineStatusSnapshot,
} from "@elfui/devtools-shared";
import type { ElfUIDevtoolsBridge } from "@elfui/devtools-runtime";

import { ComponentInspector } from "./index";
import type { DevtoolsRpcClient } from "./rpc-client";
import { openSourceInEditor, type OpenSourceInEditor } from "./source";

export const DEVTOOLS_LAYOUT_STORAGE_KEY = "elfui-devtools:layout:v1";

type DockPosition = "floating" | "bottom" | "left" | "right";

interface PanelLayout {
  dock: DockPosition;
  width: number;
  height: number;
}

interface ResizeStart {
  x: number;
  y: number;
  width: number;
  height: number;
}

const defaultLayout: PanelLayout = {
  dock: "floating",
  width: 420,
  height: 560,
};

const isDockPosition = (value: unknown): value is DockPosition =>
  value === "floating" ||
  value === "bottom" ||
  value === "left" ||
  value === "right";

const finiteDimension = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const readLayout = (storage: Storage | null): PanelLayout => {
  if (!storage) return { ...defaultLayout };
  try {
    const value = JSON.parse(
      storage.getItem(DEVTOOLS_LAYOUT_STORAGE_KEY) ?? "null",
    ) as Partial<PanelLayout> | null;
    return {
      dock: isDockPosition(value?.dock) ? value.dock : defaultLayout.dock,
      width: finiteDimension(value?.width, defaultLayout.width),
      height: finiteDimension(value?.height, defaultLayout.height),
    };
  } catch {
    return { ...defaultLayout };
  }
};

const storageFor = (document: Document): Storage | null => {
  try {
    return document.defaultView?.localStorage ?? null;
  } catch {
    return null;
  }
};

const valueText = (value: SerializedValue): string => {
  if (value.kind === "primitive") return JSON.stringify(value.value);
  if (value.kind === "object")
    return `{ ${value.entries.map(({ key, value: item }) => `${key}: ${valueText(item)}`).join(", ")} }`;
  if (value.kind === "array")
    return `[${value.items.map(valueText).join(", ")}]`;
  if (value.kind === "map" || value.kind === "set")
    return `[${value.kind}(${value.entries.length})]`;
  return "preview" in value ? value.preview : `[${value.kind}]`;
};

const styles = `
  :host { color-scheme: light dark; }
  * { box-sizing: border-box; }
  button, select { font: inherit; }
  .launcher {
    position: fixed;
    left: 50%;
    bottom: 12px;
    display: flex;
    transform: translateX(-50%);
    overflow: hidden;
    padding: 3px;
    border: 1px solid rgb(148 163 184 / 35%);
    border-radius: 999px;
    background: rgb(255 255 255 / 94%);
    box-shadow: 0 8px 28px rgb(15 23 42 / 20%);
    backdrop-filter: blur(12px);
    pointer-events: auto;
  }
  .launcher button {
    display: grid;
    width: 34px;
    height: 28px;
    place-items: center;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: #64748b;
    cursor: pointer;
  }
  .launcher button:hover,
  .launcher button[aria-pressed="true"] {
    background: #e0f2fe;
    color: #0284c7;
  }
  .brand { font-weight: 800; letter-spacing: -0.08em; }
  .target { font-size: 20px; line-height: 1; }
  .panel {
    position: fixed;
    display: flex;
    width: min(var(--elfui-devtools-width, 420px), calc(100vw - 32px));
    height: min(var(--elfui-devtools-height, 560px), calc(100vh - 72px));
    max-width: 100vw;
    max-height: 100vh;
    overflow: hidden;
    border: 1px solid #334155;
    border-radius: 12px;
    background: #0f172a;
    color: #e2e8f0;
    box-shadow: 0 18px 48px rgb(0 0 0 / 42%);
    font: 12px/1.5 ui-sans-serif, system-ui, sans-serif;
    pointer-events: auto;
  }
  .panel[data-dock="floating"] { right: 16px; bottom: 56px; }
  .panel[data-dock="bottom"] {
    right: 0;
    bottom: 0;
    left: 0;
    width: 100vw;
    height: min(var(--elfui-devtools-height, 420px), 90vh);
    border-radius: 12px 12px 0 0;
  }
  .panel[data-dock="left"],
  .panel[data-dock="right"] {
    top: 0;
    bottom: 0;
    width: min(var(--elfui-devtools-width, 420px), 90vw);
    height: 100vh;
    border-radius: 0;
  }
  .panel[data-dock="left"] { left: 0; }
  .panel[data-dock="right"] { right: 0; }
  .panel[data-fullscreen="true"] {
    inset: 0;
    width: 100vw;
    height: 100vh;
    max-width: none;
    max-height: none;
    border-radius: 0;
  }
  .panel[hidden] { display: none; }
  .resize-handle {
    position: absolute;
    z-index: 2;
    background: transparent;
    touch-action: none;
  }
  .panel[data-dock="floating"] .resize-handle {
    right: 0;
    bottom: 0;
    width: 18px;
    height: 18px;
    cursor: nwse-resize;
  }
  .panel[data-dock="bottom"] .resize-handle {
    top: 0;
    right: 0;
    left: 0;
    height: 7px;
    cursor: ns-resize;
  }
  .panel[data-dock="left"] .resize-handle {
    top: 0;
    right: 0;
    bottom: 0;
    width: 7px;
    cursor: ew-resize;
  }
  .panel[data-dock="right"] .resize-handle {
    top: 0;
    bottom: 0;
    left: 0;
    width: 7px;
    cursor: ew-resize;
  }
  .panel[data-fullscreen="true"] .resize-handle { display: none; }
  .header {
    position: sticky;
    top: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    border-bottom: 1px solid #334155;
    background: #111c31;
  }
  .header strong { font-size: 13px; }
  .header-actions { display: flex; align-items: center; gap: 5px; }
  .header-actions button,
  .header-actions select {
    min-height: 25px;
    border: 1px solid #475569;
    border-radius: 5px;
    background: #1e293b;
    color: #cbd5e1;
  }
  .header-actions button { padding: 2px 7px; cursor: pointer; }
  .header-actions select { padding: 1px 4px; }
  .close {
    border: 0 !important;
    background: transparent !important;
    color: #94a3b8;
    cursor: pointer;
  }
  .content { width: 100%; height: 100%; overflow: auto; padding: 10px; }
  .section { margin: 0 0 10px; }
  .section-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .section-title { margin: 0 0 5px; color: #94a3b8; font-weight: 600; text-transform: uppercase; }
  .timeline-actions { display: flex; gap: 4px; margin-bottom: 5px; }
  .timeline-actions button { border: 1px solid #475569; border-radius: 4px; background: #1e293b; color: #cbd5e1; cursor: pointer; }
  .source-action { margin: 8px 0 0; border: 1px solid #0ea5e9; border-radius: 5px; padding: 4px 8px; background: #082f49; color: #bae6fd; cursor: pointer; }
  .source-action:disabled { cursor: wait; opacity: .65; }
  .component {
    display: block;
    width: 100%;
    padding: 4px 8px;
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: #bae6fd;
    text-align: left;
    cursor: pointer;
  }
  .component:hover { background: #1e293b; }
  ol { margin: 0; padding-left: 22px; color: #cbd5e1; }
  pre { margin: 8px 0 0; overflow: auto; padding: 8px; border-radius: 6px; background: #020617; white-space: pre-wrap; }
  @media (prefers-color-scheme: dark) {
    .launcher { border-color: rgb(71 85 105 / 70%); background: rgb(15 23 42 / 94%); }
    .launcher button { color: #94a3b8; }
    .launcher button:hover,
    .launcher button[aria-pressed="true"] { background: #0c4a6e; color: #7dd3fc; }
  }
  @media (max-width: 560px) {
    .panel[data-dock="floating"] {
      right: 8px;
      bottom: 52px;
      width: calc(100vw - 16px);
    }
    .header { align-items: flex-start; gap: 8px; }
    .header-actions { flex-wrap: wrap; justify-content: flex-end; }
  }
`;

export class DevtoolsPanel {
  private readonly host: HTMLDivElement;
  private readonly shadow: ShadowRoot;
  private readonly panel: HTMLDivElement;
  private readonly content: HTMLDivElement;
  private readonly resizeHandle: HTMLDivElement;
  private readonly panelToggle: HTMLButtonElement;
  private readonly inspectorToggle: HTMLButtonElement;
  private readonly inspector: ComponentInspector;
  private selectedId: string | null = null;
  private visible = false;
  private readonly stop: () => void;
  private renderGeneration = 0;
  private readonly storage: Storage | null;
  private dock: DockPosition;
  private panelWidth: number;
  private panelHeight: number;
  private fullscreen = false;
  private resizeStart: ResizeStart | null = null;

  public constructor(
    private readonly bridge: ElfUIDevtoolsBridge,
    private readonly document: Document = window.document,
    private readonly rpc?: DevtoolsRpcClient,
    private readonly openSource: OpenSourceInEditor = openSourceInEditor,
  ) {
    this.storage = storageFor(document);
    const layout = readLayout(this.storage);
    this.dock = layout.dock;
    this.panelWidth = layout.width;
    this.panelHeight = layout.height;
    this.host = document.createElement("div");
    this.host.dataset.elfuiDevtools = "host";
    this.host.style.cssText =
      "position:fixed;inset:0;z-index:2147483647;pointer-events:none";
    this.shadow = this.host.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = styles;
    const launcher = document.createElement("div");
    launcher.className = "launcher";
    launcher.dataset.elfuiDevtools = "launcher";

    this.panelToggle = document.createElement("button");
    this.panelToggle.className = "brand";
    this.panelToggle.type = "button";
    this.panelToggle.textContent = "E";
    this.panelToggle.title = "Toggle ElfUI DevTools";
    this.panelToggle.setAttribute("aria-label", "Toggle ElfUI DevTools");
    this.panelToggle.onclick = () => this.setVisible(!this.visible);

    this.inspectorToggle = document.createElement("button");
    this.inspectorToggle.className = "target";
    this.inspectorToggle.type = "button";
    this.inspectorToggle.textContent = "⌖";
    this.inspectorToggle.title = "Toggle Component Inspector";
    this.inspectorToggle.setAttribute(
      "aria-label",
      "Toggle Component Inspector",
    );
    this.inspectorToggle.onclick = () => {
      if (this.inspector.enabled) this.inspector.disable();
      else this.inspector.enable();
      this.syncControls();
    };
    launcher.append(this.panelToggle, this.inspectorToggle);

    this.panel = document.createElement("div");
    this.panel.className = "panel";
    this.panel.dataset.elfuiDevtools = "panel";
    this.panel.setAttribute("role", "dialog");
    this.panel.setAttribute("aria-label", "ElfUI DevTools");
    this.panel.hidden = true;
    this.content = document.createElement("div");
    this.content.className = "content";
    this.resizeHandle = document.createElement("div");
    this.resizeHandle.className = "resize-handle";
    this.resizeHandle.dataset.elfuiDevtools = "resize-handle";
    this.resizeHandle.tabIndex = 0;
    this.resizeHandle.setAttribute("role", "separator");
    this.resizeHandle.setAttribute("aria-label", "Resize ElfUI DevTools");
    this.resizeHandle.onpointerdown = (event) => this.startResize(event);
    this.resizeHandle.onkeydown = (event) => this.resizeWithKeyboard(event);
    this.panel.append(this.content, this.resizeHandle);
    this.applyLayout();

    this.shadow.append(style, launcher, this.panel);
    document.body.appendChild(this.host);
    document.defaultView?.addEventListener("pointermove", this.onPointerMove);
    document.defaultView?.addEventListener("pointerup", this.onPointerUp);

    this.inspector = new ComponentInspector(bridge, {
      document,
      onSelect: (id) => {
        this.selectedId = id;
        this.setVisible(true);
        this.render();
      },
    });
    this.stop = bridge.on(() => this.render());
    this.syncControls();
    this.render();
  }

  public get opened(): boolean {
    return this.visible;
  }

  public dispose(): void {
    this.stop();
    this.inspector.dispose();
    this.document.defaultView?.removeEventListener(
      "pointermove",
      this.onPointerMove,
    );
    this.document.defaultView?.removeEventListener(
      "pointerup",
      this.onPointerUp,
    );
    this.host.remove();
  }

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (!this.resizeStart || this.fullscreen) return;
    const deltaX = event.clientX - this.resizeStart.x;
    const deltaY = event.clientY - this.resizeStart.y;
    if (this.dock === "right")
      this.setPanelSize(this.resizeStart.width - deltaX, this.panelHeight);
    else if (this.dock === "left")
      this.setPanelSize(this.resizeStart.width + deltaX, this.panelHeight);
    else if (this.dock === "bottom")
      this.setPanelSize(this.panelWidth, this.resizeStart.height - deltaY);
    else
      this.setPanelSize(
        this.resizeStart.width + deltaX,
        this.resizeStart.height + deltaY,
      );
  };

  private readonly onPointerUp = (): void => {
    this.resizeStart = null;
  };

  private startResize(event: PointerEvent): void {
    if (this.fullscreen) return;
    event.preventDefault();
    this.resizeHandle.focus();
    this.resizeStart = {
      x: event.clientX,
      y: event.clientY,
      width: this.panelWidth,
      height: this.panelHeight,
    };
  }

  private resizeWithKeyboard(event: KeyboardEvent): void {
    if (this.fullscreen) return;
    const step = event.shiftKey ? 40 : 16;
    let width = this.panelWidth;
    let height = this.panelHeight;
    if (event.key === "ArrowLeft") width -= step;
    else if (event.key === "ArrowRight") width += step;
    else if (event.key === "ArrowUp") height += step;
    else if (event.key === "ArrowDown") height -= step;
    else return;
    event.preventDefault();
    this.setPanelSize(width, height);
  }

  private setPanelSize(width: number, height: number): void {
    const viewportWidth = this.document.defaultView?.innerWidth ?? 1280;
    const viewportHeight = this.document.defaultView?.innerHeight ?? 720;
    this.panelWidth = Math.round(
      Math.min(Math.max(width, 320), Math.max(320, viewportWidth - 16)),
    );
    this.panelHeight = Math.round(
      Math.min(Math.max(height, 240), Math.max(240, viewportHeight - 16)),
    );
    this.applyLayout();
    this.persistLayout();
  }

  private setDock(dock: DockPosition): void {
    this.dock = dock;
    this.applyLayout();
    this.persistLayout();
  }

  private setFullscreen(fullscreen: boolean): void {
    this.fullscreen = fullscreen;
    this.applyLayout();
    this.render();
  }

  private applyLayout(): void {
    this.panel.dataset.dock = this.dock;
    this.panel.dataset.fullscreen = String(this.fullscreen);
    this.panel.style.setProperty(
      "--elfui-devtools-width",
      `${this.panelWidth}px`,
    );
    this.panel.style.setProperty(
      "--elfui-devtools-height",
      `${this.panelHeight}px`,
    );
  }

  private persistLayout(): void {
    try {
      this.storage?.setItem(
        DEVTOOLS_LAYOUT_STORAGE_KEY,
        JSON.stringify({
          dock: this.dock,
          width: this.panelWidth,
          height: this.panelHeight,
        } satisfies PanelLayout),
      );
    } catch {
      // Storage can be disabled by browser privacy settings.
    }
  }

  private setVisible(visible: boolean): void {
    this.visible = visible;
    this.panel.hidden = !visible;
    this.syncControls();
  }

  private syncControls(): void {
    this.panelToggle.setAttribute("aria-pressed", String(this.visible));
    this.inspectorToggle.setAttribute(
      "aria-pressed",
      String(this.inspector?.enabled ?? false),
    );
  }

  private render(): void {
    const generation = ++this.renderGeneration;
    if (this.rpc) {
      void this.renderFromRpc(generation);
      return;
    }
    this.renderView(
      this.bridge.getSnapshot(),
      this.selectedId ? this.bridge.getComponentDetail(this.selectedId) : null,
      this.bridge.getTimelineStatus(),
      this.bridge.getTimeline(),
    );
  }

  private async renderFromRpc(generation: number): Promise<void> {
    const [snapshot, timeline] = await Promise.all([
      this.rpc!.getSnapshot(),
      this.rpc!.getTimeline(),
    ]);
    const detail = this.selectedId
      ? await this.rpc!.getComponentDetail(this.selectedId)
      : null;
    if (generation !== this.renderGeneration) return;
    this.renderView(snapshot, detail, timeline.status, timeline.events);
  }

  private renderView(
    snapshot: DevtoolsSnapshot,
    detail: ComponentDetailSnapshot | null,
    timelineStatus: TimelineStatusSnapshot,
    timelineEvents: readonly TimelineEvent[],
  ): void {
    this.content.replaceChildren();

    const header = this.document.createElement("div");
    header.className = "header";
    const title = this.document.createElement("strong");
    title.textContent = `ElfUI DevTools (${snapshot.components.length})`;
    const headerActions = this.document.createElement("div");
    headerActions.className = "header-actions";
    const dock = this.document.createElement("select");
    dock.setAttribute("aria-label", "Dock position");
    for (const [value, label] of [
      ["floating", "Floating"],
      ["bottom", "Bottom"],
      ["left", "Left"],
      ["right", "Right"],
    ] as const) {
      const option = this.document.createElement("option");
      option.value = value;
      option.textContent = label;
      dock.appendChild(option);
    }
    dock.value = this.dock;
    dock.onchange = () => {
      if (isDockPosition(dock.value)) this.setDock(dock.value);
    };
    const fullscreen = this.document.createElement("button");
    fullscreen.type = "button";
    fullscreen.textContent = this.fullscreen ? "Restore" : "Fullscreen";
    fullscreen.setAttribute(
      "aria-label",
      this.fullscreen ? "Exit fullscreen" : "Enter fullscreen",
    );
    fullscreen.onclick = () => this.setFullscreen(!this.fullscreen);
    const close = this.document.createElement("button");
    close.className = "close";
    close.type = "button";
    close.textContent = "Close";
    close.onclick = () => this.setVisible(false);
    headerActions.append(dock, fullscreen, close);
    header.append(title, headerActions);
    this.content.append(header);

    const components = this.document.createElement("section");
    components.className = "section";
    const componentsTitle = this.document.createElement("p");
    componentsTitle.className = "section-title";
    componentsTitle.textContent = "Components";
    components.appendChild(componentsTitle);
    for (const node of snapshot.components) {
      let depth = 0;
      let parentId = node.parentId;
      while (parentId) {
        depth += 1;
        parentId =
          snapshot.components.find((candidate) => candidate.id === parentId)
            ?.parentId ?? null;
      }
      const button = this.document.createElement("button");
      button.className = "component";
      button.style.paddingLeft = `${8 + depth * 14}px`;
      button.textContent = `<${node.tag}>`;
      button.onclick = () => {
        this.selectedId = node.id;
        this.render();
      };
      components.append(button);
    }
    this.content.append(components);

    const timelineSection = this.document.createElement("section");
    timelineSection.className = "section";
    const timelineHeading = this.document.createElement("div");
    timelineHeading.className = "section-heading";
    const timelineTitle = this.document.createElement("p");
    timelineTitle.className = "section-title";
    const statusParts = [
      timelineStatus.aggregatedEvents
        ? `${timelineStatus.aggregatedEvents} aggregated`
        : "",
      timelineStatus.droppedEvents
        ? `${timelineStatus.droppedEvents} dropped`
        : "",
    ].filter(Boolean);
    timelineTitle.textContent = `Recent timeline${statusParts.length ? ` (${statusParts.join(", ")})` : ""}`;
    const timelineActions = this.document.createElement("div");
    timelineActions.className = "timeline-actions";
    const pause = this.document.createElement("button");
    pause.type = "button";
    pause.textContent = timelineStatus.paused ? "Resume" : "Pause";
    pause.setAttribute(
      "aria-label",
      timelineStatus.paused ? "Resume timeline" : "Pause timeline",
    );
    pause.onclick = () => {
      if (this.rpc) {
        void this.rpc
          .setTimelinePaused(!timelineStatus.paused)
          .then(() => this.render());
      } else {
        this.bridge.setTimelinePaused(!timelineStatus.paused);
        this.render();
      }
    };
    const clear = this.document.createElement("button");
    clear.type = "button";
    clear.textContent = "Clear";
    clear.setAttribute("aria-label", "Clear timeline");
    clear.onclick = () => {
      if (this.rpc) {
        void this.rpc.clearTimeline().then(() => this.render());
      } else {
        this.bridge.clearTimeline();
        this.render();
      }
    };
    timelineActions.append(pause, clear);
    timelineHeading.append(timelineTitle, timelineActions);
    const timeline = this.document.createElement("ol");
    timeline.dataset.elfuiDevtools = "timeline";
    for (const event of timelineEvents.slice(-20).reverse()) {
      const item = this.document.createElement("li");
      item.textContent = `${event.layer}:${event.type} — ${event.summary}`;
      timeline.append(item);
    }
    timelineSection.append(timelineHeading, timeline);
    this.content.append(timelineSection);

    if (!detail) return;
    const detailNode = this.document.createElement("pre");
    const source = detail.source
      ? `${detail.source.file}:${detail.source.line}:${detail.source.column}`
      : "unavailable";
    detailNode.textContent = `${detail.displayName}\nsource: ${source}\nprops: ${valueText(detail.props)}\nattrs: ${valueText(detail.attrs)}\nsetup: ${valueText(detail.setup)}\nexposed: ${valueText(detail.exposed)}\nupdates: ${detail.lifecycle.updateCount}`;
    this.content.append(detailNode);
    if (detail.source) {
      const sourceLocation = detail.source;
      const openButton = this.document.createElement("button");
      openButton.className = "source-action";
      openButton.type = "button";
      openButton.textContent = "Open in editor";
      openButton.setAttribute("aria-label", "Open component source in editor");
      openButton.onclick = () => {
        openButton.disabled = true;
        void this.openSource(sourceLocation)
          .catch((error: unknown) => {
            openButton.title =
              error instanceof Error ? error.message : String(error);
          })
          .finally(() => {
            openButton.disabled = false;
          });
      };
      this.content.append(openButton);
    }
  }
}
