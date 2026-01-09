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
  resolve: {
    alias: {
      "@": getAliasPath("src"),
      "@components": getAliasPath("components"),
      "@contexts": getAliasPath("contexts"),
      "@styles": getAliasPath("styles"),
      "@views": getAliasPath("views"),
      "@pages": getAliasPath("pages"),
      "@hooks": getAliasPath("hooks"),
      "@services": getAliasPath("services"),
      "@utils": getAliasPath("utils"),
      "@stores": getAliasPath("stores"),
      "@types": getAliasPath("types"),
    },
  },
});
