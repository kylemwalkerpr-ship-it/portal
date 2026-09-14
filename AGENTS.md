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
