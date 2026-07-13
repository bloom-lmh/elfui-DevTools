import { describe, expect, it } from "vitest";

import { serialize } from "./serialize";

describe("serialize", () => {
  it("serializes circular data without retaining the original object", () => {
    const value: { name: string; self?: unknown } = { name: "ElfUI" };
    value.self = value;

    expect(serialize(value)).toEqual({
      kind: "object",
      id: 1,
      name: "Object",
      entries: [
        { key: "name", value: { kind: "primitive", value: "ElfUI" } },
        {
          key: "self",
          value: { kind: "reference", id: 1, preview: "[Object]" },
        },
      ],
      truncated: false,
    });
  });

  it("bounds large collections and marks them as truncated", () => {
    expect(serialize([1, 2, 3], { maxEntries: 2 })).toMatchObject({
      kind: "array",
      items: [
        { kind: "primitive", value: 1 },
        { kind: "primitive", value: 2 },
      ],
      truncated: true,
    });
  });

  it("returns safe summaries for functions, DOM nodes, and weak collections", () => {
    const node = document.createElement("elf-counter");

    expect(serialize(() => undefined)).toEqual({
      kind: "function",
      preview: "[Function anonymous]",
    });
    expect(serialize(node)).toEqual({ kind: "dom", preview: "<elf-counter>" });
    expect(serialize(new WeakMap())).toEqual({
      kind: "weak",
      preview: "[WeakMap]",
    });
  });
});
