"use client"

import React from 'react'
import { createPortal } from 'react-dom'

type MobileNavItem = {
  label: string
  icon: string
  badge: string | null
  active: boolean
}

const PRIMARY: Array<{ source: string; label: string }> = [
  { source: 'Dashboard', label: 'Home' },
  { source: 'Marketplace', label: 'Marketplace' },
  { source: 'My Orders', label: 'Orders' },
  { source: 'Messages', label: 'Messages' },
]

const WORK = ['File shop', 'Services & Templates', 'Template Filler', 'Documents']
const CONNECT = ['Find Your Specialist', 'My Inquiries']
const ACCOUNT = ['Billing', 'Settings']

const PAGE_TITLES: Record<string, string> = {
  dashboard: 'Dashboard',
  orders: 'My Orders',
  services: 'Services & Templates',
  templates: 'Template Filler',
  documents: 'Documents',
  attorneys: 'Find Your Specialist',
  inquiries: 'My Inquiries',
  messages: 'Messages',
  billing: 'Billing',
  settings: 'Settings',
  'order-detail': 'Order Details',
}

function studentShell(): HTMLElement | null {
  const shell = document.querySelector<HTMLElement>('.yousafe-dashboard-shell')
  if (!shell) return null
  const footer = shell.querySelector<HTMLElement>('.yousafe-sidebar-user')
  if (!footer || footer.children.length < 2) return null
  return shell
}

function readItems(shell: HTMLElement): MobileNavItem[] {
  return Array.from(shell.querySelectorAll<HTMLButtonElement>('.yousafe-sidebar-nav .yousafe-nav-item'))
    .map(button => {
      const spans = Array.from(button.querySelectorAll<HTMLSpanElement>(':scope > span'))
      const label = spans[1]?.textContent?.trim() || ''
      const badge = spans.slice(2).map(span => span.textContent?.trim()).find(Boolean) || null
      return {
        label,
        icon: spans[0]?.textContent?.trim() || '•',
        badge,
        active: button.dataset.navActive === 'true',
      }
    })
    .filter(item => item.label)
}

function clickOriginal(label: string) {
  const shell = studentShell()
  if (!shell) return
  const button = Array.from(shell.querySelectorAll<HTMLButtonElement>('.yousafe-sidebar-nav .yousafe-nav-item'))
    .find(candidate => candidate.querySelector(':scope > span:nth-child(2)')?.textContent?.trim() === label)
  button?.click()
}

function sectionItems(items: MobileNavItem[], labels: string[]) {
  return labels.map(label => items.find(item => item.label === label)).filter(Boolean) as MobileNavItem[]
}

