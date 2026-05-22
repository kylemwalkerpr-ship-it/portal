# Brief 36 — Adopt the Claude Design editorial system in the marketplace

**To:** Kimi
**From:** Claude (engineering / design supervisor)
**Type:** Visual refactor of the marketplace. Design and look only — real data only.
**Sibling brief:** Brief 30 in the `caseworks` repo applies this same design system to
caseworks. Read `caseworks/docs/seo-briefs/30_KIMI_CLAUDE_DESIGN_EDITORIAL_SYSTEM.md` for
the resolved token values — this brief reuses the **identical** token system so the two
properties share one visual language.

---

## §0 — What this is

A designer mocked up an editorial redesign with Claude Design. The exported bundle is in
this repo at `docs/seo-briefs/36-design-bundle/` (README, design chat, and the
HTML/CSS/JSX prototype under `project/`). Read all of `project/` before you start.

The prototype is an **editorial article** design (home feed, article reader, author
profile). The marketplace is a **gig commerce** product. You are **not** turning the
marketplace into an article site. You are adopting the prototype's **visual language** —
its colour tokens, typography, card treatment, nav chrome, rules, spacing, and warm-paper /
navy / serif editorial *feel* — and applying that language to the marketplace's existing
commerce surfaces.

> **Adopt the look. Keep the product.**
> Gig grids stay gig grids. Seller profiles stay seller profiles. Checkout stays checkout.
> They just get the new skin.

### The two hard requirements from the request

1. **Remove every placeholder.** No letter-block / initial-block image stand-ins, no
   striped "drop a photo here" placeholders, no mock imagery. Surfaces show **real**
   uploaded gig images and **real** seller avatars. See §5.
2. **No mock or hardcoded data — ever.** Do not port the prototype's `data.jsx` sample
   content. Do not introduce hardcoded gig/seller/category arrays. Every value on screen
   comes from the **real** data source already wired in (the `/api/*` routes, Supabase,
   props). If a surface has no real data, it shows a real empty state — not filler. See §6.

---

## §1 — The design system (reuse Brief 30's resolved tokens)

The prototype ships a live Tweaks panel; **do not port it, and do not build a theme
switcher.** The designer's final resolved look (from `caseworks-redesign.html`'s
`TWEAK_DEFAULTS`, resolved through `app.jsx`) is:

- **Accent:** navy `#2a4a8a`. Active/link ink: `hsl(220 53% 27%)`.
- **Fonts:** Source Serif 4 (display + body), Inter (UI), a mono face for tiny labels.
- **Paper:** warm sepia. **Light theme only.**

Define this token block, **scoped to the marketplace root** (the `MarketplaceShell`
container — e.g. a `.cw-market` class on its outermost element) so it does **not** leak
into the rest of the portal:

```css
.cw-market {
  --font-display: 'Source Serif 4', Georgia, serif;
  --font-body:    'Source Serif 4', Georgia, serif;
  --font-ui:      'Inter', system-ui, sans-serif;
  --font-mono:    ui-monospace, 'JetBrains Mono', monospace;

  --paper:      oklch(95% 0.014 75);
  --paper-dim:  oklch(96% 0.006 80);
  --paper-deep: oklch(93% 0.008 80);
  --ink:        oklch(20% 0.01  60);
  --ink-mid:    oklch(40% 0.008 60);
  --ink-soft:   oklch(58% 0.006 60);
  --rule:       oklch(88% 0.008 60);
  --rule-soft:  oklch(93% 0.006 60);
  --accent:     #2a4a8a;
  --accent-ink: hsl(220 53% 27%);
  --highlight:  oklch(92% 0.10 95);

  --max-width: 1240px;
  --ease: cubic-bezier(.22,.61,.36,1);
}
```

Provide sRGB hex fallbacks for the oklch tokens behind an `@supports (color: oklch(0 0 0))`
upgrade, exactly as Brief 30 does, so the marketplace renders correctly in any environment.

**Fonts:** load Source Serif 4 + Inter via `next/font/google` if the portal does not
already expose them; scope the font CSS variables to the marketplace. Do not add `<link>`
tags or new font packages if `next/font` is already the portal's mechanism.

Replace the marketplace's current ad-hoc inline-style colour values (`#F7F5F0`, the
fiverr-workbench palette, hardcoded greys, etc.) with these tokens. The marketplace
`layout.tsx` Suspense fallback's hardcoded `#F7F5F0` must become `var(--paper)` or an
equivalent token-driven value.

---

## §2 — Typography & primitives

