/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // In development the API runs separately on :3000; in production Hono
    // serves this build itself so no proxy is involved.
    proxy: { "/api": "http://localhost:3000" },
  },
  build: { outDir: "dist", sourcemap: true },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
