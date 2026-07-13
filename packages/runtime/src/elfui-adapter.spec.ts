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
    }
    customElements.define("elf-adapter-counter", Counter);
    const host = document.createElement("elf-adapter-counter") as Counter;
    (host as unknown as Record<symbol, unknown>)[INSTANCE_KEY] = {};
    document.body.appendChild(host);
    const bridge = createDevtoolsBridge();
    const adapter = installElfUIAdapter(bridge);

    expect(bridge.getSnapshot().components).toMatchObject([
      { tag: "elf-adapter-counter" },
    ]);
    expect(bridge.getSnapshot().components).toHaveLength(1);
    host.remove();
    await Promise.resolve();
    await Promise.resolve();
    expect(bridge.getSnapshot().components).toHaveLength(0);
    adapter.disconnect();
  });
});
