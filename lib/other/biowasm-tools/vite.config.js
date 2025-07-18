import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      name: "Aioli",
      formats: ["es", "cjs"],
      fileName: 'aioli',
      entry: "src/main.js"
    }
  }
});
