# Kimi Brief 29 — Public Marketplace + Sign-Up-At-Action

**Supervisor:** Claude. **Executor:** Kimi.
**Repo:** `yousafe-portal`.
**Prerequisites:** brief 28 (Stripe excision) merged. Read
`00_HOUSE_STYLE.md` and, in the repo, `lib/wallet.ts`,
`lib/payments/README.md`.

Smaller brief than 28 — this is UI/auth wiring, not money architecture.
Money path is unchanged (still wallet/NMI from briefs 27–28).

---

## 0. WHY

Today the marketplace lives under the portal's Clerk session — visitors
can't fully browse without context. The user wants the **Fiverr model**:
the marketplace is a **public** app anyone can browse and read, and an
account is required **only at the action point** (place an order, start a
chat with an attorney/consultant, save a gig, leave a review).

This raises conversion (no premature wall), helps SEO (every gig +
provider profile becomes indexable), and clarifies the funnel: browse →
intent → sign-up → action.

---

## 1. THE MENTAL MODEL

Two surfaces inside `/marketplace/*`:

**Public (no account required):**
- View — landing, gig list, gig detail (tiers/gallery/reviews), provider
  profiles (attorney + consultant), template catalogue + detail, category
  browse, search.
- Cart — items live in `localStorage`; the cart works for unauth users.
- Read reviews — anyone can read.

**Authed-only (sign-up gate intercepts):**
- Place an order from a gig tier or accept a paid offer.
- Start a chat with an attorney or consultant.
- Save / favorite a gig or provider.
- Leave a review.
- The wallet, dashboard, attorney/consultant/admin surfaces — unchanged,
  still authed.

A small `<RequiresStudentAccount>` component is the single intercept
point: on click, if signed in, run the action; otherwise open the
sign-up modal and resume the action after sign-up succeeds.

---

## 2. DECISIONS (do not deviate)

- **All `/marketplace/*` pages render for unauthenticated visitors.** No
  redirect, no 401, no blank. A signed-in user gets personalization
  (cart count, saved badges, "Hi Kyle") on top of the same page.
- **Public read APIs** (`GET /api/marketplace/*`, `GET /api/attorneys`,
  `GET /api/consultants`, `GET /api/gig-reviews`, `GET /api/gigs/[id]`,
  `GET /api/gigs/[id]/tiers`, `GET /api/gigs/[id]/gallery`,
  `GET /api/gig-categories`) require **no authentication**. They may
  optionally read the session for personalization (e.g. `savedByMe`), but
  never error if there isn't one.
- **Authed-only actions** (Place order, Start chat, Save, Review) call
  routes that require a student account. Those gated routes are
  unchanged — only the marketplace UI's path to them changes.
- **`lib/payments/`, `lib/wallet.ts`, `lib/earnings.ts`,
  `app/api/wallet/*`, `app/api/payments/*`** — untouched. Brief 28's
  order pathway (`/api/wallet/debit` for signed-in buyers) is what the
  "Place order" gate flows into; brief 29 only intercepts the path to it.
- **The wallet, dashboard, attorney/consultant/admin surfaces** — left
  alone. Brief 29 only edits the marketplace subtree.

---

## 3. SCOPE MAP

### 3.A — Pages: make every marketplace page render unauth-safely
```
app/marketplace/page.tsx
app/marketplace/categories/page.tsx
app/marketplace/categories/[categoryId]/page.tsx
app/marketplace/gigs/[slug]/page.tsx
app/marketplace/providers/page.tsx
app/marketplace/cart/page.tsx
app/marketplace/templates/page.tsx
app/marketplace/templates/[slug]/page.tsx
app/marketplace/order/success/page.tsx
```
- Remove any `requirePortalUser` / `redirect to sign-in` from these pages.
  Use an optional auth helper (`getOptionalPortalUser()` — create if it
  doesn't already exist; thin wrapper that returns `null` instead of
  redirecting) so personalization works when the visitor is signed in.

