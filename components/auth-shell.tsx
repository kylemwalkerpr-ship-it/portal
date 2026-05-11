'use client'

import type { ReactNode } from 'react'

const FAMILY_ORIGINS = new Set([
  'https://yousafeconsultancy.com',
  'https://www.yousafeconsultancy.com',
  'https://usa.yousafeconsultancy.com',
  'https://ca.yousafeconsultancy.com',
  'https://checkout.yousafeconsultancy.com',
  'https://legal.yousafeconsultancy.com',
  'https://portal.yousafeconsultancy.com',
  'https://support.yousafeconsultancy.com',
])

export const clerkAppearance = {
  variables: {
    colorPrimary: '#3C3B6E',
    colorText: '#1d2433',
    colorTextSecondary: '#4a4f5b',
    colorBackground: '#ffffff',
    colorInputBackground: '#f7f3ea',
    colorInputText: '#1d2433',
    borderRadius: '0.5rem',
    fontFamily: 'Inter, system-ui, sans-serif',
  },
  elements: {
    rootBox: 'w-full',
    cardBox:
      'w-full overflow-hidden rounded-xl border border-[#d8cdb6] shadow-[0_24px_70px_rgba(29,36,51,0.14)]',
    card: 'bg-white px-6 py-7 sm:px-8',
    headerTitle: 'font-serif text-[#1d2433]',
    headerSubtitle: 'text-[#4a4f5b]',
    socialButtonsBlockButton:
      'border-[#d8cdb6] bg-[#f7f3ea] text-[#1d2433] hover:bg-[#ece6d6]',
    formButtonPrimary:
      'bg-[#3C3B6E] hover:bg-[#2d2a5e] text-white rounded-md shadow-sm',
    footerActionLink: 'text-[#3C3B6E] hover:text-[#B22234]',
    formFieldInput:
      'bg-[#f7f3ea] border-[#d8cdb6] text-[#1d2433] focus:ring-[#3C3B6E]',
    formFieldLabel: 'text-[#1d2433]',
    dividerLine: 'bg-[#d8cdb6]',
    dividerText: 'text-[#4a4f5b]',
    identityPreviewEditButton: 'text-[#3C3B6E]',
  },
}

export function safeReturnTo(value: string | null): string | null {
  if (!value) return null
  try {
    if (value.startsWith('/')) {
      if (value.startsWith('//')) return null
      if (value.startsWith('/sign-in') || value.startsWith('/sign-up')) return null
      return value
    }
    const url = new URL(value)
    if (!FAMILY_ORIGINS.has(url.origin)) return null
    if (url.pathname.startsWith('/sign-in') || url.pathname.startsWith('/sign-up')) return null
    return url.toString()
  } catch {
    return null
  }
}

