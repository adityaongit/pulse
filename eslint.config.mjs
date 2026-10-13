import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Agent worktrees are full checkouts of other branches.
    ".claude/**",
    // The marketing site (site/) is a separate Astro project with its own tooling.
    "site/**",
    // The native app shell (mobile/) is a separate Capacitor project with its own tooling.
    "mobile/**",
  ]),
]);

export default eslintConfig;
