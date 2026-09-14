# Phase 3.1: Error Handling

## Goal

Replace ad-hoc error handling with a structured error hierarchy and consistent patterns.

## Steps

### 1. Create a custom error hierarchy

Create `src/errors.ts` (or similar, matching project structure):

```typescript
export class AppError extends Error {
  readonly statusCode: number
  readonly details: Record<string, unknown>

  constructor(message: string, statusCode = 500, details: Record<string, unknown> = {}) {
    super(message)
    this.name = this.constructor.name
    this.statusCode = statusCode
    this.details = details
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message, 400, details)
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super(`${resource}${id ? ` '${id}'` : ''} not found`, 404, { resource, id })
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401)
  }
}
```

Adapt the hierarchy to the project's domain. Don't over-engineer — start with 3-5 error classes that cover the actual error cases in the codebase.

### 2. Add Express error handler (if applicable)

```typescript
import type { ErrorRequestHandler } from 'express'

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const statusCode = err instanceof AppError ? err.statusCode : 500
  const message = err instanceof AppError ? err.message : 'Internal Server Error'

  // Log the full error for debugging
  logger.error({ err, statusCode }, message)

  // Don't leak internal errors to clients
  res.status(statusCode).json({
    error: { message, ...(err instanceof AppError ? err.details : {}) },
  })
}
```

### 3. Scan and fix error handling patterns

Search the codebase for these anti-patterns and fix them:

- **Bare `catch` with `console.log`**: Replace with logger + proper error propagation
- **Empty catch blocks**: At minimum log the error. If truly ignorable, add a comment explaining why.
- **`catch (e: any)`**: Type the error properly or use `unknown` and narrow
- **Missing async error handling**: Ensure all async route handlers catch errors (use express-async-errors or wrap handlers)
- **Unhandled promise rejections**: Add `process.on('unhandledRejection', ...)` in the entry point

### 4. Add process-level handlers

In the application entry point:

```typescript
process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled promise rejection')
  process.exit(1)
})

process.on('uncaughtException', (err) => {
  logger.error({ err }, 'Uncaught exception')
  process.exit(1)
})
```

## Verification

- No bare `console.error` or `console.log` in catch blocks (use logger)
- All Express routes have error handling
- Custom error classes are used for domain-specific errors
- Process-level handlers catch unhandled rejections
