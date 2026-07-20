import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
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
