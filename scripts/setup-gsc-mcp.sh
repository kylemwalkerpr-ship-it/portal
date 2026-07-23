#!/usr/bin/env bash
# Setup free mcp-gsc (AminForou) for Grok + optional Cursor/Codex.
# Usage:
#   ./scripts/setup-gsc-mcp.sh /path/to/service_account.json
#   GSC_SERVICE_ACCOUNT_JSON='{...}' ./scripts/setup-gsc-mcp.sh
set -euo pipefail

UVX="${UVX:-$HOME/.local/bin/uvx}"
GSC_DIR="${GSC_DIR:-$HOME/.config/gsc}"
SA_PATH="${GSC_DIR}/service_account.json"
GROK_CFG="${GROK_CFG:-$HOME/.grok/config.toml}"

mkdir -p "$GSC_DIR"
chmod 700 "$GSC_DIR"

if [[ -n "${1:-}" && -f "$1" ]]; then
  cp "$1" "$SA_PATH"
  chmod 600 "$SA_PATH"
  echo "Installed SA from $1 → $SA_PATH"
elif [[ -n "${GSC_SERVICE_ACCOUNT_JSON:-}" ]]; then
  printf '%s' "$GSC_SERVICE_ACCOUNT_JSON" > "$SA_PATH"
  chmod 600 "$SA_PATH"
  echo "Wrote SA from GSC_SERVICE_ACCOUNT_JSON → $SA_PATH"
elif [[ -f "$SA_PATH" ]]; then
  echo "Using existing $SA_PATH"
else
  echo "No credentials provided."
  echo "  $0 /path/to/service_account.json"
  echo "  or set GSC_SERVICE_ACCOUNT_JSON env"
  echo "  Then add the SA email as GSC user on sc-domain:yousafeconsultancy.com"
  exit 1
fi

if [[ ! -x "$UVX" ]]; then
  echo "uvx not found at $UVX — install uv: curl -LsSf https://astral.sh/uv/install.sh | sh"
  exit 1
fi

# Warm package cache
"$UVX" mcp-search-console --help >/dev/null 2>&1 || true

# Ensure Grok MCP block exists (idempotent append if missing)
if [[ -f "$GROK_CFG" ]] && grep -q '\[mcp_servers\.gsc\]' "$GROK_CFG" 2>/dev/null; then
  echo "Grok config already has [mcp_servers.gsc]"
else
  cat >> "$GROK_CFG" <<EOF

# YouSafe GSC MCP — free first-party Search Console for agents
# Docs: docs/SEO_OPTIMAL_STACK.md
[mcp_servers.gsc]
command = "$UVX"
args = ["mcp-search-console"]
enabled = true
startup_timeout_sec = 90
env = { GSC_CREDENTIALS_PATH = "$SA_PATH", GSC_SKIP_OAUTH = "true", GSC_DATA_STATE = "all" }
EOF
  echo "Appended [mcp_servers.gsc] to $GROK_CFG"
fi

SA_EMAIL="gsc-reader@yousafe-gsc-reader.iam.gserviceaccount.com"
echo ""
echo "Next:"
echo "  1. GSC → Settings → Users → Add user (Full):"
echo "       $SA_EMAIL"
echo "     Property: sc-domain:yousafeconsultancy.com"
echo "  2. grok mcp doctor gsc"
echo "  3. In Grok: list GSC properties / top queries last 28d"
echo "  4. Studio: Optimal GSC plan → Generate optimal"
echo "Done."
