/**
 * Pipeline bubble-pill navigation E2E.
 *
 * Clicks every stage pill in the horizontal bubble navbar and asserts the
 * correct editorial panel renders with its expected testid or heading.
 *
 * Bubbles use id="studio-tab-{key}" with role="tab" and aria-selected.
 * Panels use id="studio-panel-{key}" with role="tabpanel".
 */
import { test, expect, type Browser, type Page } from '@playwright/test'

const REQUIRED_ENV = ['CLERK_TEST_EMAIL', 'CLERK_TEST_PASSWORD', 'CLERK_SECRET_KEY'] as const

let browser: Browser
let page: Page

/** Provision an admin session via Clerk sign-in token. */
async function loginAsAdmin(b: Browser): Promise<Page> {
  const clerkKey = process.env.CLERK_SECRET_KEY!
  const email = process.env.CLERK_TEST_EMAIL!
  const P = page || (await b.newPage())

  // Look up the user id
  const usersRes = await P.request.get(
    `https://api.clerk.com/v1/users?email_address=${encodeURIComponent(email)}`,
    { headers: { Authorization: `Bearer ${clerkKey}` } },
  )
  const users = await usersRes.json()
  const userId = Array.isArray(users) ? (users[0] as any)?.id : null

  // Create sign-in token
  const tokenRes = await P.request.post(
    `https://api.clerk.com/v1/sign_in_tokens`,
    {
      headers: { Authorization: `Bearer ${clerkKey}`, 'Content-Type': 'application/json' },
      data: { user_id: userId, expires_in_seconds: 60 },
    },
  )
  const token = (await tokenRes.json()) as { token?: string }
  if (!token.token) throw new Error('Failed to create sign-in token')

  const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3002'
  await P.goto(
    `${BASE}/sign-in/student?__clerk_ticket=${token.token}&return_to=/dashboard/admin/content`,
    { waitUntil: 'domcontentloaded', timeout: 30_000 },
  )
  await P.waitForTimeout(2000)
  return P
}

test.beforeAll(async ({ browser: b }) => {
  if (REQUIRED_ENV.some((k) => !process.env[k])) {
    throw new Error(`Missing env: ${REQUIRED_ENV.filter((k) => !process.env[k]).join(', ')}`)
  }
  browser = b
})

test.afterAll(async () => {
  await page?.close()
})

/* ─── Stage pill map — what to assert per tab ─── */
const STAGES = [
  {
    key: 'discover',
    label: 'Discover',
    // The Discover stage renders a ChapterIntro with "Discover" heading
    assertHeading: 'Discover',
    assertTestId: 'studio-panel-discover',
  },
  {
    key: 'research',
    label: 'Research',
    // Research & Plan tab renders the BriefAssemblyPanel
    assertHeading: 'Research & Plan',
    assertTestId: 'studio-brief-assembly',
  },
  {
    key: 'draft',
    label: 'Draft & Review',
    // Draft & Review tab renders the DraftWorkspace with the review panels below
    assertHeading: null, // DraftWorkspace has no heading text
    assertTestId: 'studio-draft-workspace',
  },
  {
    key: 'approve',
    label: 'Approve & Track',
    // Approve & Track renders ApprovePanel with the publication ledger below
    assertHeading: null,
    assertTestId: 'studio-approve-panel',
  },
  {
    key: 'configure',
    label: 'Configure',
    assertHeading: 'Configure',
    // The configure tab has its own panel(s)
    assertTestId: null, // Use heading-based assertion
  },
]

test.describe('Pipeline bubble-pill navigation', () => {
  test('login and navigate to Content Studio', async () => {
    page = await loginAsAdmin(browser)
    // Should land on the studio page
    await expect(page.locator('[role="tablist"]')).toBeVisible({ timeout: 15_000 })
  })

  for (let i = 0; i < STAGES.length; i++) {
    const stage = STAGES[i]
    test(`click "${stage.label}" bubble pill → renders stage panel`, async () => {
      const tabId = `studio-tab-${stage.key}`
      const pill = page.locator(`#${tabId}`)

      // Pill should be visible
      await expect(pill).toBeVisible({ timeout: 5_000 })

      // Click the pill
      await pill.click()

      // Wait for react to settle
      await page.waitForTimeout(500)

      // Assert aria-selected
      await expect(pill).toHaveAttribute('aria-selected', 'true')

      // Assert the correct panel renders
      if (stage.assertTestId) {
        await expect(
          page.locator(`[data-testid="${stage.assertTestId}"]`).first(),
        ).toBeVisible({ timeout: 8_000 })
      }

      // If there's a heading to check, verify it in the ChapterIntro
      if (stage.assertHeading) {
        const chapterIntro = page.locator(`[data-chapter="${stage.key}"]`)
        await expect(chapterIntro).toBeVisible({ timeout: 5_000 })
        // The ChapterIntro contains the heading text (h2 inside)
        const headingInChapter = chapterIntro.locator('h2')
        await expect(headingInChapter.first()).toContainText(
          stage.assertHeading,
          { timeout: 5_000 },
        )
      }

      // Verify the active bubble pill has the gold styling (class or background)
      // The active pill has a gold-filled circle with scale(1.08) transformation
      const bubbleCircle = pill.locator('span').first()
      const bubbleBg = await bubbleCircle.evaluate(
        (el) => window.getComputedStyle(el).backgroundColor,
      )
      // Gold accent is #A07E3A or similar — check it's not transparent
      expect(bubbleBg).not.toBe('rgba(0, 0, 0, 0)')
      expect(bubbleBg).not.toBe('transparent')
    })
  }

  test('verify all 5 pills are in the nav and in correct order', async () => {
    // The nav contains all 5 live pills as role="tab" buttons (shop is hidden
    // from the nav until it can shipContent).
    const tabs = page.locator('[role="tab"]')
    await expect(tabs.first()).toBeVisible()

    const count = await tabs.count()
    expect(count).toBeGreaterThanOrEqual(5)

    // Verify labels appear in the correct pipeline order
    const expectedLabels = STAGES.map((s) => s.label)
    for (let i = 0; i < expectedLabels.length; i++) {
      const tab = tabs.nth(i)
      await expect(tab).toContainText(expectedLabels[i])
    }
  })

  test('clicking a past-stage pill navigates backward correctly', async () => {
    // First click to Approve & Track (IV), then click back to Research (II)
    await page.locator('#studio-tab-approve').click()
    await page.waitForTimeout(400)
    await expect(page.locator('[data-testid="studio-publish-ledger"]').first()).toBeVisible()

    // Now click back to Research
    await page.locator('#studio-tab-research').click()
    await page.waitForTimeout(400)
    await expect(
      page.locator('[data-testid="studio-brief-assembly"]').first(),
    ).toBeVisible({ timeout: 5_000 })

    // Research should now be aria-selected
    await expect(page.locator('#studio-tab-research')).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })
})
