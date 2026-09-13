import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('marketplace auth return target', () => {
  it('converts root-relative marketplace paths into an absolute market URL before portal sign-in', () => {
    const modal = read('components/marketplace/SignUpGateModal.tsx')

    expect(modal).toContain("const MARKET_ORIGIN = 'https://market.yousafeconsultancy.com'")
    expect(modal).toContain("returnTo.startsWith('/')")
    expect(modal).toContain('`${MARKET_ORIGIN}${returnTo}`')
    expect(modal).toContain('encodeURIComponent(absoluteReturnTo)')
  })
})
