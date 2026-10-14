# Temporary local release and acceptance

On 13 October 2026 the user authorized local Wrangler deployment while a GitHub account billing lock prevents official Actions jobs from starting. The purpose is continuity without divergence between GitHub source and production. GitHub `main` remains authoritative.

## Release evidence

Use the lockfile dependencies and Node22, matching the official workflow. Require typecheck, full Jest, Next/OpenNext production build, static cache and payload checks, and Wrangler dry run. Deploy a clean checkout of the current remote `main` SHA. Preserve existing secrets and synchronize any added secret to both GitHub and the Worker without displaying its value.

Set the Worker version message exactly to `YQAA main=<sha> build=<build-id> authorized-local`. Save a protected local JSON receipt with source SHA, Worker version, build ID, method `temporarily_user_authorized_local_wrangler`, clean-source/remote-main flags, test counts, passed build/typecheck/dry-run/cache checks, live smoke result and secret-name preservation. Secret values never belong in the receipt.

## Acceptance

`YQAA_RELEASE_MODE=authorized-local` selects the explicitly authorized temporary path. Supply `YQAA_LOCAL_RELEASE_RECEIPT`, `YQAA_EXPECTED_SHA`, `YQAA_EXPECTED_BUILD_ID`, and the existing scoped Clerk/Supabase credentials. No fabricated GitHub CI variables are required. The harness checks a clean canonical checkout, remote main, Cloudflare's latest sole active version at100%, exact source/build annotation, and live build/manifest before fixture writes and again after scenarios.

The main run has a30minute deadline. Its owned Playwright browser process is stopped and the work is settled before cleanup starts. Cleanup has an independent10minute deadline, abortable requests/quiet wait, and existing ownership fences. Only synthetic fixtures are paused, archived or hidden. A designated real client profile is read and authenticated, never edited. Failed cleanup prevents acceptance success.

Official workflow mode retains its existing exact-main successful-workflow verification. Local acceptance is separately labeled and does not claim to be a successful Actions deployment.

## Reconciliation

When GitHub unlocks Actions, run the official workflow for the recorded SHA or a reviewed successor. Do not deploy an older source. Verify live build ID, Worker version, source and configuration, plus the secret-name manifest. Record reconciliation in the YQAA release ledger and close this temporary exception. Infrastructure deployment is separate from full product acceptance and required human review.
