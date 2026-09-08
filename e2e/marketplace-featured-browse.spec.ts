import { test, expect } from '@playwright/test'

/**
 * Browser smoke — Featured briefs grid (Load-more + pager), run against the
 * LIVE marketplace via PLAYWRIGHT_BASE_URL:
 *
 *   PLAYWRIGHT_BASE_URL=https://market.yousafeconsultancy.com \
 *     npx playwright test e2e/marketplace-featured-browse.spec.ts
 *
 * Skipped when PLAYWRIGHT_BASE_URL is unset (i.e. CI's local-server run) so
 * assertions tied to live inventory numbers never gate unrelated PRs.
 *
 * What it locks in a real browser:
 *  1. Load-more appends the next page of cards in place — no navigation.
 *  2. Pager chips jump to the page window in place — no navigation, and
 *     aria-current + range line follow.
 *  3. A deep-linked ?page=2 SSRs cumulatively (96 cards) and auto-scrolls
 *     to the featured grid on first paint.
 *
 * The no-reload assertions use a window marker: a full reload would wipe
 * `window.__smokeMarker`, so it surviving the click proves the SPA path ran.
 */

const PAGE_SIZE = 48

// Drive the real system Chrome (matches the smoke-check intent and avoids
// the bundled-Chromium version cache dance entirely). Must be top-level:
// Playwright forbids channel overrides inside describe groups.
test.use({ channel: 'chrome' })

/**
 * Wait until React has hydrated the grid: hydrated host elements carry
 * `__reactFiber$…` / `__reactProps$…` instance keys, SSR-only HTML does
 * not. Without this, a fast click falls through to the browser default
 * (anchor navigates fully, button does nothing) and the SPA assertions
 * measure hydration timing instead of the feature.
 */
async function waitForHydration(page: import('@playwright/test').Page) {
  await page.waitForFunction(
    () => {
      const el = document.querySelector('#featured-grid')
      if (!el) return false
      return Object.keys(el).some((k) => k.startsWith('__reactFiber$') || k.startsWith('__reactProps$'))
    },
    undefined,
    { timeout: 30_000 },
  )
}

test.describe('featured briefs browse smoke', () => {
  test.skip(!process.env.PLAYWRIGHT_BASE_URL, 'runs only against PLAYWRIGHT_BASE_URL (live marketplace)')

  test.beforeEach(async ({ page }) => {
    await page.goto('/marketplace', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('#featured-grid a.gig-link', { timeout: 30_000 })
    await waitForHydration(page)
    await page.evaluate(() => ((window as any).__smokeMarker = 'set'))
  })

  test('page 1 shows 48 cards, range line, and Load-more control', async ({ page }) => {
    const cards = page.locator('#featured-grid a.gig-link')
    await expect(cards).toHaveCount(PAGE_SIZE, { timeout: 15_000 })

    const range = page.locator('.pager .pg-range')
    await expect(range).toContainText(`Showing ${PAGE_SIZE.toLocaleString('en-US')}`)
    await expect(range).toContainText('page 1/')

    const loadMore = page.locator('button:has-text("Load more briefs")')
    await expect(loadMore).toBeVisible()
  })

  test('Load-more appends the next page in place without a reload', async ({ page }) => {
    const cards = page.locator('#featured-grid a.gig-link')
    await expect(cards).toHaveCount(PAGE_SIZE)

    await page.locator('button:has-text("Load more briefs")').click()
    await expect(cards).toHaveCount(PAGE_SIZE * 2, { timeout: 15_000 })

    // Range grew to page 2/5 and now reflects 96 shown.
    await expect(page.locator('.pager .pg-range')).toContainText(`Showing ${(PAGE_SIZE * 2).toLocaleString('en-US')}`)

    // No full reload happened: the marker survived.
    expect(await page.evaluate(() => (window as any).__smokeMarker)).toBe('set')
    expect(page.url()).not.toContain('page=')
  })

  test('pager chip jumps to the page window in place', async ({ page }) => {
    const cards = page.locator('#featured-grid a.gig-link')
    await expect(cards).toHaveCount(PAGE_SIZE)

    await page.locator('.pager').getByRole('link', { name: '3', exact: true }).click()
    // Page 3 shows pages 1–3 cumulatively: 144 cards.
    await expect(cards).toHaveCount(PAGE_SIZE * 3, { timeout: 15_000 })

    await expect(page.locator('.pager .pg-range')).toContainText('page 3/')
    await expect(page.locator('.pager a[aria-current="page"]')).toHaveText('3')

    // In-app jump, not a navigation.
    expect(await page.evaluate(() => (window as any).__smokeMarker)).toBe('set')
    expect(page.url()).not.toContain('page=')
  })

  test('deep-linked ?page=2 SSRs 96 cards and auto-scrolls on first paint', async ({ page }) => {
    await page.goto('/marketplace?page=2', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('#featured-grid a.gig-link', { timeout: 30_000 })
    await waitForHydration(page)

    // Cumulative SSR: pages 1–2 rendered server-side.
    const cards = page.locator('#featured-grid a.gig-link')
    await expect(cards).toHaveCount(PAGE_SIZE * 2, { timeout: 15_000 })
    await expect(page.locator('.pager .pg-range')).toContainText('page 2/')

    // Auto-scroll fired on mount: the viewport moved to the grid (well past
    // the hero). Give the smooth scroll time to settle.
    await page.waitForFunction(() => window.scrollY > 300, undefined, { timeout: 15_000 })
    await expect(page.locator('.pager a[aria-current="page"]')).toHaveText('2')
  })
})
