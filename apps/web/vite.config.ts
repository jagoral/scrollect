import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import svgr from "vite-plugin-svgr";
import { nitro } from "nitro/vite";

export default defineConfig({
  resolve: {
    dedupe: ["react", "react-dom"],
  },
  build: {
    rollupOptions: {
      external: [/^node:/],
    },
  },
  server: {
    port: 3000,
    proxy: {
      "/ingest": {
        target: "https://eu.i.posthog.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ingest/, ""),
        secure: false,
      },
    },
  },
  plugins: [
    svgr(),
    tailwindcss(),
    tsConfigPaths({
      projects: ["./tsconfig.json"],
    }),
    tanstackStart({
      srcDirectory: "src",
    }),
    viteReact({
      babel: {
        plugins: ["babel-plugin-react-compiler"],
      },
    }),
    nitro({
      compressPublicAssets: true,
      routeRules: {
        "/ingest/**": {
          proxy: { to: "https://eu.i.posthog.com/**" },
        },
      },
    }),
  ],
});
