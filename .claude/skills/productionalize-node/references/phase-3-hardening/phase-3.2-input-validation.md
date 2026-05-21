# Phase 3.2: Input Validation

## Goal

Validate all external input at system boundaries using Zod schemas.

## Steps

### 1. Install Zod

```bash
pnpm add zod
```

### 2. Identify validation boundaries

External input enters the system through:
- **API request bodies** (`req.body`)
- **API query parameters** (`req.query`)
- **API path parameters** (`req.params`)
- **Webhook payloads**
- **File uploads / external file reads**
- **CLI arguments**

List all entry points in the codebase.

### 3. Create Zod schemas for each boundary

For each entry point, create a schema that validates the expected shape:

```typescript
import { z } from 'zod'

export const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(255),
  role: z.enum(['admin', 'user']).default('user'),
})

export type CreateUserInput = z.infer<typeof CreateUserSchema>
```

Place schemas near the code that uses them (colocated), or in a `schemas/` directory if the project has many.

### 4. Add validation middleware (Express)

```typescript
import type { Request, Response, NextFunction } from 'express'
import type { ZodSchema } from 'zod'

export function validate(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body)
    if (!result.success) {
      throw new ValidationError('Invalid request body', {
        issues: result.error.issues,
      })
    }
    req.body = result.data
    next()
  }
}
```

Apply to routes:
```typescript
app.post('/users', validate(CreateUserSchema), createUser)
```

### 5. Validate path and query params too

Don't just validate body — query params and path params are strings by default and need coercion:

```typescript
const PaginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
})
```

### 6. Internal trust boundary

Do NOT add Zod validation to internal function calls between your own modules. Validation belongs at the system boundary only. Internal code can trust the types.

## Verification

- Every API endpoint validates its input with a Zod schema
- No raw `req.body` access without prior validation
- Validation errors return 400 with descriptive messages
- Internal code does not over-validate
