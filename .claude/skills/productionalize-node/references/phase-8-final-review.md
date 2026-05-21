# Phase 8: Final Review

Depends on all previous phases. This is the last phase.

## 8a: Code Review

If a code review skill is available, invoke it with:
- What was implemented: "Productionalization of a vibe-coded Node.js project"
- Plan: reference `docs/vibe-to-production-plan.md`
- Scope: all files changed since the skill started

### Inline fallback (if no code review skill available)

Review the codebase for:

1. **Consistency** — naming conventions, file structure, import patterns are consistent across the project
2. **SOLID violations** — classes/modules doing too much, tight coupling, missing abstractions
3. **Code smells** — duplicated code, long functions (>50 lines), deep nesting (>3 levels), magic numbers
4. **Dead code** — unused imports, unreachable branches, commented-out code
5. **Error handling completeness** — all async paths have error handling, errors propagate with context
6. **Type safety** — no `any` types (except justified cases), no type assertions without explanation
7. **Test quality** — tests are meaningful (not just "it exists"), cover edge cases, use proper assertions

Fix any issues found.

## 8b: Security Review

If a security review skill is available, invoke it with a focus on:
- OWASP Top 10 compliance
- Dependency supply chain security
- Secrets management
- Input validation coverage

### Inline fallback (if no security review skill available)

Run through this security checklist:

- [ ] **Injection** — no SQL/NoSQL/command injection vectors. All queries parameterized. No `eval()`, no `exec()` with user input.
- [ ] **Broken Authentication** — auth tokens have expiry, passwords hashed (bcrypt/argon2), no credentials in logs
- [ ] **Sensitive Data Exposure** — secrets in env vars (not code), .env in .gitignore, no PII in logs, HTTPS enforced
- [ ] **XXE** — XML parsing disabled or configured securely (if applicable)
- [ ] **Broken Access Control** — authorization checks on every protected endpoint
- [ ] **Security Misconfiguration** — helmet configured, debug mode off in production, error messages don't leak internals
- [ ] **XSS** — output encoding, CSP headers via helmet
- [ ] **Insecure Deserialization** — no `JSON.parse` on untrusted input without validation (Zod handles this)
- [ ] **Known Vulnerabilities** — `pnpm audit` clean, no deps newer than 1 week
- [ ] **Insufficient Logging** — security events logged (auth failures, access denied, validation failures)

Fix any issues found.

## Completion Criteria

Evaluate all 13 criteria. ALL must pass before declaring the transformation complete.

| # | Criterion | How to verify |
|---|---|---|
| 1 | TypeScript strict — zero type errors | `pnpm run check:types` exits 0 |
| 2 | ESLint — zero errors | `pnpm run lint` exits 0 |
| 3 | Prettier — fully formatted | `pnpm run format:check` exits 0 |
| 4 | Tests pass with ≥ target coverage | `pnpm test -- --run --coverage` |
| 5 | Build succeeds | `pnpm run build` exits 0 |
| 6 | No CVEs in dependencies | `pnpm audit --audit-level=moderate` exits 0 |
| 7 | No dependency newer than 1 week | `pnpm run check:deps-freshness` exits 0 |
| 8 | All process.env replaced with validated env | `grep -rn "process\.env\." src/` returns 0 results (except env.ts) |
| 9 | Security review passed | All security checklist items checked |
| 10 | Code review passed | All code review items resolved |
| 11 | README complete | Has install, usage, env vars, scripts, API docs |
| 12 | Spec compliance (if --spec) | Compliance table shows no FAILs |
| 13 | CI pipeline complete | `.github/workflows/ci.yml` runs all gates |

## Final Report

Present this table to the user:

```
| # | Criterion                        | Status    | Notes                          |
|---|----------------------------------|-----------|--------------------------------|
| 1 | TypeScript strict                | PASS/FAIL |                                |
| 2 | ESLint — zero errors             | PASS/FAIL |                                |
| 3 | Prettier — fully formatted       | PASS/FAIL |                                |
| 4 | Tests ≥ target coverage          | PASS/FAIL | Actual: XX%                    |
| 5 | Build succeeds                   | PASS/FAIL |                                |
| 6 | No CVEs                          | PASS/FAIL |                                |
| 7 | No deps newer than 1 week        | PASS/FAIL |                                |
| 8 | Env validation complete          | PASS/FAIL |                                |
| 9 | Security review passed           | PASS/FAIL |                                |
| 10| Code review passed               | PASS/FAIL |                                |
| 11| README complete                  | PASS/FAIL |                                |
| 12| Spec compliance                  | PASS/FAIL | N/A if no spec                 |
| 13| CI pipeline complete             | PASS/FAIL |                                |
```

If any criterion fails, remediate and re-evaluate. Only declare the transformation complete when all items pass.

The plan document at `docs/vibe-to-production-plan.md` remains in the repo as an artifact of the transformation.
