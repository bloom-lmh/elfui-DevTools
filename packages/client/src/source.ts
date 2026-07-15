import {
  DEVTOOLS_OPEN_IN_EDITOR_ENDPOINT,
  type SourceLocation,
} from "@elfui/devtools-shared";

export type OpenSourceInEditor = (source: SourceLocation) => Promise<void>;

export const openSourceInEditor = async (
  source: SourceLocation,
  fetchImplementation: typeof fetch = globalThis.fetch,
  origin = globalThis.location?.origin ?? "http://localhost",
): Promise<void> => {
  const url = new URL(DEVTOOLS_OPEN_IN_EDITOR_ENDPOINT, origin);
  url.searchParams.set("file", source.file);
  url.searchParams.set("line", String(source.line));
  url.searchParams.set("column", String(source.column));
  const response = await fetchImplementation(url, { method: "POST" });
  if (!response.ok) {
    throw new Error(
      `Failed to open source in editor (${response.status} ${response.statusText})`,
    );
  }
};
