import type { DevtoolsComponentInput } from "./bridge";
import type { ElfUIDevtoolsBridge } from "./bridge";
import type { SourceLocation } from "@elfui/devtools-shared";

const INSTANCE_KEY = Symbol.for("elfui.instance");
const APP_ID_KEY = Symbol.for("elfui.app.id");

interface ElfUIDefinition {
  tag?: string;
  props?: Record<string, unknown>;
  shadow?: "open" | "closed" | false;
}

interface ElfUIConstructor extends CustomElementConstructor {
  __elfDefinition?: ElfUIDefinition;
  __elfSource?: SourceLocation;
}

interface ElfUIInstanceDebugState {
  devtools?: {
    id?: string;
    parentId?: string | null;
    props?: Record<string, unknown>;
    setup?: Record<string, unknown>;
    exposed?: Record<string, unknown>;
  };
}

const instanceFor = (host: HTMLElement): ElfUIInstanceDebugState | null =>
  ((host as unknown as Record<symbol, unknown>)[INSTANCE_KEY] as
    | ElfUIInstanceDebugState
    | undefined) ?? null;

const appIdFor = (host: HTMLElement): string | null => {
  let current: Node | null = host;
  while (current) {
    const appId = (current as unknown as Record<symbol, unknown>)[APP_ID_KEY];
    if (typeof appId === "string") return appId;
    if (current.parentNode) current = current.parentNode;
    else if (current instanceof ShadowRoot) current = current.host;
    else current = null;
  }
  return null;
};

const isElfUIHost = (node: Node): node is HTMLElement => {
  if (!(node instanceof HTMLElement)) return false;
  const constructor = node.constructor as ElfUIConstructor;
  return Boolean(
    constructor.__elfDefinition?.tag &&
    (node as unknown as Record<symbol, unknown>)[INSTANCE_KEY],
  );
};

const attributes = (host: HTMLElement): Record<string, string> =>
  Object.fromEntries(
    Array.from(host.attributes, (attribute) => [
      attribute.name,
      attribute.value,
    ]),
  );

const inputFor = (host: HTMLElement): DevtoolsComponentInput => {
  const definition = (host.constructor as ElfUIConstructor).__elfDefinition!;
  const source = (host.constructor as ElfUIConstructor).__elfSource;
  const propNames = Object.keys(definition.props ?? {});
  const debug = instanceFor(host)?.devtools;
  const hostRef = new WeakRef(host);
  return {
    ...(typeof debug?.id === "string" ? { id: debug.id } : {}),
    host,
    appId: appIdFor(host),
    ...(typeof debug?.parentId === "string" || debug?.parentId === null
      ? { parentId: debug.parentId }
      : {}),
    tag: definition.tag!,
    ...(definition.tag ? { displayName: definition.tag } : {}),
    shadowMode:
      definition.shadow === false ? "none" : (definition.shadow ?? "open"),
    ...(source ? { source } : {}),
    props: () =>
      debug?.props ??
      Object.fromEntries(
        propNames.map((name) => [
          name,
          hostRef.deref()?.[name as keyof HTMLElement],
        ]),
      ),
    attrs: () => {
      const current = hostRef.deref();
      return current ? attributes(current) : {};
    },
    setup: () => debug?.setup ?? {},
    exposed: () => debug?.exposed ?? {},
  };
};

const visit = (root: Node, callback: (host: HTMLElement) => void): void => {
  if (isElfUIHost(root)) callback(root);
  for (const element of Array.from(
    (root as ParentNode).querySelectorAll?.("*") ?? [],
  )) {
    if (isElfUIHost(element)) callback(element);
  }
};

export interface ElfUIAdapter {
  disconnect(): void;
  scan(): void;
}

export const installElfUIAdapter = (
  bridge: ElfUIDevtoolsBridge,
  root: ParentNode = document,
): ElfUIAdapter => {
  const scan = (): void =>
    visit(root as Node, (host) => bridge.registerComponent(inputFor(host)));
  scan();
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of Array.from(record.addedNodes))
        visit(node, (host) => bridge.registerComponent(inputFor(host)));
      for (const node of Array.from(record.removedNodes)) {
        visit(node, (host) =>
          queueMicrotask(() => {
            if (!host.isConnected) bridge.unregisterComponent(host);
          }),
        );
      }
    }
  });
  observer.observe(root, { childList: true, subtree: true });
  return { disconnect: () => observer.disconnect(), scan };
};
