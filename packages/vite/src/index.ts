import type { Plugin } from "vite";

const virtualClientId = "virtual:elfui-devtools-client";
const resolvedVirtualClientId = `\0${virtualClientId}`;
const virtualClientUrl = "/@id/__x00__virtual:elfui-devtools-client";

export interface ElfUIDevtoolsViteOptions {
  enabled?: boolean;
}

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
