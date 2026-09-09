import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('marketplace mobile category menu stability', () => {
  const bar = read('components/marketplace/CategoryBar.tsx')
  const menu = read('components/marketplace/CategoryMegaDropdown.tsx')

  test('the open trigger is inside the outside-press boundary', () => {
    expect(bar).toContain('anchorElement={buttonRefs.current[cat.id]}')
    expect(menu).toContain('anchorElement: HTMLElement | null')
    expect(menu).toContain("document.addEventListener('pointerdown', onDocPointerDown, true)")
    expect(menu).toContain('if (anchorElement?.contains(target)) return')
    expect(menu).not.toContain("document.addEventListener('mousedown', onDocClick)")
  })

  test('scrolling re-anchors an open menu instead of dismissing it', () => {
    expect(bar).toContain("window.addEventListener('scroll', syncAnchor, { passive: true })")
    expect(bar).toContain("strip?.addEventListener('scroll', syncAnchor, { passive: true })")
    expect(bar).toContain('setAnchorRect(btn.getBoundingClientRect())')
    expect(bar).not.toContain('const onStripScroll = () => closeDropdown()')
    expect(bar).not.toContain('const onScroll = () => closeDropdown()')
  })

  test('category triggers use direct mobile tap semantics and stable aria linkage', () => {
    expect(bar).toContain("touchAction: 'manipulation'")
    expect(bar).toContain("WebkitTapHighlightColor: 'transparent'")
    expect(bar).toContain('data-category-menu-trigger={cat.id}')
    expect(bar).toContain('aria-controls={`ys-category-menu-${cat.id}`}')
    expect(menu).toContain('id={`ys-category-menu-${category.id}`}')
  })
})
