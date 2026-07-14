import { describe, expect, it, vi } from "vitest";

import {
  createDevtoolsBridge,
  DEVTOOLS_GLOBAL_HOOK,
  installGlobalDevtoolsBridge,
} from "./bridge";

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

  it("installs and restores the global bridge hook", () => {
    const target: Record<string, unknown> = {
      [DEVTOOLS_GLOBAL_HOOK]: "previous",
    };
    const bridge = createDevtoolsBridge();
    const dispose = installGlobalDevtoolsBridge(bridge, target);
    expect(target[DEVTOOLS_GLOBAL_HOOK]).toBe(bridge);
    dispose();
    expect(target[DEVTOOLS_GLOBAL_HOOK]).toBe("previous");
  });

  it("consumes real ElfUI runtime app, component, update, and emit events", () => {
    const bridge = createDevtoolsBridge({ now: () => 25 });
    const host = document.createElement("elf-runtime-counter");
    bridge.emitRuntimeEvent({
      type: "app:mount",
      app: { id: "elfui-app:1", label: "elf-app", root: host },
    });
    bridge.emitRuntimeEvent({
      type: "component:mount",
      component: {
        host,
        appId: "elfui-app:1",
        tag: "elf-runtime-counter",
        props: () => ({ count: 2 }),
        setup: () => ({ ready: true }),
      },
    });
    bridge.emitRuntimeEvent({ type: "component:update", host });
    bridge.emitRuntimeEvent({
      type: "component:emit",
      host,
      event: "change",
      args: [3],
    });

    expect(bridge.getSnapshot().apps).toMatchObject([
      { id: "elfui-app:1", rootIds: ["component:1"] },
    ]);
    expect(bridge.getComponentDetail("component:1")?.setup).toMatchObject({
      kind: "object",
      entries: [{ key: "ready", value: { value: true } }],
    });
    expect(bridge.getTimeline().map((event) => event.layer)).toEqual([
      "component",
      "component",
      "events",
    ]);
  });
});
