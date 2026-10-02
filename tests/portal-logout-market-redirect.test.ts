import fs from 'node:fs'
import path from 'node:path'

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8')

describe('portal sign-out destinations', () => {
  test('dashboard sign-out returns to the public marketplace, including fallback', () => {
    const source = read('app/dashboard/client.tsx')
    expect(source).toContain("const MARKET_HOME_URL = 'https://market.yousafeconsultancy.com/'")
    expect(source).toContain('window.location.replace(MARKET_HOME_URL)')
    expect(source).toContain('signOut({ redirectUrl: MARKET_HOME_URL })')
  })

  test('admin section sign-out returns to the public marketplace, including fallback', () => {
    const source = read('app/dashboard/admin/AdminSectionClient.tsx')
    expect(source).toContain("const MARKET_HOME_URL = 'https://market.yousafeconsultancy.com/'")
    expect(source).toContain('window.location.replace(MARKET_HOME_URL)')
    expect(source).toContain('signOut({ redirectUrl: MARKET_HOME_URL })')
  })

  test('Clerk default sign-out destination is the public marketplace', () => {
    const source = read('app/layout.tsx')
    expect(source).toContain('afterSignOutUrl={MARKET_HOME_URL}')
    expect(source).toContain("const MARKET_HOME_URL = 'https://market.yousafeconsultancy.com/'")
  })

  test('the wrong-lane sign-out loop is gone (role comes from the DB, not the sign-in URL)', () => {
    const source = read('app/dashboard/client.tsx')
    expect(source).not.toContain('signOut({ redirectUrl: target })')
    expect(source).not.toContain('expectedRole !== role')
  })
})
