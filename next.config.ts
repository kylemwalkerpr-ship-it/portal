import type { NextConfig } from 'next'

// Site-wide security headers. Applied to every response via Next's
// `headers()` config. Mirrors the policy emitted by the static-export
// apps' `public/_headers` files so the whole ecosystem stays consistent.
//
// HSTS: 1 year + includeSubDomains so every subdomain (usa, ca, checkout,
// legal, support, portal) inherits the upgrade. `preload` is on so we
// stay eligible for hstspreload.org submission; remove it if you ever
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

const nextConfig: NextConfig = {
  output: 'standalone',
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
    ]
  },
}

export default nextConfig
