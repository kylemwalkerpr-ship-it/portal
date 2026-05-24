# YouSafe Portal — Landing Page Brief
**For Kimi, supervised by Claude Code · Repo: `yousafe-portal` · Route: `app/page.tsx`**

> A working interactive reference lives at `landing/index.html` (vanilla React/Babel mock). All copy, palette, layout, ordering, and component shapes are pinned in that mock. **When in doubt, copy the mock.** This document explains *why* each piece is the way it is, where it goes in the production repo, and how to ship the background videos without burning quota.

> **Naming:** the four sign-in routes are referred to as **roles**, not "lanes". The modal that surfaces them is the **Member sign-in** modal. Internal component name `MemberSignInModal` is fine; user-facing text never says "lane".

> **Partner naming (HARD RULE):** **never name a payment processor, tokenisation vendor, or gateway brand in the rendered DOM.** Use "our payment partner", "PCI-DSS Level 1 partners", "our tokenisation partner", etc. This applies to the trust strip, the payments section, the FAQ, hover-text, alt-text, and aria-labels. The internal repo, the env vars, and the briefs can still name vendors — just nothing the user sees.

> **Data wiring policy (HARD RULE):** every section that currently renders placeholder content (stats, categories, gigs, providers, testimonials) MUST be implemented behind a data hook that **prefers live data and only falls back to the placeholder when the live source is empty**. As content populates in Supabase, the page upgrades itself — no second PR required. See §7 for the exact contract.

---

## 0 · Context

- **Domain:** `https://portal.yousafeconsultancy.com` — the members area for YouSafe Consultancy.
- **What this page is:** the public landing shown to **signed-out users** (Clerk `afterSignOutUrl` sends them here too). It must speak to **four audiences in one page**: prospective students/clients, attorneys looking to join the panel, consultants, and admins.
- **What it replaces:** the current `components/design/landing.jsx` rendered through `app/page.tsx` → `HomeClient.tsx`. The page wrapper (`app/page.tsx`), `SeoIntroBlock`, `EstateFooter`, and metadata generation **stay as-is**. We are replacing the body component only.
- **Design family it must match:**
  - Typography: `var(--font-cormorant)` headings, `var(--font-inter)` body, `var(--font-plex-mono)` eyebrows/labels — already wired in `app/layout.tsx`.
  - Palette: portal-themes default ("Mountain View"). `--portal-accent: #3C3B6E`. `#B22234` (US-flag brick) and `#C4A45A` (gold) are emphasis accents.
  - Card / Btn / Badge primitives live in `components/design/shared.jsx`. **Reuse**, don't rebuild.
  - Footer is `<EstateFooter />` already mounted by `app/page.tsx`. Do NOT nest a second footer — the prototype includes one only because it's a standalone HTML file.

---

## 1 · Visual Spec (locked)

### Tokens
| Token | Hex | Use |
|---|---|---|
| `paper` | `#FAFAF8` | Page background, footer |
| `bg` | `#F7F8FA` | Default portal background (already on body) |
| `surface` | `#FFFFFF` | Card backgrounds |
| `surface2` | `#F1EEE6` | Section bands (Practices, Member access, Testimonials) |
| `ink` | `#0F172A` | Primary text + primary button |
| `inkMid` | `#334155` | Body copy |
| `inkSoft` | `#64748B` | Meta, eyebrows |
| `inkDim` | `#94A3B8` | Disabled, dotted connectors |
| `rule` | `#E5E7EB` | Borders |
| `ruleSoft` | `#F1F1EC` | Inner dividers |
| `indigo` | `#3C3B6E` | Brand accent |
| `indigoDeep` | `#2A2A55` | Hover/pressed |
| `brick` | `#B22234` | US emphasis / attorney role / "trending" |
| `gold` | `#C4A45A` | Premium / ratings / "new" |
| `moss` | `#5F6B3A` | Success / Canada role |

### Type scale
- **H1 hero:** Cormorant Garamond 500, `clamp(48px, 6.4vw, 80px)`, `line-height: 1.02`, `letter-spacing: -0.018em`. Italic on the accent phrase, with a skewed gradient underline (`linear-gradient(90deg, gold, brick)` at 22% opacity).
- **H2 section title:** Cormorant 500, `clamp(32px, 3.6vw, 48px)`, `-0.014em`.
- **H3 card title:** Cormorant 500, 19–22px, `-0.005em`.
- **Eyebrow:** IBM Plex Mono 600, 11px, uppercase, `0.16em` tracking, `#64748B`.
- **Body:** Inter 400, 14–15px, `line-height: 1.6`.

### Buttons (from `components/design/shared.jsx` → `<Btn>`)
- **Primary:** ink background `#0F172A` — use the existing `variant="primary"`.
- **Indigo (CTA in nav + final CTA):** add `variant="brand"` to `shared.jsx` if missing. Indigo `#3C3B6E`, white text, `0 6px 18px rgba(60,59,110,0.30)` on hover.
- **Ghost:** transparent + 1px `rgba(0,0,0,0.15)` border.
- **All buttons:** `border-radius: 999px`, `transition: transform 140ms`, `translateY(-1px)` on hover.

### Spacing rhythm
- Section vertical padding: **88px top + bottom** (40px horizontal).
- Section header → content: **40px**.
- Card grid gap: **16–18px** for tile grids, **22–28px** for primary cards.
- Page max-width: **1240px** content, **880px** for narrow sections (FAQ).

---

## 2 · Page Architecture

```
<Page>                                            (app/page.tsx — unchanged)
├── <SeoIntroBlock> …                              (already there)
├── <HomeClient>                                   (rewritten — see below)
│    ├── <Nav>                  ← sticky, glass blur, Home icon (→ yousafeconsultancy.com), language pill
│    ├── <Hero>                 ← split: copy left, crossfading dual-video card right
│    ├── <StatsBand>            ← 4 numbers, white band
│    ├── <PopularCategories>    ← 8-tile grid (paper bg)
│    ├── <FeaturedServices>     ← 4 Fiverr-style gig cards
│    ├── <TwoPractices>         ← 2 large cards on putty bg
│    ├── <HowItWorks>           ← 4 numbered steps with dotted connectors
│    ├── <MemberAccessBand>     ← 4 role cards (Student / Attorney / Consultant / Support)
│    ├── <FeaturedProviders>    ← horizontal scroll strip
│    ├── <Testimonials>         ← 3 + 2 grid, serif italic quotes
│    ├── <TrustStrip>           ← infinite marquee
│    ├── <PaymentMethods>       ← brand-logo grid + escrow / SCA / region note
│    ├── <FAQ>                  ← 6 questions, accordion
│    ├── <FinalCTA>             ← dark indigo band, gold accents
│    └── <MemberSignInModal>    ← portal'd modal (sign-in router — Support is an external link)
└── <EstateFooter>                                 (already there)
```

