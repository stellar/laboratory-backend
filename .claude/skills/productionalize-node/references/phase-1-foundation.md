# Phase 1: Foundation

No dependencies. This phase establishes the project's structural foundation.

## 1a: TypeScript Strict Migration

1. Check if `tsconfig.json` exists. If not, run `npx tsc --init`.
2. Enable strict mode and recommended flags:
   ```json
   {
     "compilerOptions": {
       "strict": true,
       "noImplicitReturns": true,
       "isolatedModules": true,
       "esModuleInterop": true,
       "declaration": true,
       "declarationMap": true,
       "sourceMap": true,
       "target": "ES2022",
       "module": "NodeNext",
       "moduleResolution": "NodeNext",
       "outDir": "dist",
       "rootDir": "src"
     },
     "include": ["src"],
     "exclude": ["node_modules", "dist", "**/*.test.ts"]
   }
   ```
3. Fix all type errors introduced by strict mode. Common fixes:
   - Add explicit return types to functions
   - Handle null/undefined with narrowing or optional chaining
   - Replace `any` with proper types
   - Add missing type annotations to function parameters
4. Ensure `"type": "module"` is in package.json for ESM projects.
5. Verify: `pnpm run check:types` passes with zero errors.

## 1b: Package.json Scripts + Makefile

1. Ensure these scripts exist in package.json:
   ```json
   {
     "scripts": {
       "build": "tsc",
       "check:types": "tsc --noEmit",
       "test": "vitest",
       "lint": "eslint .",
       "format:check": "prettier --check .",
       "format": "prettier --write .",
       "prepare": "tsc"
     }
   }
   ```
   Adjust based on confirmed tooling (e.g., if user chose Jest over Vitest).

2. Create a `Makefile` that mirrors the CI pipeline:
   ```makefile
   .PHONY: help check format lint types test build deps-audit deps-freshness

   help: ## Show all targets
   	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

   check: format lint types test build deps-audit deps-freshness ## Run full quality pipeline (mirrors CI)

   format: ## Check formatting
   	pnpm run format:check

   lint: ## Run linter
   	pnpm run lint

   types: ## Type-check
   	pnpm run check:types

   test: ## Run tests
   	pnpm test -- --run

   build: ## Build
   	pnpm run build

   deps-audit: ## Audit dependencies for CVEs
   	pnpm audit --audit-level=moderate

   deps-freshness: ## Check no dependency is newer than 1 week
   	@node scripts/check-deps-freshness.js
   ```

3. If a `scripts/check-deps-freshness.js` doesn't exist, create it (see Phase 4 for the script).

## 1c: .gitignore + Editor Configs

1. Ensure `.gitignore` covers at minimum:
   ```
   node_modules/
   dist/
   coverage/
   .env
   .env.*
   !.env.example
   *.log
   .DS_Store
   ```

2. Create `.editorconfig` if missing:
   ```ini
   root = true

   [*]
   indent_style = space
   indent_size = 2
   end_of_line = lf
   charset = utf-8
   trim_trailing_whitespace = true
   insert_final_newline = true
   ```

3. If the project uses VS Code, ensure `.vscode/settings.json` has:
   ```json
   {
     "editor.formatOnSave": true,
     "editor.defaultFormatter": "esbenp.prettier-vscode"
   }
   ```

## Verification

After completing all sub-phases:
- `pnpm run check:types` passes
- `pnpm run build` succeeds
- All source files are properly gitignored
