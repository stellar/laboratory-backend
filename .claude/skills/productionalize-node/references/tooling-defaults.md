# Default Tooling Stack

Present this table to the user for confirmation before installing anything.

## Proposed Tools

| Concern | Tool | Why |
|---|---|---|
| Language | TypeScript (strict mode) | Type safety, catch errors at compile time |
| Test framework | Vitest | Fast, native ESM support, compatible with Jest API |
| Linter | ESLint (flat config, v9+) | Industry standard, typescript-eslint for TS support |
| Formatter | Prettier | Consistent formatting, no debates |
| Package manager | pnpm | Fast, disk-efficient, strict dependency resolution |
| CI | GitHub Actions | Most common, free for open source |
| Input validation | Zod | TypeScript-first, runtime validation with type inference |
| Env validation | t3-env (@t3-oss/env-core) | Type-safe env vars, Zod-based, prevents runtime crashes from missing env |
| Security headers | helmet | Express middleware for secure HTTP headers |
| Rate limiting | express-rate-limit | Prevent abuse, configurable per-route |

## Alternatives (if user prefers)

| Concern | Alternatives |
|---|---|
| Test framework | Jest, node:test |
| Linter | Biome (lint + format combined) |
| Package manager | npm, yarn |
| CI | GitLab CI, CircleCI |
| Input validation | Joi, Yup, ArkType |
| Env validation | envalid, env-var |

## Notes

- If the project already uses a tool (e.g., Jest for testing), prefer keeping it unless there's a strong reason to migrate.
- helmet and express-rate-limit only apply to Express-based projects. For Fastify, Koa, or other frameworks, suggest the equivalent middleware.
- t3-env requires Zod as a peer dependency, which is already included for input validation.
