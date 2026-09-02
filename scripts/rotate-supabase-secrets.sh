#!/usr/bin/env bash
#
# rotate-supabase-secrets.sh — propagate rotated Supabase keys after the
# dashboard-side regeneration (2026-09-02 rotation).
#
# Usage (values are READ VIA ENV, never pasted on the command line):
#   NEW_SR_JWT='eyJ…' NEW_SBP='sbp_…' ./scripts/rotate-supabase-secrets.sh
#
# Steps performed:
#   1. GitHub Actions secrets (kylemwalkerpr-ship-it/portal):
#        SUPABASE_SERVICE_ROLE_JWT  <- new legacy service_role JWT  (runtime)
#        SUPABASE_SERVICE_ROLE_KEY  <- same JWT (belt & braces — the old
#                                       sb_secret_ value was never registered
#                                       for this project and 401s)
#        SUPABASE_ACCESS_TOKEN      <- new sbp_ PAT (deploy-time vault sync)
#   2. .env.local — same three values.
#   3. (optional) --deploy: re-runs the Deploy workflow so the Worker picks
#      up the new JWT, then waits and tails the run.
#
# Secrets are never echoed. Requires: gh authenticated with repo scope.
set -euo pipefail

REPO="kylemwalkerpr-ship-it/portal"
ENV_FILE=".env.local"

if [[ -z "${NEW_SR_JWT:-}" || "${NEW_SR_JWT}" != eyJ* ]]; then
  echo "ERROR: NEW_SR_JWT must be the new legacy service_role JWT (starts with eyJ)" >&2
  exit 1
fi
if [[ -z "${NEW_SBP:-}" || "${NEW_SBP}" != sbp_* ]]; then
  echo "ERROR: NEW_SBP must be the new personal access token (starts with sbp_)" >&2
  exit 1
fi

echo "== 1/3 GitHub Actions secrets =="
printf '%s' "$NEW_SR_JWT" | gh secret set SUPABASE_SERVICE_ROLE_JWT --repo "$REPO"
printf '%s' "$NEW_SR_JWT" | gh secret set SUPABASE_SERVICE_ROLE_KEY --repo "$REPO"
printf '%s' "$NEW_SBP"    | gh secret set SUPABASE_ACCESS_TOKEN  --repo "$REPO"
echo "  GH secrets set."

echo "== 2/3 .env.local =="
python3 - "$ENV_FILE" "$NEW_SR_JWT" "$NEW_SBP" <<'PY'
import sys, re
path, jwt, sbp = sys.argv[1], sys.argv[2], sys.argv[3]
out = []
for line in open(path):
    k = line.split("=", 1)[0].strip()
    if k == "SUPABASE_SERVICE_ROLE_JWT":
        out.append(f"SUPABASE_SERVICE_ROLE_JWT={jwt}\n")
    elif k == "SUPABASE_SERVICE_ROLE_KEY":
        out.append(f"SUPABASE_SERVICE_ROLE_KEY={jwt}\n")
    elif k == "SUPABASE_ACCESS_TOKEN":
        out.append(f"SUPABASE_ACCESS_TOKEN={sbp}\n")
    else:
        out.append(line)
joined = "".join(out)
if "SUPABASE_SERVICE_ROLE_JWT=" not in joined:
    joined += f"SUPABASE_SERVICE_ROLE_JWT={jwt}\n"
open(path, "w").write(joined)
print("  .env.local updated.")
PY

echo "== 3/3 next =="
if [[ "${1:-}" == "--deploy" ]]; then
  echo "  Triggering deploy…"
  RUN=$(gh workflow run deploy.yml --repo "$REPO" --json 2>/dev/null || gh workflow run deploy.yml --repo "$REPO")
  sleep 20
  LATEST=$(gh run list --repo "$REPO" --workflow deploy.yml --limit 1 --json databaseId -q '.[0].databaseId')
  echo "  Run $LATEST — watching…"
  gh run watch "$LATEST" --repo "$REPO" --exit-status --interval 20 || {
    echo "  Deploy failed; inspect: gh run view $LATEST --repo $REPO" >&2
    exit 1
  }
  RUN_URL="https://github.com/$REPO/actions/runs/$LATEST"
  echo "  Deploy green: $RUN_URL"
  echo "  VERIFY: Worker health check should now report supabase_auth_mode = service-role (legacy JWT)."
else
  echo "  Now re-run Deploy (action or push) so the Worker picks up the new JWT, then verify"
  echo "  supabase_auth_mode=service-role in the deploy's startup health check."
fi

echo "Done. Remember (dashboard): revoke the OLD personal access token (sbp_1cf6c3…) and"
echo "confirm the old service_role JWT is no longer valid after regeneration."