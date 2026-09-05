# Ops note — Cloudflare Pages API token (regional landings)

**Audience:** operators deploying `yousafe-uk` / `yousafe-ca` / `yousafe-usa` (and apex landing) via GitHub Actions or Mac Wrangler.

## Required GH Actions secret scope

`CLOUDFLARE_API_TOKEN` (repo / org secret used by Pages deploy workflows) must
include **Cloudflare Pages Edit** (or equivalent Pages write) for:

| Pages project   | Region / role        |
|-----------------|----------------------|
| `yousafe-uk`    | UK regional landing  |
| `yousafe-ca`    | CA regional landing  |
| `yousafe-usa`   | US regional landing  |

Without Pages Edit, CI can still succeed for Workers while regional **Pages**
deploys fail. Do **not** commit token values; rotate/fix scopes in the
Cloudflare dashboard + GitHub secrets UI.

## Mac Wrangler OAuth workaround

When the GH token scopes are wrong and a landing must ship, use a Mac that
already has Wrangler OAuth (`wrangler login`):

```bash
export CLOUDFLARE_ACCOUNT_ID=48f2c5185be44e14fea1df7d0591932a
# wrangler pages deploy <dir> --project-name=yousafe-uk|yousafe-ca|yousafe-usa
```

Account ID above is the YouSafe Cloudflare account (public identifier, not a
secret). Prefer restoring CI token scopes so this workaround is temporary.

## Related

- Portal `README.md` — short copy of this note
- Prefer GH Actions as the only long-term deploy path for Pages
