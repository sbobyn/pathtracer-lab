import { defineConfig } from "vite";
import glsl from "vite-plugin-glsl";

export default defineConfig({
  base: "/three-pathtracer/",
  plugins: [glsl()],
  publicDir: "static/",
  server: {
    port: 3005,
    host: true,
    open: true,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    target: "esnext",
  },
});
