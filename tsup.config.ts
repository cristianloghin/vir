import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"], // CommonJS and ES modules
  dts: true, // Generate .d.ts files
  splitting: false,
  sourcemap: true,
  clean: true, // Clean output directory before building,
  minify: true,
  // Drop debug `console.info` logs from the bundle: marking the call pure lets
  // minification eliminate it (its return value is unused). `console.error` is
  // kept on purpose — those report subscriber/selector failures to consumers.
  esbuildOptions(options) {
    options.pure = [...(options.pure ?? []), "console.info"];
  },
});
