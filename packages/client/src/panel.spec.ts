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
    });
    const panel = new DevtoolsPanel(bridge);
    const componentButton = Array.from(
      document.querySelectorAll("button"),
    ).find((button) => button.textContent === "<elf-counter>");
    componentButton?.click();
    expect(
      document.querySelector("[data-elfui-devtools=panel]")?.textContent,
    ).toContain("count: 2");
    expect(
      document.querySelector("[data-elfui-devtools=panel]")?.textContent,
    ).toContain("elf-counter");
    panel.dispose();
  });
});
