#!/usr/bin/env bash
# ONLY local production deploy while GitHub Actions "Deploy YouSafe Portal" is down.
# Order is fixed: build, publish the prerender cache into Worker assets, wrangler
# deploy, then a GET crawl of every sitemap URL. A non-200 fails the script and
# prints the wrangler rollback to the version that was live before this deploy.
# Do not call wrangler deploy on its own. Do not use this once Actions is healthy.
set -euo pipefail

cd "$(dirname "$0")/.."

SITEMAP_URL="${SITEMAP_URL:-https://market.yousafeconsultancy.com/sitemap.xml}"
ROLLBACK_CMD=""

record_live_version() {
  local version
  version="$(npx wrangler deployments list 2>/dev/null | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1 || true)"
  if [[ -z "${version}" ]]; then
    echo "deploy-local: could not read the current worker version. Refusing to deploy without a rollback target." >&2
    exit 1
  fi
  ROLLBACK_CMD="npx wrangler rollback ${version}"
  echo "deploy-local: rollback target (version live now): ${version}"
  echo "deploy-local: if the crawl fails, run: ${ROLLBACK_CMD}"
}

crawl_sitemap() {
  local tmp codes url code failures
  tmp="$(mktemp -d)"
  echo "deploy-local: GET crawl ${SITEMAP_URL}"
  curl -fsS --max-time 60 "${SITEMAP_URL}" -o "${tmp}/sitemap.xml"
  python3 - "${tmp}/sitemap.xml" "${tmp}/urls.txt" <<'PY'
import re, sys
xml = open(sys.argv[1], encoding="utf-8").read()
urls = re.findall(r"<loc>\s*([^<\s]+)\s*</loc>", xml)
if not urls:
    raise SystemExit("sitemap contained no <loc> URLs")
open(sys.argv[2], "w", encoding="utf-8").write("\n".join(urls) + "\n")
print(f"deploy-local: sitemap URLs {len(urls)}")
PY
  : > "${tmp}/codes.txt"
  while IFS= read -r url; do
    [[ -z "${url}" ]] && continue
    printf 'url = "%s"\noutput = "/dev/null"\nwrite-out = "%%{http_code} %%{url_effective}\\n"\n' "${url}"
  done < "${tmp}/urls.txt" > "${tmp}/curl.txt"
  curl --parallel --parallel-max 20 --config "${tmp}/curl.txt" --silent --show-error --max-time 40 > "${tmp}/codes.txt"
  failures="$(awk '$1 != "200" { c++ } END { print c+0 }' "${tmp}/codes.txt")"
  local total
  total="$(wc -l < "${tmp}/urls.txt" | tr -d ' ')"
  local got
  got="$(wc -l < "${tmp}/codes.txt" | tr -d ' ')"
  echo "deploy-local: crawl results ${got}/${total}, non-200 ${failures}"
  if [[ "${got}" != "${total}" || "${failures}" != "0" ]]; then
    echo "deploy-local: CRAWL FAILED. Non-200 or missing responses:" >&2
    awk '$1 != "200" { print }' "${tmp}/codes.txt" >&2
    echo "deploy-local: ROLLBACK NOW: ${ROLLBACK_CMD}" >&2
    exit 1
  fi
  echo "deploy-local: crawl ok, every sitemap URL returned 200"
  echo "deploy-local: undo this deploy with: ${ROLLBACK_CMD}"
}

record_live_version
npm run build
npm run populate:static-incremental-cache
OPEN_NEXT_DEPLOY=true npx wrangler deploy
crawl_sitemap
