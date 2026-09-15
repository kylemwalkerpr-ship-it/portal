# YouSafe Portal agent rules

## Production source of truth

`main` on `kylemwalkerpr-ship-it/portal` is the only production source of truth.

For every coding agent, ChatGPT Work session, Codex session, local terminal session, and automation:

- Never run `wrangler deploy`, `wrangler versions deploy`, `opennextjs-cloudflare deploy`, or any equivalent direct Cloudflare publish command outside the repository's official GitHub Actions deployment workflow.
- Never publish code directly from the Cloudflare dashboard or replace the active Worker from a working directory that is not the exact `main` commit.
- Never treat the active Cloudflare Worker bundle as an editable source branch. If emergency recovery is needed, inspect it read-only, reconstruct the smallest missing delta on a Git branch, validate it, and merge through GitHub.
- Production code changes must follow: branch -> PR -> required repository checks -> merge to `main` -> `.github/workflows/deploy.yml`.
- A failed production deployment is fixed in GitHub and rerun from GitHub. Do not bypass a red workflow with a direct provider deployment.
- Cloudflare CLI use is limited to operations already encoded inside the official GitHub workflow (for example secret synchronization). It is not an alternate release path.

The repository's `npm run deploy` command is deliberately guarded and exits unless it is running inside the `Deploy YouSafe Portal` GitHub Actions workflow on `refs/heads/main`.

## Branch discipline

Keep branches short-lived. Once a PR is merged or deliberately superseded, delete its branch. Do not continue new work on historical recovery/fix branches. Start new work from current `main`.

Before deleting a branch that is not fully contained in `main`, preserve its tip as an archive tag or explicitly confirm that its unique work is intentionally discarded. This keeps `main` authoritative without losing recoverability.

## Approved authenticated browser interaction

For authenticated browser work, the approved primary path is the local Opera + Playwright control bridge defined in `docs/superpowers/specs/2026-09-15-authenticated-opera-control-design.md`.

- Prefer the user's already-authenticated Opera session so existing cookies, MFA-completed sessions, and browser state are reused instead of launching a separate cloud browser.
- Use Playwright for DOM-level interaction: tab selection, semantic element lookup, clicking, typing, navigation, waits, screenshots, uploads/downloads, and post-action verification.
- Keep the Playwright/controller connection persistent when practical so repeated browser actions do not re-bootstrap a browser or authentication flow.
- Use Opera Browser Connector as a complementary inspection/navigation tool for tab discovery, accessibility-tree reads, screenshots, and corroboration. Do not treat it as the arbitrary-click engine unless its exposed tool surface adds that capability.
- TinyFish is not the primary path for authenticated browser sessions. Reserve it for public, disposable, or otherwise suitable web automation when using the user's live authenticated Opera context is unnecessary.
- Browser-control and debugging endpoints must remain bound to localhost/loopback only. Never expose them to the LAN or public internet.
- Do not extract, print, persist, transmit, or commit raw cookies, session tokens, passwords, API keys, browser profile databases, or other authentication artifacts.
- Prefer semantic locators such as role/name, label, visible text, or stable DOM attributes over screen coordinates or brittle CSS paths.
- If page state or selector identity is ambiguous, stop and inspect rather than clicking the first match or replaying a prior action blindly.
- Consequential actions such as payments, destructive data changes, production configuration changes, publishing, PR merges, or deployments still require the normal approval and repository safety boundaries.
- Browser automation must never be used to bypass MFA, CAPTCHA, anti-bot controls, GitHub protections, or the production deployment rules above.

If Opera compatibility with the preferred Playwright extension path is unreliable, use the localhost-only CDP fallback from the approved design rather than reverting to coordinate-based GUI automation as the normal path.
