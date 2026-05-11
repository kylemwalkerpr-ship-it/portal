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
    cardBox: 'shadow-none border border-[#d8cdb6] rounded-xl overflow-hidden',
    card: 'bg-white',
    headerTitle: 'font-serif text-[#1d2433]',
    headerSubtitle: 'text-[#4a4f5b]',
    socialButtonsBlockButton:
      'border-[#d8cdb6] bg-[#f7f3ea] text-[#1d2433] hover:bg-[#ece6d6]',
    formButtonPrimary:
      'bg-[#3C3B6E] hover:bg-[#2d2a5e] text-white rounded-md shadow-sm',
    footerActionLink: 'text-[#3C3B6E] hover:text-[#B22234]',
    formFieldInput:
      'bg-[#f7f3ea] border-[#d8cdb6] text-[#1d2433] focus:ring-[#3C3B6E]',
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
  return (
    <div className="min-h-screen bg-[#f3eee5] text-[#1d2433]">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 opacity-70"
        style={{
          background:
            'radial-gradient(circle at 0% 0%, rgba(178,34,52,.08) 0%, transparent 36%), radial-gradient(circle at 100% 0%, rgba(60,59,110,.10) 0%, transparent 40%), radial-gradient(circle at 50% 100%, rgba(135,168,106,.12) 0%, transparent 46%)',
        }}
      />
      <main className="relative mx-auto grid min-h-screen w-full max-w-6xl items-center gap-8 px-4 py-10 md:grid-cols-[minmax(0,0.95fr)_minmax(360px,440px)] md:px-8">
        <section className="max-w-2xl">
          <a
            href="https://yousafeconsultancy.com"
            className="inline-flex items-center gap-3 text-sm font-semibold text-[#1d2433] no-underline"
          >
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[#3C3B6E] font-serif text-lg text-white">
              Y
            </span>
            YouSafe Consultancy
          </a>
          <p className="mt-10 font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-[#4a4f5b]">
            {eyebrow}
          </p>
          <h1 className="mt-3 font-serif text-4xl font-medium leading-tight tracking-tight text-[#1d2433] sm:text-5xl">
            {title}
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-[#4a4f5b]">
            {body}
          </p>
          <div className="mt-7 flex flex-wrap gap-3 text-sm">
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

        <section className="w-full">
          <div className="mb-3 rounded-lg border border-[#d8cdb6] bg-white/80 px-4 py-3 text-sm text-[#4a4f5b] shadow-sm">
            You are entering as <strong className="text-[#1d2433]">{laneLabel}</strong>.
            Use the matching lane so your dashboard, files, and messages open correctly.
          </div>
          {children}
        </section>
      </main>
    </div>
  )
}
