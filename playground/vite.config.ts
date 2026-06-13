import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// Resolve the library to its TypeScript source rather than the built `dist`,
// so editing src/ hot-reloads in the playground with no rebuild step.
const libSrc = fileURLToPath(new URL("../src/index.ts", import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@mikrostack/vir": libSrc,
    },
  },
});
