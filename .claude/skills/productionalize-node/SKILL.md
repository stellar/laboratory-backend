---
name: productionalize-node
description: Use when transforming a vibe-coded Node.js project into production-ready code. Triggers on requests to productionalize, harden, or bring a Node.js codebase to production quality. Handles TypeScript strict migration, testing, linting, security hardening, CI setup, dependency management, and documentation.
---

# productionalize-node

One-shot skill that takes a scaffolded-but-hollow Node.js project to production quality. Works standalone without any sub-skills installed. Enhanced by optional sub-skills when available.

## Parameters

- `--spec=<path|url>` — Reference spec (API spec, RFC, protocol doc) for compliance validation.
- `--mode=parallel|sequential` — Execution mode. Default: `parallel`.
- `--coverage=<number>` — Target test coverage percentage. Default: `80`. Confirmed with user during opening flow.

## Phase 0: Opening Flow

Execute these steps before any code changes:

1. Read `package.json`, `tsconfig.json`, `README.md`, and list the top-level directory structure. Identify the runtime, framework, language version, and current tooling.
2. If `--spec` was not provided, ask: _"Do you have a reference spec (API spec, RFC, protocol doc) for this project? It can be a file path or URL."_ Store the answer for Phase 1.
3. Ask: _"Do you have specific tooling preferences, or should I propose a default stack?"_
4. Read `references/tooling-defaults.md`. Present the default tooling stack to the user. Do not install anything until the user confirms.
5. Ask about optional items:
   - _"Would you like me to set up CHANGELOG + commit conventions?"_
   - _"Should I evaluate whether CORS is needed?"_
6. Confirm coverage target: _"I'll target 80% test coverage. Does that work, or would you prefer a different target?"_ Use `--coverage` value if provided instead of asking.

## Phase 1: Assessment

1. Read `references/assessment-checklist.md`.
2. Evaluate all 19 checklist items against the codebase. For each item, record: status (pass/fail/partial), evidence, and remediation needed.
3. If a spec was provided (`--spec`), read it and cross-reference against the codebase for compliance gaps.
4. Generate a plan document at `docs/vibe-to-production-plan.md` with findings, prioritized remediation steps, and phase assignments.
5. Present the plan to the user. Wait for approval before proceeding to execution.

## Execution

Read the corresponding phase file from `references/` before executing each phase.

### Phase Dependency Order

```
Phase 1 (Foundation)           — no dependencies
Phase 2 (Quality Infra)        ─┐
Phase 3 (Hardening)            ─┤── depend on Phase 1, run in parallel with each other
Phase 4 (Dependencies)         ─┘
Phase 5 (Testing)              — depends on Phases 2, 3
Phase 6 (CI/CD)                — depends on Phases 2, 4
Phase 7 (Documentation)        — depends on all above
Phase 8 (Final Review)         — depends on all above
```

### Parallel Mode (default)

If a parallel agent dispatch skill is available, invoke it to run independent phases concurrently. Otherwise, execute phases sequentially within each dependency group:

1. Execute Phase 1. Run quality gates.
2. Execute Phases 2, 3, 4 concurrently (or sequentially if no dispatch skill). Run quality gates after each.
3. Execute Phase 5. Run quality gates.
4. Execute Phase 6. Run quality gates.
5. Execute Phase 7. Run quality gates.
6. Execute Phase 8.

### Sequential Mode

Execute phases one at a time in dependency order. Confirm with the user between each phase before proceeding.

## Quality Gates

After each phase completes, run every available check:

```bash
pnpm run check:types    # TypeScript type check
pnpm run lint           # Lint
pnpm test -- --run      # Unit tests
pnpm run build          # Build
```

Skip any command that is not yet configured (e.g., lint may not exist until Phase 2). If any check fails, remediate the failure before proceeding to the next phase.

## Sub-skill Integration

Sub-skills are capability-based, not name-bound. For each capability below, invoke the matching skill if one is available. Otherwise, follow the inline fallback instructions in the relevant phase file.

| Capability                     | Used In          | Fallback                                             |
| ------------------------------ | ---------------- | ---------------------------------------------------- |
| Security review                | Phase 3, Phase 8 | Manual review per `references/phase-3-hardening.md`  |
| TDD workflow                   | Phase 5          | Write tests per `references/phase-5-testing.md`      |
| Code review                    | Phase 8          | Self-review per `references/phase-8-final-review.md` |
| Plan writing                   | Assessment       | Generate plan inline                                 |
| Parallel agent dispatch        | Parallel mode    | Execute sequentially within dependency groups        |
| Verification before completion | All phases       | Run quality gates manually after each phase          |

## Completion

1. Read `references/phase-8-final-review.md`.
2. Evaluate all 13 completion criteria against the final codebase state.
3. Produce a final report table with pass/fail per criterion:

```
| # | Criterion           | Status | Notes |
|---|---------------------|--------|-------|
| 1 | TypeScript strict   | PASS   |       |
| 2 | ...                 | ...    |       |
```

4. If any criterion fails, remediate and re-evaluate.
5. Leave `docs/vibe-to-production-plan.md` in the repo as an artifact of the transformation.
6. Present the final report to the user.
