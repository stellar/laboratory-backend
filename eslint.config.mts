import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores(["**/node_modules", "**/dist", "**/generated"]),
  // ESLint core recommended (JS)
  js.configs.recommended,

  // TypeScript ESLint recommended (TS)
  tseslint.configs.eslintRecommended,
  tseslint.configs.recommended,

  // Project-specific tweaks / options
  {
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      "@typescript-eslint/no-namespace": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
]);