`HomeClient.tsx` already receives `onLogin(role)` and `onSignup(role)` from `app/page.tsx` — keep that signature. Wire:
- Nav `Sign in` button → opens `<MemberSignInModal>`
- Inside the modal, each role's primary button → `onLogin(role.id)`; secondary → `onSignup(role.id)`.
- Hero `Start an inquiry` → `onSignup('student')`.
- Final CTA `Start an inquiry` → `onSignup('student')`.
- "Sign in to your account" button in `<MemberAccessBand>` → opens modal.

---

## 3 · Section-by-section spec

### 3.1 Nav (`<Nav>`)
- Sticky top, `position: sticky`, `z-index: 50`.
- Background: `rgba(250,250,248,0.55)` at rest → `rgba(250,250,248,0.88)` when `window.scrollY > 8`, with 1px bottom border that fades in.
- `backdrop-filter: saturate(180%) blur(14px)` — the glass feel.
- **Left:** logo mark (38×38 indigo rounded square with gold dot top-right) + "YouSafe" wordmark in Cormorant 22, with mono micro-line "The Portal" underneath. Brand block links to `https://yousafeconsultancy.com/`.
- **Center:** a **Home icon link** (`Icon.Home` + label "Home" + external-arrow glyph) that links to `https://yousafeconsultancy.com/`, followed by a thin 1px divider, followed by **4 anchor links** — Categories (`#categories`), Practices (`#practices`), How it works (`#how`), Trust & safety (`#trust`). Hide the whole row on `≤720px`.
- **Right:** language pill (in production drop in the real `<GlobalLanguageBar />` from `components/GlobalLanguageBar.tsx`), `Sign in` ghost button (opens modal), `Start an inquiry` indigo button.

> The Home icon is *not* duplicative of the brand logo — the brand block reads as the **portal identity**, and the explicit Home icon + label communicates "go back to the main marketing site" to first-time visitors who may not realise the wordmark is clickable.

### 3.2 Hero (`<Hero>`) — **uses BOTH videos**
- 2-column grid: copy `1.05fr` left, video card `0.95fr` right, gap 56px.
- **Copy column:**
  - Tag pill: "Now serving US · UK · Canada" with a pulsing moss dot.
  - H1: *"Your team for the [italic]moves that matter[/italic]."* with a gold→brick gradient underline on the italic phrase.
  - Sub: 19px ink-mid, max 560px.
  - CTAs: ink "Start an inquiry" + ghost "Browse marketplace".
  - Trust micro-row: Shield/Scale/Lock icons + "Funds in escrow", "ABA Rule 5.4 compliant", "Encrypted documents".
- **Video card column:** §5 below covers the bytes. Visually:
  - Rounded 22px, aspect `4/5`, min-height 520px.
  - Indigo gradient base (in case neither video loads).
  - **TWO videos stacked, opacity-crossfading**: layer A (`student-working`) and layer B (`students-walking`), both `position: absolute; inset: 0; object-fit: cover`. `opacity` toggles every ~9.5s with a `transition: opacity 1.2s ease` — the dissolve is the entire animation. **Both videos play continuously** so each fade reveals a moving clip, not a paused frame.
  - Layered overlays: dark gradient bottom for readability + radial gold glow top-right.
  - Top: US/UK/CA flag bar (4px, 33/33/33 split).
  - Top-left: chip "Active across US · UK · Canada" with a pulsing green dot.
  - Bottom: pull-quote *"The SOP review changed everything. Four rejections turned into three offers."* + Priya S. attribution (with India → Australia + "Education member") + VERIFIED mono tag.
  - Floating "$1,240.00 escrow released" card, slightly rotated, breaking out of the right edge (parent must not `overflow: hidden` past the card).
- **Mobile (≤720px):** stack to 1 col, video card height 320px, lift floating card back inside. **Videos skipped entirely on mobile** — see §5.4.

### 3.3 StatsBand
- 48px vertical padding, white background, 1px top & bottom rules.
- 4 stats in a row with a left tick-rule on each. Values in Cormorant 500, eyebrow underneath. Star icon next to the 4.93 rating.
- Values: **12,400+ inquiries delivered · 94% on-time delivery · 38 countries served · 4.93 avg rating**.
- **Production:** wire to real metrics where possible — see §7.

### 3.4 PopularCategories
- Background: paper (`#FAFAF8`). 8 tiles in `repeat(4, 1fr)`, gap 16px, min-height 168px each.
- Each tile: icon chip top-left, "POPULAR/TRENDING/NEW" tag top-right (only on 3 tiles), serif title, "{n} services" + arrow at bottom. Hover: lift 3px, indigo border, arrow slides right.
- **Each tile uses a REAL `lib/categories.ts` category ID** so the target route is `/marketplace/categories/{categoryId}` and `getCategoryById()` resolves it server-side:

| Tile order | `id` (from `lib/categories.ts`) | Display title | Icon | Tag |
|---|---|---|---|---|
| 1 | `immigration` | Immigration services | Globe | POPULAR |
| 2 | `education` | Education & admissions | Cap | TRENDING |
| 3 | `legal` | Legal services | Scale | — |
| 4 | `settlement` | Settlement & integration | House | — |
| 5 | `career` | Career development | Briefcase | — |
| 6 | `business` | Business services | Coin | — |
| 7 | `credentials` | Credentials & assessment | Doc | NEW |
| 8 | `mentorship` | Mentorship & coaching | Spark | — |

- Section "kicker" links to `/marketplace/categories` (the index page that exists at `app/marketplace/categories/page.tsx`).
- **Service counts** ("218 services" etc.) — placeholder until v1.1 ships the live counts from `gig_categories` API.

### 3.5 FeaturedServices
- 4 Fiverr-style gig cards in `repeat(4, 1fr)`, gap 18px, lift on hover.
- Each card is a full `<a href="/marketplace/gigs/{slug}">` so the whole tile is clickable.
- Cover: 16:11 aspect, currently a diagonal-striped gradient with the seller's accent. **Replace with `<img src={gig.coverUrl} loading="lazy" />`** wired to real seller gigs from `/api/marketplace/gigs`. Until real images exist, keep the striped gradient — it's intentional, not a bug.
- Top-left tag: "Top rated" / "Verified attorney" / "Rising talent" in white pill with seller-accent text.
- Top-right: category in mono uppercase.
- Body: avatar circle + seller name/role, 3-line clamped title, ★ rating + (review count) + delivery time, "From $XXX" footer separated by a top rule.
- Section "kicker" links to `/marketplace` (root discovery page).

**Sample gig slugs in the prototype** (replace with real DB-backed slugs):
- `uk-masters-application-shortlist-to-offer`
- `h1b-amendment-attorney-review`
- `canada-express-entry-crs-package`
- `personal-statement-top-30-us-programmes`

### 3.6 TwoPractices
- Background: putty (`#F1EEE6`). 2-column grid.
- Each card: 18px radius, white, 38px padding, accent-coloured 3px top-left bar (80px wide), icon chip, eyebrow, serif title, body, 3 checkmark bullets, accent-coloured "Browse … services →" link.
- **Card 1 (Study abroad)** → `/marketplace/categories/education`, accent indigo.
- **Card 2 (Legal)** → `/marketplace/categories/legal`, accent brick.

