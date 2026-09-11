import type { NextConfig } from 'next'

// Site-wide security headers. Applied to every response via Next's
// `headers()` config. Mirrors the policy emitted by the static-export
// apps' `public/_headers` files so the whole ecosystem stays consistent.
const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options',    value: 'nosniff' },
  { key: 'X-Frame-Options',           value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy',           value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy',        value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
  { key: 'Content-Security-Policy',   value: "frame-ancestors 'self'" },
]

const legacyMarketplaceRedirects = ['market.yousafeconsultancy.com', 'portal.yousafeconsultancy.com'].map((host) => ({
  source: '/marketplace/:path*',
  has: [{ type: 'host' as const, value: host }],
  destination: 'https://market.yousafeconsultancy.com/:path*',
  permanent: true,
}))

// Phase-A-cleared Payhip products 10-36. Rewriting only these exact public
// shop URLs leaves the already-shipped Batch-1 immigration pages untouched.
const auditedPayhipShopSlugs = [
  'us-i134-financial-support-companion-pack',
  'us-stem-opt-i765-i983-companion-pack',
  'us-opt-i765-application-prep-pack',
  'us-b1b2-visitor-visa-ds160-invitation-pack',
  'us-f1-interview-home-ties-pack',
  'us-f1-student-visa-ds160-i20-pack',
  'canada-study-permit-complete-pack',
  'weekly-meal-planner-grocery-list',
  '90-day-guided-self-reflection-journal',
  'svg-cut-file-bundle-8-designs',
  'minimalist-wall-art-bundle-6-prints',
  'undated-hyperlinked-digital-planner',
  'social-media-post-template-pack-8-editable-posts',
  'business-plan-investor-pitch-deck-template',
  'client-welcome-packet-template',
  'wedding-invitation-suite-editable-word',
  'ats-resume-matching-cover-letter-templates',
  'small-business-startup-checklist-90-day-plan',
  '30-day-habit-wellness-tracker',
  '50-ai-prompts-content-creators-marketers',
  'rental-property-income-expense-tracker',
  'content-calendar-social-media-planner',
  'wedding-budget-vendor-tracker',
  'household-budget-debt-payoff-tracker',
  'freelance-rate-project-profitability-calculator',
  'solo-consultant-business-toolkit',
  '50-ai-prompts-small-business-owners',
] as const

const nextConfig: NextConfig = {
  output: 'standalone',
  experimental: {
    webpackMemoryOptimizations: true,
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
    ]
  },
  async redirects() {
    // Preserve authority from the retired public `/marketplace` namespace.
    // Next applies these before Proxy/middleware and carries query parameters
    // through to the clean standalone Marketplace URL.
    return legacyMarketplaceRedirects
  },
  async rewrites() {
    return {
      beforeFiles: auditedPayhipShopSlugs.map((slug) => ({
        source: `/shop/${slug}`,
        destination: `/payhip-product/${slug}`,
      })),
      afterFiles: [],
      fallback: [],
    }
  },
}

export default nextConfig
