import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDevtoolsBridge,
  createInPageDevtoolsTransport,
} from "@elfui/devtools-runtime";
import { DEVTOOLS_LAYOUT_STORAGE_KEY, DevtoolsPanel } from "./panel";
import { DevtoolsRpcClient } from "./rpc-client";

describe("DevtoolsPanel", () => {
  afterEach(() => {
    document.body.replaceChildren();
    window.localStorage.clear();
  });
  it("renders a component tree, opens its source, and shows details", async () => {
    const bridge = createDevtoolsBridge();
    const host = document.createElement("elf-counter");
    bridge.registerComponent({
      host,
      tag: "elf-counter",
      props: () => ({ count: 2 }),
      source: { file: "/src/Counter.elf", line: 2, column: 3 },
    });
    const openSource = vi.fn().mockResolvedValue(undefined);
    const panel = new DevtoolsPanel(bridge, document, undefined, openSource);
    const panelHost = document.querySelector<HTMLElement>(
      "[data-elfui-devtools=host]",
    );
    const shadow = panelHost?.shadowRoot;
    const panelNode = shadow?.querySelector<HTMLElement>(
      "[data-elfui-devtools=panel]",
    );
    expect(panel.opened).toBe(false);
    expect(panelNode?.hidden).toBe(true);
    shadow
      ?.querySelector<HTMLButtonElement>('[aria-label="Toggle ElfUI DevTools"]')
      ?.click();
    expect(panel.opened).toBe(true);
    expect(panelNode?.hidden).toBe(false);
    const componentButton = Array.from(
      shadow?.querySelectorAll("button") ?? [],
    ).find((button) => button.textContent === "<elf-counter>");
    componentButton?.click();
    expect(panelNode?.textContent).toContain("count: 2");
    expect(panelNode?.textContent).toContain("elf-counter");
    expect(panelNode?.textContent).toContain("/src/Counter.elf:2:3");
    shadow
      ?.querySelector<HTMLButtonElement>(
        '[aria-label="Open component source in editor"]',
      )
      ?.click();
    await vi.waitFor(() => {
      expect(openSource).toHaveBeenCalledWith({
        file: "/src/Counter.elf",
        line: 2,
        column: 3,
      });
    });
    bridge.notifyUpdate(host);
    expect(
      shadow?.querySelector("[data-elfui-devtools=timeline]")?.textContent,
    ).toContain("component:update");
    shadow
      ?.querySelector<HTMLButtonElement>('[aria-label="Pause timeline"]')
      ?.click();
    bridge.notifyUpdate(host);
    expect(bridge.getTimelineStatus()).toMatchObject({
      paused: true,
      droppedEvents: 1,
    });
    expect(
      shadow?.querySelector<HTMLButtonElement>(
        '[aria-label="Resume timeline"]',
      ),
    ).not.toBeNull();
    shadow
      ?.querySelector<HTMLButtonElement>('[aria-label="Clear timeline"]')
      ?.click();
    expect(bridge.getTimeline()).toHaveLength(0);
    panel.dispose();
  });

  it("reads panel data and controls the timeline through RPC", async () => {
    const bridge = createDevtoolsBridge();
    const host = document.createElement("elf-rpc-panel");
    bridge.registerComponent({ host, tag: "elf-rpc-panel" });
    const rpc = new DevtoolsRpcClient(createInPageDevtoolsTransport(bridge));
    await rpc.connect();
    const panel = new DevtoolsPanel(bridge, document, rpc);
    const shadow = document.querySelector<HTMLElement>(
      "[data-elfui-devtools=host]",
    )?.shadowRoot;

    await vi.waitFor(() => {
      expect(shadow?.textContent).toContain("<elf-rpc-panel>");
    });
    shadow
      ?.querySelector<HTMLButtonElement>('[aria-label="Pause timeline"]')
      ?.click();
    await vi.waitFor(() => {
      expect(bridge.getTimelineStatus().paused).toBe(true);
      expect(
        shadow?.querySelector('[aria-label="Resume timeline"]'),
      ).not.toBeNull();
    });

    panel.dispose();
    rpc.dispose();
  });

  it("docks, resizes, enters fullscreen, and restores persisted layout", () => {
    window.localStorage.setItem(
      DEVTOOLS_LAYOUT_STORAGE_KEY,
      JSON.stringify({ dock: "right", width: 512, height: 444 }),
    );
    const bridge = createDevtoolsBridge();
    const panel = new DevtoolsPanel(bridge, document);
    const shadow = document.querySelector<HTMLElement>(
      "[data-elfui-devtools=host]",
    )?.shadowRoot;
    const panelNode = shadow?.querySelector<HTMLElement>(
      "[data-elfui-devtools=panel]",
    );

    expect(panelNode?.dataset.dock).toBe("right");
    expect(panelNode?.style.getPropertyValue("--elfui-devtools-width")).toBe(
      "512px",
    );
    expect(panelNode?.style.getPropertyValue("--elfui-devtools-height")).toBe(
      "444px",
    );

    const dock = shadow?.querySelector<HTMLSelectElement>(
      '[aria-label="Dock position"]',
    );
    if (dock) {
      dock.value = "bottom";
      dock.dispatchEvent(new Event("change"));
    }
    expect(panelNode?.dataset.dock).toBe("bottom");

    shadow
      ?.querySelector<HTMLButtonElement>('[aria-label="Enter fullscreen"]')
      ?.click();
    expect(panelNode?.dataset.fullscreen).toBe("true");
    shadow
      ?.querySelector<HTMLButtonElement>('[aria-label="Exit fullscreen"]')
      ?.click();
    expect(panelNode?.dataset.fullscreen).toBe("false");

    const resizeHandle = shadow?.querySelector<HTMLElement>(
      '[aria-label="Resize ElfUI DevTools"]',
    );
    resizeHandle?.dispatchEvent(
      new MouseEvent("pointerdown", { clientX: 100, clientY: 200 }),
    );
    expect(shadow?.activeElement).toBe(resizeHandle);
    window.dispatchEvent(
      new MouseEvent("pointermove", { clientX: 100, clientY: 160 }),
    );
    window.dispatchEvent(new MouseEvent("pointerup"));
    expect(panelNode?.style.getPropertyValue("--elfui-devtools-height")).toBe(
      "484px",
    );
    resizeHandle?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowUp" }),
    );
    expect(panelNode?.style.getPropertyValue("--elfui-devtools-height")).toBe(
      "500px",
    );
    expect(
      JSON.parse(
        window.localStorage.getItem(DEVTOOLS_LAYOUT_STORAGE_KEY) ?? "null",
      ),
    ).toEqual({ dock: "bottom", width: 512, height: 500 });

    panel.dispose();
    const restored = new DevtoolsPanel(createDevtoolsBridge(), document);
    const restoredNode = document
      .querySelector<HTMLElement>("[data-elfui-devtools=host]")
      ?.shadowRoot?.querySelector<HTMLElement>("[data-elfui-devtools=panel]");
    expect(restoredNode?.dataset.dock).toBe("bottom");
    expect(
      restoredNode?.style.getPropertyValue("--elfui-devtools-height"),
    ).toBe("500px");
    restored.dispose();
  });
});
