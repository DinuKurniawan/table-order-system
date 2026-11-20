import path from "node:path";
import "dotenv/config";
import { defineConfig } from "vitest/config";

export default defineConfig(() => {
  return {
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src"),
        // Tes berjalan di Node biasa; penanda server-only hanya relevan di bundler.
        "server-only": path.resolve(__dirname, "node_modules/server-only/empty.js"),
      },
    },
    test: {
      include: ["quality/**/*.test.ts"],
      setupFiles: ["quality/setup.ts"],
      fileParallelism: false,
      testTimeout: 30_000,
      hookTimeout: 30_000,
    },
  };
});
