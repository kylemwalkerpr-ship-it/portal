'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface SellerShellProps {
  title: string
  children: React.ReactNode
}

// Core seller center pages — messages/earnings/promotions live in the
// main role dashboard (attorney.jsx / consultant.jsx) until dedicated
// seller-center routes are built for those sections.
const NAV_LINKS = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Gigs', href: '/dashboard/gigs' },
  { label: 'Orders', href: '/dashboard/orders' },
]

// Features not yet wired to dedicated routes — still accessible via main dashboard
const COMING_LINKS = [
  { label: 'Messages & Earnings', note: 'available in Dashboard' },
  { label: 'Promotions', note: 'coming soon' },
]

export default function SellerShell({ title, children }: SellerShellProps) {
  const pathname = usePathname()

  return (
    <div className="min-h-screen bg-[#FBFAF7] text-[#1F2937]" style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif" }}>
      <div className="w-full border-b border-black/[0.08] bg-white">
        <div className="mx-auto px-4" style={{ maxWidth: '1180px' }}>
          <nav className="flex items-center gap-1 overflow-x-auto py-0">
            {NAV_LINKS.map((link) => {
              const isActive =
                link.href === '/dashboard'
                  ? pathname === '/dashboard'
                  : pathname.startsWith(link.href)
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={[
                    'whitespace-nowrap px-4 py-3 text-sm font-semibold border-b-2 transition-colors',
                    isActive
                      ? 'border-[#3C3B6E] text-[#3C3B6E]'
                      : 'border-transparent text-[#6B7280] hover:text-[#1F2937]',
                  ].join(' ')}
                >
                  {link.label}
                </Link>
              )
            })}
            <div className="ml-auto flex items-center gap-3 py-3 pl-4 border-l border-black/[0.06]">
              {COMING_LINKS.map((item) => (
                <span
                  key={item.label}
                  title={item.note}
                  className="whitespace-nowrap text-xs text-[#9CA3AF] cursor-default select-none"
                >
                  {item.label} ↗
                </span>
              ))}
            </div>
          </nav>
        </div>
      </div>

      <main className="mx-auto px-4 py-7" style={{ maxWidth: '1180px' }}>
        <h1
          className="mb-6 text-3xl font-medium tracking-tight"
          style={{ fontFamily: "'Cormorant Garamond', 'Garamond', Georgia, 'Times New Roman', serif" }}
        >
          {title}
        </h1>
        {children}
      </main>
    </div>
  )
}
