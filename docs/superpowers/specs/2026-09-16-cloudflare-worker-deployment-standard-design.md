# Cloudflare Worker Deployment Standardization Design

## Purpose

Standardize production deployment for every YouSafe Cloudflare Worker without creating one high-blast-radius CI credential.
The Portal deployment repair is the proving ground. No other Worker inherits the new pattern until the Portal production run succeeds with Wrangler 4.132.0 and the existing least-privilege token.

## Current Worker estate

Cloudflare currently shows five Workers in scope:

- `yousafe-portal` — OpenNext Worker; routes managed by Wrangler.
- `support-saas` — OpenNext Worker; route managed by Wrangler.
- `yousafe-landing` — OpenNext Worker; custom domains managed in Cloudflare dashboard.
- `caseworks` — direct Worker with static assets and D1; custom domain not managed by Wrangler config.
- `yousafe-au` — direct Worker with static assets; custom domain managed in Cloudflare dashboard.

The Pages projects (`yousafe-usa`, `yousafe-ca`, `yousafe-uk`, `yousafe-landing-page-git`, `pain`) are explicitly outside this Worker-specific rollout. They need a separate Pages deployment standard because their publish API and failure modes differ.

## Goals

1. Pin the production Wrangler generation exactly rather than relying on stale lockfiles, `wrangler@4`, or action defaults.
2. Remove OpenNext deploy-wrapper calls where they trigger unnecessary Cloudflare platform-proxy APIs before the real Worker upload.
3. Make every Worker deployment fail closed after bounded retries.
4. Keep runtime secrets out of logs and out of the deploy credential.
5. Use one account-owned Cloudflare API token per Worker, not one shared all-Workers token.
6. Preserve strong existing release controls such as Landing's version promotion and build-freshness smoke gate.

## Global deployment contract

All Worker repos follow these invariants:

- Production deploys originate from the repository's protected `main` workflow, never from a local dashboard publish.
- Root Wrangler is pinned exactly to `4.132.0` while this authorization compatibility fix is active.
- Deployment runs only after build/test gates pass.
- Production-only steps are skipped on pull requests.
- A failed deployment attempt returns a non-zero status; three exhausted attempts end the workflow red.
- Existing routes/custom domains are not rewritten unless the repo intentionally manages them in `wrangler.toml`.
- `CLOUDFLARE_API_TOKEN` is never copied into Worker runtime bindings.
- Secrets are never printed. Any temporary secrets file lives under `RUNNER_TEMP`, mode `0600`, and is removed with an `always()` cleanup step.
- Production success requires an explicit proof: Portal and Landing must match the expected `/BUILD_ID`; Support must return HTTP 200 at `https://support.yousafeconsultancy.com/`; Caseworks must return HTTP 200 at `https://legal.yousafeconsultancy.com/`; AU must return HTTP 200 at `https://au.yousafeconsultancy.com/`.

## OpenNext Worker contract

OpenNext continues to build `.open-next/worker.js` and assets. Deployment does not use `opennextjs-cloudflare deploy` after the build.
Instead, the workflow invokes Wrangler directly with `OPEN_NEXT_DEPLOY=true`, preventing Wrangler from recursively delegating back to OpenNext.

For `yousafe-portal`, code and GitHub-managed runtime secrets publish atomically through `wrangler deploy --secrets-file`.
For `support-saas` and `yousafe-landing`, runtime secrets currently live only on the Worker. This rollout does not migrate those secrets into GitHub merely for uniformity; direct Wrangler must preserve the existing bindings.

`yousafe-landing` keeps its staged-release model. The implementation must first prove, in tests and a non-production-compatible CLI inspection, that Wrangler 4.132.0 can upload the built OpenNext Worker as a version and expose the uploaded version ID. Only then may the existing explicit `versions deploy <id>@100%` promotion be retained. If that exact primitive is not available, use a direct deploy plus the existing BUILD_ID freshness gate rather than reintroducing the OpenNext deploy wrapper.

## Direct Worker contract

`caseworks` and `yousafe-au` do not need OpenNext deploy handling.
They use pinned direct Wrangler 4.132.0.

