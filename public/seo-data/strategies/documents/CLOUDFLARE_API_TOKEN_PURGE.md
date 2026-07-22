# Cloudflare token: enable auto cache-purge for USA SEO aliases

**Operator action required.** Deploy is fine; custom-domain 404s were stuck on `cf-cache-status: HIT` because `CLOUDFLARE_API_TOKEN` cannot purge zone cache (`error 10000`).

Full checklist lives in the consultancy repo:

**`yousafe-consultancy/docs/CLOUDFLARE_API_TOKEN.md`**

## 60-second version

1. [Create/edit API token](https://dash.cloudflare.com/profile/api-tokens) used by GitHub secret `CLOUDFLARE_API_TOKEN` on `kylemwalkerpr-ship-it/yousafe-consultancy`.
2. Add permissions:
   - **Account → Cloudflare Pages → Edit**
   - **Zone → Cache Purge → Purge** (on `yousafeconsultancy.com`)
   - **Zone → Zone → Read** (unless you set `CLOUDFLARE_ZONE_ID` secret)
3. Save token → update GitHub secret.
4. Optional: add secret `CLOUDFLARE_ZONE_ID` from zone Overview.
5. Run **Actions → Purge USA SEO cache → Run workflow**.
6. Confirm:

```bash
curl -sI https://usa.yousafeconsultancy.com/universities/nyu/ | head -8
# HTTP/2 301  location: …/new-york-university/
```

Until then: Dashboard → Caching → Custom purge those three trailing-slash alias URLs (or wait ~4h for TTL).
