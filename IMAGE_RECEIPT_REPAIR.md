# Studio service-role image receipt repair

## Scope

This closes the image evidence gap for the isolated local Supabase integration workflow. The baseline was PR #303 at `b38d9a3c549729ce2b7188c9f2313a00cd5524e9`, including hosted run `36602275466`. That completed historical run did not produce image receipts; this change does not claim that it captured historical image digests.

The pinned Supabase CLI remains `2.98.2`, and `ci/supabase/supabase/config.toml` is unchanged. The workflow uses the Supabase project label `com.supabase.cli.project=yousafe-studio-service-role-ci` to find the stack. It projects only container name, resolved image reference, and immutable image ID from container inspection, then separately runs `docker image inspect` for those exact immutable IDs and projects only image ID and repository digests. The receipt builder joins these allowlisted records by ID and fails if any referenced image is absent. Docker inspect and JQ diagnostics stay in runner temp files. Neither Docker environment configuration nor Supabase status/startup output is printed.

Each JSON receipt includes schema version, `GITHUB_SHA`, Supabase CLI version, workflow run ID and attempt, and a sorted inventory. The builder enforces Docker image reference grammar (including registry ports, repository paths, tags, digest references, and bare SHA256 image IDs), repository digest grammar, exact root/context/record field allowlists, and string types for all context values. It constructs output from explicit fields and emits fixed validation errors that do not include rejected image or digest values or unknown key names. Empty inventory, duplicate container/image identities, missing image inspect results, non-allowlisted fields, and invalid IDs/digests fail the job. When Docker reports no repository digest, the receipt says so explicitly and retains the image ID. The single JSON file is uploaded with the official [`actions/upload-artifact` v4.6.2 commit](https://github.com/actions/upload-artifact/commit/ea165f8d65b6e75b540449e92b4886f43607fa02), retained for 14 days. Teardown remains `if: always()`.

## Exact diff summary

- `.github/workflows/studio-service-role-integration.yml`: add the receipt script and test to pull request path triggers; discover all labeled stack containers; inspect their immutable image IDs separately; join explicit allowlisted Docker projections; upload the receipt with the full-SHA-pinned action.
- `scripts/studio-service-role-image-receipt.cjs`: validate Docker image and repository digest grammar, exact typed context and root/record allowlists, join image inspection data by immutable ID, normalize/sort data, distinguish available from absent repository digests, and explicitly construct the small JSON receipt.
- `tests/studio-service-role-image-receipt.test.ts`: cover different container shapes and image join, standard image reference forms, fail-closed missing inventory/images, duplicate identities, malformed digest prefixes, secret/control/URL canaries, context types, and non-allowlisted fields.
- `IMAGE_RECEIPT_REPAIR.md`: document the repair, evidence boundaries, checks, and required hosted rerun.

No production Supabase access, Docker pull, local stack launch, push, merge, or deploy was performed.

## Checks

- RED confirmation before implementation: `npx jest --runInBand tests/studio-service-role-image-receipt.test.ts` — 3 new negative tests failed against the original builder (unsafe image and digest accepted, context secret spread into output).
- GREEN: `npx jest --runInBand tests/studio-service-role-image-receipt.test.ts` — 9 tests passed.
- `npx tsc --noEmit` — passed.
- Ruby `YAML.load_file` parse of the workflow — passed.
- `bash -n /tmp/studio-service-role-startup.sh` (previously extracted from the workflow startup step) — passed.
- `node --check scripts/studio-service-role-image-receipt.cjs` — passed.
- `git diff --check` — passed.

The existing integration suite was not rerun; its successful hosted result is the stated baseline. The startup shell syntax check used the pre-existing `/tmp/studio-service-role-startup.sh` extraction rather than regenerating it during this revision. These local checks do not produce hosted image evidence.

## Hosted rerun required

After this local commit is pushed through the existing PR #303 review path, run **Studio service-role integration** on the repair commit (or use `workflow_dispatch` against that exact branch/ref). Confirm the run succeeds, teardown completes, and download the `studio-supabase-image-receipt-<run-id>-<attempt>` artifact. Verify its `commit`, `cliVersion`, `runId`, and `runAttempt` match that hosted run, and that it contains each labeled Supabase container with image reference and image ID. Any empty `repoDigests` entry must carry the explicit unavailable note. Do not attribute the new receipt to run `36602275466` or to the earlier baseline commit.
