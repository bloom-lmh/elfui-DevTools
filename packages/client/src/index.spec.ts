import { afterEach, describe, expect, it, vi } from "vitest";

import { createDevtoolsBridge } from "@elfui/devtools-runtime";

import { ComponentInspector } from "./index";

describe("ComponentInspector", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("selects a registered Custom Element across a shadow root", () => {
    const bridge = createDevtoolsBridge();
    const root = document.createElement("elf-root");
    const child = document.createElement("elf-counter");
    const select = vi.fn();
    root.attachShadow({ mode: "open" }).appendChild(child);
    document.body.appendChild(root);
    bridge.registerComponent({ host: root, tag: "elf-root" });
    const childId = bridge.registerComponent({
      host: child,
      tag: "elf-counter",
    });
    const inspector = new ComponentInspector(bridge, { onSelect: select });
    inspector.enable();

    child.dispatchEvent(
      new PointerEvent("pointermove", { bubbles: true, composed: true }),
    );
    const clicked = child.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        composed: true,
      }),
    );

    expect(
      document
        .querySelector("[data-component-id]")
        ?.getAttribute("data-component-id"),
    ).toBe(childId);
    expect(select).toHaveBeenCalledWith(childId);
    expect(clicked).toBe(false);
    inspector.dispose();
  });

  it("stops inspecting on Escape and cleans up its overlay", () => {
    const inspector = new ComponentInspector(createDevtoolsBridge());
    inspector.enable();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(inspector.enabled).toBe(false);
    inspector.dispose();
    expect(document.querySelector("[aria-hidden=true]")).toBeNull();
  });
});
