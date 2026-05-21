# Assessment Checklist

Evaluate each item against the target codebase. Record: status (pass/fail/partial), evidence, and remediation needed.

## 1. TypeScript Configuration

**What to check:** Does `tsconfig.json` exist? Is `strict: true` enabled? Check for: `strictNullChecks`, `noImplicitAny`, `noImplicitReturns`, `isolatedModules`, `target` (should be ES2022+), `module` (ESNext/NodeNext), `moduleResolution` (bundler/nodenext).
**How to evaluate:** Read `tsconfig.json` at the repo root (and any extended configs like `tsconfig.build.json`). Verify the `compilerOptions` object explicitly sets `strict: true`. If `strict` is absent, check whether the individual strict-family flags are enabled independently. Inspect `target`, `module`, and `moduleResolution` values.
**Pass criteria:** All strict flags enabled, modern target and module settings.
**Common vibe-code state:** tsconfig exists but `strict` is false or missing, loose target like ES5/ES6, `moduleResolution` set to `node` (legacy) instead of `bundler` or `nodenext`.

## 2. Error Handling

**What to check:** Search for unhandled promise rejections, missing try/catch around async operations, generic catch blocks that swallow errors, missing error types/classes.
**How to evaluate:** Grep for `catch` blocks — look for empty catches (`catch {}`, `catch (e) {}`), catches that only `console.log` the error, and catches that don't rethrow or wrap. Search for `.then()` chains without `.catch()`. Search for `async` functions that lack any error handling. Check whether custom error classes exist (search for `extends Error`). Check if `process.on('unhandledRejection')` or `process.on('uncaughtException')` are set up in entry points.
**Pass criteria:** Custom error hierarchy exists, async operations have proper error handling, errors propagate with context (wrapped with cause or custom message).
**Common vibe-code state:** No custom errors, bare `try/catch` with `console.log`, unhandled promise rejections, `.catch(() => {})` to silence errors.

## 3. Input Validation

**What to check:** Search for raw `req.body`, `req.params`, `req.query` usage without validation. Check for missing Zod/Joi schemas at API boundaries.
**How to evaluate:** Find all route handlers (search for `app.get`, `app.post`, `router.get`, `router.post`, etc.). For each handler, check whether request data is validated before use. Search for Zod schemas (`z.object`), Joi schemas (`Joi.object`), or manual validation. Check if validated types flow through to business logic or if `any` is used after the boundary.
**Pass criteria:** Every API endpoint validates its input using a schema library. Validated types propagate into handler logic. No raw `req.body` access without prior validation.
**Common vibe-code state:** Routes access `req.body.fieldName` directly with no validation, casting to `any`, or ad-hoc `if (!req.body.field)` checks that miss edge cases.

## 4. Security

**What to check:** Hardcoded secrets (grep for API keys, passwords, tokens in source), missing `helmet`, missing rate limiting, raw `process.env` without validation.
**How to evaluate:** Grep for common secret patterns: strings matching API key formats, `password`, `secret`, `token`, `apiKey` assigned to string literals. Check for `.env` files committed to git (`git ls-files .env`). Check if `helmet` middleware is used in Express apps. Check if rate limiting middleware exists. Search for `process.env.` usage and verify it goes through a validation layer. Check for SQL injection vectors (string concatenation in queries), XSS vectors (unescaped user input in responses), and command injection (`exec`, `spawn` with user input).
**Pass criteria:** No hardcoded secrets, helmet enabled, rate limiting on public endpoints, env vars validated, no injection vectors.
**Common vibe-code state:** API keys in source code, no helmet, no rate limiting, raw `process.env` usage everywhere.

## 5. Test Coverage

**What to check:** Do any test files exist? What framework is used? Can you run a coverage report?
**How to evaluate:** Search for test files (`*.test.ts`, `*.spec.ts`, `__tests__/`). Check `package.json` for test framework dependencies (vitest, jest, mocha). Run the test suite and check if it passes. If possible, run with coverage (`--coverage` flag). Count test files vs source files to estimate coverage breadth. Check if tests are meaningful (not just `expect(true).toBe(true)`).
**Pass criteria:** Test framework configured and passing, meaningful tests exist for core business logic, coverage is measurable and reasonable (>70% for critical paths).
**Common vibe-code state:** Zero test files, or a test framework is installed but no actual tests written, or tests exist but are all skipped/broken.

## 6. Linting + Formatting

**What to check:** Does an ESLint config exist? Does a Prettier config exist? Are they consistent (no conflicting rules)?
**How to evaluate:** Look for ESLint config files (`eslint.config.mjs`, `.eslintrc.*`, `eslint.config.ts`). Look for Prettier config (`.prettierrc`, `.prettierrc.json`, `prettier.config.*`). Check if `eslint-config-prettier` or `eslint-plugin-prettier` is used to avoid conflicts. Run `pnpm run lint` and `pnpm run format:check` (or equivalent) to see if the codebase passes. Check if ESLint uses typescript-eslint for TS-aware rules.
**Pass criteria:** Both ESLint and Prettier configured, no conflicts between them, codebase passes both checks, typescript-eslint rules enabled.
**Common vibe-code state:** No ESLint config, or a default config with no TS support, no Prettier, or both installed but never run (many violations).

