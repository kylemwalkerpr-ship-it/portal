import type { NextConfig } from 'next'

// Site-wide security headers. Applied to every response via Next's
// `headers()` config. Mirrors the policy emitted by the static-export
// apps' `public/_headers` files so the whole ecosystem stays consistent.
//
// HSTS: 1 year + includeSubDomains so every active subdomain (usa, ca, uk,
// au, legal, support, portal, market) inherits the upgrade. `preload` is on
// so we stay eligible for hstspreload.org submission; remove it if you ever
// need to allow http on this hostname.
//
// CSP: only `frame-ancestors 'self'` for now — strict enough to satisfy
// scanners + replace X-Frame-Options on modern browsers, loose enough
// not to break NMI/Clerk/Plausible. Tighten later with a full
// allow-list if needed.
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
}

export default nextConfig
