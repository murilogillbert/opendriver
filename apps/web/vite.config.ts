import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  build: {
    // Quiet the legitimate vendor chunk: react + react-dom alone are ~140 KB.
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // Manual chunks keep the marketing landing tiny by deferring the admin/partner
        // bundles. Admin pages still load fast because their JS doesn't get parsed on
        // the marketplace route.
        manualChunks(id) {
          if (id.includes("node_modules/react/") || id.includes("node_modules/react-dom/")) {
            return "vendor-react";
          }
          if (id.includes("node_modules/qrcode")) {
            return "vendor-qrcode";
          }
          if (id.includes("/src/components/admin/")) {
            return "admin";
          }
          if (id.includes("/src/components/partner/")) {
            return "partner";
          }
          if (id.includes("/src/components/marketplace/")) {
            return "marketplace";
          }
          return undefined;
        }
      }
    }
  }
});
