import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"], // CommonJS and ES modules
  dts: true, // Generate .d.ts files
  splitting: false,
  sourcemap: true,
  clean: true, // Clean output directory before building
});
