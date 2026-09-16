# Cloudflare Worker Deployment Standardization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give all five YouSafe Cloudflare Workers pinned, fail-closed, repository-controlled production deployments with least-privilege per-Worker credentials.

**Architecture:** First prove Wrangler 4.132.0 on Portal. Then update each Worker repository independently: direct Wrangler for OpenNext after build, direct pinned Wrangler for plain Workers, atomic secrets only where GitHub already owns those secrets, and one Cloudflare account token per Worker. Pages projects remain unchanged.

**Tech Stack:** GitHub Actions, Cloudflare Workers/Wrangler 4.132.0, OpenNext, Node 22, npm/pnpm, Opera + Playwright, GitHub CLI.

**Spec:** `docs/superpowers/specs/2026-09-16-cloudflare-worker-deployment-standard-design.md`

## Global Constraints

- Wrangler production floor and exact pin: `4.132.0`.
- Never use one shared account-wide Workers token as the default rollout credential.
- Never expose a Cloudflare token value in chat, logs, shell history, repository files, or screenshots.
- Production deploys come from `main` GitHub workflows only.
- Three exhausted retry attempts must end red.
- `CLOUDFLARE_API_TOKEN` never becomes a Worker runtime secret.
- Pages projects are out of scope.
- Portal proof is a hard prerequisite for propagating the Wrangler authorization fix.

---
### Task 1: Prove Portal granular authorization on Wrangler 4.132.0

**Files:**
- Already modified in PR #217: `package.json`, `package-lock.json`, `tests/github-only-production-deploy.test.ts`

**Interfaces:**
- Consumes: existing direct `wrangler deploy --secrets-file` path from PR #216.
- Produces: production evidence that Individual Worker Editor works with Wrangler 4.132.0.

- [ ] **Step 1: Require PR #217 checks to pass**

Run:
```bash
gh pr checks 217 --repo kylemwalkerpr-ship-it/portal
```
Expected: all required checks `pass`.

- [ ] **Step 2: Merge PR #217 through GitHub**

Run only after green checks:
```bash
gh pr merge 217 --repo kylemwalkerpr-ship-it/portal --merge --delete-branch=false
```

- [ ] **Step 3: Follow the exact main deployment run**

Verify the run uses Wrangler `4.132.0`, direct Wrangler deployment succeeds, Worker-secret health passes, and `/BUILD_ID` equals the build produced by that run.
If Cloudflare code `10000` remains, stop the entire cross-Worker rollout and record the exact failing endpoint.

