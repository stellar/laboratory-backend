# Phase 5: Testing

Depends on Phase 2 (Quality Infra) and Phase 3 (Hardening).

## 5a: Test Setup

### 1. Install Vitest (or confirmed framework)

```bash
pnpm add -D vitest @vitest/coverage-v8
```

### 2. Configure Vitest

Create or update `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.d.ts'],
    },
  },
})
```

### 3. Verify test infrastructure

Create a smoke test to verify the setup works:

```typescript
// src/smoke.test.ts
import { describe, it, expect } from 'vitest'

describe('test setup', () => {
  it('works', () => {
    expect(true).toBe(true)
  })
})
```

Run: `pnpm test -- --run`. Delete the smoke test after verifying.

### 4. Colocate tests

Follow the convention of placing test files next to source files:
```
src/
  users/
    users.ts
    users.test.ts
  orders/
    orders.ts
    orders.test.ts
```

## 5b: Write Tests to Reach Coverage Target

### 1. Run coverage baseline

```bash
pnpm test -- --run --coverage
```

Record the current coverage percentage. This is the baseline.

### 2. Prioritize what to test

Focus on the highest-value tests first:

1. **Public API / route handlers** — these are the system boundary, most likely to break
2. **Business logic / domain functions** — core algorithms and decision-making
3. **Error paths** — verify error handling works (custom errors, validation rejection)
4. **Edge cases** — null/undefined inputs, empty arrays, boundary values
5. **Integration points** — database queries, external API calls (mock these)

Do NOT waste time testing:
- Simple getters/setters
- Framework boilerplate
- Third-party library internals
- Trivial type conversions

### 3. Writing tests

If a TDD workflow skill is available, invoke it for writing new tests. Otherwise, follow this pattern:

For each module:
1. Write a test that exercises the happy path
2. Write tests for each error/validation path
3. Write tests for edge cases
4. Mock external dependencies (database, APIs, file system)

Test structure:
```typescript
describe('createUser', () => {
  it('creates a user with valid input', async () => {
    // Arrange
    const input = { email: 'test@example.com', name: 'Test' }
    // Act
    const result = await createUser(input)
    // Assert
    expect(result).toMatchObject({ email: 'test@example.com' })
  })

  it('throws ValidationError for invalid email', async () => {
    await expect(createUser({ email: 'invalid', name: 'Test' }))
      .rejects.toThrow(ValidationError)
  })

  it('throws NotFoundError when referenced resource missing', async () => {
    // ...
  })
})
```

### 4. Reach coverage target

Run coverage after each batch of tests:
```bash
pnpm test -- --run --coverage
```

Keep writing tests until the confirmed coverage target is reached. Focus on the uncovered files/lines shown in the coverage report.

### 5. Coverage in CI

Add coverage flag to the test script for CI (Phase 6 will wire this):
```json
"test:ci": "vitest run --coverage --coverage.reporter=text"
```

## Verification

- `pnpm test -- --run` passes with zero failures
- `pnpm test -- --run --coverage` shows ≥ target coverage
- Tests cover: happy paths, error paths, edge cases
- No flaky tests (run twice to confirm)
- Test files are colocated with source
