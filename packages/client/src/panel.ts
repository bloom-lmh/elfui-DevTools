import type { SerializedValue } from "@elfui/devtools-shared";
import type { ElfUIDevtoolsBridge } from "@elfui/devtools-runtime";

import { ComponentInspector } from "./index";

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

export class DevtoolsPanel {
  private readonly root: HTMLDivElement;
  private readonly inspector: ComponentInspector;
  private selectedId: string | null = null;
  private readonly stop: () => void;

  public constructor(
    private readonly bridge: ElfUIDevtoolsBridge,
    document: Document = window.document,
  ) {
    this.root = document.createElement("div");
    this.root.dataset.elfuiDevtools = "panel";
    this.root.style.cssText =
      "position:fixed;right:16px;bottom:16px;z-index:2147483647;width:320px;max-height:70vh;overflow:auto;padding:12px;background:#0f172a;color:#e2e8f0;font:12px/1.5 system-ui;border-radius:8px;box-shadow:0 12px 32px #0008";
    document.body.appendChild(this.root);
    this.inspector = new ComponentInspector(bridge, {
      document,
      onSelect: (id) => {
        this.selectedId = id;
        this.render();
      },
    });
    this.stop = bridge.on(() => this.render());
    this.render();
  }

  public dispose(): void {
    this.stop();
    this.inspector.dispose();
    this.root.remove();
  }

  private render(): void {
    const snapshot = this.bridge.getSnapshot();
    const detail = this.selectedId
      ? this.bridge.getComponentDetail(this.selectedId)
      : null;
    this.root.replaceChildren();
    const inspect = document.createElement("button");
    inspect.textContent = this.inspector.enabled
      ? "Exit Inspector"
      : "Inspect component";
    inspect.onclick = () => {
      if (this.inspector.enabled) this.inspector.disable();
      else this.inspector.enable();
      this.render();
    };
    this.root.append(inspect);
    const title = document.createElement("strong");
    title.textContent = ` ElfUI DevTools (${snapshot.components.length})`;
    this.root.append(title);
    const list = document.createElement("div");
    for (const node of snapshot.components) {
      const button = document.createElement("button");
      button.textContent = `${"· ".repeat(node.parentId ? 1 : 0)}<${node.tag}>`;
      button.style.display = "block";
      button.onclick = () => {
        this.selectedId = node.id;
        this.render();
      };
      list.append(button);
    }
    this.root.append(list);
    const timeline = document.createElement("ol");
    timeline.dataset.elfuiDevtools = "timeline";
    for (const event of this.bridge.getTimeline().slice(-20).reverse()) {
      const item = document.createElement("li");
      item.textContent = `${event.layer}:${event.type} — ${event.summary}`;
      timeline.append(item);
    }
    this.root.append(timeline);
    if (!detail) return;
    const detailNode = document.createElement("pre");
    detailNode.textContent = `${detail.displayName}\nprops: ${valueText(detail.props)}\nattrs: ${valueText(detail.attrs)}\nsetup: ${valueText(detail.setup)}\nupdates: ${detail.lifecycle.updateCount}`;
    this.root.append(detailNode);
  }
}
