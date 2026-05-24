# Claude Code — Supervisor Brief
**Project:** YouSafe Portal landing-page rebuild
**Repo:** `yousafe-portal` · Route `app/page.tsx` → `app/HomeClient.tsx`
**Implementor:** Kimi (sees the companion brief `kimi-brief.md`)
**Reference prototype:** `landing/index.html` in this archive — a vanilla React/Babel mock pinning every visual decision.

---

## Verbatim handoff message (copy-paste into your Claude Code session)

> Hey Claude — you are supervising Kimi on a landing-page rebuild for `yousafe-portal`. The route is `app/page.tsx` → `app/HomeClient.tsx`, replacing the body component `components/design/landing.jsx`. Keep `app/page.tsx`, `<SeoIntroBlock>`, `<EstateFooter>`, the metadata generation, and `app/layout.tsx` untouched.
>
> The full reference and acceptance criteria live in `landing/kimi-brief.md` (hand that to Kimi verbatim). Your responsibilities are summarised in `landing/claude-code-brief.md` (this file). The visual source of truth is `landing/index.html` — every layout, copy choice, animation, and component shape is pinned there.
>
> **Repos / hosts in play:**
> - `yousafe-portal` — the portal (Clerk-secured, members area). Lives at **`portal.yousafeconsultancy.com`**. This rebuild is here.
> - `yousafe-consultancy/landing-page` — the brand marketing site at **`yousafeconsultancy.com`**. The nav Home icon links here.
> - `yousafe-consultancy/usa`, `/uk`, `/ca` — country marketing sites at `usa./uk./ca.yousafeconsultancy.com`. Footer links here.
> - Marketplace subdomain at **`market.yousafeconsultancy.com`** (rewrite handled by `lib/marketplaceSeo.ts` — the `/marketplace` prefix is stripped). All public marketplace deep-links from the landing page MUST go to this host. The portal still hosts the same content at `/marketplace/*` for signed-in users, but the landing page never sends users there.
> - `support-saas` — the support team's stack at **`support.yousafeconsultancy.com`**. The Support role on the member-access strip points here. Do not modify this repo.
>
> **Three hard rules:**
> 1. **Browse marketplace and every category/provider/gig link points to `market.yousafeconsultancy.com`**, never `portal.*/marketplace`. Auth routes (`/sign-in/*`, `/sign-up/*`) stay on `portal.*`.
> 2. **No payment-partner brand names** (gateway, tokenisation vendor, processor) appear anywhere in the rendered DOM, alt-text, aria-labels, or hover tooltips. Use "payment partner" / "PCI-DSS Level 1 partners" everywhere user-visible. Code and env vars can still name them.
> 3. **Every list-of-things section is wired to live Supabase data, with the prototype placeholder as fallback**. As content populates, the page upgrades itself — no second PR. See `kimi-brief.md §7`.
>
> **Order of work:** drive Kimi through the 16-step plan in `kimi-brief.md §10`, one commit per step. After each commit, run the review checklist in this file's §3 and the Playwright link-audit test from `kimi-brief.md §15`. Reject PRs that bundle multiple steps or skip the audit.
>
> Anything you're unsure about — escalate to me before merging.

---

## 0 · Your role here

You are the **reviewer and orchestrator**, not the typist.

- Read both `kimi-brief.md` and the prototype source under `landing/` so you can answer Kimi's questions and catch drift early.
- Break Kimi's work into the **16 commits** outlined in `kimi-brief.md §10`. Reject PRs that bundle multiple steps.
- Run the **acceptance gate** (`kimi-brief.md §11`) before approving any merge.
- Own the items in **§5 (video quota), §3.12.2 (payment-method truth-in-advertising), and §3.8 (Support role)** — these are the three places where Kimi can ship a working PR that's still wrong, because the wrongness is contractual or financial rather than visual.

You should pull these three items up to the top of your review checklist every single time.

---

## 1 · Project context (short version)

The portal at `https://portal.yousafeconsultancy.com` is the signed-out landing page for **four audiences in one page**: students/clients, attorneys, consultants, and the support team. The page also doubles as the Clerk `afterSignOutUrl` so any signed-out portal user lands here.