### 3.7 HowItWorks
- 4 numbered steps with dotted connector lines between (`repeating-linear-gradient` 6px dashes, only between items, not after step 4).
- Number badge: 44×44 ink rounded square, white serif number.
- Step name: icon (Doc/Spark/Coin/Check) in indigo + serif title.
- Body: 14px ink-mid, max-width 240px.

### 3.8 MemberAccessBand (formerly "Lane band")
- Paper bg. **Eyebrow "Member access". Title "Four roles. One secure portal."**
- 4 role cards in a row. Compact version of the modal.
- Each: icon chip top-left, arrow top-right, serif title, blurb, top-ruled footer with `Sign in →` (accent colour, links to `/sign-in/{role.id}`) and an `or [Create account]` link (links to `/sign-up/{role.id}`).
- **IMPORTANT — DOM nesting:** these cards must NOT be `<a>` elements because the footer contains nested `<a>`s. Render the card as `<div>` and put separate `<a>`s on the footer links.
- Below the grid: a centred **"Sign in to your account"** primary button (opens modal) + "Not a member yet? Create a free account →" helper that links to `/sign-up/student`.

The 4 roles:

| `id` | Label | Blurb | Primary | Primary target | Secondary | Accent |
|---|---|---|---|---|---|---|
| `student` | Student / Client | Place orders, talk to your consultant, manage documents and inquiries. | Sign in | `/sign-in/student` | Create account → `/sign-up/student` | indigo |
| `attorney` | Attorney | Review intake inquiries, message clients, send custom offers and manage payouts. | Sign in | `/sign-in/attorney` | Apply to join → `/sign-up/attorney` | brick |
| `consultant` | Consultant | Manage assigned students, deliverables, escrow releases and your profile. | Sign in | `/sign-in/consultant` | Apply as consultant → `/sign-up/consultant` | moss |
| `support` | Support team | Agent and admin tools for the YouSafe support desk — chats, tickets, escalations. | Sign in to support | **`https://support.yousafeconsultancy.com/`** (external, opens in new tab) | _(none)_ | ink |

> **Why Support replaces Admin here.** Portal admins still exist — they sign in via `/sign-in/admin` and land on `/dashboard/admin`. But the **member access** surface is a *public* sign-in router, and shipping an admin link there is poor security hygiene (it advertises the admin route). The support team, by contrast, lives in the separate **`support-saas`** stack (live chat / agent / admin tools at `support.yousafeconsultancy.com`) and a clear sign-in route to that subdomain is genuinely useful for staff arriving from the public marketing surfaces. **Do not delete `/sign-in/admin`** — just don't surface it on the landing page.

### 3.9 FeaturedProviders
- Horizontally scrollable strip (`overflow-x: auto`, snap, faded edges via `mask-image`).
- 6 provider cards, each 260px wide. Avatar circle with accent gradient + verified check badge bottom-right. Name + role. Two mono tag chips (badge + credential — e.g., "Bar verified", "AILA member", "CICC reg." — Canadian regulator is CICC, formerly ICCRC, since 2021). ★ rating + order count + country.
- "View profile" ghost button → `/marketplace/providers/{provider.id}`.
- Section kicker → `/marketplace/providers`.

### 3.10 Testimonials
- Putty bg. **Single row of cards that drift steadily left**, never a static grid.
- Each card: 380px wide, fixed; faint quote glyph top-right, 5 gold stars, italic serif quote (4-line clamp), top-ruled attribution row (avatar, name, country, role tag).
- The strip is masked at both edges with a `linear-gradient(90deg, transparent 0, #000 6%, #000 94%, transparent 100%)` so cards fade in and out at the edges. Loop is seamless — duplicate the array once and animate `translateX(0 → -50%)` on a `~90s linear infinite` keyframe.
- **Pause on hover** of the strip (`animation-play-state: paused`) so users can read a specific quote.
- **Respect `prefers-reduced-motion`** — strip becomes a non-animated horizontally-scrollable row.

### 3.11 TrustStrip
- White band between Testimonials and FAQ.
- Centred eyebrow "Trust & safety".
- 8 chips in an infinite horizontal marquee (42s loop), masked at both edges so chips fade in/out.
- Items: PCI-DSS Level 1 payments · Funds held in escrow · ABA Rule 5.4 compliant · Encrypted document storage · Clerk-secured sign-in · 3-D Secure 2 (SCA) ready · GDPR & DPA 2018 ready · TLS 1.3 across the board.
- Stops on `prefers-reduced-motion`.

### 3.12 PaymentMethods (NEW)
- White band between TrustStrip and FAQ, 72px vertical padding, 1px top + bottom rules.
- 2-column grid: copy left (`1fr`), logo grid right (`1.4fr`). Stack on mobile.
- **Left column:**
  - Eyebrow “Accepted payment methods”.
  - Serif H2: *“Pay the way you already pay everywhere else.”*
  - Body: “All major card networks, three mobile wallets, and PayPal — processed through our secure payment partners, with funds parked in escrow until you approve the work.”
  - Three trust bullets with stroke icons: PCI-DSS Level 1 tokenisation (lock, indigo) · 3-D Secure 2 SCA for UK & EU (shield, moss) · Wallets & PayPal availability varies by region (globe, brick).
- **Right column:** 4×2 grid of `<PaymentChip>` cards. Each chip is a white 80px-min-width pill with 1px rule, 10px radius, 52px tall, subtle shadow, holding a brand SVG centred. Hover lift -2px is optional.
- Logos (left to right, top to bottom): **Visa, Mastercard, American Express, Discover, Apple Pay, Google Pay, Samsung Pay, PayPal.**
- Bottom strip: mono caption row — “PCI-DSS Level 1 partners” / “USD · GBP · CAD” / “SCA-ready” separated by flex. **No partner brand names in the rendered DOM.**
- **Mobile:** logo grid collapses to 2 columns.

#### 3.12.1 Brand logos — production rules

The prototype draws each logo as **inline SVG** with hand-tuned text + simple shapes (Mastercard’s two-circle Venn, Discover’s orange dot, Amex’s blue square, etc.) so the demo has zero external image deps. **In production, swap to the official acceptance marks** from each network’s brand resource centre:

| Brand | Official asset source | Notes |
|---|---|---|
| Visa | <https://usa.visa.com/run-your-business/visa-merchant-acceptance.html> | Use the blue “Visa” brandmark on white, never recoloured. |
| Mastercard | <https://brand.mastercard.com/brandcenter/mastercard-brand-mark.html> | Use the symbol-only acceptance mark (two interlocking circles). |
| American Express | <https://merchant-channel.americanexpress.com/merchant/en_US/marketing-tools> | The square blue brand block. |
| Discover | <https://www.discovernetwork.com/business-resources/marketing-and-promotional-materials/> | The orange logotype. |
| Apple Pay | <https://developer.apple.com/apple-pay/marketing/> | **Apple is strict:** use the black “Apple Pay” mark exactly, never the standalone Apple logo. Required text height ratios apply. |
| Google Pay | <https://developers.google.com/pay/api/web/guides/brand-guidelines> | Use the multi-colour “G Pay” mark. |
| Samsung Pay | <https://www.samsung.com/us/samsung-pay/> brand guidelines | Use the Samsung-blue logotype. |
| PayPal | <https://www.paypal.com/us/webapps/mpp/logo-center> | The two-tone “PayPal” logotype. |

