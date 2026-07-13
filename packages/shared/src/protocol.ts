export const DEVTOOLS_PROTOCOL_VERSION = 1 as const;

export type PrimitiveValue = string | number | boolean | null;

export interface SerializedPrimitive {
  kind: "primitive";
  value: PrimitiveValue;
}

export interface SerializedSpecial {
  kind:
    | "undefined"
    | "bigint"
    | "symbol"
    | "function"
    | "date"
    | "regexp"
    | "error"
    | "dom"
    | "weak";
  preview: string;
}

export interface SerializedReference {
  kind: "reference";
  id: number;
  preview: string;
}

export interface SerializedArray {
  kind: "array";
  id: number;
  items: SerializedValue[];
  truncated: boolean;
}

export interface SerializedObject {
  kind: "object";
  id: number;
  name: string;
  entries: Array<{ key: string; value: SerializedValue }>;
  truncated: boolean;
}

export interface SerializedCollection {
  kind: "map" | "set";
  id: number;
  entries:
    | SerializedValue[]
    | Array<{ key: SerializedValue; value: SerializedValue }>;
  truncated: boolean;
}

export type SerializedValue =
  | SerializedPrimitive
  | SerializedSpecial
  | SerializedReference
  | SerializedArray
  | SerializedObject
  | SerializedCollection;

export interface SourceLocation {
  file: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
}

export interface ComponentNodeSnapshot {
  id: string;
  appId: string;
  parentId: string | null;
  tag: string;
  displayName: string;
  mounted: boolean;
  shadowMode: "open" | "closed" | "none";
  children: string[];
  source?: SourceLocation;
}

export interface ComponentDetailSnapshot extends ComponentNodeSnapshot {
  props: SerializedValue;
  attrs: SerializedValue;
  setup: SerializedValue;
  exposed: SerializedValue;
  lifecycle: {
    updateCount: number;
    lastUpdatedAt: number | null;
    error: SerializedValue | null;
  };
}

export interface AppSnapshot {
  id: string;
  label: string;
  rootIds: string[];
}

export interface TimelineEvent {
  id: string;
  appId: string;
  componentId?: string;
  layer: "component" | "reactivity" | "events" | "router";
  type: string;
  at: number;
  summary: string;
  data?: SerializedValue;
}

export interface DevtoolsSnapshot {
  protocolVersion: typeof DEVTOOLS_PROTOCOL_VERSION;
  apps: AppSnapshot[];
  components: ComponentNodeSnapshot[];
}