This rebuild replaces the existing body component (`components/design/landing.jsx`) with a marketplace-flavoured editorial layout. Everything else stays the same:

- `app/page.tsx` (server component) — keep.
- `<SeoIntroBlock>` above the new body — keep.
- `<EstateFooter />` below the new body — keep, **rendered exactly once**.
- Metadata generation in `app/page.tsx` and JSON-LD — keep.
- `app/layout.tsx` (fonts, Clerk provider, language context) — keep.

If Kimi proposes touching any of the above, push back and ask why.

---

## 2 · Three things that matter most

### 2.1 Video quota (`kimi-brief.md §5`)

Source videos are **16 MB and 13 MB**. Both must be re-encoded BEFORE landing in the repo. Approve no commit that includes the raw MP4s in git or in `public/`. Verify:

- [ ] Both clips re-encoded per `§5.1` (1080p, 24fps, 10s, no audio, H.264 + HEVC, ~1–1.5 MB each).
- [ ] Posters are 70–110 KB JPEGs.
- [ ] Files live in R2 (or Cloudflare Stream) under `media.yousafeconsultancy.com`, with `Cache-Control: public, max-age=31536000, immutable` confirmed via `curl -I`.
- [ ] No raw MP4 anywhere in `public/` or git history (`git log -p --all -- '*.mp4'` returns nothing).
- [ ] Crossfade uses BOTH clips, opacity-toggled, with the 1.2s ease transition.
- [ ] Mobile (`≤720px`) shows poster only — no video fetch.
- [ ] `prefers-reduced-motion`, `saveData`, and slow-effective-type all skip the video.
- [ ] Hero poster is `<link rel="preload" as="image" fetchpriority="high">`-ed in `<head>`.

If any of those fail, kick the PR back — even if the rest is gorgeous.

### 2.2 Payment-method honesty (`kimi-brief.md §3.12.2`) + Partner-naming rule

This is the **biggest legal/UX risk** in the project.

The portal currently processes **cards only** through the existing payment partner. It does NOT yet support Apple Pay, Google Pay, Samsung Pay, or PayPal. The landing page now advertises all eight brands.

**No partner brand-names in the DOM.** The rendered page must NEVER name the gateway, tokenisation library, or processor by brand — say "our payment partner", "PCI-DSS Level 1 partners", "our tokenisation partner". You can talk about them freely in env vars, internal docs, code comments, and these briefs; just not in anything a user can see (HTML text nodes, `alt`, `aria-label`, `title`, hover tooltips).

**Your job:** before letting the PaymentMethods PR ship, confirm one of:

1. **All four wallets/PayPal are actually wired by the time the page goes live.** Verify by completing a sandbox payment with each method through `app/marketplace/cart/page.tsx`.
2. **OR** the unsupported chips are visibly greyed out (`<PaymentChip available={false}>`) with a "Coming soon" sub-label, AND the page-level copy doesn't promise what isn't there.

The middle path — shipping live-looking logos for methods that aren't wired — is not acceptable. It's a consumer-protection issue (FTC-style "deceptive omissions"), and for legal clients it's career-risk.

Tickets to track:

- [ ] Gateway Apple Pay merchant config enabled (dashboard → Apple Pay setup → cert)
- [ ] Gateway Google Pay merchant config enabled
- [ ] Samsung Pay verified to flow as a vault-able card on supported devices
- [ ] PayPal Smart Buttons SDK integrated at the checkout, escrow ledger reuses the same `payments` table
- [ ] **DOM-scan check:** `grep` the built HTML for the gateway brand name and the tokenisation library name. Both must return zero hits.

Until each is confirmed, the corresponding chip stays greyed.

### 2.3 Support role boundary (`kimi-brief.md §3.8`)

The Support role on the landing page links to **`https://support.yousafeconsultancy.com/`** — that's the **`support-saas`** stack (live chat / agent / admin), a separate repo.

Verify:

- [ ] The Support card's primary CTA opens in a **new tab** (`target="_blank" rel="noopener noreferrer"`).
- [ ] Arrow glyph is `↗` (external) not `→` (internal).
- [ ] There is **no `/sign-in/support`** route on this portal — don't create one by accident.
- [ ] `/sign-in/admin` still works (Clerk catch-all handles it); it's just **not surfaced** on the landing page anymore.
- [ ] The internal admin role is still reachable for staff who know the direct URL.
- [ ] No PR in this stream touches `support-saas` — that's a different repo and a different review pipeline.

