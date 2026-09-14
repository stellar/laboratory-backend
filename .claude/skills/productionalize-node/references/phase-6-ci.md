# Phase 6: CI/CD

Depends on Phase 2 (Quality Infra) and Phase 4 (Dependencies).

## 6a: GitHub Actions Pipeline

### 1. Create workflow file

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

concurrency:
  group: ${{ github.workflow }}-${{ github.head_ref || github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  check:
    name: Check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Check formatting
        run: pnpm run format:check

      - name: Lint
        run: pnpm run lint

      - name: Type check
        run: pnpm run check:types

      - name: Test
        run: pnpm test -- --run --coverage --coverage.reporter=text

      - name: Build
        run: pnpm run build

      - name: Audit dependencies
        run: pnpm audit --audit-level=moderate

      - name: Check dependency freshness
        run: pnpm run check:deps-freshness

  complete:
    name: CI Complete
    if: always()
    needs: [check]
    runs-on: ubuntu-latest
    steps:
      - name: Check result
        run: |
          if [ "${{ needs.check.result }}" != "success" ]; then
            echo "CI failed"
            exit 1
          fi
```

### 2. Adapt to project

- If the project uses npm instead of pnpm, replace `pnpm` commands and remove `pnpm/action-setup`
- If the project uses yarn, use `yarn --frozen-lockfile` and the appropriate cache setup
- Adjust Node.js version to match the project's minimum supported version
- If the project has a `pnpm-lock.yaml`, ensure `--frozen-lockfile` is used
- If the project doesn't use pnpm, remove the `pnpm/action-setup` step

### 3. Pipeline mirrors local

The CI pipeline must run the exact same checks as `make check` (or the local equivalent). Verify the order matches:

1. Format check
2. Lint
3. Type check
4. Test (with coverage)
5. Build
6. Dependency audit
7. Dependency freshness

### 4. Sentinel job

The `complete` job acts as a required status check. Configure branch protection to require this job to pass before merging to main.

### 5. Security best practices for CI

- Pin action versions to full SHAs (e.g., `actions/checkout@11bd7190...`) for supply chain security. At minimum use version tags.
- Use `permissions: contents: read` (least privilege)
- Use `--frozen-lockfile` to prevent lockfile manipulation
- Enable `cancel-in-progress` to save runner minutes
- Never store secrets in workflow files — use GitHub Secrets

## Verification

- `.github/workflows/ci.yml` exists and is valid YAML
- Pipeline runs the same checks in the same order as `make check`
- `complete` sentinel job fails if any upstream job fails
- Permissions are minimized
- Lockfile is frozen in CI
