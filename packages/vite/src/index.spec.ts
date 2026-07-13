import { describe, expect, it } from "vitest";
import { createDevtoolsBootstrap, elfuiDevtools } from "./index";

describe("elfuiDevtools", () => {
  it("injects the development bootstrap but can be disabled", () => {
    const plugin = elfuiDevtools();
    expect(plugin.apply).toBe("serve");
    expect(createDevtoolsBootstrap()).toMatchObject([
      { tag: "script", injectTo: "body" },
    ]);
    expect(elfuiDevtools({ enabled: false }).transformIndexHtml).toBeDefined();
  });
});