From `caseworks-redesign.html`'s `<style>` block, applied within `.cw-market`:

- Body text in `--font-body`, `line-height: 1.65`, antialiased, `optimizeLegibility`,
  `font-feature-settings: "kern","liga","onum"`.
- Display headings (gig titles, section heads, seller names, page titles) in
  `--font-display`, weight 600, tight letter-spacing as the prototype's headline scale.
- UI text (buttons, meta, labels, filters, nav) in `--font-ui` (Inter).
- `::selection` uses `--highlight`.
- Recreate the prototype's line-art **Icon set** (`shared.jsx`) as one React icon
  component, 1.5px stroke, `currentColor`. If `lucide-react` is already used in the
  marketplace, you may keep lucide icons **where they are visually equivalent**; otherwise
  use the prototype's path data. Pick one icon source per surface — do not mix.

The prototype's card hover behaviour (headline shifts to `--accent-ink` on card hover),
its 1px `--rule` dividers, its pill buttons (ink fill, navy on hover), its rounded chips,
and its eyebrow labels (`11px`, uppercase, letter-spaced, `--accent-ink`) are the building
blocks — apply them consistently across every marketplace surface below.

---

## §3 — Marketplace nav (`components/marketplace/MarketplaceNavHeader.tsx`)

Restyle to the prototype's `Nav` (`shared.jsx`): sticky, 64px tall, translucent
`--paper` with `backdrop-filter: blur(14px) saturate(140%)`, 1px `--rule` bottom border,
`max-width: var(--max-width)`. Wordmark + framed-logo SVG on the left, a `--paper-deep`
search field in the centre, nav links + pill CTA + account avatar on the right.

**Wiring is sacred:** every nav link, the search field, the account menu, and the cart
control must keep pointing at the **real existing marketplace routes and handlers**
(`/marketplace/...`, the real search, the real cart). The prototype's `navigate()` pub-sub
router is a prototype device — do **not** port it. Keep Next.js routing. The marketplace is
a standalone site on `market.yousafeconsultancy.com` (Brief 32) — preserve every absolute
portal URL and every standalone-domain rule already in place. This is a re-skin of the
nav, not a re-route.

Restyle `MarketplaceShell`, the category/filter chrome, and any sticky sub-bar
(`FilterControls`, `MarketplaceCategoriesIndex` chip bar) the same way — underline-on-active
chips, horizontal scroll, token-driven colours.

---

## §4 — Footer

Restyle the marketplace footer to the prototype's `Footer` aesthetic (`--paper-dim`
background, 1px top rule, column grid, display-italic brand blurb, base row). Footer link
**labels and destinations stay whatever the marketplace ships today** — restyle the
container and typography, do not re-target real links to match the prototype's sample
labels.

---

## §5 — Remove every placeholder; show real media

This is the heart of the request. The marketplace currently renders **letter / initial
image placeholders** for missing gig images and seller avatars. Find and remove all of
them, including (non-exhaustive):

- `components/marketplace/GigDetailComponents.tsx` — `imgPlaceholder` (line ~402, used
  ~426 rendering `g.title.slice(0,2).toUpperCase()`).
- `components/marketplace/SellerProfileComponents.tsx` — `avatarPlaceholder` (~388),
  `gigImagePlaceholder` / `gigImagePlaceholderText` (~654/663, rendering
  `gig.title.charAt(0)`).
- `components/marketplace/SellerDirectoryPage.tsx` — `cardAvatarPlaceholder` (~391).
- Any equivalent in gig cards, the discovery grid, provider cards, review components.

**Replace them with real media:**

- **Gig images** — render the gig's **real uploaded image** (the `GigBuilderWizard`
  collects an image URL; sellers supply it). Use `next/image` where the marketplace
  already does, with correct `alt` text from the real gig title.
- **Seller avatars** — render the seller's **real avatar** from their profile record.

**For records that genuinely have no image yet** (a real, valid data state — not a mock):
do **not** fall back to a letter-block placeholder. Use a **deterministic branded panel**
derived from the real record — a flat fill in a token colour (e.g. `--paper-deep` or a
hue deterministically chosen from the gig category), with no text or with the category
label in `--font-ui`. This is a styled empty-image state computed from real data, not a
mock placeholder. Apply the **same** treatment everywhere a gig/seller image can be
absent, so it reads as an intentional design state.

Confirm the gig/seller data model already carries image and avatar fields (it does — the
gig builder collects them). You are surfacing real fields that exist, not inventing them.

---

