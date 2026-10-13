# Manual YQAA live acceptance

`.github/workflows/yqaa-live-acceptance.yml` is a manual, exact-`main` workflow. It runs the complete Jest suite and TypeScript check before it reads production or writes test fixtures. It never deploys, publishes, or runs on a push or pull request.

## Required repository configuration

- Secret `CLERK_SECRET_KEY` for Clerk Backend API one-time sign-in tokens.
- Secret `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SERVICE_ROLE_JWT` for isolated fixture setup and cleanup.
- Repository variable `NEXT_PUBLIC_SUPABASE_URL` for the production Supabase project.

Secrets are only exposed to the live CI step. Do not put tokens, credentials, response prose, profile email, or message bodies into workflow inputs or artifacts.

The known E2E student profile must still resolve to an active `client` profile with `is_test_account=true` and a Clerk user. If it does not, the harness stops before creating fixture records. For each workflow attempt it creates/reuses username-only synthetic Clerk identities and matching hidden test profiles, one paused synthetic consultant gig, and nine isolated DM threads. The existing E2E student is used only for orientation; the other scenarios use dedicated synthetic clients so a valid provider handoff in one case cannot pause later cases. No actual customer profile is changed. Fixture profile email fields use unique, undeliverable `.invalid` addresses only; Clerk accounts have no email address, no mail is sent, and no licensed credentials are represented. The gig is never published. Each run is limited to nine DM turns and 60 seconds per YQAA reply.

## Run after the candidate is merged and deployed

1. In the GitHub Actions run history, open the latest successful **Deploy YouSafe Portal** run on `main`. Confirm its commit is the current `main` commit. The deploy log prints `Built bundle buildId: …` in the post-deploy smoke test step.
2. Copy that 40-character commit SHA and build ID. From a configured `gh` session with repository read access, invoke:

   ```sh
   gh workflow run yqaa-live-acceptance.yml --ref main \
     -f expected_sha=FULL_40_CHARACTER_MAIN_SHA \
     -f expected_build_id=EXACT_DEPLOYED_BUILD_ID
   ```

3. The workflow verifies that the dispatch is on `main`, its checkout equals the supplied SHA, GitHub's latest successful official deploy run for `main` used that SHA, and production HTML plus its build manifest serve the supplied build ID. Any mismatch stops before fixture creation.
4. Review the job summary and the seven-day `yqaa-live-acceptance-<run id>` artifact. The receipt contains scenario names, pass/fail status, latency, coarse reply-length buckets, hashes of synthetic fixture IDs, deployment identity, and cleanup status. It contains no conversation transcript or provider/client email.

The harness authenticates with a Clerk Backend API sign-in token consumed through Clerk's browser client, then posts and reads through the authenticated production Messenger endpoints. It checks orientation, budget, scope narrowing, counter, low offer, frustration, AI disclosure, stale-floor handling, and provider attention. It also loads the provider pricing controls and the paused gig scope editor through their authenticated production pages/API. A missing model response, missing disclosure, wrong owner, unavailable migration, unrecognized test-account status, stale deployment, or incomplete cleanup fails the run.

Cleanup uses each fixture client's authenticated archive action, cancels only pending offers in the fixture threads, and reasserts the fixture gig's paused status. It performs no hard deletes, does not create orders, charges, or notifications to real people, and does not mutate the known student's profile. Synthetic Clerk identities, profiles, paused gigs, and archived threads are intentionally retained as test records.