### 3.B — New pages (Fiverr-style provider profiles)
```
app/marketplace/providers/[id]/page.tsx   — provider profile (attorney
                                            or consultant), with their
                                            gigs, bio, ratings, "Start a
                                            chat" CTA. Public.
```
Use the existing `/api/attorneys/[id]` and `/api/consultants/[id]`
read endpoints (already exist). The provider type is inferred from
the profile row.

### 3.C — APIs: remove auth requirements from read endpoints
Audit each and drop any `requirePortalUser` / `getClerkUserId` *requirement*
(personalization-only reads are fine):
```
app/api/marketplace/gigs/route.ts             — list
app/api/marketplace/gigs/[slug]/route.ts      — detail
app/api/gigs/route.ts                         — public list (filter to active+published)
app/api/gigs/[id]/route.ts                    — read (mutation endpoints stay authed)
app/api/gigs/[id]/tiers/route.ts              — list tiers
app/api/gigs/[id]/tiers/[tierId]/route.ts     — read a tier
app/api/gigs/[id]/gallery/route.ts            — list gallery
app/api/gig-categories/route.ts               — list categories
app/api/gig-reviews/route.ts                  — list reviews (GET only)
app/api/attorneys/route.ts                    — list public attorneys
app/api/attorneys/search/route.ts             — search
app/api/attorneys/[id]/route.ts               — profile
app/api/attorneys/[id]/ratings/route.ts       — ratings
app/api/consultants/[id]/route.ts             — profile
```
The mutating endpoints under `/api/gigs/[id]/*` (archive, pause, publish,
status, gallery POST, tier POST) STAY authed — providers manage their own
gigs through the authed dashboard.

### 3.D — The sign-up gate component
```
components/marketplace/RequiresStudentAccount.tsx   — wrapper component
components/marketplace/SignUpGateModal.tsx          — the modal itself
```

`RequiresStudentAccount` is a click-intercepting wrapper:

```tsx
<RequiresStudentAccount
  intent="order" | "chat" | "save" | "review"
  returnTo={pathname}
  metadata={{ gigId?, attorneyId?, tierId? }}
  onAuthed={() => actuallyPlaceTheOrder()}
>
  <Button>Place order</Button>
</RequiresStudentAccount>
```

Behaviour:
- Renders `children` (the button). On click:
  - If signed in **and** the student profile is active → call `onAuthed()`.
  - Else → open `SignUpGateModal` with a contextual heading
    (“Sign up to start a chat”, “Sign up to order”, etc.) and the
    benefits (“Free · 30 seconds · No payment yet”).
- The modal’s primary CTA links to
  `/sign-up/student?return=<returnTo>&action=<intent>&meta=<base64-json>`.
- After sign-up completes, the post-sign-up handler reads the `action`
  and `meta` query params and resumes the action by redirecting back to
  `returnTo` with `?resume=<intent>`. Marketplace pages listen for
  `?resume=<intent>` and re-trigger the original click target.

Keep the modal small, fast, and **honest** — no fake urgency, no
outcome promises.

### 3.E — Action wiring (replace direct buttons with the gate wrapper)
- Gig detail page: "Order tier X" button → `<RequiresStudentAccount intent="order">`.
- Gig detail page: "Message [provider name]" → `<RequiresStudentAccount intent="chat">`.
- Provider profile: "Start a chat" → `<RequiresStudentAccount intent="chat">`.
- Gig detail / provider profile: "Save" → `<RequiresStudentAccount intent="save">`.
- Gig detail: "Leave a review" (only on gigs the user has bought, but
  shown for unauth as "Sign up + buy to review") → `<RequiresStudentAccount intent="review">`.
- Cart page (already supports unauth template guest-checkout via the
  brief-28 flow): if the cart contains a service / gig tier (not just
  templates), the “Checkout” button is `<RequiresStudentAccount intent="order">`.
  Templates-only cart → guest checkout works as today.

### 3.F — Nav / header
`components/marketplace/MarketplaceNavHeader.tsx`:
- **Unauth nav:** Browse · Templates · Search · "Sign in" · "Sign up
  free". Cart icon always visible.
- **Authed nav:** Browse · Templates · Search · cart icon · avatar
  with link to Dashboard.
