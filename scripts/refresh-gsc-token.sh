#!/usr/bin/env bash
# scripts/refresh-gsc-token.sh
#
# Refresh the Google Search Console OAuth refresh token used by
# lib/gscKeywordSignals.ts. Run this when the previous refresh token
# expires (Google forces a 7-day expiry on tokens issued by OAuth apps
# in Testing status — we accept that until/unless we publish the
# consent screen via Google verification).
#
# Total time: ~60 seconds — click through the consent flow, paste the
# refresh token back, script pushes it to both GitHub repo secrets and
# the Worker. The next gig draft picks it up automatically.
#
# Prereqs (one-time, already done — listed here so future-you doesn't
# have to dig through chat history):
#   • Google Cloud project: yousafe-gsc-reader
#   • Search Console API enabled on that project
#   • OAuth client created (Web application type) with
#     https://developers.google.com/oauthplayground in Authorized
#     redirect URIs
#   • OAuth consent screen configured (Testing mode, kylemwalker.pr@
#     gmail.com added as test user)
#   • GitHub repo secret GSC_OAUTH_CLIENT_ID + GSC_OAUTH_CLIENT_SECRET
#     already populated (this script reads them)
#
# Usage:
#   ./scripts/refresh-gsc-token.sh

set -euo pipefail

REPO="kylemwalkerpr-ship-it/portal"

echo "→ Reading OAuth client ID from GitHub repo secret metadata…"
# gh can't read secret values back (they're write-only) — but we don't
# need the secret value here, just the client ID (which is technically
# not a secret — it's public-by-design in OAuth). Read it from the
# locally cached value or prompt for it.
CLIENT_ID="${GSC_OAUTH_CLIENT_ID:-}"
if [ -z "$CLIENT_ID" ]; then
  echo
  echo "  GSC_OAUTH_CLIENT_ID not set in your shell env."
  echo "  Paste it here (it looks like 418757979440-XXX.apps.googleusercontent.com):"
  read -r CLIENT_ID
fi

echo
echo "→ Step 1 — Authorize the app in your browser."
echo "   Opening OAuth Playground with your client ID pre-baked."
echo
OAUTH_URL="https://developers.google.com/oauthplayground/"
echo "   URL: $OAUTH_URL"
echo
echo "   Once it opens, do this (60 seconds total):"
echo "     1. Top-right gear icon → tick 'Use your own OAuth credentials'."
echo "        Paste OAuth Client ID:     $CLIENT_ID"
echo "        Paste OAuth Client secret: (from GitHub repo secret"
echo "        GSC_OAUTH_CLIENT_SECRET — or from the original JSON file"
echo "        in ~/Downloads/client_secret_*.json)"
echo "        Close the settings panel."
echo "     2. Left side, scroll to 'Google Search Console API v1'."
echo "        Expand it. Tick: https://www.googleapis.com/auth/webmasters.readonly"
echo "     3. Click blue 'Authorize APIs' → sign in as kylemwalker.pr@gmail.com"
echo "        → click through the 'Google hasn't verified' warning (Advanced →"
echo "        'Go to YouSafe GSC Reader (unsafe)') → Continue."
echo "     4. Back in Playground, click 'Exchange authorization code for tokens'."
echo "     5. Copy the 'refresh_token' value from the response (long string"
echo "        starting with 1// — the request-response panel shows it under"
echo "        the response body)."
echo

# Try to open the browser cross-platform.
if command -v open >/dev/null 2>&1; then
  open "$OAUTH_URL" 2>/dev/null || true
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$OAUTH_URL" 2>/dev/null || true
fi

echo "→ Step 2 — Paste the new refresh_token below (then press Enter):"
read -r NEW_TOKEN
if [ -z "$NEW_TOKEN" ]; then
  echo "ERROR: empty input. Aborting." >&2
  exit 1
fi
# Sanity-check the shape — Google's refresh tokens consistently start
# with "1//" followed by base64-url-safe characters.
case "$NEW_TOKEN" in
  "1//"*) ;;
  *)
    echo "WARNING: that doesn't look like a Google refresh token (expected to start with '1//')."
    echo "Continuing anyway — if the deploy fails, re-run this script."
    ;;
esac

echo
echo "→ Step 3 — Pushing new token to GitHub repo secret…"
printf '%s' "$NEW_TOKEN" | gh secret set GSC_OAUTH_REFRESH_TOKEN -R "$REPO"

echo "→ Step 4 — Triggering CI to sync the secret to the Worker…"
# CI's "Sync AI provider secrets" step runs on every main-branch deploy.
# An empty commit is the lowest-friction way to trigger it without
# requiring local wrangler auth.
EMPTY_COMMIT_MSG="ci: refresh GSC OAuth token ($(date -u +%Y-%m-%d))"
git commit --allow-empty -m "$EMPTY_COMMIT_MSG" >/dev/null
git push origin main

echo
echo "✓ Done. CI will sync the new refresh token to the Worker in ~3 min."
echo "  Verify with:  gh run list -R $REPO --limit 1"
echo "  The token is good for 7 days. Re-run this script when it expires."
