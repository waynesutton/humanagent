import { defineConfig } from "eslint/config";
import convexPlugin from "@convex-dev/eslint-plugin";
import tseslint from "typescript-eslint";

export default defineConfig([
  // TypeScript support (required for type-aware Convex rules)
  ...tseslint.configs.recommended,

  // Convex recommended rules (applies to convex/**/*.ts by default)
  ...convexPlugin.configs.recommended,

  // Enable non-default Convex rules
  {
    files: ["**/convex/**/*.ts"],
    rules: {
      "@convex-dev/import-wrong-runtime": "error",
    },
  },

  // Ignore generated files and build output
  {
    ignores: ["convex/_generated/**", "dist/**", "node_modules/**"],
  },
]);