### 2.4 Live-data wiring (`kimi-brief.md §7`)

**The page must self-upgrade as content populates.** Every list-of-things section (stats, category counts, featured services, featured providers, testimonials) is wired with a server-side query first, placeholder array as fallback. Switch-over happens automatically per the `live.length ≥ N → use live, else mix-and-fill` rule.

Verify on every wired-section PR:

- [ ] Section has a `data/{name}.ts` module exporting both a `FALLBACK_*` array and a `get*` function wrapped in `unstable_cache`.
- [ ] Function queries Supabase server-side and returns live rows when present.
- [ ] Fallback array is identical in shape to live rows (same keys, same types) so the same component renders both.
- [ ] **Mix-and-fill works:** if the table has 2 real testimonials and 3 placeholders, we render 2 live + 3 placeholder — NOT 5 placeholders.
- [ ] In dev builds only, placeholder cards show a small mono `placeholder` badge. Stripped in production.
- [ ] `app/page.tsx` (already async) is the call-site — no client-side fetching.

This matters because Yousaf will be filling the database over weeks. We want the landing page to *visibly improve* as he does, not to sit frozen until a second PR lands.

---

## 3 · Review checklist (run this on every PR in the stream)

```
☐ Step number matches kimi-brief.md §10 numbering
☐ ONE commit per step
☐ pnpm typecheck clean
☐ pnpm lint clean
☐ pnpm test (where touched)
☐ next build clean — no new warnings
☐ Lighthouse local: Performance ≥ 90, A11y ≥ 95, SEO ≥ 95
☐ Console clean on every viewport: 360 / 768 / 1024 / 1440
☐ Every link in kimi-brief.md §4 returns 200 in `next start`
☐ Word "lane" not in rendered DOM (grep the built HTML)
☐ Word "Admin" not in the member-access surface (still OK in /dashboard/admin)
☐ **No payment-partner brand names in the DOM, alt, aria-label, title** (grep the built HTML for the gateway name and tokenisation library name — both must be 0 hits)
☐ EstateFooter is rendered exactly once
☐ SeoIntroBlock + metadata unchanged
☐ Page weight ≤ 4 MB with both videos
☐ First-paint media ≤ 200 KB (poster only)
☐ Payment chips that aren't yet wired are greyed
☐ Nav Home icon links to https://yousafeconsultancy.com/
☐ Support role primary opens new tab to support.yousafeconsultancy.com/
☐ Wired sections have `data/{name}.ts` modules with FALLBACK_* + get*()
☐ Wired sections do mix-and-fill (live first, top up from placeholders)
☐ Dev-build `placeholder` badges render; prod builds strip them
☐ **Playwright link audit passes** (`tests/e2e/landing-links.spec.ts`, see kimi-brief.md §15) — every `<a href>` lands on the right host with a valid category/role/provider id, and the marketplace deep-link samples + portal auth routes both return HTTP < 400.
☐ **Browse marketplace and every category/provider/gig link goes to `market.yousafeconsultancy.com`**, never `portal.*/marketplace`. Auth links stay on `portal.*`.
```

If any box stays unchecked, request changes — do not approve.

---

## 4 · What "done" looks like for the whole stream

- [ ] `components/design/landing/` folder exists with the components from §10.
- [ ] Old `components/design/landing.jsx` is **deleted**, not just unused. (`git rm`).
- [ ] `app/HomeClient.tsx` is a slim composer that wires `onLogin`/`onSignup` into the new components.
- [ ] One Cloudflare Pages preview link with Lighthouse score ≥ 90 attached to the final PR.
- [ ] A short Loom or screen recording (60 sec) showing the crossfade actually crossfading on first scroll, on a desktop browser with a clean cache.
- [ ] A 10-line CHANGELOG.md entry explaining the rebuild for future archaeologists.
- [ ] Tickets filed in your tracker for each not-yet-wired payment method (Apple Pay, Google Pay, Samsung Pay, PayPal) with current status.

---

