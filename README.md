# ElfUI DevTools

Development tools for inspecting, locating, and profiling ElfUI Custom Elements.

## Development usage

Add the Vite plugin after the ElfUI compiler plugin:

```ts
import { defineConfig } from "vite";
import { elfuiMacroPlugin } from "@elfui/vite-plugin";
import { elfuiDevtools } from "@elfui/devtools-vite";

export default defineConfig({
  plugins: [elfuiMacroPlugin(), elfuiDevtools()],
});
```

In development, it injects a floating ElfUI DevTools panel. Choose **Inspect component**, then click an `elf-*` host to inspect the component tree, props, attributes, setup snapshot, lifecycle count, and recent timeline events. The plugin uses `apply: "serve"`, so it is absent from production builds.

For source locations, the compiler may attach a development-only `__elfSource` field to a component constructor:

```ts
Counter.__elfSource = { file: "/src/Counter.elf", line: 12, column: 1 };
```

DevTools exposes this field in the component snapshot and displays it in the detail panel.

The product plan is in [docs/plan/elfui-devtools.md](docs/plan/elfui-devtools.md).

This project is intentionally independent of Vue. It will support ElfUI apps directly and may offer optional integration with Vite and Vue DevTools hosts later.