For `caseworks`, the current RESEND/BREVO secrets already exist as GitHub repository secrets. The preferred deployment publishes them atomically with the Worker through an ephemeral `--secrets-file`, eliminating the current non-blocking post-deploy `wrangler secret put` loop. D1 migrations remain a separate operation because database edit authority is a different trust boundary from Worker deployment.

For `yousafe-au`, no runtime-secret migration is needed. Replace the floating `pnpm dlx wrangler@4 deploy` with an exact Wrangler 4.132.0 dependency/invocation and add a bounded retry plus a production smoke check.

## Cloudflare token model

Use separate account-owned tokens:

- `github-ci-portal` → Individual Worker Editor for `yousafe-portal`; Workers Routes Write for the YouSafe zone because Portal routes are declared in Wrangler.
- `github-ci-support-saas` → Individual Worker Editor for `support-saas`; Workers Routes Write for the YouSafe zone because Support declares its custom-domain route in Wrangler.
- `github-ci-landing` → Individual Worker Editor for `yousafe-landing`; no zone-route permission because routing is dashboard-managed.
- `github-ci-caseworks` → Individual Worker Editor for `caseworks`; no broad D1 permission in the deploy token.
- `github-ci-au` → Individual Worker Editor for `yousafe-au`; no zone-route permission because routing is dashboard-managed.

If Caseworks migrations need automation, use a separate D1-specific repository secret/token rather than expanding `github-ci-caseworks` into a general account data credential.
A single account-wide Workers Scripts Write token is a fallback only if Cloudflare 4.132.0 proves granular Worker Editor unusable in production; it is not the default design.

## Rollout gates

### Gate 1 — Portal proof

PR #217 must pass clean-install CI, merge to `main`, and the resulting official Portal workflow must satisfy all of the following:

- Wrangler reports 4.132.0.
- Direct deploy no longer fails at `/workers/services/yousafe-portal` with Cloudflare code 10000.
- Deploy step returns success without hidden retries exhausting.
- Worker-secret health succeeds.
- Exact-build smoke sees the expected new BUILD_ID in production.

If Gate 1 fails, stop. Do not propagate Wrangler 4.132.0 as the authorization solution to the other Workers. Diagnose the new exact endpoint/permission first.

### Gate 2 — Repository-local TDD

Each Worker gets its own isolated branch/worktree and a RED→GREEN cycle covering its exact deployment contract. No cross-repo mega-commit.

### Gate 3 — PR CI

Every repo's pull request must prove dependency installation, tests/typecheck/build, and that production-only Cloudflare steps are skipped on PRs.

### Gate 4 — Production one at a time

Merge and prove one Worker at a time. Do not rotate all CI tokens simultaneously. Production evidence from one Worker cannot substitute for another Worker's smoke test.

## Browser and credential operations

Authenticated Cloudflare inspection and token provisioning use the approved local Opera + Playwright bridge, reusing the existing Opera session and MFA state. Do not create a competing browser controller or export authentication state.

Playwright may:

- inventory Workers, routes, deployment history, and token permission labels;
- create or edit the per-Worker account tokens after the corresponding code path is ready;
- verify token status and resource scope;
- support post-deploy dashboard inspection when CI evidence needs correlation.

Playwright must not expose token values in chat, logs, screenshots, shell history, or repository files. A newly created token value is transferred directly into the matching GitHub Actions secret and is not retained elsewhere.

## Failure handling

- Authentication/authorization `10000`: fail the deploy and record the exact Cloudflare endpoint before changing permissions.
- Transient Workers API `10013`: bounded retry is allowed because the publish is idempotent.
- Secret-file preparation failure: fail before deployment; do not fall back to a secretless deploy where GitHub-managed secrets are part of the contract.
- Smoke mismatch: deployment is not considered complete even if Wrangler returned zero.
- Token provisioning failure: leave the existing token/secret unchanged and stop that Worker's rollout.
- Pages projects: no changes in this rollout.

## Completion criteria

The rollout is complete only when all five Workers have repository-controlled, pinned, fail-closed deployment paths; each has a least-privilege per-Worker token; and each has passed its own post-merge production proof. The final audit must show no Worker deployment still depends on `opennextjs-cloudflare deploy`, floating `wrangler@4`, unpinned wrangler-action defaults, or non-blocking secret mutation that can hide a failed runtime-secret update.
