import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: { port: 5175 },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
