# Phase 7: Documentation

Depends on all previous phases. This is the last phase before final review.

## 7a: README Quality Check + Fixes

### 1. Evaluate the existing README

Check for these sections (all required for production):

- [ ] **Project title and description** — one-paragraph summary of what the project does
- [ ] **Installation** — exact commands to install and set up
- [ ] **Quick start / Usage** — minimal example to get running
- [ ] **Environment variables** — table of all env vars, types, defaults, descriptions (must match `env.ts`)
- [ ] **API documentation** — if it's an API, document endpoints, request/response shapes
- [ ] **Scripts / Commands** — table of available npm scripts and what they do
- [ ] **Development** — how to set up for development, run tests, lint
- [ ] **Architecture** (optional but recommended) — high-level overview for contributors
- [ ] **License** — license type and file reference

### 2. Fix gaps

For each missing section, add it. Pull information from:
- `package.json` (scripts, description, license)
- `env.ts` (environment variables)
- Source code (API routes, exported functions)
- Existing inline comments

### 3. Verify accuracy

Every command in the README must actually work:
- Copy each code block and run it
- Verify install instructions produce a working setup
- Verify the quick start example runs

### 4. Remove stale content

- Remove references to deleted features or old APIs
- Remove TODO placeholders
- Remove "coming soon" sections with no content

## 7b: CHANGELOG + Commit Conventions (Optional)

Only execute if user opted in during Phase 0.

### 1. CHANGELOG

Create `CHANGELOG.md` following [Keep a Changelog](https://keepachangelog.com/en/1.1.0/):

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- TypeScript strict mode
- Vitest test suite with X% coverage
- ESLint + Prettier configuration
- GitHub Actions CI pipeline
- Input validation with Zod
- Environment validation with t3-env
- Custom error hierarchy
- Structured logging with pino
- Security hardening (helmet, rate limiting)
- Dependency freshness gate
```

### 2. Commit conventions

Add a section to the README or a `CONTRIBUTING.md`:

```markdown
## Commit Convention

This project uses [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` — new feature
- `fix:` — bug fix
- `refactor:` — code change that neither fixes a bug nor adds a feature
- `docs:` — documentation only
- `test:` — adding or updating tests
- `chore:` — maintenance (deps, CI, tooling)
```

Do NOT install commitlint or husky unless the user explicitly asks. Keep it convention-based, not enforced.

## 7c: Spec Compliance Check (if --spec provided)

### 1. Read the spec

If `--spec` is a URL, fetch it. If it's a file path, read it.

### 2. Cross-reference

For each requirement in the spec:
- Find the corresponding implementation in the codebase
- Verify the behavior matches
- Document any deviations

### 3. Report

Present a compliance table:

```
| Spec Section | Requirement | Status | Notes |
|---|---|---|---|
| 3.1 | Must return 402 for unpaid requests | PASS | Handled in middleware |
| 3.2 | Must include X-Payment header | FAIL | Header not implemented |
```

Fix any FAIL items or document them as known gaps for the user to address.

## Verification

- README has all required sections
- All README commands actually work when executed
- CHANGELOG exists and is accurate (if opted in)
- Spec compliance table shows no unresolved FAILs (if --spec)