export default function StudentMobileNavigation() {
  const [mounted, setMounted] = React.useState(false)
  const [items, setItems] = React.useState<MobileNavItem[]>([])
  const [moreOpen, setMoreOpen] = React.useState(false)
  const [threadOpen, setThreadOpen] = React.useState(false)
  const [titleHost, setTitleHost] = React.useState<HTMLElement | null>(null)
  const [pageTitle, setPageTitle] = React.useState('Dashboard')

  React.useEffect(() => {
    if (typeof window === 'undefined') return

    let observer: MutationObserver | null = null
    let discoveryObserver: MutationObserver | null = null
    let frame = 0
    const mq = window.matchMedia('(max-width: 768px)')

    const refresh = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const shell = mq.matches ? studentShell() : null
        if (!shell) {
          setMounted(false)
          setItems([])
          setThreadOpen(false)
          setTitleHost(null)
          return
        }

        shell.dataset.studentMobileEnhanced = 'true'
        const nextItems = readItems(shell)
        const openThread = Boolean(shell.querySelector(".yousafe-messenger .ys-chatscreen[data-mobile-view='chat']"))
        const page = new URLSearchParams(window.location.search).get('page') || 'dashboard'
        const active = nextItems.find(item => item.active)
        const topbar = shell.querySelector<HTMLElement>('.yousafe-topbar')
        const originalTitle = topbar?.querySelector('h1')?.textContent?.trim() || ''
        const correctedTitle = originalTitle && (originalTitle !== 'Dashboard' || page === 'dashboard')
          ? originalTitle
          : PAGE_TITLES[page] || active?.label || 'Dashboard'

        setMounted(true)
        setItems(nextItems)
        setThreadOpen(openThread)
        setTitleHost(topbar)
        setPageTitle(correctedTitle)
        if (openThread) setMoreOpen(false)
      })
    }

    const attach = () => {
      observer?.disconnect()
      discoveryObserver?.disconnect()
      refresh()
      const shell = mq.matches ? studentShell() : null
      if (shell) {
        observer = new MutationObserver(refresh)
        observer.observe(shell, {
          subtree: true,
          childList: true,
          attributes: true,
          attributeFilter: ['data-nav-active', 'data-mobile-view'],
        })
      } else if (mq.matches && document.body) {
        // Dashboard role data can resolve after this global coordinator mounts.
        // Watch only until the real student shell appears, then narrow the
        // observer to that shell so public pages do not carry long-lived work.
        discoveryObserver = new MutationObserver(() => {
          if (studentShell()) attach()
        })
        discoveryObserver.observe(document.body, { childList: true, subtree: true })
      }
    }

    attach()
    mq.addEventListener?.('change', attach)
    window.addEventListener('popstate', refresh)
    window.addEventListener('resize', refresh)
    return () => {
      cancelAnimationFrame(frame)
      observer?.disconnect()
      discoveryObserver?.disconnect()
      mq.removeEventListener?.('change', attach)
      window.removeEventListener('popstate', refresh)
      window.removeEventListener('resize', refresh)
      const shell = studentShell()
      if (shell) delete shell.dataset.studentMobileEnhanced
    }
  }, [])

  React.useEffect(() => {
    if (!moreOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMoreOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [moreOpen])

  if (!mounted) return null

  const activeLabel = items.find(item => item.active)?.label || ''
  const primarySources = new Set(PRIMARY.map(item => item.source))
  const moreActive = Boolean(activeLabel && !primarySources.has(activeLabel))
  const workItems = sectionItems(items, WORK)
  const connectItems = sectionItems(items, CONNECT)
  const accountItems = sectionItems(items, ACCOUNT)

  const navigate = (label: string) => {
    setMoreOpen(false)
    clickOriginal(label)
  }

  const openSupport = () => {
    setMoreOpen(false)
    window.setTimeout(() => document.querySelector<HTMLButtonElement>('.ys-chat-launcher')?.click(), 0)
  }

  const openArticles = () => {
    setMoreOpen(false)
    window.setTimeout(() => document.querySelector<HTMLButtonElement>("button[aria-label='Open article feed']")?.click(), 0)
  }

  return (
    <>
      {titleHost && createPortal(
        <div className="ys-student-mobile-page-title" aria-live="polite">{pageTitle}</div>,
        titleHost,
      )}

      {!threadOpen && (
        <nav className="ys-student-mobile-dock" aria-label="Student dashboard navigation">
          {PRIMARY.map(primary => {
            const item = items.find(candidate => candidate.label === primary.source)
            if (!item) return null
            return (
              <button
                key={primary.source}
                type="button"
                className={item.active ? 'is-active' : undefined}
                aria-current={item.active ? 'page' : undefined}
                onClick={() => navigate(primary.source)}
              >
                <span className="ys-student-mobile-dock-icon" aria-hidden="true">{item.icon}</span>
                <span className="ys-student-mobile-dock-label">{primary.label}</span>
                {item.badge && <span className="ys-student-mobile-dock-badge">{item.badge}</span>}
              </button>
            )
          })}
          <button
            type="button"
            className={moreActive || moreOpen ? 'is-active' : undefined}
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen(value => !value)}
          >
            <span className="ys-student-mobile-dock-icon" aria-hidden="true">•••</span>
            <span className="ys-student-mobile-dock-label">More</span>
          </button>
        </nav>
      )}

      {moreOpen && (
        <div className="ys-student-mobile-more-layer">
          <button
            className="ys-student-mobile-more-backdrop"
            type="button"
            aria-label="Close more navigation"
            onClick={() => setMoreOpen(false)}
          />
          <section className="ys-student-mobile-more-sheet" role="dialog" aria-modal="true" aria-label="More dashboard destinations">
            <div className="ys-student-mobile-more-head">
              <div>
                <div className="ys-student-mobile-more-eyebrow">Student portal</div>
                <h2>More</h2>
              </div>
              <button type="button" className="ys-student-mobile-more-close" aria-label="Close" onClick={() => setMoreOpen(false)}>×</button>
            </div>

            <MobileSection title="Work" items={workItems} onNavigate={navigate} />
            <MobileSection title="Connect" items={connectItems} onNavigate={navigate} />
            <MobileSection title="Account" items={accountItems} onNavigate={navigate} />

            <div className="ys-student-mobile-more-section">
              <div className="ys-student-mobile-more-section-title">Help & resources</div>
              <div className="ys-student-mobile-more-grid">
                <button type="button" onClick={openSupport}>
                  <span aria-hidden="true">💬</span>
                  <strong>Yara support</strong>
                  <small>Ask for portal help</small>
                </button>
                <button type="button" onClick={openArticles}>
                  <span aria-hidden="true">📰</span>
                  <strong>Articles</strong>
                  <small>Guides & explainers</small>
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </>
  )
}

function MobileSection({
  title,
  items,
  onNavigate,
}: {
  title: string
  items: MobileNavItem[]
  onNavigate: (label: string) => void
}) {
  if (!items.length) return null
  return (
    <div className="ys-student-mobile-more-section">
      <div className="ys-student-mobile-more-section-title">{title}</div>
      <div className="ys-student-mobile-more-grid">
        {items.map(item => (
          <button
            key={item.label}
            type="button"
            className={item.active ? 'is-active' : undefined}
            aria-current={item.active ? 'page' : undefined}
            onClick={() => onNavigate(item.label)}
          >
            <span aria-hidden="true">{item.icon}</span>
            <strong>{item.label}</strong>
            {item.badge && <small>{item.badge}</small>}
          </button>
        ))}
      </div>
    </div>
  )
}
