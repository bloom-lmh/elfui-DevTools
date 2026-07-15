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

  it("builds a runtime tree when children mount before their parent", () => {
    const bridge = createDevtoolsBridge();
    const parent = document.createElement("elf-runtime-parent");
    const child = document.createElement("elf-runtime-child");

    bridge.emitRuntimeEvent({
      type: "component:mount",
      component: {
        id: "elfui-component:2",
        parentId: "elfui-component:1",
        appId: "elfui-app:1",
        host: child,
        tag: "elf-runtime-child",
      },
    });
    bridge.emitRuntimeEvent({
      type: "component:mount",
      component: {
        id: "elfui-component:1",
        parentId: null,
        appId: "elfui-app:1",
        host: parent,
        tag: "elf-runtime-parent",
      },
    });

    expect(bridge.getSnapshot()).toMatchObject({
      apps: [{ id: "elfui-app:1", rootIds: ["elfui-component:1"] }],
      components: [
        {
          id: "elfui-component:2",
          parentId: "elfui-component:1",
        },
        {
          id: "elfui-component:1",
          children: ["elfui-component:2"],
        },
      ],
    });

    bridge.emitRuntimeEvent({ type: "component:unmount", host: parent });
    expect(bridge.getSnapshot().components).toEqual([]);
  });

  it("keeps multiple runtime apps isolated during unmount", () => {
    const bridge = createDevtoolsBridge();
    const first = document.createElement("elf-first-app");
    const second = document.createElement("elf-second-app");
    bridge.emitRuntimeEvent({
      type: "app:mount",
      app: { id: "elfui-app:first", label: "first", root: first },
    });
    bridge.emitRuntimeEvent({
      type: "app:mount",
      app: { id: "elfui-app:second", label: "second", root: second },
    });
    bridge.emitRuntimeEvent({
      type: "component:mount",
      component: {
        id: "elfui-component:first",
        parentId: null,
        appId: "elfui-app:first",
        host: first,
        tag: "elf-first-app",
      },
    });
    bridge.emitRuntimeEvent({
      type: "component:mount",
      component: {
        id: "elfui-component:second",
        parentId: null,
        appId: "elfui-app:second",
        host: second,
        tag: "elf-second-app",
      },
    });

    bridge.emitRuntimeEvent({
      type: "app:unmount",
      appId: "elfui-app:first",
    });

    expect(bridge.getSnapshot()).toMatchObject({
      apps: [
        {
          id: "elfui-app:second",
          rootIds: ["elfui-component:second"],
        },
      ],
      components: [{ id: "elfui-component:second" }],
    });
  });

  it("adds state trigger and effect causality to the reactivity timeline", () => {
    const bridge = createDevtoolsBridge();
    const host = document.createElement("elf-reactivity-counter");
    bridge.registerComponent({
      id: "elfui-component:counter",
      appId: "elfui-app:counter",
      parentId: null,
      host,
      tag: "elf-reactivity-counter",
    });

    bridge.emitReactivityEvent({
      type: "reactivity:trigger",
      id: "elfui-trigger:1",
      parentTriggerId: null,
      targetId: "elfui-target:1",
      targetName: "count",
      key: "value",
      effects: [
        {
          effectId: "elfui-effect:1",
          componentId: "elfui-component:counter",
        },
      ],
    });
    bridge.emitReactivityEvent({
      type: "reactivity:effect",
      triggerId: "elfui-trigger:1",
      effectId: "elfui-effect:1",
      componentId: "elfui-component:counter",
      duration: 1.25,
    });

    expect(bridge.getTimeline().slice(-2)).toMatchObject([
      {
        layer: "reactivity",
        type: "trigger",
        summary: "count.value triggered 1 effect",
      },
      {
        layer: "reactivity",
        type: "effect",
        summary: "elfui-effect:1 ran in 1.25ms",
      },
    ]);
  });
});
