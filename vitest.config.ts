import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["packages/**/src/**/*.spec.ts"],
    coverage: { reporter: ["text", "html"] },
  },
});