Store them as SVG files under `public/payment-logos/` and `<img>`-tag them with explicit `width`/`height` and `loading="lazy"`. Each is ~1–3 KB, total ~16 KB — cheap.

#### 3.12.2 Truth in advertising — IMPORTANT

Right now the portal only processes **cards** through the current payment partner (the gateway / tokenisation library is fully described in `lib/payments/providers/*` and the cart route — read those files for the real names; never put them in user-facing copy). **Apple Pay, Google Pay, Samsung Pay and PayPal are not yet wired.**

Before shipping the logos publicly, **at least one** of the following must be true — do **not** display logos for unsupported methods:

1. **Recommended path:** enable the existing gateway’s Apple Pay / Google Pay merchant configuration (the gateway supports both via its tokenisation library — add the `applePay` and `googlePay` request types to the init code in `student.jsx` / `cart/page.tsx` and configure the merchant account on the dashboard). Once enabled, the wallet sheet flows through the same vault-charge path. Samsung Pay tokenises as a regular card via the Samsung Wallet sheet on supported devices — nothing extra to wire.
2. **PayPal:** integrate the PayPal Smart Buttons SDK at the checkout (`app/marketplace/cart/page.tsx`). Treat as a third `payMethod` value alongside `wallet`, `saved_card`, `new_card`. Reuse the escrow ledger — PayPal capture lands in the same `payments` table.
3. **If a method is not yet supported when the page ships:** *grey out that chip* (the `<PaymentChip available={false}>` prop already drops opacity to 55%) and add a small “Coming soon” label. Better than promising what we can’t deliver.

Log a Linear/Jira ticket for whichever methods aren’t live on day 1.

### 3.13 FAQ
- **2-column layout.** Left rail (320px, sticky at `top: 96px` on desktop): eyebrow “Frequently asked”, serif H2 *“The questions we get every week.”*, supporting sentence, ghost “Talk to support →” button → `https://support.yousafeconsultancy.com/`. Right side (`minmax(0, 1fr)`): a 2-column grid of accordion items (`1fr 1fr`, gap `0 40px`).
- Items use the **compact variant** of the accordion: 14px vertical padding, 18px serif question, 14px body, plus-icon rotates to ×. **Only one open at a time across both columns.**
- The 6 FAQ items split as 3 + 3. Border-top rule between items inside each column.
- **Mobile (≤980px):** rail collapses on top (non-sticky), right side becomes a single column of 6 items.
- **6 questions** — exact copy in the prototype, do not rewrite without approval.

### 3.14 FinalCTA
- Full-bleed dark band: `radial-gradient(circle at 10% 0%, #3C3B6E 0%, #2A2A55 60%, #14133b 100%)` with gold + brick radial accents and a 4px flag bar at the very top.
- 2-column grid: large headline left, "The YouSafe promise" card right with 4 gold-check bullets.
- CTAs: white "Start an inquiry" (`/sign-up/student`) + outline-light "Browse the marketplace" (`/marketplace`).

### 3.15 MemberSignInModal
- Backdrop: `rgba(15,23,42,0.55)` + `blur(8px)`. Esc and click-outside close.
- Modal: 900px max, paper bg, 24px radius, US/UK/CA flag bar at top.
- Header: eyebrow **"Member access"**, serif H2 **"Sign in to the portal."**, subtitle, close X button.
- Body: 2×2 grid of role cards. Same 4 roles as the MemberAccessBand (Student / Attorney / Consultant / Support).
  - Student / Attorney / Consultant: primary → `/sign-in/{role}` (internal, regular `→` arrow), secondary → `/sign-up/{role}` (internal).
  - **Support**: primary → `https://support.yousafeconsultancy.com/` (external; opens in new tab; the arrow glyph is `↗` not `→`; no secondary CTA).
- Border tints to role accent on hover, lifts -2px.
- Footer strip: lock icon + "Clerk-secured sign-in · TLS & 2FA · noindex members area" on left, "Need help signing in?" → `https://support.yousafeconsultancy.com/`.

---

## 4 · Verified link table

Every clickable element on the page lands at one of these real paths. **All checked against the actual repo (`app/marketplace/*`, `app/sign-in/[[...rest]]`, `app/sellers/*`, `lib/marketplaceSeo.ts`, etc.).** Marketplace links live on the **`market.yousafeconsultancy.com`** subdomain — the `/marketplace` prefix is stripped on that host (see `lib/marketplaceSeo.ts`).

### Auth / portal (portal.yousafeconsultancy.com)
| Surface | Destination |
|---|---|
| Nav logo (left) | `https://yousafeconsultancy.com/` |
| Nav **Home icon link** | `https://yousafeconsultancy.com/` (same tab) |
| Nav center anchors | `#categories`, `#practices`, `#how`, `#trust` (in-page) |
| Nav `Sign in` | opens `<MemberSignInModal>` (no navigation) |
| Nav `Start an inquiry` | `https://portal.yousafeconsultancy.com/sign-up/student` |
| Hero `Start an inquiry` | `https://portal.yousafeconsultancy.com/sign-up/student` |
| Member access role card (Student/Attorney/Consultant) primary | `https://portal.yousafeconsultancy.com/sign-in/{role.id}` |
| Member access role card secondary | `https://portal.yousafeconsultancy.com/sign-up/{role.id}` |
| Member access role card (**Support**) primary | `https://support.yousafeconsultancy.com/` (external, `target=_blank`) |
| Member access band "Sign in to your account" | opens modal |
| Member access band "Create a free account →" | `https://portal.yousafeconsultancy.com/sign-up/student` |
| Final CTA "Start an inquiry" | `https://portal.yousafeconsultancy.com/sign-up/student` |
| Modal role card primary (Student/Attorney/Consultant) | `https://portal.yousafeconsultancy.com/sign-in/{role.id}` |
| Modal role card secondary | `https://portal.yousafeconsultancy.com/sign-up/{role.id}` |
| Modal "Need help signing in?" | `https://support.yousafeconsultancy.com/` |

