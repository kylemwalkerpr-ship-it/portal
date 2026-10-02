/**
 * The ONE YouSafe-branded Clerk appearance, shared by the Market modal, every
 * portal modal and the portal /sign-in + /sign-up fallback documents.
 *
 * Uses the current (@clerk/nextjs v7 / Core 3) appearance API:
 *   - `options` (formerly `layout`)
 *   - colorForeground / colorMutedForeground / colorInput / colorInputForeground
 *     (the deprecated colorText / colorTextSecondary / colorInputBackground /
 *     colorInputText are no longer read by v7, which is why the old portal
 *     theme silently fell back to Clerk defaults).
 *
 * Brand sources in this repo: navy #3C3B6E and red #B22234 (flag bar,
 * app/globals.css + components/auth-shell.tsx), ink #0F172A / paper #F7F8FA
 * (--ys-* tokens in app/globals.css), logo public/logo.png. Element classes
 * map onto the existing `.ys-clerk-*` rules in app/globals.css.
 */

export const YS_BRAND = {
  navy: '#3C3B6E',
  navyDark: '#2D2A5E',
  red: '#B22234',
  ink: '#0F172A',
  inkSoft: '#4A4F5B',
  paper: '#F7F8FA',
  cream: '#F7F3EA',
  rule: '#D8CDB6',
  white: '#FFFFFF',
  logoUrl: 'https://portal.yousafeconsultancy.com/logo.png',
} as const

const sharedElements = {
  headerTitle: 'ys-clerk-title',
  headerSubtitle: 'ys-clerk-subtitle',
  socialButtonsBlockButton: 'ys-clerk-social-button',
  formButtonPrimary: 'ys-clerk-primary-button',
  footerActionLink: 'ys-clerk-link',
  formFieldInput: 'ys-clerk-input',
  formFieldLabel: 'ys-clerk-label',
  dividerLine: 'ys-clerk-divider-line',
  dividerText: 'ys-clerk-divider-text',
  identityPreviewEditButton: 'ys-clerk-link',
}

/** Modal-safe appearance (no page-layout sizing classes). */
export const ysClerkAppearance = {
  variables: {
    colorPrimary: YS_BRAND.navy,
    colorPrimaryForeground: YS_BRAND.white,
    colorDanger: YS_BRAND.red,
    colorForeground: YS_BRAND.ink,
    colorMutedForeground: YS_BRAND.inkSoft,
    colorBackground: YS_BRAND.white,
    colorInput: YS_BRAND.cream,
    colorInputForeground: YS_BRAND.ink,
    colorBorder: YS_BRAND.rule,
    colorRing: YS_BRAND.navy,
    colorModalBackdrop: 'rgba(15, 23, 42, 0.55)',
    borderRadius: '10px',
    fontFamily: 'Inter, system-ui, sans-serif',
  },
  options: {
    logoImageUrl: YS_BRAND.logoUrl,
    logoLinkUrl: 'https://market.yousafeconsultancy.com/',
    logoPlacement: 'inside' as const,
    socialButtonsPlacement: 'bottom' as const,
    socialButtonsVariant: 'blockButton' as const,
  },
  elements: sharedElements,
}

/** Same theme plus the full-width card classes used inside AuthShell pages. */
export const ysClerkEmbeddedAppearance = {
  ...ysClerkAppearance,
  elements: {
    ...sharedElements,
    rootBox: 'ys-clerk-root',
    cardBox: 'ys-clerk-card-box',
    card: 'ys-clerk-card',
  },
}
