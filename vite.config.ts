import { defineConfig } from "vite";

export default defineConfig({
  // Relative asset URLs work locally and under a GitHub Pages repository path.
  base: "./",
  server: { watch: { ignored: ["**/reports/**"] } },
});
