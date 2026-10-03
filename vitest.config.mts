import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    // Seed-heavy pipeline tests can exceed the 5 s default on a loaded machine.
    testTimeout: 30_000,
    // Same for the beforeAll hooks that seed two demo databases.
    hookTimeout: 60_000,
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
