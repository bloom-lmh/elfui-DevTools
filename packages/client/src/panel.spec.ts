import { afterEach, describe, expect, it } from "vitest";
import { createDevtoolsBridge } from "@elfui/devtools-runtime";
import { DevtoolsPanel } from "./panel";

describe("DevtoolsPanel", () => {
  afterEach(() => document.body.replaceChildren());
  it("renders a component tree and its details", () => {
    const bridge = createDevtoolsBridge();
    const host = document.createElement("elf-counter");
    bridge.registerComponent({
      host,
      tag: "elf-counter",
      props: () => ({ count: 2 }),
      source: { file: "/src/Counter.elf", line: 2, column: 3 },
    });
    const panel = new DevtoolsPanel(bridge);
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
});
