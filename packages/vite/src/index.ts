import type { Plugin } from "vite";

export interface ElfUIDevtoolsViteOptions {
  enabled?: boolean;
}

export const createDevtoolsBootstrap = () => [
  {
    tag: "script",
    attrs: { type: "module", src: "/@id/@elfui/devtools-client/auto" },
    injectTo: "body" as const,
  },
];

export const elfuiDevtools = (
  options: ElfUIDevtoolsViteOptions = {},
): Plugin => ({
  name: "elfui-devtools",
  apply: "serve",
  transformIndexHtml: () => {
    if (options.enabled === false) return [];
    return createDevtoolsBootstrap();
  },
});
