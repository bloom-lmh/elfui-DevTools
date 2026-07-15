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
  button { font: inherit; }
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
    right: 16px;
    bottom: 56px;
    width: min(420px, calc(100vw - 32px));
    max-height: min(72vh, 720px);
    overflow: hidden;
    border: 1px solid #334155;
    border-radius: 12px;
    background: #0f172a;
    color: #e2e8f0;
    box-shadow: 0 18px 48px rgb(0 0 0 / 42%);
    font: 12px/1.5 ui-sans-serif, system-ui, sans-serif;
    pointer-events: auto;
  }
  .panel[hidden] { display: none; }
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
  .close {
    border: 0;
    background: transparent;
    color: #94a3b8;
    cursor: pointer;
  }
  .content { max-height: calc(min(72vh, 720px) - 42px); overflow: auto; padding: 10px; }
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
`;

export class DevtoolsPanel {
  private readonly host: HTMLDivElement;
  private readonly shadow: ShadowRoot;
  private readonly panel: HTMLDivElement;
  private readonly content: HTMLDivElement;
  private readonly panelToggle: HTMLButtonElement;
  private readonly inspectorToggle: HTMLButtonElement;
  private readonly inspector: ComponentInspector;
  private selectedId: string | null = null;
  private visible = false;
  private readonly stop: () => void;
  private renderGeneration = 0;

  public constructor(
    private readonly bridge: ElfUIDevtoolsBridge,
    private readonly document: Document = window.document,
    private readonly rpc?: DevtoolsRpcClient,
    private readonly openSource: OpenSourceInEditor = openSourceInEditor,
  ) {
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
    this.panel.appendChild(this.content);

    this.shadow.append(style, launcher, this.panel);
    document.body.appendChild(this.host);

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
    this.host.remove();
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
    const close = this.document.createElement("button");
    close.className = "close";
    close.type = "button";
    close.textContent = "Close";
    close.onclick = () => this.setVisible(false);
    header.append(title, close);
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
