# Phase 3.4: Env Validation

## Goal

Replace raw `process.env` access with type-safe, validated environment configuration using t3-env.

## Steps

### 1. Install t3-env

```bash
pnpm add @t3-oss/env-core zod
```

(Zod should already be installed from Phase 3.2.)

### 2. Inventory all env var usage

Search the codebase for all `process.env` references:

```bash
grep -rn "process\.env\." --include="*.ts" --include="*.js" src/
```

List every env var used, its expected type, and whether it's required or has a default.

### 3. Create env configuration

Create `src/env.ts`:

```typescript
import { createEnv } from '@t3-oss/env-core'
import { z } from 'zod'

export const env = createEnv({
  server: {
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().default(3000),
    DATABASE_URL: z.string().url(),
    API_KEY: z.string().min(1),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  },
  runtimeEnv: process.env,
})
```

Adapt the schema to match the actual env vars discovered in step 2. Only include vars the application actually uses.

### 4. Replace all process.env usage

Replace every `process.env.X` with `env.X`. This gives you:
- Type safety (autocomplete, compile-time errors)
- Runtime validation (app crashes immediately with a clear error if env is misconfigured)
- Single source of truth for all configuration

### 5. Update .env.example

Ensure `.env.example` lists all required env vars with placeholder values and comments:

```env
# Server
NODE_ENV=development
PORT=3000

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/mydb

# API
API_KEY=your-api-key-here
```

### 6. Add startup validation

t3-env validates on import, so the app will crash at startup if required vars are missing. Verify this works:

```bash
# Should crash with clear error message about missing DATABASE_URL
unset DATABASE_URL && node dist/index.js
```

## Verification

- Zero `process.env` references outside of `src/env.ts`
- `env.ts` has Zod schemas for every env var
- App crashes with clear error if required env var is missing
- `.env.example` is complete and up to date
