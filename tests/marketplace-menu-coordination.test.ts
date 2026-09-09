import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('marketplace account menu quality and overlay coordination', () => {
  const auth = read('components/marketplace/MarketplaceAuthNav.tsx')
  const shell = read('components/marketplace/MarketplaceShell.tsx')
  const css = read('components/marketplace/MarketplaceAuthNav.module.css')

  test('uses touch-safe outside dismissal instead of mousedown-only behavior', () => {
    expect(auth).toContain("document.addEventListener('pointerdown', onPointerDown, true)")
    expect(auth).toContain("document.addEventListener('focusin', onFocusIn)")
    expect(auth).not.toContain("document.addEventListener('mousedown', onDoc)")
  })

  test('closes the avatar popover whenever the hamburger drawer opens', () => {
    expect(shell).toContain('className="ys-shell-menu-toggle"')
    expect(shell).toContain('aria-expanded={menuOpen}')
    expect(auth).toContain("document.querySelector<HTMLButtonElement>('.ys-shell-menu-toggle')")
    expect(auth).toContain("drawerToggle.getAttribute('aria-expanded') === 'true'")
    expect(auth).toContain("attributeFilter: ['aria-expanded']")
    expect(css).toContain('body:has(#ys-market-mobile-menu) :global(.cw-market) .menu')
    expect(css).toContain('display: none !important;')
  })

  test('renders a deliberate account card instead of a flat generic link list', () => {
    expect(auth).toContain('className={styles.profile}')
    expect(auth).toContain('className={styles.signedIn}')
    expect(auth).toContain('className={styles.itemIcon}')
    expect(auth).toContain('styles.itemPrimary')
    expect(css).toContain('border-radius: 20px;')
    expect(css).toContain('0 28px 70px -18px rgba(15, 23, 42, 0.42)')
    expect(css).toContain('linear-gradient(90deg, var(--ys-indigo, #0B786C), var(--ys-gold, #DFAB40))')
  })

  test('keeps the mobile account menu roomy but clearly smaller than a full sheet', () => {
    expect(css).toContain('width: min(304px, calc(100vw - 24px)) !important;')
    expect(css).toContain('max-width: calc(100vw - 24px) !important;')
    expect(css).toContain('min-height: 46px;')
    expect(css).not.toContain('width: 100vw')
  })

  test('preserves keyboard focus and reduced-motion affordances', () => {
    expect(auth).toContain("if (e.key !== 'Escape') return")
    expect(auth).toContain('btnRef.current?.focus()')
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
    expect(css).toContain(':global(.cw-market) .item:focus-visible')
  })
})
