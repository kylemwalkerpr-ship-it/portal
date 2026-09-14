# YouSafe Marketplace + Portal production hardening audit

Date: 2026-09-14
Scope: public `market.yousafeconsultancy.com` surfaces plus public/auth entry surfaces of `portal.yousafeconsultancy.com`. Authenticated dashboard pages are not treated as SEO landing pages.

Status key: **PASS** = implemented and appropriate for the scoped surface; **FIXED** = confirmed gap corrected in this hardening pass; **PARTIAL** = coverage exists but a universal claim would be inaccurate or undesirable.

| # | Requirement | Status | Evidence / decision |
|---|---|---|---|
| 1 | Custom 404 page | PASS | `app/not-found.tsx` is a custom noindex 404 with recovery CTA. |
| 2 | Meta title on every page | PASS (public SEO routes) | Root metadata provides a fallback and indexable Marketplace route families use route metadata/generateMetadata. Authenticated utility pages are intentionally not SEO landing pages. |
| 3 | Meta description on every page | PASS (public SEO routes) | Root fallback plus route-specific descriptions on public Marketplace route families. |
| 4 | CTA above the fold | PASS / route-dependent | Public landing and service discovery surfaces expose immediate browse/auth/action paths. A universal CTA is intentionally not injected into authenticated utility pages. |
| 5 | Favicon set | PASS | Root metadata declares SVG, 16x16, 32x32, Apple touch icon and manifest; `app/favicon.ico` also exists. |
| 6 | robots.txt | PASS | `app/robots.ts` is host-aware and advertises the Marketplace sitemap without exposing API endpoints. |
| 7 | sitemap.xml | PASS | `app/sitemap.ts` emits public hubs, products, supplied categories, active gigs and providers for the Marketplace host. |
| 8 | Open Graph image | PASS | Root metadata declares `/og-image.png` at 1200x630 plus Twitter large-image metadata; public dynamic routes can override metadata. |
| 9 | Alt text on every image | PARTIAL (semantically correct) | Public commercial images use descriptive alt text where meaningful. Some avatars/background/slideshow imagery intentionally uses `alt=""` because it is decorative. A blanket rule requiring non-empty alt on every image would reduce accessibility. |
| 10 | Mobile breakpoints | PASS | Dedicated mobile CSS and Marketplace breakpoints are present, with mobile public-surface E2E coverage. |
| 11 | Sticky mobile CTA | PARTIAL / intentional | Conversion/mobile hardening exists, but there is no universal sticky CTA. Sticky purchase/action UI should be route-specific so it does not cover chat, navigation or authenticated controls. |
| 12 | Loading states | PASS | Marketplace structural route skeletons plus loading states across dashboard, messaging and order surfaces. |
| 13 | Form error states | PARTIAL | Major interactive flows expose error state handling, but no repository-wide assertion proves every historical/admin form has an inline error state. This is a coverage-hardening opportunity, not evidence that forms currently fail silently. |
| 14 | Thank-you page | PASS (transactional) | Marketplace order completion has a dedicated success route. Generic lead/contact flows live on the wider YouSafe estate and should own their own confirmation pages. |
| 15 | Privacy policy page | PASS (estate-level canonical) | Marketplace footer links to the canonical YouSafe privacy policy rather than duplicating legal text into each subdomain. |
| 16 | Terms and conditions | PASS (estate-level canonical) | Marketplace footer links to the canonical YouSafe terms of service. |
| 17 | Cookie banner | FIXED | Added explicit analytics consent choices. Essential auth/security cookies remain available; GA4 stays unloaded until analytics consent is granted. |
| 18 | Analytics installed | PASS + hardened | GA4 is installed across the shared app and is now consent-gated instead of loading unconditionally. |
| 19 | Real contact address | FIXED | Marketplace footer now publishes the canonical YouSafe business address, contact email, and official contact-page link. |
| 20 | Compressed images | PARTIAL | Shared Marketplace discovery cards already use `responsiveImageProps`, responsive `srcSet`, lazy loading and Supabase WebP transforms. The repository still contains legacy/direct `<img>` paths, so claiming universal optimized delivery would be inaccurate. |

## Changes made in this pass

1. Added `CookieConsentBanner` with explicit **Accept analytics** and **Reject non-essential** actions and a direct privacy-policy link.
2. Changed `GoogleAnalytics` so Google scripts and page-view tracking do not initialize until the saved consent value is `granted`.
3. Published the canonical business identity in the public Marketplace footer: `906 Donne Court, Virginia Beach, VA 23462` and `admin@yousafeconsultancy.com`, plus the official contact page.
4. Added focused regression coverage for the new privacy/contact contracts and retained an assertion that responsive WebP delivery remains wired into shared Marketplace discovery cards.

## Follow-up work that should remain targeted

- Add a route-specific sticky mobile purchase CTA only if mobile conversion data or usability testing shows the existing gig purchase flow needs one; do not inject a global sticky banner.
- Continue migrating remaining legacy/direct remote image paths to the existing `responsiveImageProps` helper when those components are touched.
- Add form-level regression tests to high-value conversion flows first (checkout, inquiry, provider onboarding) rather than mechanically rewriting every historical/admin form.
- Keep SEO metadata coverage focused on indexable public pages. Do not optimize private dashboard URLs for search indexing.
