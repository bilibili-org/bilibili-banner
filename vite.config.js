import { defineConfig } from "vite";

export default defineConfig({
  base: "/bilibili-banner/",
  server: {
    watch: {
      ignored: ["**/scripts/**"],
    },
  },
});
