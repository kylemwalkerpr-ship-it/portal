# Kimi Brief 32 — Marketplace as a Standalone Site on market.yousafeconsultancy.com

**Supervisor:** Claude. **Executor:** Kimi.
**Repo:** `yousafe-portal`.
**Prerequisites:** briefs 27-31 merged. Read `00_HOUSE_STYLE.md` and, in the
repo, `middleware.ts`, `wrangler.toml`, `app/sitemap.ts`,
`app/marketplace/**`, `components/marketplace/**`, `lib/portalAuth.ts`.

The decision is settled (approved by the user): **the marketplace gets its
own domain on the SAME Worker** — not a separate app/repo. The marketplace
is dynamic and shares Clerk auth, Supabase, payments, orders, and chat with
the portal; a separate codebase would duplicate all of that for no gain.
Instead it gets a custom domain and is served at that domain's root so it
reads as a standalone Fiverr-style site.

**§1 is a live bug — do it first and it can ship on its own.**

---

## §1 — CRITICAL — FIX THE SERVER COMPONENTS RENDER ERROR

The marketplace currently throws *"An error occurred in the Server
Components render"* ("We hit a snag") for the signed-in user.

Diagnostic facts (already established):
- Every marketplace page returns **200 unauthenticated** — `/marketplace`,
  `/categories`, `/providers`, `/templates`, `/cart`, `/order/success`, and
  the detail pages (`/gigs/[slug]`, `/providers/[id]`,
  `/categories/[categoryId]`, `/templates/[slug]`). The crash is **not** on
  the public path.
- So the failure is in the **signed-in render path** (a marketplace page or
  component that renders differently when `getOptionalPortalUser()` returns
  a user) or a soft-navigation RSC fetch.

Do this:
1. Reproduce it **signed in** — `pnpm dev`, log in (try student, attorney,
   and admin roles), open the marketplace. Or read the production error
   `digest` via `npx wrangler tail` while reproducing.
2. Find the throwing server component and fix the root cause. Do not paper
   over it with a try/catch that hides a broken render — fix what throws.
3. Confirm every marketplace page renders for signed-in AND signed-out
   users across all roles.

---

## §2 — BIND THE CUSTOM DOMAIN

**`wrangler.toml`** — add a second route block alongside the existing
`portal.yousafeconsultancy.com` one:

```toml
[[routes]]
pattern = "market.yousafeconsultancy.com"
custom_domain = true
```

`custom_domain = true` provisions the hostname + cert on deploy because the
zone is Cloudflare-managed. Flag to the user: if it does not resolve after
deploy, they must check the Cloudflare DNS for `yousafeconsultancy.com`.

**`wrangler.toml` `[vars]`** — `CLERK_AUTHORIZED_PARTIES` is currently
`"https://portal.yousafeconsultancy.com"`. Change it to:

```
CLERK_AUTHORIZED_PARTIES = "https://portal.yousafeconsultancy.com,https://market.yousafeconsultancy.com"
```

(The middleware already splits this on commas.)

---

## §3 — HOSTNAME ROUTING IN `middleware.ts`

The marketplace files stay where they are (`app/marketplace/**`). Routing
makes them serve at the **root of the market domain**.

Add hostname logic at the **top** of the `clerkMiddleware` handler, before
the existing language/auth logic:

**A. On host `market.yousafeconsultancy.com`:**
- Leave `/api/*` and `/_next/*` untouched (do not rewrite — APIs are
  shared).
- For any other path that does **not** already start with `/marketplace`,
  `NextResponse.rewrite()` to `/marketplace` + path (so `/` →
  `/marketplace`, `/gigs/x` → `/marketplace/gigs/x`,
  `/providers/y` → `/marketplace/providers/y`). The browser URL stays
  clean (`market.yousafeconsultancy.com/gigs/x`).
- The rewrite response must still carry the `withPathHeaders` headers +
  lang cookie (pass them into the `NextResponse.rewrite(url, { headers })`)
  so language detection and personalization keep working.
- Marketplace pages are public — no auth gate on this host.

**B. On host `portal.yousafeconsultancy.com`, path starting `/marketplace`:**
- `NextResponse.redirect()` **301** to
  `https://market.yousafeconsultancy.com` + path-with-`/marketplace`-stripped
  (`/marketplace` → `/`, `/marketplace/gigs/x` → `/gigs/x`). Preserve the
  query string. This keeps old links + search-engine-indexed URLs alive and
  makes the marketplace single-homed on the market domain.