## §6 — No mock data; real functionality stays wired

The marketplace is already API-backed (`/api/gigs`, `/api/marketplace/gigs`,
`/api/sellers`, `/api/gig-categories`, `/api/gig-reviews`, `/api/saved-gigs`, the cart
provider, the offers/messaging routes). Throughout this re-skin:

- **Never** introduce a hardcoded gig, seller, category, review, or price array.
- **Never** port `docs/seo-briefs/36-design-bundle/project/data.jsx` — it is prototype
  sample content. It exists only so you can see the *shape* the design expects; the real
  shape is the marketplace's real data.
- Every restyled component keeps reading from the **same real data source** it reads from
  today. If a component receives data as props, it still receives the same props. If it
  fetches, it fetches the same endpoint.
- **Empty states are real, not filler.** A gig grid with no results shows a genuine "no
  gigs found" state; a seller with no reviews shows a genuine "no reviews yet" state.
  Loading skeletons stay. None of these are "placeholders" to remove — they are real
  data-state UX. What you remove are the *mock-imagery* placeholders (§5) and any
  fabricated numbers.
- **Never fabricate numbers.** Ratings, review counts, order counts, response times,
  prices, delivery days — only render values that come from real records. If a real value
  is absent, omit that field; do not show a placeholder figure.

Restyle, the real data flows through unchanged.

---

## §7 — Marketplace surfaces to restyle

Apply the §1–§2 visual system to each of these. **Restyle only** — keep every component's
data, props, routes, and behaviour:

1. **Marketplace home / discovery** — `MarketplacePage.tsx`, `GigDiscoveryPage.tsx`,
   `MarketplaceHero.tsx`. Adopt the prototype's editorial home rhythm: a masthead-style
   hero, section heads (display serif + UI sub-label + ink rule), and a clean gig grid
   built from the prototype's card aesthetic (`ArticleCardLarge` / `Tile` / `Row` →
   reinterpreted as **gig cards**: gig image, eyebrow = category, display-serif gig title,
   seller byline with real avatar, meta row = rating · reviews · starting price). The
   prototype's right-rail pattern may be used for filters / trending categories.
2. **Gig detail** — `GigDetailComponents.tsx`, `GigDetailPage.tsx`,
   `app/marketplace/gigs/[slug]/page.tsx`. Restyle: gig title in display serif, gig
   gallery with **real images** (§5), seller byline block, pricing tiers, description,
   reviews — all real data. Keep the buy / checkout entry points and all three payment
   methods (Brief 35) exactly as wired.
3. **Seller profile & directory** — `SellerProfileComponents.tsx`, `SellerProfilePage.tsx`,
   `SellerDirectoryPage.tsx`, `MarketplaceProvidersIndex.tsx`,
   `app/marketplace/providers/...`. Restyle to the prototype's author-profile aesthetic
   (large avatar = **real** avatar, name in display serif, stats row, tabbed body, gig
   list). All real seller data.
4. **Categories** — `MarketplaceCategoriesIndex.tsx`,
   `app/marketplace/categories/...`. Restyle with the chip/eyebrow system.
5. **Cart & checkout** — `app/marketplace/cart/page.tsx`, `app/marketplace/order/...`.
   **Restyle the surface only.** Do **not** touch the NMI / Collect.js logic, the payment
   method picker, the saved-card dropdown, or the order API calls — Brief 35 just rebuilt
   that and it must remain byte-functional. Style the inputs, buttons, and layout with the
   token system; leave every `id`, every Collect.js selector, every handler intact.
6. **Reviews** — `ReviewComponents.tsx`, `ReviewForm.tsx`. Restyle; real review data.
7. **Filters** — `FilterSidebar.tsx`, `FilterControls.tsx`. Restyle; real filter logic.
8. **Chat / offers** — `ChatSidePane.tsx`, `MessageOfferCard.tsx`. Restyle to the new
   token system, but **do not regress Brief 34's WhatsApp `ChatScreen` layout** — if the
   chat already uses `ChatScreen`, only its colours/typography move to the new tokens.
9. **Gig builder** — `GigBuilderWizard*.tsx`. Restyle the wizard chrome; keep every field,
   validation rule, and submit handler.
10. **Buyer dashboard / saved gigs / escrow** — `BuyerDashboardWidgets.tsx`,
    `SaveGigButton.tsx`, `OrderEscrowPanel.tsx`. Restyle; real data and behaviour.

---

## §8 — Hard exclusion list (touch any of these = reject)

You may **not**:

- Change any **API route**, server handler, or `/api/*` file.
- Change the **payment logic**: NMI, Collect.js, the Customer Vault, the
  `/api/checkout/order` flow, the payment-method picker, saved-card handling — all of
  Brief 35 stays byte-functional. Style only.
- Change the **data model, Supabase queries, or `lib/` data logic** — except to *read*
  existing real data into restyled components.
- Change **routing, the standalone-domain rules (Brief 32), middleware, or absolute portal
  URLs**.
- Change the **WhatsApp `ChatScreen` layout / messaging primitives** (Brief 34) — colours
  and type may move to tokens; structure stays.
- Add **mock data, hardcoded arrays, fabricated numbers**, or port `data.jsx`.
- Add a **tweaks panel, theme switcher, or dark mode**.
- Add new **routes, pages, or npm dependencies** (Source Serif 4 / Inter via `next/font`
  is the only sanctioned addition, and only if not already present).
- Change **SEO metadata, canonicals, or JSON-LD** on any marketplace page.

If adopting the design *seems* to require any of the above, **stop and flag it** in
handoff. Scope is: tokens, CSS, and the visual structure of components.

---

## §9 — Idempotency (hard gate)

- Re-running `npm run build` twice yields byte-identical output for unchanged inputs.
- No timestamps, random IDs, or `Date.now()` baked into rendered output.
- The token block is defined **once**; component styles own their CSS once — no duplicated
  rule blocks.
- Removing the old fiverr-workbench inline styles means **deleting** them, not stacking new
  styles on top. Leave no dead placeholder-style objects (`imgPlaceholder`,
  `avatarPlaceholder`, `cardAvatarPlaceholder`, `gigImagePlaceholder`, …), no dead colour
  constants.
- Re-applying this brief over an already-migrated marketplace is a no-op.
- Verify with two clean builds; record both output hashes in handoff.

---

## §10 — Verification checklist (run before handoff)

1. `npm run build` succeeds — no new errors or warnings.
2. Build is idempotent — two clean builds, identical hash (§9).
3. **Zero placeholders:** grep the marketplace for `Placeholder`, `placeholder` style
   objects, `.slice(0, 2).toUpperCase()`, `.charAt(0)` letter-blocks — none remain as
   image/avatar stand-ins. (Input `placeholder=""` attributes are fine and stay.)
4. **Zero mock data:** no hardcoded gig/seller/category/review arrays anywhere;
   `data.jsx` is not imported by any production file.
5. Every marketplace surface renders **real** API/prop data; gig images and seller avatars
   are real uploads, with the §5 branded panel only where a real record genuinely has no
   image.
6. **Diff audit:** `git diff --stat` touches only marketplace component files, marketplace
   CSS, and `app/marketplace/*` view files. **Zero** changes under `app/api/`, payment
   files, `lib/` data logic, middleware, or `wrangler.toml`.
7. Payments still work end-to-end: gig checkout offers wallet + saved card + new card
   (Brief 35); cart checkout unchanged; Collect.js selectors intact.
8. Chat still uses the Brief 34 `ChatScreen` layout; offers flow intact.
9. Save-gig, filters, search, categories, reviews, gig builder, seller directory — all
   still function, now in the new skin.
10. The token block is scoped to `.cw-market` and does **not** affect the rest of the
    portal.
11. Responsive behaviour holds at the prototype's breakpoints (1080 / 880 / 720px).

---

## §11 — Reject criteria

- Any file in §8's exclusion list is modified.
- Any letter-block / initial / striped image placeholder survives anywhere.
- Any hardcoded mock data, fabricated number, or `data.jsx` import exists.
- Payment, checkout, or messaging behaviour regressed.
- The build is not idempotent.
- A tweaks panel / theme switcher / dark mode was shipped.
- The token block leaked outside the marketplace.
- A new route, page, or dependency was introduced.
- Dead placeholder-style objects or fiverr-workbench colour constants remain.

---

## §12 — Handoff (what to report back)

1. Exact file list changed, with `git diff --stat`.
2. The two build-output hashes proving idempotency.
3. Confirmation that §10's 11 checks all pass.
4. The full list of placeholder-style objects you removed and what real media replaced
   each.
5. Any surface where a real data field you expected (gig image, seller avatar, rating)
   does **not** exist in the real data model — so the supervisor can decide whether to
   commission the data work separately. Do not paper over a missing field with mock data.
6. Anything in the design you could not faithfully adapt to a commerce surface, and why.

Do not deploy. Hand back to the supervisor for gating and commit.
