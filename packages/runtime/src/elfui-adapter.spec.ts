import { afterEach, describe, expect, it } from "vitest";

import { createDevtoolsBridge } from "./bridge";
import { installElfUIAdapter } from "./elfui-adapter";

const INSTANCE_KEY = Symbol.for("elfui.instance");

describe("installElfUIAdapter", () => {
  afterEach(() => document.body.replaceChildren());

  it("discovers ElfUI hosts and follows DOM lifecycle changes", async () => {
    class Counter extends HTMLElement {
      public static __elfDefinition = {
        tag: "elf-adapter-counter",
        props: { count: Number },
        shadow: "open" as const,
      };
      public count = 3;
      public static __elfSource = {
        file: "/src/Counter.elf",
        line: 4,
        column: 1,
      };
    }
    customElements.define("elf-adapter-counter", Counter);
    const host = document.createElement("elf-adapter-counter") as Counter;
    (host as unknown as Record<symbol, unknown>)[INSTANCE_KEY] = {
      devtools: {
        props: { count: 4 },
        setup: { ready: true },
        exposed: { focus: "method" },
      },
    };
    document.body.appendChild(host);
    const bridge = createDevtoolsBridge();
    const adapter = installElfUIAdapter(bridge);

    expect(bridge.getSnapshot().components).toMatchObject([
      { tag: "elf-adapter-counter", source: { file: "/src/Counter.elf" } },
    ]);
    expect(bridge.getSnapshot().components).toHaveLength(1);
    const id = bridge.getSnapshot().components[0]!.id;
    expect(bridge.getComponentDetail(id)?.setup).toMatchObject({
      entries: [{ key: "ready", value: { value: true } }],
    });
    host.remove();
    await Promise.resolve();
    await Promise.resolve();
    expect(bridge.getSnapshot().components).toHaveLength(0);
    adapter.disconnect();
  });

  it("discovers an existing macro component after its custom element upgrades", async () => {
    const host = document.createElement("elf-adapter-late-counter");
    document.body.appendChild(host);
    const bridge = createDevtoolsBridge();
    const adapter = installElfUIAdapter(bridge);

    expect(bridge.getSnapshot().components).toHaveLength(0);

    class LateCounter extends HTMLElement {
      public static __elfDefinition = {
        tag: "elf-adapter-late-counter",
        props: {},
        shadow: "open" as const,
      };

      public constructor() {
        super();
        (this as unknown as Record<symbol, unknown>)[INSTANCE_KEY] = {};
      }
    }
    customElements.define("elf-adapter-late-counter", LateCounter);
    await customElements.whenDefined("elf-adapter-late-counter");
    await Promise.resolve();
    await Promise.resolve();

    expect(bridge.getSnapshot().components).toMatchObject([
      { tag: "elf-adapter-late-counter" },
    ]);
    adapter.disconnect();
  });
});
