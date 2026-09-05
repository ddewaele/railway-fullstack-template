import { defineConfig } from "tsup";

// Bundles the server (and the migration runner) into plain ESM files under dist/.
// Workspace packages (@repo/*) are inlined so `node dist/index.js` needs only
// the third-party dependencies present in node_modules.
export default defineConfig({
  entry: { index: "src/index.ts", migrate: "src/migrate.ts" },
  format: ["esm"],
  target: "node22",
  platform: "node",
  clean: true,
  sourcemap: true,
  splitting: false,
  noExternal: [/^@repo\//],
});