### Marketplace (market.yousafeconsultancy.com)
| Surface | Destination |
|---|---|
| Hero `Browse marketplace` | `https://market.yousafeconsultancy.com/` |
| Category tile (×8) | `https://market.yousafeconsultancy.com/categories/{categoryId}` (real IDs in §3.4) |
| Categories kicker | `https://market.yousafeconsultancy.com/categories` |
| Featured gig card (×4) | `https://market.yousafeconsultancy.com/gigs/{slug}` |
| Featured services kicker | `https://market.yousafeconsultancy.com/` |
| Practice card "Browse education services →" | `https://market.yousafeconsultancy.com/categories/education` |
| Practice card "Browse legal services →" | `https://market.yousafeconsultancy.com/categories/legal` |
| Featured providers kicker | `https://market.yousafeconsultancy.com/providers` |
| Provider card "View profile" | `https://market.yousafeconsultancy.com/providers/{providerId}` |
| Final CTA "Browse the marketplace" | `https://market.yousafeconsultancy.com/` |
| Footer → Browse the marketplace | `https://market.yousafeconsultancy.com/` |
| Footer → Find a consultant | `https://market.yousafeconsultancy.com/providers` |
| Footer → Find an attorney | `https://market.yousafeconsultancy.com/categories/legal` |

### Decorative / static
| Surface | Destination |
|---|---|
| Payment method chip (×8) | Decorative — no `href`. Each chip carries `aria-label` only. |
| FAQ "Talk to support" | `https://support.yousafeconsultancy.com/` |
| FAQ "Talk to support" | `https://support.yousafeconsultancy.com/` |
| Final CTA "Start an inquiry" | `/sign-up/student` |
| Final CTA "Browse the marketplace" | `/marketplace` |
| Modal role card primary | `/sign-in/{role.id}` |
| Modal role card secondary | `/sign-up/{role.id}` |
| Modal "Need help signing in?" | `https://support.yousafeconsultancy.com/` |

### Footer (lifted verbatim from `components/estate-footer-config.ts`)
| Column | Label | Destination |
|---|---|---|
| Study & Migrate | USA — F-1 student visas | `https://usa.yousafeconsultancy.com/` |
| Study & Migrate | Canada — study permits | `https://ca.yousafeconsultancy.com/` |
| Study & Migrate | UK — Student Route | `https://uk.yousafeconsultancy.com/` |
| Study & Migrate | Country guides | `https://usa.yousafeconsultancy.com/from/` |
| Study & Migrate | University guides | `https://usa.yousafeconsultancy.com/universities/` |
| Legal & Tenancy | Legal article library | `https://legal.yousafeconsultancy.com/` |
| Legal & Tenancy | US immigration & status | `https://legal.yousafeconsultancy.com/us/` |
| Legal & Tenancy | UK immigration & tenancy | `https://legal.yousafeconsultancy.com/uk/` |
| Legal & Tenancy | Canada study & PR | `https://legal.yousafeconsultancy.com/ca/` |
| Marketplace | Browse the marketplace | `/marketplace` |
| Marketplace | Find a consultant | `/marketplace/providers` |
| Marketplace | Find an attorney | `/marketplace/categories/legal` |
| Marketplace | Open the portal | `/` |
| Marketplace | For attorneys & consultants | `https://legal.yousafeconsultancy.com/attorneys/` |
| Company | About YouSafe | `https://yousafeconsultancy.com/` |
| Company | Contact | `https://usa.yousafeconsultancy.com/contact/` |
| Company | Support centre | `https://support.yousafeconsultancy.com/` |
| Company | Help & FAQ | `https://usa.yousafeconsultancy.com/faqs/` |
| Legal strip | Privacy | `https://usa.yousafeconsultancy.com/privacy-policy/` |
| Legal strip | Terms | `https://usa.yousafeconsultancy.com/terms-of-service/` |
| Legal strip | Refund policy | `https://usa.yousafeconsultancy.com/refund-policy/` |
| Legal strip | Disclaimer | `https://legal.yousafeconsultancy.com/disclaimer/` |
| Social | LinkedIn | `https://linkedin.com/company/yousafe-consultancy` |
| Social | X / Twitter | `https://x.com/yousafeconsult` |
| Social | Facebook | `https://facebook.com/yousafeconsultancy` |
| Social | Instagram | `https://instagram.com/yousafeconsultancy` |

> **Action:** in production, do NOT inline the footer markup again. Import `<EstateFooter />` from `@/components/EstateFooter` so the columns stay in sync with the config file.

---

## 5 · Background video — quota strategy (CRITICAL)

The source clips are **16 MB** and **13 MB**. Shipping as-is would tank LCP and bandwidth quota. Strategy below ships ≤ ~2 MB per visitor in the worst case, ~80 KB in the best.

### 5.1 Encoding pass (do this BEFORE anything else)

Use `ffmpeg` locally. Produce **three artefacts per clip**:

```bash
# A) H.264/MP4 — broad compatibility
ffmpeg -i input.mp4 \
  -vf "scale=1080:-2,fps=24" \
  -c:v libx264 -preset slow -crf 28 \
  -profile:v main -level 4.0 \
  -movflags +faststart \
  -an \
  -t 10 \
  output-1080.h264.mp4

# B) H.265/HEVC — Safari/iOS preferred, ~30% smaller
ffmpeg -i input.mp4 \
  -vf "scale=1080:-2,fps=24" \
  -c:v libx265 -preset slow -crf 30 -tag:v hvc1 \
  -movflags +faststart \
  -an \
  -t 10 \
  output-1080.hevc.mp4

# C) Poster JPEG — extract frame at ~1s
ffmpeg -i input.mp4 -ss 1 -vframes 1 -q:v 4 -vf "scale=1080:-2" output.poster.jpg
```

Targets:
- **1080p H.264 @ 24fps, 10s loop, no audio:** ~1.2–1.8 MB.
- **1080p HEVC same:** ~0.8–1.2 MB.
- **Poster JPEG:** ~70–110 KB. **This is the LCP image.**

### 5.2 Hosting
**Preferred:** Cloudflare R2 + a custom subdomain (`media.yousafeconsultancy.com`) fronted by Cloudflare's CDN. R2→CDN egress is free; CDN cache means one fetch per edge, not per visitor. Set `Cache-Control: public, max-age=31536000, immutable` on the objects.

**Fallback:** Cloudflare Stream — only switch if R2+CDN measurements show worse economics.

**Don't:** put MP4s in `public/` or ship through OpenNext/Workers Sites. Worker request size + bandwidth costs bite hard.

### 5.3 Markup — both clips, crossfaded

```tsx
const A_POSTER = 'https://media.yousafeconsultancy.com/hero/student-working.poster.jpg'
const A_H264   = 'https://media.yousafeconsultancy.com/hero/student-working.h264.mp4'
const A_HEVC   = 'https://media.yousafeconsultancy.com/hero/student-working.hevc.mp4'
const B_POSTER = 'https://media.yousafeconsultancy.com/hero/students-walking.poster.jpg'
const B_H264   = 'https://media.yousafeconsultancy.com/hero/students-walking.h264.mp4'
const B_HEVC   = 'https://media.yousafeconsultancy.com/hero/students-walking.hevc.mp4'

const FADE_MS = 1200
const HOLD_MS = 9500     // each clip is on-screen ~9.5s before fade

<>
  <video ref={refA} poster={A_POSTER} muted loop playsInline preload="none" aria-hidden
    style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover',
             opacity: active === 0 ? 1 : 0, transition: `opacity ${FADE_MS}ms ease`, zIndex:1 }}>
    <source src={A_HEVC} type='video/mp4; codecs="hvc1"' />
    <source src={A_H264} type="video/mp4" />
  </video>
  <video ref={refB} poster={B_POSTER} muted loop playsInline preload="none" aria-hidden
    style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover',
             opacity: active === 1 ? 1 : 0, transition: `opacity ${FADE_MS}ms ease`, zIndex:1 }}>
    <source src={B_HEVC} type='video/mp4; codecs="hvc1"' />
    <source src={B_H264} type="video/mp4" />
  </video>
</>
```

