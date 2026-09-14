# Phase 3: Hardening

Depends on Phase 1 (Foundation). Can run in parallel with Phases 2 and 4.

This phase hardens the application against errors, invalid input, and security threats.

## Sub-phases

Execute in order (each builds on the previous):

1. Read and execute `phase-3.1-error-handling.md`
2. Read and execute `phase-3.2-input-validation.md`
3. Read and execute `phase-3.3-security.md`
4. Read and execute `phase-3.4-env-validation.md`
5. Read and execute `phase-3.5-cors-evaluation.md` (only if user opted in)

## Capability-based sub-skill integration

If a security review skill is available, invoke it after completing sub-phases 3.3 and 3.4 to validate the security hardening. Otherwise, use the inline checklists in each sub-phase file.

## Verification

After all sub-phases complete:
- `pnpm run check:types` passes
- `pnpm run build` succeeds
- Application starts and handles errors gracefully (no unhandled rejections)
- No hardcoded secrets in source code
- All env vars validated at startup
