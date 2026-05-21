# Phase 3.3: Security Hardening

## Goal

Protect the application against common web vulnerabilities (OWASP Top 10).

## Steps

### 1. Security headers (Express)

Install and configure helmet:

```bash
pnpm add helmet
```

```typescript
import helmet from 'helmet'
app.use(helmet())
```

For non-Express frameworks, add equivalent headers manually or use the framework's security plugin.

### 2. Rate limiting

Install and configure rate limiting:

```bash
pnpm add express-rate-limit
```

```typescript
import rateLimit from 'express-rate-limit'

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
})

app.use(limiter)
```

Consider stricter limits for auth endpoints (login, password reset).

### 3. Secrets audit

Search the entire codebase for hardcoded secrets:

```bash
# Patterns to search for
grep -rn "password\s*=" --include="*.ts" --include="*.js" .
grep -rn "api[_-]?key\s*=" --include="*.ts" --include="*.js" .
grep -rn "secret\s*=" --include="*.ts" --include="*.js" .
grep -rn "token\s*=" --include="*.ts" --include="*.js" .
grep -rn "Bearer " --include="*.ts" --include="*.js" .
```

Move all secrets to environment variables. Create a `.env.example` with placeholder values.

### 4. Dependency injection for secrets

Never import secrets directly. Pass them through configuration:

```typescript
// Bad
const apiKey = process.env.API_KEY // scattered across files

// Good — centralized in env.ts (Phase 3.4 will formalize this)
export const config = { apiKey: env.API_KEY }
```

### 5. Security checklist (inline fallback)

If no security review skill is available, manually verify:

- [ ] No hardcoded secrets in source code
- [ ] All secrets loaded from environment variables
- [ ] `.env` is in `.gitignore`
- [ ] `.env.example` exists with placeholder values
- [ ] helmet (or equivalent) is configured
- [ ] Rate limiting is configured on public endpoints
- [ ] No SQL/NoSQL injection vectors (parameterized queries)
- [ ] No XSS vectors (output encoding, CSP headers)
- [ ] No command injection (avoid `exec`, `spawn` with user input)
- [ ] HTTPS enforced in production (or documented as a deployment concern)
- [ ] Auth tokens have expiry
- [ ] Sensitive data not logged (passwords, tokens, PII)

## Verification

- `grep` for hardcoded secrets returns zero results
- helmet middleware is active
- Rate limiting is configured
- `.env.example` exists
- Security checklist items pass