### Task 2: Harden `support-saas` OpenNext deployment

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.github/workflows/deploy.yml`
- Create: `scripts/deploy-production.mjs`
- Create: `tests/deploy-production-contract.test.mjs`

**Interfaces:**
- Consumes: `.open-next/worker.js` and assets produced by `opennextjs-cloudflare build`.
- Produces: guarded `npm run deploy` that invokes exact Wrangler directly with `OPEN_NEXT_DEPLOY=true`.

- [ ] **Step 1: Write the failing deployment-contract test**

The Node test must assert:
```js
assert.equal(pkg.devDependencies.wrangler, '4.132.0')
assert.equal(pkg.scripts.deploy, 'node scripts/deploy-production.mjs')
assert.doesNotMatch(workflow, /opennextjs-cloudflare deploy/)
assert.match(workflow, /npm run pages:build/)
assert.match(workflow, /All 3 deploy attempts failed[\s\S]*exit 1/)
assert.match(workflow, /https:\/\/support\.yousafeconsultancy\.com\//)
```
Also spawn `scripts/deploy-production.mjs` against a fake `npx` and prove wrong GitHub context blocks before the child process while official context passes `wrangler deploy` and `OPEN_NEXT_DEPLOY=true`.

- [ ] **Step 2: Run RED**

Run:
```bash
node --test tests/deploy-production-contract.test.mjs
```
Expected: failure because Wrangler is not pinned, deploy still uses OpenNext, and no guarded direct-deploy script exists.

- [ ] **Step 3: Implement the minimal direct-Wrangler path**

Set:
```json
"deploy": "node scripts/deploy-production.mjs",
"wrangler": "4.132.0"
```
The deploy script must require `GITHUB_ACTIONS=true`, `GITHUB_REF=refs/heads/main`, and `GITHUB_WORKFLOW=Deploy YouSafe Support SaaS`, then execute:
```js
spawnSync(command, ['wrangler', 'deploy'], {
  cwd: process.cwd(),
  env: { ...process.env, OPEN_NEXT_DEPLOY: 'true' },
  stdio: 'inherit',
})
```
The workflow build step uses `npm run pages:build`; the deploy step retries `npm run deploy` up to three times with 30s/60s backoff and exits `1` after exhaustion. Add an HTTP-200 smoke gate for `https://support.yousafeconsultancy.com/`.

- [ ] **Step 4: Verify locally**

Run:
```bash
npm ci
node --test tests/deploy-production-contract.test.mjs
npm run pages:build
git diff --check
```
Expected: all pass; no production deploy occurs locally.

- [ ] **Step 5: Commit and open a PR**

Commit only the files above. PR CI must build the exact OpenNext artifact and skip Cloudflare deployment on pull requests.

### Task 3: Provision and prove the Support per-Worker token

**Files:** none; Cloudflare + GitHub repository secret mutation only.

**Interfaces:**
- Consumes: green Support deployment PR from Task 2.
- Produces: `CLOUDFLARE_API_TOKEN` in `support-saas` backed by a Support-only account token.

- [ ] **Step 1: Create token through authenticated Opera + Playwright**

Create `github-ci-support-saas` with exactly:
```text
Individual Workers Editor -> support-saas
Workers Routes Write -> yousafeconsultancy.com zone
```
Do not add Account Settings, D1, KV, R2, AI, or global Workers Scripts permissions.

- [ ] **Step 2: Transfer the one-time token directly to GitHub**

Capture the token value into a shell variable without printing it and pipe it on stdin to:
```bash
gh secret set CLOUDFLARE_API_TOKEN --repo kylemwalkerpr-ship-it/support-saas
```
Unset the shell variable immediately. Verify only the GitHub secret update timestamp and Cloudflare token status/resource labels.

- [ ] **Step 3: Merge and prove production**

Merge the green Support PR. Require the deploy step to succeed on Wrangler 4.132.0 and the Support homepage smoke check to return HTTP 200. On `10000`, stop and inspect the exact endpoint before changing permission scope.

### Task 4: Harden `caseworks` direct Worker deployment

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `.github/workflows/deploy.yml`
- Create: `scripts/prepare-worker-secrets.mjs`
- Create: `tests/deploy-production-contract.test.mjs`

**Interfaces:**
- Consumes: GitHub secrets `RESEND_API_KEY` and `BREVO_API_KEY`.
- Produces: pinned direct Wrangler deploy with an ephemeral additive secrets file; D1 migration remains a separate trust boundary.

- [ ] **Step 1: Write RED tests**

Use Node's built-in test runner to assert:
```js
assert.equal(pkg.devDependencies.wrangler, '4.132.0')
assert.doesNotMatch(workflow, /cloudflare\/wrangler-action@v3[\s\S]*command: deploy/)
assert.doesNotMatch(workflow, /wrangler secret put/)
assert.match(workflow, /--secrets-file/)
assert.match(workflow, /All 3 deploy attempts failed[\s\S]*exit 1/)
assert.match(workflow, /https:\/\/legal\.yousafeconsultancy\.com\//)
```
The secret-preparer test must prove mode `0600`, exactly `RESEND_API_KEY`/`BREVO_API_KEY` when set, omission of unset values, and absence of `CLOUDFLARE_API_TOKEN`.

- [ ] **Step 2: Run RED**

Run:
```bash
node --test tests/deploy-production-contract.test.mjs
```
Expected: fail on the current action-based deploy and post-deploy secret-put workflow.

- [ ] **Step 3: Implement direct atomic deployment**

Pin Wrangler:
```bash
pnpm add -D -E wrangler@4.132.0
```
Prepare `$RUNNER_TEMP/caseworks-worker-secrets.json` from the two GitHub secrets, chmod `0600`, export the path via `$GITHUB_ENV`, and deploy with:
```bash
pnpm exec wrangler deploy --secrets-file "$WORKER_SECRETS_FILE"
```
Wrap that command in the existing 3-attempt 30s/60s retry policy and explicitly `exit 1` after attempt 3 fails. Add `if: always()` cleanup and an HTTP-200 smoke gate for `https://legal.yousafeconsultancy.com/`.

Replace the D1 migration authentication source with a dedicated GitHub secret:
```yaml
env:
  CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_D1_API_TOKEN }}
  CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
run: pnpm exec wrangler d1 migrations apply caseworks-intake --remote
```
Keep the migration non-blocking during this rollout; do not widen the Worker deploy token for D1.

- [ ] **Step 4: Verify and PR**

Run:
```bash
pnpm install --frozen-lockfile
node --test tests/deploy-production-contract.test.mjs
pnpm build
git diff --check
```
Then commit only the Caseworks deployment files and open a PR. Production-only steps must skip on the PR run.

### Task 5: Provision and prove Caseworks credentials

**Files:** none; Cloudflare + GitHub repository secret mutation only.

- [ ] **Step 1: Create `github-ci-caseworks`**

Through Opera + Playwright, create an account token with only:
```text
Individual Workers Editor -> caseworks
```
Transfer it directly to the Caseworks GitHub secret `CLOUDFLARE_API_TOKEN` without printing the value.

- [ ] **Step 2: Create a separate D1 migration token**

Create `github-ci-caseworks-d1` with only the minimum Cloudflare D1 edit permission available for the account. Do not add Worker Editor or route permissions to this token. Transfer it directly to GitHub secret `CLOUDFLARE_D1_API_TOKEN`.

- [ ] **Step 3: Merge and prove production**

Merge the green Caseworks PR. Require the direct Worker deploy to succeed on Wrangler 4.132.0, the ephemeral secrets file to clean up, and `https://legal.yousafeconsultancy.com/` to return HTTP 200. Record D1 migration success/failure separately because it remains non-blocking.

### Task 6: Harden `yousafe-landing` staged OpenNext release

**Files:**
- Modify: `landing-page/package.json`
- Modify: `landing-page/pnpm-lock.yaml`
- Modify: `.github/workflows/deploy-landing-page.yml`
- Create: `landing-page/scripts/upload-production-version.mjs`
- Create: `landing-page/tests/deploy-production-contract.test.mjs`

**Interfaces:**
- Consumes: `.open-next/worker.js` from `pnpm pages:build`.
- Produces: tagged Wrangler version upload, explicit 100% promotion, unchanged BUILD_ID freshness proof.

- [ ] **Step 1: Write RED tests for staged release semantics**

Assert:
```js
assert.equal(pkg.devDependencies.wrangler, '4.132.0')
assert.doesNotMatch(workflow, /opennextjs-cloudflare deploy/)
assert.match(workflow, /wrangler versions upload/)
assert.match(workflow, /wrangler versions deploy/)
assert.match(workflow, /https:\/\/yousafeconsultancy\.com\/BUILD_ID/)
```
The upload helper test must prove official GitHub `main` context is required and that `OPEN_NEXT_DEPLOY=true` is present when invoking Wrangler.

- [ ] **Step 2: Run RED**

Run:
```bash
cd landing-page
node --test tests/deploy-production-contract.test.mjs
```
Expected: fail because deploy still routes through `opennextjs-cloudflare deploy` and Wrangler is not exactly pinned.

- [ ] **Step 3: Implement version upload with Wrangler 4.132.0**

Pin:
```bash
pnpm add -D -E wrangler@4.132.0
```
The upload helper invokes:
```bash
OPEN_NEXT_DEPLOY=true pnpm exec wrangler versions upload --tag "github-${GITHUB_SHA}"
```
Parse the uploaded version ID from Wrangler output and write only the ID to `$GITHUB_OUTPUT`. Preserve the existing separate promotion command:
```bash
pnpm exec wrangler versions deploy "${UPLOADED_VERSION}@100%" --name yousafe-landing -y
```
Do not add `--keep-vars`; the current Worker has no dashboard-only plaintext vars in this rollout. Existing Worker secrets remain additive/preserved.

- [ ] **Step 4: Verify and PR**

Run:
```bash
cd landing-page
pnpm install --frozen-lockfile
node --test tests/deploy-production-contract.test.mjs
pnpm pages:build
git diff --check
```
Then commit only Landing deployment files and open a PR. The PR must build but never upload/promote a production version.

### Task 7: Provision and prove the Landing token

**Files:** none; Cloudflare + GitHub secret mutation only.

- [ ] **Step 1: Create `github-ci-landing`**

Through Opera + Playwright create exactly:
```text
Individual Workers Editor -> yousafe-landing
```
No Workers Routes permission is required because the custom domain remains dashboard-managed.

- [ ] **Step 2: Replace only the repository secret value**

Transfer the one-time value directly to `kylemwalkerpr-ship-it/yousafe-consultancy` secret `CLOUDFLARE_API_TOKEN` only when the same repository's AU token migration is ready in Task 9. Because Landing and AU currently share one repo secret, do not rotate this secret to a Landing-only token prematurely.

- [ ] **Step 3: Split repo credentials before production rollout**

Change Landing workflow to read `${{ secrets.CLOUDFLARE_LANDING_API_TOKEN }}` and AU workflow to read `${{ secrets.CLOUDFLARE_AU_API_TOKEN }}`. Provision both secrets before merging either production workflow change. This prevents one Worker-specific token from breaking the sibling Worker in the monorepo.

- [ ] **Step 4: Merge and prove Landing**

Require version upload success, explicit 100% promotion success, and exact `/BUILD_ID` match at `https://yousafeconsultancy.com/BUILD_ID`.

### Task 8: Harden `yousafe-au` direct Worker deployment

**Files:**
- Modify: `au/package.json`
- Modify: `au/pnpm-lock.yaml`
- Modify: `.github/workflows/deploy-au.yml`
- Create: `au/tests/deploy-production-contract.test.mjs`

**Interfaces:**
- Consumes: static export in `au/out`.
- Produces: exact Wrangler 4.132.0 direct deploy, bounded retry, AU homepage smoke proof.

- [ ] **Step 1: Write RED tests**

Assert:
```js
assert.equal(pkg.devDependencies.wrangler, '4.132.0')
assert.doesNotMatch(workflow, /pnpm dlx wrangler@4 deploy/)
assert.match(workflow, /pnpm exec wrangler deploy/)
assert.match(workflow, /All 3 deploy attempts failed[\s\S]*exit 1/)
assert.match(workflow, /https:\/\/au\.yousafeconsultancy\.com\//)
assert.match(workflow, /CLOUDFLARE_AU_API_TOKEN/)
```

- [ ] **Step 2: Run RED**

Run:
```bash
cd au
node --test tests/deploy-production-contract.test.mjs
```
Expected: fail because the workflow floats `wrangler@4`, has no explicit retry exhaustion failure, and uses the shared token secret.

- [ ] **Step 3: Implement exact direct deployment**

Pin:
```bash
pnpm add -D -E wrangler@4.132.0
```
Deploy with three attempts of:
```bash
pnpm exec wrangler deploy
```
using `${{ secrets.CLOUDFLARE_AU_API_TOKEN }}` and existing account ID. Back off 30s then 60s; after attempt 3 print a GitHub error and `exit 1`. Add an HTTP-200 smoke gate for `https://au.yousafeconsultancy.com/`.

- [ ] **Step 4: Verify and PR**

Run:
```bash
cd au
pnpm install --frozen-lockfile
node --test tests/deploy-production-contract.test.mjs
pnpm build
git diff --check
```
Open the AU deployment PR only after the Landing/AU credential split is represented in both workflows so main is never left with one workflow pointing at a missing secret.

### Task 9: Provision and prove the AU token and monorepo secret split

**Files:** none beyond the workflow changes in Tasks 6 and 8; Cloudflare + GitHub secrets are mutated here.

- [ ] **Step 1: Create `github-ci-au`**

Through Opera + Playwright create exactly:
```text
Individual Workers Editor -> yousafe-au
```
No Workers Routes permission is required because routing remains dashboard-managed.

- [ ] **Step 2: Store both monorepo Worker tokens under distinct names**

Transfer the Landing token directly to:
```bash
gh secret set CLOUDFLARE_LANDING_API_TOKEN --repo kylemwalkerpr-ship-it/yousafe-consultancy
```
Transfer the AU token directly to:
```bash
gh secret set CLOUDFLARE_AU_API_TOKEN --repo kylemwalkerpr-ship-it/yousafe-consultancy
```
Do not delete the existing shared `CLOUDFLARE_API_TOKEN` until both replacement workflows have shipped successfully.

- [ ] **Step 3: Merge and prove AU after Landing is healthy**

Require Wrangler 4.132.0 deploy success and HTTP 200 from `https://au.yousafeconsultancy.com/`.

- [ ] **Step 4: Retire the shared monorepo token only after both proofs**

Once Landing and AU are both green on their dedicated secrets, remove the old shared `CLOUDFLARE_API_TOKEN` from the `yousafe-consultancy` repository and revoke only the corresponding old Cloudflare token if its identity can be established unambiguously. If identity is ambiguous, leave the Cloudflare token active and flag it for a separate credential audit rather than guessing.

### Task 10: Final Worker-estate deployment audit

**Files:** none unless the audit finds a concrete regression requiring a separately reviewed follow-up.

- [ ] **Step 1: Search all five Worker sources for disallowed deployment patterns**

Run targeted searches proving none remain:
```bash
roots=(
  /Users/phantomdarne/Documents/GitHub/yousafe-portal
  /Users/phantomdarne/Documents/GitHub/yousafe-saas
  /Users/phantomdarne/Documents/GitHub/caseworks
  /Users/phantomdarne/Documents/GitHub/yousafe-consultancy/landing-page
  /Users/phantomdarne/Documents/GitHub/yousafe-consultancy/au
)
grep -RIn --exclude-dir=node_modules --exclude-dir=.git 'opennextjs-cloudflare deploy' "${roots[@]}"
grep -RIn --exclude-dir=node_modules --exclude-dir=.git 'wrangler@4 deploy' "${roots[@]}"
grep -RIn --exclude-dir=node_modules --exclude-dir=.git 'wrangler secret put' "${roots[@]}"
```
Allowed matches must be documentation/tests describing rejected legacy behavior, not active production deploy commands.

- [ ] **Step 2: Verify exact Wrangler versions**

For each Worker repo/subproject, inspect its manifest and lockfile and prove production resolves exactly `4.132.0`.

- [ ] **Step 3: Verify Cloudflare token labels and scopes through Opera + Playwright**

Confirm active tokens exist for Portal, Support, Landing, Caseworks, and AU with the resource scopes defined in the spec. Do not reveal token values.

- [ ] **Step 4: Verify GitHub secret timestamps and workflow references**

Confirm each repository's deployment workflow references the intended Worker-specific secret and that each secret's update timestamp predates its successful production run.

- [ ] **Step 5: Record production evidence**

Capture the successful main run ID and deployed commit for each Worker plus its required smoke result. The estate is complete only when all five are independently green.

- [ ] **Step 6: Keep Pages separate**

Document the five Pages projects as intentionally not modified by this rollout. Open a separate Pages deployment-standard task only if current Pages workflows show similar reliability defects.
