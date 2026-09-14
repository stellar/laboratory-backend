# Phase 3.5: CORS Evaluation (Optional)

Only execute this sub-phase if the user opted in during Phase 0.

## Goal

Evaluate whether the application needs CORS configuration, and set it up correctly if so.

## Decision Criteria

CORS is needed if ANY of these are true:
- The API is consumed by a browser-based frontend on a different origin
- The API is a public API that third-party websites may call
- The app serves both a frontend and an API from different origins/ports

CORS is NOT needed if:
- The API is only consumed by server-side clients (other services, CLI tools)
- The frontend and API are served from the same origin
- The app is behind a reverse proxy that handles CORS

## Steps

### 1. Analyze the application

- Check if there are any CORS-related headers or middleware already
- Check the README or docs for information about how the API is consumed
- Look for frontend code or references to a frontend
- Ask the user if unclear: "Is this API consumed by a browser-based frontend on a different origin?"

### 2. If CORS is needed

Install and configure:

```bash
pnpm add cors
pnpm add -D @types/cors
```

```typescript
import cors from 'cors'

app.use(cors({
  origin: env.CORS_ORIGIN, // Add to env.ts
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 86400, // 24 hours preflight cache
}))
```

Add `CORS_ORIGIN` to `env.ts` and `.env.example`.

### 3. If CORS is NOT needed

Document the decision:
```typescript
// CORS is intentionally not configured.
// This API is consumed only by server-side clients.
```

### 4. Present recommendation to user

Whether CORS is needed or not, present your finding and recommendation. Let the user confirm before making changes.

## Verification

- CORS decision is documented (either configured or explicitly not needed)
- If configured: only the intended origins are allowed (no wildcard `*` in production)
- If configured: credentials handling matches the auth strategy
