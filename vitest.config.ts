import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@elfui/devtools-shared": fileURLToPath(
        new URL("./packages/shared/src/index.ts", import.meta.url),
      ),
      "@elfui/devtools-runtime": fileURLToPath(
        new URL("./packages/runtime/src/index.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "jsdom",
    include: ["packages/**/src/**/*.spec.ts"],
    coverage: { reporter: ["text", "html"] },
  },
});
