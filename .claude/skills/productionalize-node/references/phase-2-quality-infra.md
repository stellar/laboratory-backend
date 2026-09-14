# Phase 2: Quality Infrastructure

Depends on Phase 1 (Foundation).

## 2a: Linting + Formatting Setup

### ESLint (flat config)

1. Install: `pnpm add -D eslint @eslint/js typescript-eslint`
2. Create `eslint.config.mjs`:
   ```js
   import eslint from '@eslint/js'
   import tseslint from 'typescript-eslint'

   export default tseslint.config(
     eslint.configs.recommended,
     ...tseslint.configs.recommended,
     {
       rules: {
         '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
         '@typescript-eslint/no-explicit-any': 'warn',
       },
     },
     {
       ignores: ['dist/', 'coverage/', 'node_modules/', '**/*.test.ts'],
     }
   )
   ```
3. Adjust rules based on the project's needs. Don't be overly strict on a first pass — `warn` for things the team can tighten later.

### Prettier

1. Install: `pnpm add -D prettier`
2. Create `.prettierrc`:
   ```json
   {
     "semi": false,
     "singleQuote": true,
     "trailingComma": "all",
     "printWidth": 100,
     "tabWidth": 2
   }
   ```
   Adjust to match existing code style if the project already has a dominant pattern.
3. Create `.prettierignore`:
   ```
   dist/
   coverage/
   pnpm-lock.yaml
   ```

### Run and fix

1. Run `pnpm run format -- --write .` to auto-format all files.
2. Run `pnpm run lint -- --fix` to auto-fix lint issues.
3. Fix remaining lint errors manually.
4. Verify: `pnpm run format:check` and `pnpm run lint` both pass with zero errors.

## 2b: Logger Setup

1. Check if the project already uses a logger. If yes, keep it.
2. If only `console.log` is used:
   - Install pino: `pnpm add pino`
   - Create a logger module (e.g., `src/logger.ts`):
     ```typescript
     import pino from 'pino'

     export const logger = pino({
       level: process.env.LOG_LEVEL ?? 'info',
     })
     ```
   - Replace `console.log` calls with appropriate logger levels:
     - `console.log` → `logger.info`
     - `console.error` → `logger.error`
     - `console.warn` → `logger.warn`
     - Debug/trace output → `logger.debug`
3. Do NOT replace console.log in test files or CLI scripts where stdout is the interface.
4. Verify: application starts and produces structured JSON logs.

## Verification

- `pnpm run lint` passes with zero errors
- `pnpm run format:check` passes
- Application logs are structured JSON (if logger was set up)
