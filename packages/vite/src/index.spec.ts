import type { IncomingMessage, ServerResponse } from "node:http";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  DEVTOOLS_OPEN_IN_EDITOR_ENDPOINT,
  createDevtoolsBootstrap,
  createOpenInEditorMiddleware,
  elfuiDevtools,
} from "./index";

const requestMiddleware = (
  middleware: ReturnType<typeof createOpenInEditorMiddleware>,
  url: string,
) => {
  const end = vi.fn();
  const next = vi.fn();
  const response = { statusCode: 200, end } as unknown as ServerResponse;
  middleware({ url } as IncomingMessage, response, next);
  return { end, next, response };
};

describe("elfuiDevtools", () => {
  it("injects the development bootstrap but can be disabled", () => {
    const plugin = elfuiDevtools();
    expect(plugin.apply).toBe("serve");
    expect(createDevtoolsBootstrap()).toMatchObject([
      {
        tag: "script",
        attrs: {
          src: "/@id/__x00__virtual:elfui-devtools-client",
        },
        injectTo: "body",
      },
    ]);
    expect(elfuiDevtools({ enabled: false }).transformIndexHtml).toBeDefined();
  });

  it("opens an existing source file with its line and column", () => {
    const openInEditor = vi.fn();
    const middleware = createOpenInEditorMiddleware(process.cwd(), {
      openInEditor,
    });
    const query = new URLSearchParams({
      file: "package.json",
      line: "3",
      column: "4",
    });
    const { response, next } = requestMiddleware(
      middleware,
      `${DEVTOOLS_OPEN_IN_EDITOR_ENDPOINT}?${query}`,
    );

    expect(response.statusCode).toBe(204);
    expect(next).not.toHaveBeenCalled();
    expect(openInEditor).toHaveBeenCalledWith(
      resolve(process.cwd(), "package.json"),
      3,
      4,
    );
  });

  it("rejects paths outside the Vite root and ignores other routes", () => {
    const openInEditor = vi.fn();
    const middleware = createOpenInEditorMiddleware(process.cwd(), {
      openInEditor,
    });
    const blocked = requestMiddleware(
      middleware,
      `${DEVTOOLS_OPEN_IN_EDITOR_ENDPOINT}?file=../package.json`,
    );
    const ignored = requestMiddleware(middleware, "/application-route");

    expect(blocked.response.statusCode).toBe(403);
    expect(openInEditor).not.toHaveBeenCalled();
    expect(ignored.next).toHaveBeenCalledOnce();
  });
});
