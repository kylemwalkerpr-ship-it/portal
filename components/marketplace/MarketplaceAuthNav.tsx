'use client'

import React from 'react'
import { useUser, useClerk } from '@clerk/nextjs'
import { F } from './tokens'
import styles from './MarketplaceAuthNav.module.css'

const PORTAL_URL = 'https://portal.yousafeconsultancy.com'

interface MarketplaceAuthNavProps {
  signUpHref: string
}

type AccountIconKind = 'dashboard' | 'shop' | 'orders' | 'messages' | 'profile' | 'signout'

function AccountIcon({ kind }: { kind: AccountIconKind }) {
  const paths: Record<AccountIconKind, React.ReactNode> = {
    dashboard: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
    shop: <><path d="M6 9V7a6 6 0 0 1 12 0v2" /><path d="M4.5 9.5h15l-1 11h-13z" /></>,
    orders: <><path d="m4 7 8-4 8 4-8 4z" /><path d="M4 7v10l8 4 8-4V7" /><path d="M12 11v10" /></>,
    messages: <><path d="M21 12a8.5 8.5 0 0 1-9 8.5 10 10 0 0 1-4.1-.9L3 21l1.4-4.4A8.3 8.3 0 0 1 3 12a8.5 8.5 0 0 1 9-8.5A8.5 8.5 0 0 1 21 12Z" /><path d="M8 12h.01M12 12h.01M16 12h.01" /></>,
    profile: <><circle cx="12" cy="8" r="4" /><path d="M4.5 21a7.5 7.5 0 0 1 15 0" /></>,
    signout: <><path d="M10 17l5-5-5-5" /><path d="M15 12H3" /><path d="M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5" /></>,
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[kind]}
    </svg>
  )
}

function Chevron() {
  return (
    <svg className={styles.chevron} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m7.5 4.5 5 5-5 5" />
    </svg>
  )
}