The hero card also stamps **A's poster as a base layer** behind both videos via the existing radial gradient, so before any bytes load the viewer sees a coherent indigo card, not black.

### 5.4 Load gating & crossfade controller
Skip video entirely when any of:
- `prefers-reduced-motion: reduce`
- `navigator.connection?.saveData === true`
- `navigator.connection?.effectiveType` ∈ {`'slow-2g'`, `'2g'`, `'3g'`}
- viewport ≤ 720px (mobile uses the poster only)

```tsx
React.useEffect(() => {
  if (!enabled) return
  const skip =
    matchMedia('(prefers-reduced-motion: reduce)').matches ||
    (navigator as any).connection?.saveData ||
    ['slow-2g','2g','3g'].includes((navigator as any).connection?.effectiveType) ||
    matchMedia('(max-width: 720px)').matches
  if (skip) return

  const a = refA.current, b = refB.current
  const io = new IntersectionObserver(entries => {
    for (const e of entries) if (e.isIntersecting) {
      a!.preload = 'auto'; b!.preload = 'auto'
      a!.play?.().catch(() => {})
      b!.play?.().catch(() => {})
      io.disconnect()
    }
  })
  io.observe(a!)
  return () => io.disconnect()
}, [enabled])

// Crossfade only starts once BOTH layers have loadedData — otherwise the
// first fade would reveal a black layer. Track readiness on each <video>.
React.useEffect(() => {
  if (!bothReady) return
  const id = setInterval(() => setActive(p => p ^ 1), HOLD_MS)
  return () => clearInterval(id)
}, [bothReady])
```

### 5.5 Expected per-visit byte budgets

| Visitor profile | Bytes pulled |
|---|---|
| Mobile (any) | ~80 KB (poster A only) |
| Save-data / reduced motion / slow connection | ~80 KB (poster A only) |
| Desktop, Safari, full play | ~1.0 MB A.hevc + ~1.0 MB B.hevc = **~2.0 MB** |
| Desktop, Chrome, full play | ~1.5 MB A.h264 + ~1.5 MB B.h264 = **~3.0 MB** |

Cloudflare R2 free tier is 10 GB stored, 1M Class A ops / 10M Class B ops. The CDN cache absorbs almost all repeat traffic. At ~3 MB per cold-cache desktop visit, **100,000 unique desktop visitors with cold caches = ~300 GB egress per month**, which is well within Pages free bandwidth. No quota panic.

### 5.6 Do NOT check the raw MP4s into git
The 16/13 MB originals are kept locally / in R2 only. Add the encoded artefacts to a `media/` bucket. Reference via the custom subdomain.

---

## 6 · Routing & wiring (recap)

- `<Nav>` Sign in → opens `<MemberSignInModal>`, doesn't navigate.
- Modal Sign in → `router.push('/sign-in/{roleId}')` for student / attorney / consultant.
- Modal Sign in for `support` → `window.location.href = 'https://support.yousafeconsultancy.com/'` (or `<a target="_blank">`); **no internal route**.
- Modal secondary → `router.push('/sign-up/{roleId}')` (Support has no secondary).
- Hero Start an inquiry → `router.push('/sign-up/student')`.
- Hero Browse marketplace → `router.push('/marketplace')`.
- Category tile → `router.push('/marketplace/categories/{categoryId})`.
- Featured gig card → `router.push('/marketplace/gigs/{slug})`.
- Provider card → `router.push('/marketplace/providers/{providerId})`.
- "Apply to join" attorney → `router.push('/sign-up/attorney')` (the existing onboarding flow handles the attorney-apply form).
- "Apply as consultant" → `router.push('/sign-up/consultant')`.

`HomeClient.tsx` keeps its `onLogin` / `onSignup` prop shape so `app/page.tsx` doesn't change.

---

## 7 · Data (live-first, placeholder-fallback)

**Policy:** every section that renders a list of "things" MUST query the source of truth first and only fall back to a static placeholder when the query returns zero rows. As content populates in Supabase, the page upgrades itself — no follow-up PR required. The placeholder lives in the same module so a future contributor can delete it in one line once live data is consistently non-empty.

### 7.1 Contract

Each wired section follows the same shape:

```tsx
// components/design/landing/data/stats.ts
import { unstable_cache } from 'next/cache'
import { createSupabaseAdminClient } from '@/lib/supabase'

export const FALLBACK_STATS = [
  { value: '12,400+', label: 'Inquiries delivered' },
  { value: '94%',     label: 'On-time delivery' },
  { value: '38',      label: 'Countries served' },
  { value: '4.93',    label: 'Avg. order rating', star: true },
]

export const getLandingStats = unstable_cache(async () => {
  const db = createSupabaseAdminClient()
  // … queries that compute the four numbers
  const live = await computeStats(db)
  // Only swap to live when ALL four are real. Mixing one-real-three-placeholder reads as broken.
  return live && live.length === 4 ? live : FALLBACK_STATS
}, ['landing-stats'], { revalidate: 600 })
```

`app/page.tsx` (already async) calls each data fn server-side and threads the results into `HomeClient` as props. Don't fetch client-side — it kills LCP and crawler value.

### 7.2 Sections to wire (in this order)

| Section | Live source (when populated) | Placeholder kept in | Switch-over rule |
|---|---|---|---|
| StatsBand | `inquiries`, `orders`, `reviews` aggregates | `data/stats.ts` | 4 real values present → use live |
| PopularCategories — counts | `gigs` grouped by `category` where `status='active'` | static counts in `data/categories.ts` | live count > 0 → show live, else fall back |
| FeaturedServices | top 4 gigs by `rating * ln(reviews_count)` | 4 dummy gigs in `data/featured-services.ts` | live.length ≥ 4 → use live, else mix-and-fill (live first, fallback to top up to 4) |
| FeaturedProviders | top 6 sellers by `completed_orders_count` | 6 dummy providers in `data/featured-providers.ts` | live.length ≥ 6 → use live, else mix-and-fill |
| Testimonials | `reviews` table where `featured=true`, joined with profile name + country | 5 dummy testimonials in `data/testimonials.ts` | live.length ≥ 5 → use live, else mix-and-fill |

The “mix-and-fill” rule is important: ship one real gig and three placeholders rather than four placeholders. Real beats placeholder card-by-card, not strip-by-strip.

### 7.3 Indicators when placeholders are showing

