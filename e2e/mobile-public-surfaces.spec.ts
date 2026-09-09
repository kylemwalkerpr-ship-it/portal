import { test, expect } from '@playwright/test'

/**
 * Phone-viewport smoke for the public conversion surfaces.
 *
 * Locked in:
 *  1. Landing hamburger + visible My Account (no clipped "Brow…" nav).
 *  2. Marketplace compact single-row header with Dashboard in the drawer.
 *  3. Sign-in form is in the first viewport, not below the brand panel.
 *  4. viewport-fit=cover, 16px inputs, no page-level horizontal overflow.
 *
 * Viewport is set at file scope so this file stays off the desktop-chrome
 * project defaults without re-running the rest of the e2e suite on Pixel 7.
 */

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
})

async function assertNoHorizontalOverflow(page: import('@playwright/test').Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1)
}

async function assertViewportFitCover(page: import('@playwright/test').Page) {
  const content = await page.locator('meta[name="viewport"]').getAttribute('content')
  expect(content || '').toMatch(/viewport-fit\s*=\s*cover/i)
}

test.describe('mobile public surfaces', () => {
  test('landing: hamburger, My Account, no clipped nav, no overflow', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.ys-portal-nav', { timeout: 30_000 })

    await assertViewportFitCover(page)
    await assertNoHorizontalOverflow(page)

    const menu = page.getByRole('button', { name: 'Open menu' })
    await expect(menu).toBeVisible()
    await expect(menu).toHaveCSS('display', 'inline-flex')

    await expect(page.locator('.ys-nav-cta-account').getByRole('button', { name: /My Account/i })).toBeVisible()
    await expect(page.locator('.ys-nav-links')).toBeHidden()
    await expect(page.locator('.ys-nav-cta-inquiry')).toBeHidden()

    await menu.click()
    const drawer = page.getByRole('dialog', { name: 'Site menu' })
    await expect(drawer).toBeVisible()
    await expect(drawer.getByRole('link', { name: 'Browse services' })).toBeVisible()
    await expect(drawer.getByRole('link', { name: 'Start an inquiry' })).toBeVisible()

    await expect(page.getByRole('button', { name: 'Open chat' })).toBeVisible()
  })

  test('marketplace: compact header, hamburger exposes Dashboard', async ({ page }) => {
    await page.goto('/marketplace', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.ys-shell-header-inner', { timeout: 30_000 })

    await assertNoHorizontalOverflow(page)

    const header = page.locator('.ys-shell-header-inner')
    const height = await header.evaluate((el) => el.getBoundingClientRect().height)
    expect(height).toBeLessThanOrEqual(72)

    const menu = page.getByRole('button', { name: 'Open menu' })
    await expect(menu).toBeVisible()
    await expect(page.locator('.ys-shell-desktop-pill').first()).toBeHidden()
    await expect(page.locator('.ys-market-nav')).toBeHidden()

    await menu.click()
    const drawer = page.getByRole('dialog', { name: 'Marketplace menu' })
    await expect(drawer).toBeVisible()
    await expect(drawer.getByRole('link', { name: 'Dashboard' })).toBeVisible()
    await expect(drawer.getByRole('link', { name: 'File shop' })).toBeVisible()
    await expect(drawer.getByRole('link', { name: 'Home' })).toBeVisible()
  })

  test('sign-in: Clerk form is above the fold', async ({ page }) => {
    await page.goto('/sign-in/student', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.ys-auth-form-panel', { timeout: 30_000 })

    await assertNoHorizontalOverflow(page)

    const form = page.locator('.ys-auth-form-panel')
    await expect(form).toBeVisible()
    const box = await form.boundingBox()
    expect(box).toBeTruthy()
    expect(box!.y).toBeLessThan(120)

    await expect(page.locator('.ys-auth-detail-list')).toBeHidden()

    const inputFont = await page.evaluate(() => {
      const el = document.querySelector('.ys-clerk-input, input[type="email"], input[type="text"]')
      return el ? getComputedStyle(el).fontSize : '16px'
    })
    const px = Number.parseFloat(inputFont)
    expect(px).toBeGreaterThanOrEqual(16)
  })
})
