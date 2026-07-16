import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const getAliasPath = (filepath: string) =>
  fileURLToPath(new URL(`./src/${filepath}`, import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: "0.0.0.0",
    port: 3000,
    watch: {
      usePolling: true,
    },
  },
  // `@blurtz/shared` is a LINKED workspace package that ships CommonJS (the
  // server is a CJS Nest build and cannot require() ESM, so CJS is the format
  // that serves both sides). Vite treats a linked dep as source and skips
  // pre-bundling it, which leaves a CJS package with no ESM interop - so it
  // has to be opted back in, in both dev and build. There is no path alias
  // here on purpose: it resolves through the workspace symlink like any other
  // dependency.
  optimizeDeps: {
    include: ["@blurtz/shared"],
  },
  build: {
    commonjsOptions: {
      include: [/@blurtz\/shared/, /node_modules/],
    },
  },
  resolve: {
    alias: {
      "@": getAliasPath("src"),
      "@components": getAliasPath("components"),
      "@contexts": getAliasPath("contexts"),
      "@styles": getAliasPath("styles"),
      "@views": getAliasPath("views"),
      "@hooks": getAliasPath("hooks"),
      "@services": getAliasPath("services"),
      "@utils": getAliasPath("utils"),
      "@stores": getAliasPath("stores"),
      "@types": getAliasPath("types"),
    },
  },
});
