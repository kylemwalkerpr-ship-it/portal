/* eslint-disable */
// @ts-nocheck
/* ═════════════════════════════════════════════════════════════════════
   Canonical URLs for the landing page.

   Source of truth verified against:
     - GitHub/yousafe-portal/lib/marketplaceSeo.ts       (market subdomain)
     - GitHub/yousafe-portal/lib/categories.ts            (8 category IDs)
     - GitHub/yousafe-portal/app/sign-in/[[...rest]]      (Clerk catch-all)
     - GitHub/yousafe-portal/app/sign-up/[[...rest]]      (Clerk catch-all)
     - GitHub/yousafe-portal/components/estate-footer-config.ts
                                                          (footer link set)
     - GitHub/yousafe-consultancy/usa/app/*               (marketing routes)
     - GitHub/yousafe-consultancy/landing-page/app/blog/  (blog routes)

   Reading rules:
   - PORTAL hosts auth (Clerk) + member dashboards. Stay on portal.* for
     anything sign-in/sign-up/dashboard-related.
   - MARKET hosts the public marketplace discovery surface. Browse-marketplace
     CTAs and any category/provider/gig deep-link go to market.*. The /marketplace
     prefix is stripped on the market subdomain (see marketplaceSeo.ts).
   - SUPPORT hosts the support-saas stack (live chat / agent / admin tools).
     Support role on the member-access strip points there.
   - YOUSAFE root (.com) is the brand marketing site.
   - LEGAL (legal.*) hosts the legal article library + attorneys index.
   - Country subs (usa./uk./ca.) host country-specific marketing pages.
   ════════════════════════════════════════════════════════════════════ */

window.YS_URLS = {
  // ─── Hosts ──────────────────────────────────────────────────────────
  brand:    'https://yousafeconsultancy.com',
  portal:   'https://portal.yousafeconsultancy.com',
  market:   'https://market.yousafeconsultancy.com',
  legal:    'https://legal.yousafeconsultancy.com',
  support:  'https://support.yousafeconsultancy.com',
  usa:      'https://usa.yousafeconsultancy.com',
  uk:       'https://uk.yousafeconsultancy.com',
  ca:       'https://ca.yousafeconsultancy.com',

  // ─── Marketplace (always market.*) ──────────────────────────────────
  marketHome:        'https://market.yousafeconsultancy.com/',
  marketCategories:  'https://market.yousafeconsultancy.com/categories',
  marketProviders:   'https://market.yousafeconsultancy.com/providers',
  marketTemplates:   'https://market.yousafeconsultancy.com/templates',
  marketCategoryUrl: (id)   => `https://market.yousafeconsultancy.com/categories/${id}`,
  marketProviderUrl: (id)   => `https://market.yousafeconsultancy.com/providers/${id}`,
  marketGigUrl:      (slug) => `https://market.yousafeconsultancy.com/gigs/${slug}`,

  // ─── Portal sign-in / sign-up (always portal.*) ─────────────────────
  signInUrl: (role) => `https://portal.yousafeconsultancy.com/sign-in/${role}`,
  signUpUrl: (role) => `https://portal.yousafeconsultancy.com/sign-up/${role}`,
  signInDefault: 'https://portal.yousafeconsultancy.com/sign-in/student',
  signUpDefault: 'https://portal.yousafeconsultancy.com/sign-up/student',

  // ─── Support team (support-saas) ───────────────────────────────────
  supportSaas: 'https://support.yousafeconsultancy.com/',

  // ─── Brand / company / marketing ───────────────────────────────────
  brandHome:    'https://yousafeconsultancy.com/',
  contact:      'https://usa.yousafeconsultancy.com/contact/',
  faqs:         'https://usa.yousafeconsultancy.com/faqs/',
  terms:        'https://usa.yousafeconsultancy.com/terms-of-service/',
  privacy:      'https://usa.yousafeconsultancy.com/privacy-policy/',
  refundPolicy: 'https://usa.yousafeconsultancy.com/refund-policy/',
  disclaimer:   'https://legal.yousafeconsultancy.com/disclaimer/',
  countryGuides: 'https://usa.yousafeconsultancy.com/from/',
  universityGuides: 'https://usa.yousafeconsultancy.com/universities/',

  // ─── Legal article library ─────────────────────────────────────────
  legalArticles:    'https://legal.yousafeconsultancy.com/',
  legalUS:          'https://legal.yousafeconsultancy.com/us/',
  legalUK:          'https://legal.yousafeconsultancy.com/uk/',
  legalCA:          'https://legal.yousafeconsultancy.com/ca/',
  legalAttorneys:   'https://legal.yousafeconsultancy.com/attorneys/',

  // ─── Social ────────────────────────────────────────────────────────
  linkedin:  'https://linkedin.com/company/yousafe-consultancy',
  twitter:   'https://x.com/yousafeconsult',
  facebook:  'https://facebook.com/yousafeconsultancy',
  instagram: 'https://instagram.com/yousafeconsultancy',
};

// ─── Real category IDs from lib/categories.ts (TYPE-CHECKED LIST) ─────
window.YS_CATEGORY_IDS = [
  'immigration',
  'education',
  'legal',
  'settlement',
  'career',
  'business',
  'credentials',
  'mentorship',
];

// ─── Valid role IDs for Clerk catch-all auth routes ───────────────────
window.YS_ROLE_IDS = ['student', 'attorney', 'consultant', 'admin'];
