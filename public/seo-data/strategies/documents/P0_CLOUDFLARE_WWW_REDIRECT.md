# P0 — www → apex hard redirect (Cloudflare backup)

**Code shipped:** `yousafe-consultancy/landing-page/middleware.ts` issues **301** from `www.yousafeconsultancy.com` → `yousafeconsultancy.com` (same path + query).

**Also configure in Cloudflare** (zone `yousafeconsultancy.com`) so edge/cache paths that never hit the Worker still consolidate:

## Recommended: Single Redirects

1. Cloudflare Dashboard → **Rules** → **Redirect Rules** (or Bulk Redirects)
2. Create rule:

| Field | Value |
|---|---|
| Name | `www to apex 301` |
| If | Hostname equals `www.yousafeconsultancy.com` |
| Then | Dynamic redirect |
| Expression | `concat("https://yousafeconsultancy.com", http.request.uri.path)` — preserve query via **Preserve query string** = ON |
| Status | **301** |

Alternative Bulk Redirect list:

```
www.yousafeconsultancy.com/*  https://yousafeconsultancy.com/$1  301
```

(Use Cloudflare’s bulk redirect source/target format for your plan.)

## Verify after deploy

```bash
curl -sI https://www.yousafeconsultancy.com/ | head -15
# expect: HTTP/2 301  and  location: https://yousafeconsultancy.com/
curl -sI https://www.yousafeconsultancy.com/blog | head -10
# expect: location: https://yousafeconsultancy.com/blog
```

## GSC

- Keep both properties temporarily; set apex as preferred via redirect.
- Resubmit `https://yousafeconsultancy.com/sitemap-index.xml` on apex property.