## 7. CI Pipeline

**What to check:** Does `.github/workflows/` exist? What checks run? Does it mirror local dev checks?
**How to evaluate:** List files in `.github/workflows/`. Read each workflow YAML. Check which steps run (lint, format check, typecheck, test, build). Compare the CI steps to the local dev scripts in `package.json`. Verify that CI runs on pull requests and pushes to main. Check if CI uses the same Node version and package manager as the project.
**Pass criteria:** CI exists, runs all quality checks (lint, format, types, tests, build), triggers on PRs and main pushes, uses correct Node version and package manager.
**Common vibe-code state:** No CI at all, or a minimal CI that only runs `npm test` (which may be a no-op), or CI exists but is broken/disabled.

## 8. Package.json Scripts

**What to check:** Does `package.json` have `build`, `test`, `lint`, `check:types`, `format:check` scripts?
**How to evaluate:** Read `package.json` and inspect the `scripts` object. Verify each essential script exists and runs the correct tool. Essential scripts: `build` (should run `tsc` or equivalent), `test` (should run test framework), `lint` (should run ESLint), `check:types` (should run `tsc --noEmit`), `format:check` (should run `prettier --check`). Bonus: `format` (auto-fix), `lint:fix`.
**Pass criteria:** All five essential scripts present and functional.
**Common vibe-code state:** Only `start` and `dev` scripts, missing `build`, `lint`, `check:types`, and `format:check`.

## 9. Makefile

**What to check:** Does a Makefile or similar automation exist? Does it mirror CI?
**How to evaluate:** Check for `Makefile` at repo root. If present, read it and compare targets to CI steps and package.json scripts. Look for a `check` or `ci` target that runs the full quality pipeline. Check for a `help` target. If no Makefile, check for alternatives like `justfile`, `taskfile.yml`, or scripts in a `scripts/` directory.
**Pass criteria:** Makefile (or equivalent) exists with a single command that runs the full quality pipeline matching CI.
**Common vibe-code state:** No Makefile or automation — developer must remember each command individually.

## 10. Dependency Audit

**What to check:** Run `pnpm audit` or `npm audit` and list CVEs by severity.
**How to evaluate:** Run `pnpm audit` (or `npm audit`) and capture the output. Count vulnerabilities by severity (critical, high, moderate, low). For critical and high CVEs, note the affected package and whether a fix is available. Check if `pnpm audit --fix` resolves any issues. If audit fails due to lockfile issues, note that as a separate problem.
**Pass criteria:** Zero critical or high vulnerabilities. Moderate/low are acceptable if no fix is available.
**Common vibe-code state:** Multiple critical/high vulnerabilities from outdated transitive dependencies, audit never run.

## 11. Dependency Freshness

**What to check:** Check if any dependency was published less than 1 week ago.
**How to evaluate:** For each dependency in `package.json` (both `dependencies` and `devDependencies`), run `npm view <pkg> time --json` and check the publish date of the installed version. Flag any dependency whose installed version was published less than 1 week ago (7 days from today). Very new packages may have undiscovered bugs or supply chain risks.
**Pass criteria:** No dependencies published in the last 7 days. If found, recommend pinning to the previous version or waiting.
**Common vibe-code state:** Dependencies installed via `latest` tag without checking publish date, possibly pulling in a compromised or broken release.

## 12. Dependency Upgrades

**What to check:** Check for outdated deps that have newer stable versions published more than 1 week ago.
**How to evaluate:** Run `pnpm outdated` (or `npm outdated`). For each outdated dependency, check if the newer version is a major/minor/patch bump. For major bumps, check the changelog for breaking changes. Focus on: security-related updates, dependencies with known issues, and dependencies more than 1 major version behind. Ignore pre-release versions.
**Pass criteria:** All dependencies within 1 minor version of latest stable (published >7 days ago). No outdated dependencies with known security fixes.
**Common vibe-code state:** Many dependencies several major versions behind, locked to old versions with no explanation.

## 13. Logger

**What to check:** Is there structured logging (pino, winston)? Or just `console.log` scattered around?
**How to evaluate:** Search for `console.log`, `console.error`, `console.warn` usage in source code (not test files). Check if a logging library is installed (`pino`, `winston`, `bunyan`). If a logger exists, check whether it's used consistently or if `console.log` still appears alongside it. Check if the logger supports structured output (JSON format), log levels, and context attachment.
**Pass criteria:** Structured logger configured and used consistently. No `console.log` in production source code. Logger supports JSON output and log levels.
**Common vibe-code state:** `console.log` everywhere, no structured logging, no log levels, debug output left in production code.

