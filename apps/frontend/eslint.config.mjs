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
    // Ignore legacy template folders
    "legacy/**",
    "akbar/**",
    "disha/**",
    "poorvisha/**",
    "sathvika/**",
    "sravani/**",
    "**/*.test.ts",
    "**/*.test.tsx",
    "test-e2e.js"
  ]),
]);

export default eslintConfig;
