import { defineConfig } from "vite";

export default defineConfig({
  // Relative asset URLs work locally and under a GitHub Pages repository path.
  base: "./",
  server: { watch: { ignored: ["**/reports/**"] } },
  build: {
    rollupOptions: {
      input: { island: "index.html", gallery: "gallery.html" },
      output: {
        manualChunks(id) {
          if (id.includes("/node_modules/three/build/three.core.js"))
            return "three-core";
          if (id.includes("/node_modules/three/")) return "three-renderer";
        },
      },
    },
  },
});