In development only (`process.env.NODE_ENV !== 'production'`), render a small mono badge in the corner of each placeholder card reading `placeholder` so reviewers can see at a glance what’s live and what isn’t. Strip the badge in prod builds.

### 7.4 Sections that stay static (for now)

- Hero copy + CTAs
- Two practices (this is the brand pitch, not a feed)
- How it works (4 steps)
- Member access band
- Trust strip
- Payment methods
- FAQ
- Final CTA

These can stay hard-coded until the brand voice shifts.

---

## 8 · Accessibility

- All buttons have visible focus rings (`outline: 2px solid #3C3B6E`, `outline-offset: 2px` — already in `globals.css`).
- The Member sign-in modal traps focus, returns focus to the trigger on close, and is announced as `role="dialog" aria-modal="true" aria-label="Member sign-in"`.
- Decorative videos have `aria-hidden="true"`.
- FAQ items use proper `<button aria-expanded>`.
- Marquee respects `prefers-reduced-motion`.
- All icons are decorative (`aria-hidden`); meaning is carried by adjacent text.

---

## 9 · SEO

- `app/page.tsx` already emits translated metadata + WebSite/Organization JSON-LD. **Don't touch it.**
- `SeoIntroBlock` renders above `HomeClient` — that's the H1-equivalent SEO copy.
- Hero CTA links use real `href`s (not `onClick`-only) so crawlers find `/marketplace`, `/sign-in/*`, `/sign-up/*`.
- Add `<link rel="preload" as="image" href={A_POSTER} fetchpriority="high">` for the hero poster in `<head>`.

---

## 10 · Step-by-step build plan

Each numbered step = one commit. Run `pnpm typecheck` + `pnpm lint` after each.

1. **Scaffold the folder.** Create `components/design/landing/`. Add the icon set first (`icons.tsx`) — every other component depends on it.
2. **Atomic primitives.** Port any new `<Btn>` variants you need (e.g. `variant="brand"`) into `shared.jsx` so the rest of the portal benefits.
3. **Build `Nav.tsx`.** Wire the real `<GlobalLanguageBar />`. Hook `Sign in` to a callback prop `onOpenSignIn`.
4. **Build `MemberSignInModal.tsx`.** `createPortal(node, document.body)` to escape any z-index parent. Add focus trap.
5. **Build `Hero.tsx` with posters only — no `<video>` yet.** Verify LCP element is the poster + the floating "$1,240 escrow" card sits correctly across breakpoints.
6. **Encode + upload the videos** per §5.1 and §5.2. Spin up the R2 bucket, set the custom subdomain, confirm `Cache-Control` on a `curl -I`. **Don't proceed until URLs work.**
7. **Add the two `<video>` elements + IntersectionObserver gating + crossfade controller** per §5.3 and §5.4. Confirm with DevTools throttling: on Slow 3G, ~80 KB; on Fast 4G, both clips pulled once.
8. **Build `StatsBand`, `PopularCategories`, `FeaturedServices`** (one commit each).
9. **Build `TwoPractices`, `HowItWorks`, `MemberAccessBand`.**
10. **Build `FeaturedProviders`, `Testimonials`, `TrustStrip`.**
11. **Build `PaymentMethods`** — see §3.12. Drop in placeholder SVG logos for v1; swap to official assets per the brand-resource table once licensing is confirmed.
12. **Build `FAQ`, `FinalCTA`.**
13. **Rewrite `app/HomeClient.tsx`** to compose them. Keep the existing `onLogin`/`onSignup` prop signature.
14. **Delete `components/design/landing.jsx`** (old version). Confirm nothing else imports it (`grep -r "design/landing" .`).
15. **Run Lighthouse** on a Pages preview. Targets: LCP < 2.0s, CLS < 0.05, TBT < 200ms, Performance ≥ 90.
16. **Smoke-test every CTA** — every link in the §4 verified-link table.

---

## 11 · Acceptance criteria

A PR is mergeable when **all** of these hold:

- [ ] Lighthouse Performance ≥ 90, Accessibility ≥ 95, SEO ≥ 95 on a Pages preview build.
- [ ] **No more than 200 KB of media** loaded on first paint at desktop, no-cache. (Poster only — videos lazy.)
- [ ] **Total page weight ≤ 4 MB** including both fully-loaded videos.
- [ ] **0 console errors** in production build.
- [ ] **0 console warnings** for hydration / DOM nesting / key uniqueness in dev.
- [ ] `pnpm typecheck` and `pnpm lint` clean.
- [ ] **Every link in §4 returns 200 in `next start` and on Pages preview.** Use a small puppeteer / playwright script if needed to enumerate.
- [ ] All four role sign-in routes reachable from the modal. **Support opens in a new tab** to `support.yousafeconsultancy.com`.
- [ ] Modal closes on Esc, backdrop click, and X. Focus returns to the trigger.
- [ ] `prefers-reduced-motion: reduce` disables: hero videos, trust marquee, all transform-on-hover animations.
- [ ] Page renders cleanly at 360px, 768px, 1024px, 1440px.
- [ ] `<EstateFooter>` is rendered exactly once (by `app/page.tsx`, not by `HomeClient`).
- [ ] Existing `SeoIntroBlock` and metadata generation untouched.
- [ ] Tested in Safari (HEVC must play), Chrome, Firefox; iOS 16+; Android Chrome.
- [ ] **No user-facing text contains the word "lane".** It's "role" or "sign-in route".
- [ ] **No "Admin" role on the landing page.** `/sign-in/admin` still works internally; it just isn't surfaced here.
- [ ] **Payment-method logos** render correctly at 100% (chip sizes match across 8 brands) and on the 2-col mobile collapse.
- [ ] **Payment methods not yet wired through the gateway / PayPal are greyed out** (via `<PaymentChip available={false}>`) with a "Coming soon" label — do not advertise unsupported methods.
- [ ] **Nav Home icon** is present, links to `https://yousafeconsultancy.com/`, has `aria-label="YouSafe Consultancy home"`.
- [ ] **No payment-partner brand names** (gateway / tokenisation vendor / processor) appear in rendered HTML, alt-text, or aria-labels. Only "payment partner" / "PCI-DSS Level 1 partners" / generic language.
- [ ] **Every list-of-things section is wired to the live data source first**, with the placeholder array as fallback. Switch-over happens automatically per §7 — no second PR needed.

---

## 12 · Out of scope (don't add)

