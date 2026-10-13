# Manual YQAA live acceptance

`.github/workflows/yqaa-live-acceptance.yml` is a manual, exact-`main` workflow. Its optional `client_email` dispatch input selects an already existing authorized client for all six scenarios. The workflow passes it only as `YQAA_CLIENT_EMAIL`; the email is never written to source, logs, summary, or receipt. An unset input preserves the synthetic-client path. It runs the complete Jest suite and TypeScript check before it reads production or writes test fixtures. It never deploys, publishes, or runs on a push or pull request.

## Required repository configuration

- Secret `CLERK_SECRET_KEY` for Clerk Backend API one-time sign-in tickets and username-only synthetic identities.
- Secret `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SERVICE_ROLE_JWT` for isolated fixture setup and cleanup.
- Repository variable `NEXT_PUBLIC_SUPABASE_URL` for the production Supabase project.

Secrets are only exposed to the live CI step. Do not put tokens, credentials, response prose, profile email, or message bodies into workflow inputs or artifacts.

Before creating identities, the harness checks Clerk's Frontend API environment for username enabled, password enabled, and email not required. It fails closed if Clerk cannot accept username-only users. It creates or reuses only run-scoped synthetic Clerk usernames with fixture metadata, then verifies each corresponding profile is active and hidden (`is_test_account=true`, `is_hidden=true`). Clerk receives no synthetic email address. Undeliverable `.invalid` values are stored only in the required profile email field and are never sent to Clerk; the harness sends no email. With `client_email`, it requires one exact profile match at the authorized known client ID, active client role, visible/non-test flags, a linked Clerk identity, and verified primary Clerk email. It never creates or updates that profile or identity.

The harness creates hidden, paused consultant gigs with actual taxonomy IDs: `education/university-admissions`, `academic-writing/application-essays`, and `mentorship/student-mentorship`. The default mode creates one synthetic provider per category and two synthetic client identities. Designated-client mode creates six distinct synthetic provider identities/gigs (two per category), with a different provider pair for negotiation and attention, so participant-pair conversation uniqueness yields six fresh threads. It refuses any existing participant pair or thread with messages and never resets a live thread. The continuous negotiation thread proceeds through orientation, budget, scope narrowing, a counter derived only from a quote persisted in server memory, lowball, and frustration. It checks actual AI replies, disclosure on each reply, client-safe pricing language, and persisted budget/scope/counter records. If frustration pauses AI, it verifies the pause and ends AI-required steps on that thread. Provider attention runs separately. Gig text describes organizational test fixtures only; it makes no licensed claims or offers of actual professional service. Gigs remain `status=paused` and `is_hidden=true`. Each YQAA reply wait is limited to 45 seconds, each HTTP request to 10 seconds, and the manual workflow job to 45 minutes. The harness creates no orders, accepts no offers, and does not charge or notify real people.

## Run after the candidate is merged and deployed

1. In the GitHub Actions run history, open the latest successful **Deploy YouSafe Portal** run on `main`. Confirm its commit is the current `main` commit. The deploy log prints `Built bundle buildId: …` in the post-deploy smoke test step.
2. Copy that 40-character commit SHA and build ID. From a configured `gh` session with repository read access, invoke:

   ```sh
   gh workflow run yqaa-live-acceptance.yml --ref main \
     -f expected_sha=FULL_40_CHARACTER_MAIN_SHA \
     -f expected_build_id=EXACT_DEPLOYED_BUILD_ID
   ```

   To run the authorized designated client, add `-f client_email="$AUTHORIZED_CLIENT_EMAIL"`; leave it out for the synthetic-client default. Do not put the email in command transcripts or artifacts.

3. The workflow verifies that the dispatch is on `main`, its checkout equals the supplied SHA, GitHub's latest successful official deploy run for `main` used that SHA, and production HTML plus its build manifest serve the supplied build ID. Any mismatch stops before fixture creation.
4. Review the job summary and the seven-day `yqaa-live-acceptance-<run id>` artifact. The receipt contains category and scenario names, pass/fail status, latency, coarse reply-length buckets, hashes of synthetic fixture identifiers, deployment identity, and verified cleanup states. It contains no conversation transcript or provider/client email.

The harness authenticates with a Clerk Backend API sign-in ticket consumed through ClerkJS 6.32's legacy `client.signIn.create({ strategy: 'ticket', ticket })` flow, then posts and reads through authenticated production Messenger endpoints. It checks orientation, budget, scope narrowing, a server-recorded quote counter, lowball, frustration, actual response disclosure, floor leakage, and provider attention across the three taxonomy categories. It also loads provider pricing controls and the paused gig scope editor through authenticated production pages/API. A missing model response, missing disclosure, wrong owner, unavailable migration, unsupported Clerk username-only configuration, stale deployment, or incomplete cleanup fails the run.

Cleanup revalidates fixture ownership, pauses AI on every owned thread, confirms the pause, snapshots messages and offers, and waits one full reply bound before checking for late AI replies or offers. It cancels pending offers only after the pause and quiet-period checks pass, verifies no pending offers remain, then performs an owner-scoped soft archive update and reasserts each gig's paused and hidden state. The sanitized receipt records these states without message bodies. Cleanup verification failures fail the workflow. No hard deletes occur. Synthetic Clerk identities, hidden test profiles, paused gigs, and archived threads are intentionally retained as test records.
