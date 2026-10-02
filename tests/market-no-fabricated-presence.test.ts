import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * Response time and live presence are not measured anywhere yet, so the gig and
 * seller APIs must not hard-code them and the UI must not default to "Online".
 */
const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')

describe('market: no fabricated response time / online status', () => {
  it.each(['app/api/marketplace/gigs/[slug]/route.ts', 'app/api/sellers/[id]/route.ts', 'app/api/sellers/route.ts'])(
    '%s does not hard-code a response time or derive "online" from availability',
    (p) => {
      const src = read(p)
      expect(src).not.toMatch(/response_time:\s*['"`]/)
      expect(src).not.toMatch(/is_online:\s*true/)
      expect(src).not.toMatch(/is_online:\s*\w+\.available/)
    },
  )

  it('gig page and chat do not default to Online or promise quick replies', () => {
    const page = read('components/marketplace/GigDetailPage.tsx')
    expect(page).not.toMatch(/provider_is_online \? 'Online' : 'Available'/)
    const chat = read('components/marketplace/ChatSidePane.tsx')
    expect(chat).not.toMatch(/useState\('online'\)/)
    expect(chat).not.toMatch(/quick replies likely/)
    expect(chat).not.toMatch(/is online now/)
    const card = read('components/marketplace/GigDetailComponents.tsx')
    expect(card).not.toMatch(/[^$]\{seller\.is_online \? 'Online' : 'Offline'\} · \{seller\.role/)
    expect(card).toMatch(/typeof seller\.is_online === 'boolean'/)
  })

  it('seller avatars only show the online dot when presence is known true', () => {
    expect(read('components/marketplace/SellerProfileComponents.tsx')).not.toMatch(/is_online !== false/)
    expect(read('components/marketplace/SellerDirectoryPage.tsx')).not.toMatch(/is_online !== false/)
  })
})