- The 1-question intake form on `Start an inquiry`. v1 just routes to `/sign-up/student`.
- A real search bar in the hero (user opted out).
- Live data wiring (see §7 — that's v1.1).
- A megamenu for "Categories" in the nav — it's just a section anchor for now.
- Multi-currency display in the gig cards. v1 is USD.

---

## 13 · References in this repo (use these — don't reinvent)

| Need | Use |
|---|---|
| Colour tokens | `app/portal-themes.css` `:root` block |
| Button / Badge / Card / Btn variants | `components/design/shared.jsx` |
| Footer | `components/EstateFooter.tsx` (mounted by `app/page.tsx`) |
| Footer config | `components/estate-footer-config.ts` — source of truth |
| Language selector | `components/GlobalLanguageBar.tsx` |
| Auth-page styling vocab | `app/globals.css` `.ys-auth-*` |
| Flag-bar gradient | `app/globals.css` `.ys-auth-flag-bar` — but use the **3-stripe US/UK/CA** version from the prototype (indigo / brick / gold), not the 2-stripe US version |
| Categories source of truth | `lib/categories.ts` — `CATEGORIES` array + `getCategoryById()` |
| Existing role definitions | `components/design/landing.jsx` `LANES` array — copy verbatim, lift into a new file |
| Skip link + focus styles | `app/globals.css` `.yousafe-skip-link` + `*:focus-visible` |

---

## 14 · Hand-off checklist for Claude Code (supervisor)

When Kimi's PR lands in review, Claude Code should verify:

1. [ ] Hero poster image is preloaded with `fetchpriority="high"`.
2. [ ] No raw MP4 files under `public/` or in git history.
3. [ ] R2 bucket + custom domain reachable; objects have correct `Cache-Control`.
4. [ ] Both videos crossfade on desktop; mobile shows poster only.
5. [ ] `<HomeClient>` receives `onLogin`/`onSignup` as props (matching `app/page.tsx`).
6. [ ] Sign-out from any portal page lands here cleanly (Clerk `afterSignOutUrl` already points at `/`).
7. [ ] The page carries `noindex` headers (members-area policy — already in `app/layout.tsx`).
8. [ ] Real provider photos & gig covers are queued behind a `TODO` for the v1.1 backfill, but placeholder gradients read as intentional, not unfinished.
9. [ ] Mobile tap targets ≥ 44px for nav, CTAs, and role cards.
10. [ ] **The text "lane" appears nowhere in the rendered DOM.**
11. [ ] Footer is imported from `@/components/EstateFooter`, not re-inlined.
12. [ ] Every link in §4 has been hit and returns 200.

That's the whole brief. Treat the prototype HTML as the source of truth for visuals; treat this document as the source of truth for the *why*, the *where it goes in the repo*, and the *verified links*.

---

## 15 · Link audit — automated test

Ship this as a Playwright test alongside the PR (`tests/e2e/landing-links.spec.ts`). It enumerates every `<a href>` on the rendered landing page and asserts each one matches the canonical contract. **It MUST pass before merge.**

```ts
// tests/e2e/landing-links.spec.ts
import { test, expect } from '@playwright/test'

const CATEGORY_IDS = [
  'immigration','education','legal','settlement',
  'career','business','credentials','mentorship',
]
const ROLE_IDS = ['student','attorney','consultant','admin']

const MARKET_HOST  = 'market.yousafeconsultancy.com'
const PORTAL_HOST  = 'portal.yousafeconsultancy.com'
const SUPPORT_HOST = 'support.yousafeconsultancy.com'
const BRAND_HOST   = 'yousafeconsultancy.com'
const LEGAL_HOST   = 'legal.yousafeconsultancy.com'
const COUNTRY_HOSTS = ['usa.yousafeconsultancy.com','uk.yousafeconsultancy.com','ca.yousafeconsultancy.com']
const SOCIAL_HOSTS  = ['linkedin.com','x.com','facebook.com','instagram.com']

test('landing page links — all canonical', async ({ page }) => {
  await page.goto('/')

  const links = await page.$$eval('a[href]', els => els.map(el => ({
    text: (el.textContent ?? '').trim().slice(0, 60),
    href: el.getAttribute('href') ?? '',
    target: (el as HTMLAnchorElement).target,
  })))

  const issues: { text: string; href: string; issue: string }[] = []

  for (const { text, href } of links) {
    if (href.startsWith('#')) continue                                  // anchor: ok
    if (!/^https?:\/\//.test(href)) {
      issues.push({ text, href, issue: 'relative href — must be absolute' })
      continue
    }
    const url = new URL(href)
    const h = url.host
    const p = url.pathname

    // No marketplace pages on the portal host.
    if (h === PORTAL_HOST && p.startsWith('/marketplace')) {
      issues.push({ text, href, issue: 'marketplace link on portal.* — should be market.*' })
      continue
    }
    // Auth routes are role-validated.
    if (h === PORTAL_HOST) {
      const si = p.match(/^\/sign-in\/([^/]+)\/?$/)
      const su = p.match(/^\/sign-up\/([^/]+)\/?$/)
      if (si && !ROLE_IDS.includes(si[1])) issues.push({ text, href, issue: `unknown role "${si[1]}"` })
      if (su && !ROLE_IDS.includes(su[1])) issues.push({ text, href, issue: `unknown role "${su[1]}"` })
      continue
    }
    // Market routes are category/provider/gig-validated.
    if (h === MARKET_HOST) {
      const cat = p.match(/^\/categories\/([^/]+)\/?$/)
      if (cat && !CATEGORY_IDS.includes(cat[1])) {
        issues.push({ text, href, issue: `unknown category id "${cat[1]}"` })
      }
      if (p !== '/' && !/^\/(categories|providers|gigs|templates)(\/.*)?$/.test(p)) {
        issues.push({ text, href, issue: `unexpected market path "${p}"` })
      }
      continue
    }
    // Approved hosts.
    if (h === SUPPORT_HOST || h === BRAND_HOST || h === LEGAL_HOST) continue
    if (COUNTRY_HOSTS.includes(h) || SOCIAL_HOSTS.includes(h))      continue

    issues.push({ text, href, issue: `unrecognised host "${h}"` })
  }

  expect(issues, JSON.stringify(issues, null, 2)).toEqual([])
})

test('marketplace deep-links return 200', async ({ request }) => {
  // Hit a representative sample of each marketplace pattern.
  const samples = [
    'https://market.yousafeconsultancy.com/',
    'https://market.yousafeconsultancy.com/categories',
    'https://market.yousafeconsultancy.com/categories/immigration',
    'https://market.yousafeconsultancy.com/categories/legal',
    'https://market.yousafeconsultancy.com/providers',
  ]
  for (const url of samples) {
    const res = await request.get(url)
    expect(res.status(), `${url} returned ${res.status()}`).toBeLessThan(400)
  }
})

test('portal auth routes return 200', async ({ request }) => {
  for (const role of ROLE_IDS) {
    for (const verb of ['sign-in', 'sign-up']) {
      const url = `https://portal.yousafeconsultancy.com/${verb}/${role}`
      const res = await request.get(url, { maxRedirects: 0 })
      // Clerk catch-all may redirect to a hosted UI — 2xx or 3xx both fine; 4xx fails.
      expect(res.status(), `${url} returned ${res.status()}`).toBeLessThan(400)
    }
  }
})
```

### Sandbox console version (for quick manual checks)

A standalone JS version of the audit lives in the prototype at `landing/link-audit.js`. Paste it into the DevTools console on the rendered page and it returns the same `{ ok, issueCount, issues, summary }` object — useful when you don't want to spin up the Playwright runner.
