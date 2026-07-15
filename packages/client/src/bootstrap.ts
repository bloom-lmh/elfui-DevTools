import {
  createDevtoolsBridge,
  createInPageDevtoolsTransport,
  installElfUIAdapter,
  installGlobalDevtoolsBridge,
} from "@elfui/devtools-runtime";

import { DevtoolsPanel } from "./panel";
import { DevtoolsRpcClient } from "./rpc-client";

export const installElfUIDevtools = (): (() => void) => {
  const bridge = createDevtoolsBridge();
  const uninstallGlobal = installGlobalDevtoolsBridge(bridge);
  const adapter = installElfUIAdapter(bridge);
  const rpc = new DevtoolsRpcClient(createInPageDevtoolsTransport(bridge));
  let disposed = false;
  let panel: DevtoolsPanel | null = null;
  void rpc
    .connect()
    .then(() => {
      if (!disposed) panel = new DevtoolsPanel(bridge, window.document, rpc);
    })
    .catch((error: unknown) => {
      console.warn("[ElfUI DevTools] RPC handshake failed", error);
      if (!disposed) panel = new DevtoolsPanel(bridge);
    });
  return () => {
    disposed = true;
    panel?.dispose();
    rpc.dispose();
    adapter.disconnect();
    uninstallGlobal();
  };
};
