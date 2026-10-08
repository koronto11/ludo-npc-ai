import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  build: {
    outDir: "dist/client",
    // Keep local fonts compatible with the application's self-only CSP.
    assetsInlineLimit: 0,
  },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
    // Preserve the browser Host so the local API can validate same-origin requests
    // on the actual development port, including 4184 and localhost aliases.
    proxy: { "/api": { target: `http://127.0.0.1:${process.env.LUDO_API_PORT || '4174'}`, changeOrigin: false } },
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
  plugins: [react()],
});
