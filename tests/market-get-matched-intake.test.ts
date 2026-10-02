import fs from 'fs'
import path from 'path'

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8')

describe('market get-matched free intake', () => {
  it('ships an indexable /get-matched page on the market host', () => {
    const page = read('app/marketplace/get-matched/page.tsx')
    expect(page).toContain("getMarketplaceCanonicalUrl('/get-matched')")
    expect(page).toContain('GetMatchedClient')
    expect(read('app/sitemap.ts')).toContain('/get-matched')
  })

  it('tags intake source and sends buyers to client sign-up after submit', () => {
    const client = read('components/marketplace/GetMatchedClient.tsx')
    expect(client).toContain('market:get-matched')
    expect(client).toContain('ys_sign_up=1&intent=client')
    const form = read('components/design/inquiry-intake-form.jsx')
    expect(form).toMatch(/source\s*\|\|/)
  })

  it('links to the intake from the landing hero and gig detail', () => {
    expect(read('app/marketplace/PublicMarketplaceLanding.tsx')).toContain('href="/get-matched"')
    expect(read('components/marketplace/GigDetailComponents.tsx')).toContain('/get-matched')
  })

  it('sends a buyer confirmation and an admin lead alert, escaping user input', () => {
    const route = read('app/api/inquiries/route.ts')
    expect(route).toContain('LEAD_ALERT_EMAIL')
    expect(route).toContain('escapeHtml(')
    expect(route).toMatch(/not a law firm/i)
  })
})
