import type { ElfUIDevtoolsBridge } from "@elfui/devtools-runtime";

export interface ComponentInspectorOptions {
  document?: Document;
  onSelect?: (componentId: string) => void;
}

const findRegisteredHost = (
  bridge: ElfUIDevtoolsBridge,
  target: EventTarget | null,
): HTMLElement | null => {
  let current = target instanceof HTMLElement ? target : null;
  while (current) {
    if (bridge.getComponentId(current)) return current;
    const root = current.getRootNode();
    current =
      current.parentElement ??
      (root instanceof ShadowRoot && root.host instanceof HTMLElement
        ? root.host
        : null);
  }
  return null;
};

export class ComponentInspector {
  private readonly document: Document;
  private readonly overlay: HTMLDivElement;
  private hoveredId: string | null = null;
  private active = false;

  public constructor(
    private readonly bridge: ElfUIDevtoolsBridge,
    private readonly options: ComponentInspectorOptions = {},
  ) {
    this.document = options.document ?? document;
    this.overlay = this.document.createElement("div");
    this.overlay.setAttribute("aria-hidden", "true");
    this.overlay.style.cssText = [
      "position:fixed",
      "z-index:2147483647",
      "display:none",
      "pointer-events:none",
      "box-sizing:border-box",
      "border:2px solid #38bdf8",
      "background:rgb(56 189 248 / 14%)",
    ].join(";");
    this.document.body.appendChild(this.overlay);
  }

  public get enabled(): boolean {
    return this.active;
  }

  public enable(): void {
    if (this.active) return;
    this.active = true;
    this.document.addEventListener("pointermove", this.onPointerMove, true);
    this.document.addEventListener("click", this.onClick, true);
    this.document.addEventListener("keydown", this.onKeyDown, true);
  }

  public disable(): void {
    if (!this.active) return;
    this.active = false;
    this.hoveredId = null;
    this.overlay.style.display = "none";
    this.document.removeEventListener("pointermove", this.onPointerMove, true);
    this.document.removeEventListener("click", this.onClick, true);
    this.document.removeEventListener("keydown", this.onKeyDown, true);
  }

  public dispose(): void {
    this.disable();
    this.overlay.remove();
  }

  private readonly onPointerMove = (event: PointerEvent): void => {
    const host = event
      .composedPath()
      .map((target) => findRegisteredHost(this.bridge, target))
      .find((candidate): candidate is HTMLElement => candidate !== null);
    const id = host ? this.bridge.getComponentId(host) : null;
    if (!host || !id) {
      this.hoveredId = null;
      this.overlay.style.display = "none";
      return;
    }
    this.hoveredId = id;
    const bounds = host.getBoundingClientRect();
    this.overlay.dataset.componentId = id;
    this.overlay.style.left = `${bounds.left}px`;
    this.overlay.style.top = `${bounds.top}px`;
    this.overlay.style.width = `${bounds.width}px`;
    this.overlay.style.height = `${bounds.height}px`;
    this.overlay.style.display = "block";
  };

  private readonly onClick = (event: MouseEvent): void => {
    const host = event
      .composedPath()
      .map((target) => findRegisteredHost(this.bridge, target))
      .find((candidate): candidate is HTMLElement => candidate !== null);
    if (
      !host ||
      !this.hoveredId ||
      this.bridge.getComponentId(host) !== this.hoveredId
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    this.options.onSelect?.(this.hoveredId);
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") this.disable();
  };
}

export { DevtoolsPanel } from "./panel";
export { installElfUIDevtools } from "./bootstrap";
export {
  DevtoolsRpcClient,
  DevtoolsRpcClientError,
  type DevtoolsRpcClientOptions,
} from "./rpc-client";
