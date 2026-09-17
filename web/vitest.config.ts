import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules", ".next"],
  },
  resolve: {
    alias: {
      // Mirrors the `@/*` path alias in web/tsconfig.json.
      "@": fileURLToPath(new URL("./", import.meta.url)),
      // `server-only` resolves to an empty module ONLY under the `react-server` export
      // condition; vitest resolves the default, which is a module whose whole job is to
      // throw. Without this alias every suite that transitively imports
      // web/lib/hotels/db.ts fails to collect with "This module cannot be imported from a
      // Client Component module" — which reads as a code fault rather than a resolver one.
      // `../` because node_modules is hoisted to the workspace root.
      "server-only": fileURLToPath(new URL("../node_modules/server-only/empty.js", import.meta.url)),
    },
  },
});
