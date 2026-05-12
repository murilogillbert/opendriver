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
          // Leaflet is heavy (~40 KB gzipped) and only used on the home map. Keep it
          // out of the marketplace chunk so the lazy import in <PartnerMap /> can
          // actually defer it.
          if (id.includes("node_modules/leaflet")) {
            return "vendor-leaflet";
          }
          if (id.includes("/src/components/admin/")) {
            return "admin";
          }
          if (id.includes("/src/components/partner/")) {
            return "partner";
          }
          // Don't bundle PartnerMap into the marketplace chunk — it must stay lazy.
          if (id.includes("/src/components/marketplace/PartnerMap")) {
            return undefined;
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
