import { describe, expect, it, vi } from "vitest";
import { openSourceInEditor } from "./source";

describe("openSourceInEditor", () => {
  it("sends the encoded source location to the Vite endpoint", async () => {
    const fetchImplementation = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      statusText: "No Content",
    });

    await openSourceInEditor(
      { file: "C:/project/src/Card view.elf.ts", line: 8, column: 12 },
      fetchImplementation,
      "http://localhost:5173",
    );

    const [url, init] = fetchImplementation.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/__elfui_devtools/open-in-editor");
    expect(url.searchParams.get("file")).toBe(
      "C:/project/src/Card view.elf.ts",
    );
    expect(url.searchParams.get("line")).toBe("8");
    expect(url.searchParams.get("column")).toBe("12");
    expect(init).toEqual({ method: "POST" });
  });

  it("reports a rejected open request", async () => {
    const fetchImplementation = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: "Forbidden",
    });

    await expect(
      openSourceInEditor(
        { file: "../secret", line: 1, column: 1 },
        fetchImplementation,
        "http://localhost:5173",
      ),
    ).rejects.toThrow("403 Forbidden");
  });
});
