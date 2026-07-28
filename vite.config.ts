import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";
import { configDefaults } from "vitest/config";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [svelte()],
  resolve: {
    conditions: ["browser"],
  },
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    host: host || "127.0.0.1",
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 5174,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    // Nested git worktrees live under .claude/worktrees and would otherwise be
    // collected as a second copy of the whole suite.
    exclude: [...configDefaults.exclude, "**/.claude/**"],
  },
});