## 14. .gitignore + Editor Configs

**What to check:** Does `.gitignore` cover `node_modules`, `dist`, `.env`, `coverage`? Does `.editorconfig` or `.vscode/settings.json` exist?
**How to evaluate:** Read `.gitignore` and verify it includes: `node_modules/`, `dist/` (or build output dir), `.env` (and `.env.*` variants), `coverage/`, `*.log`, `.DS_Store`. Check for `.editorconfig` with consistent settings (indent style, indent size, end of line, charset). Check for `.vscode/settings.json` with workspace-specific settings. Verify that no ignored files are actually tracked (`git ls-files .env node_modules`).
**Pass criteria:** `.gitignore` covers all standard entries. Editor config exists for consistency. No ignored files accidentally tracked.
**Common vibe-code state:** Minimal `.gitignore` missing `.env` or `coverage`, no `.editorconfig`, `node_modules` or `.env` accidentally committed.

## 15. README Quality

**What to check:** Does the README have: project description, install instructions, usage/API docs, environment setup, examples?
**How to evaluate:** Read `README.md`. Check for these sections (or equivalent content): (1) project description — what it does, who it's for; (2) installation instructions — prerequisites, install command; (3) usage — basic API examples or getting started guide; (4) environment setup — required env vars, how to configure; (5) examples — runnable code snippets or link to examples directory. Check if the README is up-to-date with the current codebase (e.g., referenced commands actually work).
**Pass criteria:** All five sections present and accurate. README reflects current state of the project.
**Common vibe-code state:** Default `create-react-app` or `npm init` README, or a README with only the project name, or completely outdated instructions.

## 16. Subpath Exports / Package Design

**What to check:** If it's a library, does `package.json` have an `exports` field? `sideEffects`? `files` field?
**How to evaluate:** Read `package.json` and check for: `exports` field (maps subpath imports to source/dist files), `files` field (limits what gets published to npm), `sideEffects` (for tree-shaking), `main` and `types` fields (for backwards compatibility). If `exports` exists, verify each entry points to a real file. Check if the `files` field excludes test files, examples, and dev configs from the published package. If it's not a library (pure application), this check may not apply.
**Pass criteria:** For libraries: `exports` field properly configured, `files` limits published content, `types` field set. For applications: mark as N/A.
**Common vibe-code state:** No `exports` field, everything published via default (including tests and dev files), no `files` field.

## 17. Spec Compliance

**What to check:** If a spec or standard was provided (e.g., RFC, OpenAPI doc, protocol spec), read it and cross-reference against the codebase. List deviations.
**How to evaluate:** If the user provides a spec document or reference, read it thoroughly. Map each requirement in the spec to its implementation in the codebase. Check for: missing endpoints/methods, incorrect field names, wrong data types, missing validation rules, deviations from the spec's error handling requirements. List each deviation with the spec reference and the actual implementation.
**Pass criteria:** All spec requirements implemented correctly. No undocumented deviations.
**Common vibe-code state:** Partial implementation of the spec, field names that don't match, missing required behaviors, no awareness that a spec exists. If no spec is provided, mark as N/A.

## 18. CORS Evaluation (optional)

**What to check:** Does the app serve cross-origin requests? Is CORS middleware configured? Should it be?
**How to evaluate:** Check if the application is an API server that will be called from browsers (e.g., a frontend app on a different origin). Search for `cors` middleware installation and configuration. If CORS is configured, check: allowed origins (should not be `*` in production), allowed methods, allowed headers, credentials setting. If the app is server-to-server only (e.g., an MPP SDK), CORS may not be needed — note this.
**Pass criteria:** If cross-origin access is needed: CORS configured with specific origins, not wildcard. If not needed: CORS absent or disabled (not misconfigured). Mark as N/A for libraries or server-to-server apps.
**Common vibe-code state:** `cors()` with no options (allows everything), or CORS missing when the frontend needs it, or CORS enabled unnecessarily.

## 19. Env Validation

**What to check:** Search for raw `process.env` usage. Check if there's a centralized env config. Check for missing env vars that would crash at runtime.
**How to evaluate:** Grep for `process.env.` across all source files (not just test files). Check if env vars are accessed directly in business logic or if there's a centralized env validation module. If centralized: verify it validates all required vars at startup (fail-fast). Check for type coercion (e.g., `process.env.PORT` is a string, not a number). Look for optional vars that have sensible defaults. Verify that a `.env.example` or documentation lists all required vars.
**Pass criteria:** Centralized env validation at startup, all required vars validated with correct types, fail-fast on missing vars, `.env.example` exists documenting all vars.
**Common vibe-code state:** `process.env.THING` scattered throughout codebase, no validation, app crashes deep in a request handler when an env var is missing, no `.env.example`.
