import {
  createDevtoolsBridge,
  installElfUIAdapter,
  installGlobalDevtoolsBridge,
} from "@elfui/devtools-runtime";

import { DevtoolsPanel } from "./panel";

export const installElfUIDevtools = (): (() => void) => {
  const bridge = createDevtoolsBridge();
  const uninstallGlobal = installGlobalDevtoolsBridge(bridge);
  const adapter = installElfUIAdapter(bridge);
  const panel = new DevtoolsPanel(bridge);
  return () => {
    panel.dispose();
    adapter.disconnect();
    uninstallGlobal();
  };
};