export function AuthShell({
  title,
  eyebrow,
  body,
  laneLabel,
  previousUrl,
  children,
}: {
  title: string
  eyebrow: string
  body: string
  laneLabel: string
  previousUrl: string | null
  children: ReactNode
}) {
  const detailItems = [
    'Role-based dashboards for students, consultants, attorneys, and support',
    'Escrow-protected orders, private files, and message threads in one place',
    'Secure Clerk sign-in with Stripe-powered payments and payouts',
  ]

  return (
    <div className="min-h-screen overflow-hidden bg-[#f3eee5] text-[#1d2433]">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 opacity-80"
        style={{
          background:
            'radial-gradient(circle at 0% 0%, rgba(178,34,52,.10) 0%, transparent 34%), radial-gradient(circle at 100% 0%, rgba(60,59,110,.12) 0%, transparent 40%), radial-gradient(circle at 50% 100%, rgba(135,168,106,.14) 0%, transparent 48%)',
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 opacity-[0.22]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.12 0 0 0 0 0.14 0 0 0 0 0.20 0 0 0 0.16 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
        }}
      />

      <main className="relative mx-auto grid min-h-screen w-full max-w-7xl items-center gap-8 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(380px,460px)] lg:px-10">
        <section className="relative overflow-hidden rounded-xl border border-[#d8cdb6] bg-white/55 p-6 shadow-[0_24px_80px_rgba(29,36,51,0.10)] backdrop-blur sm:p-8 lg:min-h-[720px] lg:p-10">
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-1"
            style={{
              background: 'linear-gradient(90deg, #3C3B6E 0%, #3C3B6E 42%, #ffffff 42%, #ffffff 58%, #B22234 58%, #B22234 100%)',
            }}
          />

          <div className="relative flex min-h-full flex-col">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <a
                href="https://yousafeconsultancy.com"
                className="inline-flex items-center gap-3 text-sm font-semibold text-[#1d2433] no-underline"
              >
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-[#3C3B6E] font-serif text-xl text-white shadow-sm">
                  Y
                </span>
                <span>
                  <span className="block font-serif text-lg font-medium leading-tight">YouSafe</span>
                  <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-[#4a4f5b]">Consultancy</span>
                </span>
              </a>
              <span className="rounded-full border border-[#d8cdb6] bg-[#f7f3ea] px-3 py-1 text-xs font-semibold text-[#4a4f5b]">
                Secure portal
              </span>
            </div>

            <div className="my-auto py-10 lg:py-16">
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-[#4a4f5b]">
                {eyebrow}
              </p>
              <h1 className="mt-4 max-w-3xl font-serif text-[2.65rem] font-medium leading-[1.02] tracking-tight text-[#1d2433] sm:text-5xl lg:text-6xl">
                {title}
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-7 text-[#4a4f5b] sm:text-lg">
                {body}
              </p>

              <div className="mt-8 grid gap-3">
                {detailItems.map((item) => (
                  <div key={item} className="flex gap-3 rounded-lg border border-[#d8cdb6] bg-white/70 p-3 text-sm text-[#1d2433]">
                    <span className="mt-0.5 inline-flex h-5 w-5 flex-none items-center justify-center rounded-full bg-[#3C3B6E]/10 text-xs font-bold text-[#3C3B6E]">
                      ✓
                    </span>
                    <span className="leading-6">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-3 border-t border-[#d8cdb6] pt-5 text-sm sm:grid-cols-3">
              <div>
                <div className="font-serif text-2xl font-medium text-[#3C3B6E]">500+</div>
                <div className="mt-1 text-xs font-medium text-[#4a4f5b]">clients supported</div>
              </div>
              <div>
                <div className="font-serif text-2xl font-medium text-[#B22234]">30+</div>
                <div className="mt-1 text-xs font-medium text-[#4a4f5b]">countries served</div>
              </div>
              <div>
                <div className="font-serif text-2xl font-medium text-[#1d2433]">24/7</div>
                <div className="mt-1 text-xs font-medium text-[#4a4f5b]">secure access</div>
              </div>
            </div>
          </div>
        </section>

        <section className="w-full">
          <div className="mb-4 rounded-xl border border-[#d8cdb6] bg-white/80 p-4 shadow-sm backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[#4a4f5b]">
                  Account lane
                </div>
                <div className="mt-1 text-sm text-[#4a4f5b]">
                  Entering as <strong className="text-[#1d2433]">{laneLabel}</strong>
                </div>
              </div>
              <span className="rounded-full bg-[#3C3B6E]/10 px-3 py-1 text-xs font-bold text-[#3C3B6E]">
                Role matched
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-white/60 bg-white/40 p-2 shadow-[0_28px_90px_rgba(29,36,51,0.16)] backdrop-blur">
            {children}
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm">
            {previousUrl ? (
              <a
                href={previousUrl}
                className="inline-flex items-center justify-center rounded-md border border-[#d8cdb6] bg-white px-4 py-2 font-semibold text-[#1d2433] shadow-sm no-underline transition-colors hover:border-[#3C3B6E]/40 hover:text-[#3C3B6E]"
              >
                Back to previous page
              </a>
            ) : (
              <a
                href="https://yousafeconsultancy.com"
                className="inline-flex items-center justify-center rounded-md border border-[#d8cdb6] bg-white px-4 py-2 font-semibold text-[#1d2433] shadow-sm no-underline transition-colors hover:border-[#3C3B6E]/40 hover:text-[#3C3B6E]"
              >
                Back to main site
              </a>
            )}
            <a
              href="mailto:support@yousafeconsultancy.com"
              className="inline-flex items-center justify-center rounded-md px-4 py-2 font-semibold text-[#3C3B6E] no-underline hover:text-[#B22234]"
            >
              Need help?
            </a>
          </div>
        </section>
      </main>
    </div>
  )
}
