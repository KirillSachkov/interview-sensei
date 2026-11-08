import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const serverPort = process.env.SERVER_PORT ?? "4310";

export default defineConfig({
  plugins: [
    // File routes live in the FSD app layer and only mount pages; it must precede react().
    tanstackRouter({
      target: "react",
      routesDirectory: "./src/app/routes",
      generatedRouteTree: "./src/app/route-tree.gen.ts",
      autoCodeSplitting: true,
    }),
    react(),
  ],
  resolve: { tsconfigPaths: true },
  server: {
    host: "127.0.0.1",
    port: Number(process.env.WEB_PORT ?? "5173"),
    strictPort: true,
    // The browser calls same-origin /api; the dev server forwards it to the server, so no CORS
    // and no server URL is built into the bundle.
    // `ws` forwards the WebSocket of an agent session too.
    proxy: { "/api": { target: `http://127.0.0.1:${serverPort}`, ws: true } },
  },
});
