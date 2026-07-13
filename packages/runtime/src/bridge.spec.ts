import { describe, expect, it, vi } from "vitest";

import { createDevtoolsBridge } from "./bridge";

describe("ElfUIDevtoolsBridge", () => {
  it("builds a component tree across an open shadow root", () => {
    const bridge = createDevtoolsBridge({ now: () => 42 });
    const root = document.createElement("elf-root");
    const shadow = root.attachShadow({ mode: "open" });
    const child = document.createElement("elf-child");
    shadow.appendChild(child);
    document.body.appendChild(root);

    const rootId = bridge.registerComponent({
      host: root,
      tag: "elf-root",
      shadowMode: "open",
    });
    const childId = bridge.registerComponent({
      host: child,
      tag: "elf-child",
      props: () => ({ count: 1 }),
    });

    expect(bridge.getSnapshot()).toMatchObject({
      protocolVersion: 1,
      apps: [{ rootIds: [rootId] }],
      components: [
        { id: rootId, parentId: null, children: [childId] },
        { id: childId, parentId: rootId, tag: "elf-child" },
      ],
    });
    expect(bridge.getComponentDetail(childId)?.props).toMatchObject({
      kind: "object",
      entries: [{ key: "count", value: { kind: "primitive", value: 1 } }],
    });
  });

  it("emits bounded lifecycle events and detaches components", () => {
    const now = vi.fn().mockReturnValue(100);
    const bridge = createDevtoolsBridge({ now, maxTimelineEvents: 2 });
    const host = document.createElement("elf-counter");
    const id = bridge.registerComponent({ host, tag: "elf-counter" });

    bridge.notifyUpdate(host);
    bridge.notifyError(host, new Error("boom"));
    bridge.unregisterComponent(host);

    expect(bridge.getComponentDetail(id)).toBeNull();
    expect(bridge.getTimeline()).toHaveLength(2);
    expect(bridge.getTimeline().map((event) => event.type)).toEqual([
      "error",
      "unmount",
    ]);
  });

  it("does not duplicate registration for the same host", () => {
    const bridge = createDevtoolsBridge();
    const host = document.createElement("elf-counter");

    expect(bridge.registerComponent({ host, tag: "elf-counter" })).toBe(
      bridge.registerComponent({ host, tag: "different-tag" }),
    );
    expect(bridge.getSnapshot().components).toHaveLength(1);
  });
});
