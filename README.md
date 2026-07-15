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

In development, it injects a bottom-center launcher with separate **ElfUI DevTools** and **Component Inspector** buttons. The panel stays hidden until opened; choose the inspector, then click an `elf-*` host to inspect the component tree, props, attributes, setup snapshot, exposed state, lifecycle count, and recent timeline events. The plugin uses `apply: "serve"`, so it is absent from production builds.

For source locations, the compiler may attach a development-only `__elfSource` field to a component constructor:

```ts
Counter.__elfSource = { file: "/src/Counter.elf", line: 12, column: 1 };
```

DevTools exposes this field in the component snapshot and displays it in the detail panel.

## RPC boundary

Panel data is read through a versioned request/response protocol. Every request carries `protocolVersion` and `requestId`; the initial handshake negotiates component, timeline, control, and reactivity capabilities. The current transport is in-page, while the same shared envelopes are intended for extension ports and standalone transports later.

Protocol definitions live in `@elfui/devtools-shared`; `@elfui/devtools-runtime` exposes the bridge endpoint and in-page transport, and `@elfui/devtools-client` exposes `DevtoolsRpcClient`.

The product plan is in [docs/plan/elfui-devtools.md](docs/plan/elfui-devtools.md).

This project is intentionally independent of Vue. It will support ElfUI apps directly and may offer optional integration with Vite and Vue DevTools hosts later.