- Detect auth client-side via a lightweight `useOptionalPortalUser()`
  hook (or pass from server). Don't block render on it.

### 3.G — Sign-up flow handoff
`app/sign-up/student/page.tsx` (existing — read first) handles the
`return` query param already used by other flows; honour and extend it
to handle `action` + `meta` as described in §3.D. After Clerk
post-sign-up callback, redirect to
`${return}?resume=${action}&meta=${meta}`.

### 3.H — SEO + indexing
- Every public marketplace page: `robots: { index: true, follow: true }`.
- Add JSON-LD per page:
  - Gig detail: `Service` (or `Product` if a tier has a `price_cents`)
    with offers per tier, aggregateRating from reviews.
  - Provider profile: `ProfessionalService` with `name`, `image`,
    `aggregateRating`, services offered.
  - Templates: keep as currently (`Product`).
- Update `app/sitemap.ts` to include all active+published gigs and
  active provider profiles in addition to the templates already there.

---

## 4. SELF-CHECK

- Every `/marketplace/*` page returns 200 unauthenticated.
- Every API in §3.C returns 200 unauthenticated (mutating endpoints
  still require auth — verify with a write probe).
- The four authed-only actions (order, chat, save, review) open the
  sign-up modal when clicked unauth.
- After sign-up the original action resumes (i.e. the user lands back
  on the gig/provider page and the action fires automatically).
- Sitemap includes gigs + provider profiles.
- JSON-LD validates on gig + provider pages.
- `lib/payments/`, `lib/wallet.ts`, `lib/earnings.ts`,
  `supabase/wallet_nmi.sql` untouched.
- The dashboard, attorney/consultant/admin surfaces untouched.
- Build x2 idempotent.

---

## 5. VERIFICATION

```bash
cd ~/Documents/GitHub/yousafe-portal
rm -f .next/lock
pnpm build >/dev/null 2>&1 && pnpm build >/dev/null 2>&1; echo "build: $?"

echo "=== public pages (expect all 200) ==="
for p in / /categories /providers /providers/<some-existing-id> \
         /gigs/<some-existing-slug> /templates /cart; do
  code=$(curl -s -o /dev/null -w "%{http_code}" \
    "https://market.yousafeconsultancy.com$p")
  echo "  $code  $p"
done

echo "=== public APIs (expect 200) ==="
for u in /api/marketplace/gigs /api/gig-categories \
         /api/attorneys /api/consultants \
         /api/marketplace/gigs/<some-existing-slug>; do
  code=$(curl -s -o /dev/null -w "%{http_code}" \
    "https://portal.yousafeconsultancy.com$u")
  echo "  $code  $u"
done

test -f components/marketplace/RequiresStudentAccount.tsx && echo "gate component ok"
test -f components/marketplace/SignUpGateModal.tsx && echo "gate modal ok"
test -f app/marketplace/providers/[id]/page.tsx && echo "provider profile page ok"
grep -rn "requirePortalUser\|getClerkUserId" app/marketplace/ 2>/dev/null | wc -l | awk '{print "marketplace pages still gated (expect 0):", $1}'
git status --porcelain | grep -v /.next/
```

Required: `build: 0`; all public pages 200; all public APIs 200; three
new component/page files present; zero remaining auth-required
references inside `app/marketplace/`.

---

## 6. EDITORIAL GATE (Claude)

Reject if: any `/marketplace/*` page errors or redirects for an unauth
visitor; any public read API requires auth; the sign-up gate is missing
on any of the four gated actions; sign-up doesn't return the user to
the originating page with `?resume=` honoured; `lib/payments/`,
`lib/wallet.ts`, `lib/earnings.ts`, or any non-marketplace surface
modified; the dashboard / attorney / consultant / admin code paths
touched; SEO regressions on existing public pages (templates / landing);
build not idempotent.

---

## 7. HANDOFF

No zip. Report the §5 output. Do not commit or branch — Claude reviews,
commits, deploys, and runs the cross-repo broken-link sweep + a curl
sanity sweep over the marketplace surface.
