import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@types": path.resolve(__dirname, "./types"),
    },
  },
  server: {
    port: 5174,
    strictPort: true, // Fail instead of silently picking another port
  },
});
