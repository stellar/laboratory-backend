# Phase 4: Dependencies

Depends on Phase 1 (Foundation).

## 4a: Dependency Audit (CVEs)

1. Run `pnpm audit` (or `npm audit` if using npm).
2. For each vulnerability:
   - **Critical/High**: Fix immediately. Upgrade the dependency or find an alternative.
   - **Moderate**: Fix if a patch is available. Document if no fix exists.
   - **Low**: Document and move on.
3. If a dependency has no fix available, evaluate:
   - Can it be replaced with an alternative?
   - Can the vulnerable code path be avoided?
   - Document the risk in the plan.
4. Run `pnpm audit` again to verify zero critical/high CVEs.

## 4b: Dependency Upgrades

Upgrade dependencies to the latest stable version that is NOT newer than 1 week old.

1. List outdated dependencies: `pnpm outdated` (or `npm outdated`).
2. For each outdated dependency:
   - Check publish date: `npm view <pkg> time --json`
   - Only upgrade if the latest version was published MORE than 7 days ago.
   - Check the changelog/release notes for breaking changes.
3. Upgrade one at a time (or in small batches of related deps).
4. After each upgrade batch, run the quality gates:
   ```bash
   pnpm run check:types
   pnpm run lint
   pnpm test -- --run
   pnpm run build
   ```
5. If an upgrade breaks something, either fix the breakage or skip that upgrade and document why.

## 4c: Dependency Freshness Gate

Create a CI + Makefile check that rejects dependencies newer than 1 week.

1. Create `scripts/check-deps-freshness.js`:
   ```javascript
   #!/usr/bin/env node

   /**
    * Checks that no dependency in package.json was published less than 7 days ago.
    * This protects against supply chain attacks via compromised fresh packages.
    */

   import { execSync } from 'node:child_process'
   import { readFileSync } from 'node:fs'

   const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
   const allDeps = {
     ...pkg.dependencies,
     ...pkg.devDependencies,
   }

   const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000
   const now = Date.now()
   const violations = []

   for (const [name, version] of Object.entries(allDeps)) {
     try {
       const raw = execSync(`npm view ${name} time --json`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
       const times = JSON.parse(raw)
       const resolvedVersion = version.replace(/^[\^~>=<]*/g, '')
       const publishDate = times[resolvedVersion]
       if (publishDate) {
         const age = now - new Date(publishDate).getTime()
         if (age < ONE_WEEK_MS) {
           const days = Math.floor(age / (24 * 60 * 60 * 1000))
           violations.push(`${name}@${resolvedVersion} — published ${days} day(s) ago`)
         }
       }
     } catch {
       // Skip packages that can't be looked up (private, local, etc.)
     }
   }

   if (violations.length > 0) {
     console.error('Dependencies newer than 1 week detected:')
     violations.forEach((v) => console.error(`  - ${v}`))
     process.exit(1)
   } else {
     console.log('All dependencies are older than 1 week.')
   }
   ```

2. Make it executable: `chmod +x scripts/check-deps-freshness.js`

3. Add to package.json scripts:
   ```json
   "check:deps-freshness": "node scripts/check-deps-freshness.js"
   ```

4. The Makefile target was already added in Phase 1b (`deps-freshness`).

5. Add to CI pipeline (Phase 6 will wire this in, but document the step here):
   ```yaml
   - name: Check dependency freshness
     run: pnpm run check:deps-freshness
   ```

## Verification

- `pnpm audit` shows zero critical/high CVEs
- `pnpm run check:deps-freshness` passes
- All quality gates still pass after upgrades