## 5 · When Kimi asks you a question, here's the answer policy

| Question shape | Your answer |
|---|---|
| "Can I use a different colour for X?" | No — palette is locked in `kimi-brief.md §1`. |
| "Can I add a new section?" | No — the section list in `§2` is exhaustive. Ask Yousaf first. |
| "Can I change the copy?" | Minor tightening yes, structural changes no. Headlines and CTAs in §3 are locked. |
| "Can I add a megamenu to Categories?" | Out of scope (`§12`). |
| "Can I make the videos auto-play with audio?" | No — they're decorative, `muted` is mandatory. |
| "Can I check the raw MP4s into git?" | No (see §2.1 above). |
| "Can I add a `/sign-in/support` route?" | No (see §2.3). |
| "Can I show all eight payment logos at full opacity even if wallets aren't wired?" | **No** (see §2.2). |
| "The CICC acronym should be ICCRC, right?" | **No.** It's been CICC since November 2021. |
| "Should Support open in-tab or new-tab?" | New tab. It's a different domain and a different stack. |
| "Can I delete the Admin sign-in route entirely?" | No — staff still use it. We just don't surface it on the landing page. |
| "Can I write 'NMI' or 'Collect.js' in the alt-text or aria-label?" | **No.** No vendor brand names in the DOM — "payment partner" only. |
| "Should we just hard-code the testimonials forever?" | No — wire to Supabase per §7. The hard-coded array stays as a fallback for when the table is empty. |
| "The placeholder data looks fine, do I really need the data fetch?" | Yes. The whole point is the page upgrades itself as Yousaf populates Supabase. Mix-and-fill or no PR. |

---

## 6 · One-line escalation guide

- **Visual / copy disagreement** → defer to the prototype (`landing/index.html`).
- **Routing / contract / repo-boundary question** → defer to `kimi-brief.md §4` (verified links) and this brief.
- **Payment wiring scope** → escalate to Yousaf. Do not let Kimi guess.
- **Anything touching `support-saas`** → not this PR, not this repo. Escalate.

---

## 7 · Files in this archive

```
landing/
├── index.html                  ← Open this. The reference prototype.
├── styles.css                  ← CSS for the prototype (Kimi can lift wholesale into the new component CSS or inline styles — Kimi's call).
├── tokens.js                   ← Design tokens — same numbers as portal-themes.css.
├── urls.js                     ← Canonical URL set — the source of truth for every link target. Mirror this into a `lib/landingUrls.ts` in production.
├── link-audit.js               ← Drop into DevTools console on the rendered page; logs a verdict + table of any non-canonical links. The Playwright variant lives in kimi-brief.md §15.
├── tweaks-panel.jsx            ← Prototype-only chrome. Do NOT ship to production.
├── app.jsx                     ← Composer — mirrors what `HomeClient.tsx` becomes.
├── assets/
│   ├── student-working.mp4     ← 16 MB raw — Kimi MUST re-encode per §5.1 before shipping.
│   └── students-walking.mp4    ← 13 MB raw — same.
├── components/
│   ├── icons.jsx               ← Stroke icon set. Port as `icons.tsx`.
│   ├── nav.jsx                 ← Nav + MemberSignInModal. Port as `Nav.tsx` + `MemberSignInModal.tsx`.
│   ├── hero.jsx                ← Hero with dual-video crossfade.
│   ├── marketplace.jsx         ← StatsBand, PopularCategories, FeaturedServices, TwoPractices.
│   ├── process.jsx             ← HowItWorks, MemberAccessBand, FeaturedProviders.
│   ├── social.jsx              ← Testimonials (drifting row), TrustStrip, FAQ (2-column), FinalCTA.
│   ├── payments.jsx            ← PaymentMethods (the 8-brand logo strip).
│   └── footer.jsx              ← Prototype-only — production uses <EstateFooter />.
├── kimi-brief.md               ← Hand to Kimi as-is.
└── claude-code-brief.md        ← This file.
```

The prototype is the **source of truth for visuals**.
`kimi-brief.md` is the source of truth for **routes, copy structure, file layout in the repo, and acceptance criteria**.
This file is the source of truth for **what you, the supervisor, must catch before merging**.

Good luck.
