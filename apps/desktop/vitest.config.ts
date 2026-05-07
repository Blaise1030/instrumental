import os from "node:os";
import { fileURLToPath, URL } from "node:url";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";

/** Cap parallel workers — full Vue SFC suite + Monaco mocks can starve the machine and feel hung. */
const maxWorkers = Math.min(
  4,
  Math.max(
    1,
    typeof os.availableParallelism === "function"
      ? os.availableParallelism()
      : os.cpus().length,
  ),
);

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@shared": fileURLToPath(new URL("./src/shared", import.meta.url)),
      shadcn: fileURLToPath(new URL("./shadcn", import.meta.url)),
      // monaco-editor only declares `module`; Vite 6 package entry resolution needs a concrete file.
      "monaco-editor": fileURLToPath(
        new URL("./node_modules/monaco-editor/esm/vs/editor/editor.main.js", import.meta.url)
      )
    }
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: [fileURLToPath(new URL("./src/test/setup.ts", import.meta.url))],
    include: ["src/**/*.test.ts", "electron/**/*.test.ts"],
    maxWorkers,
    minWorkers: 1,
    testTimeout: 60_000,
    hookTimeout: 30_000,
    teardownTimeout: 10_000,
    isolate: true,
    reporter: process.env.CI ? "dot" : "default",
  }
});
