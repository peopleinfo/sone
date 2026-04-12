import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { defineConfig } from "vite";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(rootDir, "./src"),
      "node:module": resolve(rootDir, "./src/shims/node-module.ts"),
    },
    conditions: ["browser"],
  },
  server: {
    proxy: {
      "/api": {
        target: `http://${process.env.LIVE_AGENT_API_HOST || "127.0.0.1"}:${process.env.LIVE_AGENT_API_PORT || "5174"}`,
        changeOrigin: true,
      },
    },
  },
});