export default function MarketplaceAuthNav({ signUpHref }: MarketplaceAuthNavProps) {
  const { isSignedIn, user } = useUser()
  const clerk = useClerk()
  const [open, setOpen] = React.useState(false)
  const btnRef = React.useRef<HTMLButtonElement>(null)
  const menuRef = React.useRef<HTMLDivElement>(null)
  const menuId = React.useId()

  React.useEffect(() => {
    if (!open) return

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (!menuRef.current?.contains(target) && !btnRef.current?.contains(target)) {
        setOpen(false)
      }
    }
    const onFocusIn = (e: FocusEvent) => {
      const target = e.target as Node
      if (!menuRef.current?.contains(target) && !btnRef.current?.contains(target)) {
        setOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      window.requestAnimationFrame(() => btnRef.current?.focus())
    }

    // Pointer Events are reliable on touch Safari; relying only on mousedown
    // allowed the avatar popover to survive long enough to collide with the
    // mobile drawer during fast taps.
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  React.useEffect(() => {
    // MarketplaceShell owns the hamburger drawer state. Keep this account
    // component decoupled while making the two overlays mutually exclusive:
    // whenever the shell toggle enters aria-expanded=true, close this popover.
    const drawerToggle = document.querySelector<HTMLButtonElement>('.ys-shell-menu-toggle')
    if (!drawerToggle) return

    const syncWithDrawer = () => {
      if (drawerToggle.getAttribute('aria-expanded') === 'true') setOpen(false)
    }
    const observer = new MutationObserver(syncWithDrawer)
    observer.observe(drawerToggle, { attributes: true, attributeFilter: ['aria-expanded'] })
    syncWithDrawer()
    return () => observer.disconnect()
  }, [])

  // signUpHref is preserved for backward compat; modal flow uses Clerk methods directly.
  void signUpHref

  // SSR / signed-out fallback
  if (!isSignedIn) {
    return (
      <nav className="nav-links" style={{ display: 'flex', alignItems: 'center', gap: 8 }} suppressHydrationWarning>
        <button
          type="button"
          onClick={() => clerk.openSignIn({
            forceRedirectUrl: `${PORTAL_URL}/dashboard`,
            signUpUrl: `${PORTAL_URL}/sign-up/student`,
          })}
          style={{
            fontFamily: F.ui, fontSize: 13, fontWeight: 600,
            color: 'var(--ys-ink, #1C1410)', background: 'transparent',
            padding: '8px 14px', borderRadius: 999,
            border: '1px solid var(--ys-rule, rgba(247,237,224,0.16))', cursor: 'pointer',
            minHeight: 44,
          }}
        >Sign in</button>
        <button
          type="button"
          onClick={() => clerk.openSignUp({
            unsafeMetadata: { requestedRole: 'client', signupSource: 'marketplace_join' },
            forceRedirectUrl: `${PORTAL_URL}/dashboard`,
            fallbackRedirectUrl: `${PORTAL_URL}/dashboard`,
            signInUrl: `${PORTAL_URL}/sign-in/student`,
          })}
          style={{
            fontFamily: F.ui, fontSize: 13, fontWeight: 700,
            color: '#fff', background: 'var(--ys-ink, #1C1410)',
            padding: '9px 18px', borderRadius: 999,
            border: 'none', cursor: 'pointer',
            minHeight: 44,
          }}
        >Join</button>
      </nav>
    )
  }

  const initials = user?.firstName?.[0] || user?.lastName?.[0] || user?.emailAddresses?.[0]?.emailAddress?.[0]?.toUpperCase() || '?'
  const fullName = user?.fullName || user?.firstName || user?.emailAddresses?.[0]?.emailAddress || 'User'
  const email = user?.emailAddresses?.[0]?.emailAddress || ''
  const imageUrl = user?.imageUrl

  const closeMenu = () => setOpen(false)

  return (
    <div className={styles.root} suppressHydrationWarning>
      <button
        ref={btnRef}
        type="button"
        className={styles.trigger}
        onClick={() => setOpen(v => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label="Account menu"
      >
        {imageUrl ? (
          <img src={imageUrl} alt="" />
        ) : (
          <span className={styles.triggerInitials}>{initials}</span>
        )}
      </button>

      {open && (
        <div
          id={menuId}
          ref={menuRef}
          className={styles.menu}
          role="menu"
          aria-label="Account"
        >
          <div className={styles.accent} aria-hidden="true" />
          <div className={styles.profile}>
            <div className={styles.profileAvatar} aria-hidden="true">
              {imageUrl ? <img src={imageUrl} alt="" /> : <span>{initials}</span>}
            </div>
            <div className={styles.profileCopy}>
              <div className={styles.profileMeta}>
                <span className={styles.kicker}>Your account</span>
                <span className={styles.signedIn}><i aria-hidden="true" />Signed in</span>
              </div>
              <strong className={styles.name}>{fullName}</strong>
              {email && <span className={styles.email}>{email}</span>}
            </div>
          </div>

          <div className={styles.items}>
            <a role="menuitem" href={`${PORTAL_URL}/dashboard`} className={`${styles.item} ${styles.itemPrimary}`} onClick={closeMenu}>
              <span className={styles.itemIcon}><AccountIcon kind="dashboard" /></span>
              <span className={styles.itemLabel}>Dashboard</span>
              <Chevron />
            </a>
            <a role="menuitem" href="/shop" className={styles.item} onClick={closeMenu}>
              <span className={styles.itemIcon}><AccountIcon kind="shop" /></span>
              <span className={styles.itemLabel}>File shop</span>
              <Chevron />
            </a>
            <a role="menuitem" href="/marketplace?view=orders" className={styles.item} onClick={closeMenu}>
              <span className={styles.itemIcon}><AccountIcon kind="orders" /></span>
              <span className={styles.itemLabel}>My Orders</span>
              <Chevron />
            </a>
            <a role="menuitem" href={`${PORTAL_URL}/dashboard?page=messages`} className={styles.item} onClick={closeMenu}>
              <span className={styles.itemIcon}><AccountIcon kind="messages" /></span>
              <span className={styles.itemLabel}>Messages</span>
              <Chevron />
            </a>

            <div className={styles.divider} aria-hidden="true" />

            <a role="menuitem" href={`${PORTAL_URL}/dashboard?page=settings`} className={styles.item} onClick={closeMenu}>
              <span className={styles.itemIcon}><AccountIcon kind="profile" /></span>
              <span className={styles.itemLabel}>Profile settings</span>
              <Chevron />
            </a>
            <button
              type="button"
              role="menuitem"
              className={`${styles.item} ${styles.signout}`}
              onClick={() => {
                setOpen(false)
                // Let Clerk clear the session before redirecting. Navigating
                // first races middleware and can make logout appear broken.
                clerk.signOut({ redirectUrl: PORTAL_URL }).catch(() => {
                  window.location.replace(PORTAL_URL)
                })
              }}
            >
              <span className={styles.itemIcon}><AccountIcon kind="signout" /></span>
              <span className={styles.itemLabel}>Sign out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