**C. Everything else** — unchanged (portal behaviour as today).

Keep `/marketplace(.*)` etc. in `isPublicRoute` (added in the prior
middleware fix) — after the rewrite the path is `/marketplace/...` and must
still register as public.

---

## §4 — CLEAN INTERNAL LINKS

Because the marketplace is now single-homed on the market domain and served
at root, its internal links must be **root-relative without the
`/marketplace` prefix**.

In `app/marketplace/**` and `components/marketplace/**`:
- Every internal marketplace link — `href="/marketplace/gigs/..."`,
  `/marketplace/providers/...`, `/marketplace/categories/...`,
  `/marketplace/templates/...`, `/marketplace/cart`, `/marketplace` — drop
  the `/marketplace` prefix → `/gigs/...`, `/providers/...`, `/categories`,
  `/templates/...`, `/cart`, `/`.
- Links that point at the **portal** (sign-in, sign-up, dashboard, wallet,
  the `<RequiresStudentAccount>` / `SignUpGateModal` sign-up CTA) must
  become **absolute** `https://portal.yousafeconsultancy.com/...` URLs —
  they cross domains.
- The sign-up gate's `return`/`return_to` param must be an **absolute
  market URL** so the visitor lands back on the market page they came from
  after completing sign-up on the portal.

Audit `MarketplaceNavHeader.tsx`, `PublicMarketplaceLanding.tsx`,
`RequiresStudentAccount.tsx`, `SignUpGateModal.tsx`, `GigDetailPage.tsx`,
the provider/category/template pages, and `useGatedAction.tsx`.

---

## §5 — SEO / CANONICALS

The marketplace's canonical home is now `https://market.yousafeconsultancy.com`.
- `app/marketplace/providers/[id]/page.tsx` — `PORTAL_URL` constant and the
  OG URL become `https://market.yousafeconsultancy.com/providers/${id}/`
  (no `/marketplace`).
- All marketplace `metadata` / `openGraph` / canonical URLs → the market
  domain, no `/marketplace` segment.
- JSON-LD (`Service`, `ProfessionalService`, `Product`) URLs → market
  domain.
- `app/sitemap.ts` — emit marketplace entries as
  `https://market.yousafeconsultancy.com/...` (gigs at `/gigs/{slug}/`,
  providers at `/providers/{id}/`, templates, landing). Portal entries stay
  on the portal domain.
- `app/robots.ts` — ensure it does not disallow the market host.

---

## §6 — FAVICON

`/favicon.ico` 404s. Add a site icon via the Next.js convention — an
`app/icon.svg` (or `app/favicon.ico`) using the YouSafe mark — so it
resolves on both domains. One small asset; no logic.

---

## §7 — VERIFICATION

```bash
cd ~/Documents/GitHub/yousafe-portal
rm -f .next/lock
pnpm build >/dev/null 2>&1 && pnpm build >/dev/null 2>&1; echo "build: $?"
grep -rn 'href=["'"'"'`]/marketplace' app/marketplace components/marketplace 2>/dev/null | wc -l | awk '{print "stale /marketplace links (expect 0):", $1}'
grep -n "market.yousafeconsultancy.com" wrangler.toml | wc -l | awk '{print "market route+clerk in wrangler.toml (expect 2):", $1}'
git status --porcelain | grep -v /.next/
```

Post-deploy (Claude runs):
- `market.yousafeconsultancy.com/` → 200, renders the marketplace landing.
- `market.yousafeconsultancy.com/gigs/<slug>`, `/providers/<id>`,
  `/categories`, `/templates`, `/cart` → 200.
- `market.yousafeconsultancy.com` → 301 → `market.../`.
- Marketplace pages render for signed-in users (no "We hit a snag").
- `/favicon.ico` → 200.

---

## §8 — EDITORIAL GATE (Claude)

Reject if: the Server Components error still fires for any signed-in role;
`market.` does not serve the marketplace at root; `/api/*` or `/_next/*`
get rewritten on the market host; `portal.../marketplace/*` does not 301 to
market; any marketplace internal link still carries `/marketplace`; the
sign-up gate loses the cross-domain return; canonicals/sitemap still point
the marketplace at the portal domain; build not idempotent.

---

## §9 — HANDOFF

No zip. Report the §7 build/grep output and a one-line note on the §1
repro+fix. Do not commit or branch — Claude reviews, commits, deploys, and
runs the post-deploy domain checks.
