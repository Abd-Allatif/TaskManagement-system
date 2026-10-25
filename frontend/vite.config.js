import { defineConfig } from "vite";

// The backend runs on :5000 and only allows CLIENT_URL (http://localhost:3000)
// through CORS, so the dev server mirrors that port and proxies /api to Express.
// This also keeps the auth rate-limiter keyed to a single origin during dev.
export default defineConfig({
  // No @vitejs/plugin-react in this environment — esbuild's automatic JSX
  // runtime is enough to compile React 19 without Babel.
  esbuild: {
    jsx: "automatic",
    jsxDev: true,
  },
  server: {
    port: 3000,
    strictPort: true,
    proxy: {
      "/api": {
        target: process.env.VITE_PROXY_TARGET || "http://localhost:5000",
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 3000,
    strictPort: true,
  },
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});
