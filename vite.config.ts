import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// https://vite.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      "@physics-derivation-pad/core/ast": fileURLToPath(
        new URL("./src/math/ast/index.ts", import.meta.url),
      ),
      "@physics-derivation-pad/core/compile": fileURLToPath(
        new URL("./src/math/compile/index.ts", import.meta.url),
      ),
      "@physics-derivation-pad/core/latex": fileURLToPath(
        new URL("./src/math/adapters/latex/index.ts", import.meta.url),
      ),
      "@physics-derivation-pad/core/rewrite": fileURLToPath(
        new URL("./src/math/rewrite/index.ts", import.meta.url),
      ),
      "@physics-derivation-pad/core/selection": fileURLToPath(
        new URL("./src/math/selection/index.ts", import.meta.url),
      ),
    },
  },
  build: {
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      onwarn(warning, warn) {
        if (warning.code === "EVAL" && warning.id?.includes("node_modules/algebrite/")) {
          return;
        }

        warn(warning);
      },
    },
  },
  plugins: [react()],
});
