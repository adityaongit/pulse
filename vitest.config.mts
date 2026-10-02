import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    projects: [
      // src/core, src/server and src/lib: plain Node.
      { extends: true, test: { name: "node", environment: "node", include: ["src/**/*.test.ts"] } },
      // Component tests.
      {
        extends: true,
        test: {
          name: "dom",
          environment: "happy-dom",
          include: ["src/**/*.test.tsx"],
          setupFiles: ["./vitest.setup.ts"],
        },
      },
    ],
  },
});
