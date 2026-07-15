import { existsSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import launchEditor from "launch-editor";
import type { Plugin } from "vite";

export const DEVTOOLS_OPEN_IN_EDITOR_ENDPOINT =
  "/__elfui_devtools/open-in-editor" as const;

const virtualClientId = "virtual:elfui-devtools-client";
const resolvedVirtualClientId = `\0${virtualClientId}`;
const virtualClientUrl = "/@id/__x00__virtual:elfui-devtools-client";

export interface ElfUIDevtoolsViteOptions {
  enabled?: boolean;
  editor?: string;
  openInEditor?: (file: string, line: number, column: number) => void;
}

type DevtoolsMiddleware = (
  request: IncomingMessage,
  response: ServerResponse,
  next: () => void,
) => void;

const send = (
  response: ServerResponse,
  statusCode: number,
  body = "",
): void => {
  response.statusCode = statusCode;
  response.end(body);
};

const isInsideRoot = (root: string, file: string): boolean => {
  const pathFromRoot = relative(root, file);
  return (
    pathFromRoot !== ".." &&
    !pathFromRoot.startsWith(`..${sep}`) &&
    !isAbsolute(pathFromRoot)
  );
};

const positiveInteger = (value: string | null): number => {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
};

export const createOpenInEditorMiddleware = (
  root: string,
  options: ElfUIDevtoolsViteOptions = {},
): DevtoolsMiddleware => {
  const projectRoot = resolve(root);
  const open =
    options.openInEditor ??
    ((file: string, line: number, column: number) => {
      const target = `${file}:${line}:${column}`;
      const onError = (fileName: string, errorMessage: string | null): void => {
        console.warn(
          `[ElfUI DevTools] Failed to open ${fileName}: ${errorMessage ?? "Unknown editor error"}`,
        );
      };
      if (options.editor) launchEditor(target, options.editor, onError);
      else launchEditor(target, onError);
    });

  return (request, response, next) => {
    const url = new URL(request.url ?? "/", "http://elfui.local");
    if (url.pathname !== DEVTOOLS_OPEN_IN_EDITOR_ENDPOINT) {
      next();
      return;
    }

    const requestedFile = url.searchParams.get("file");
    if (!requestedFile) {
      send(response, 400, "Missing source file");
      return;
    }

    const sourceFile = resolve(projectRoot, requestedFile);
    if (!isInsideRoot(projectRoot, sourceFile)) {
      send(response, 403, "Source file is outside the Vite project root");
      return;
    }
    try {
      if (!existsSync(sourceFile) || !statSync(sourceFile).isFile()) {
        send(response, 404, "Source file does not exist");
        return;
      }
      open(
        sourceFile,
        positiveInteger(url.searchParams.get("line")),
        positiveInteger(url.searchParams.get("column")),
      );
      send(response, 204);
    } catch (error) {
      send(
        response,
        500,
        error instanceof Error ? error.message : String(error),
      );
    }
  };
};

export const createDevtoolsBootstrap = () => [
  {
    tag: "script",
    attrs: { type: "module", src: virtualClientUrl },
    injectTo: "body" as const,
  },
];

export const elfuiDevtools = (
  options: ElfUIDevtoolsViteOptions = {},
): Plugin => ({
  name: "elfui-devtools",
  apply: "serve",
  configureServer(server) {
    if (options.enabled === false) return;
    server.middlewares.use(
      createOpenInEditorMiddleware(server.config.root, options),
    );
  },
  resolveId(id) {
    return id === virtualClientId ? resolvedVirtualClientId : undefined;
  },
  load(id) {
    return id === resolvedVirtualClientId
      ? 'import "@elfui/devtools-client/auto";'
      : undefined;
  },
  transformIndexHtml: () => {
    if (options.enabled === false) return [];
    return createDevtoolsBootstrap();
  },
});
