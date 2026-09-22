import fs from 'node:fs'
import path from 'node:path'

describe('P11 client/server ownership boundary', () => {
  it('keeps citation remediation off the server-only ownership loader', () => {
    const remediation = fs.readFileSync(path.join(process.cwd(), 'lib/seoEngine/citationRemediation.ts'), 'utf8')
    expect(remediation).not.toContain("from '@/lib/seoFactory/ownership'")
    expect(remediation).toContain("from '@/lib/seoFactory/ownershipContract'")
  })

  it('keeps the public host contract pure and client-safe', () => {
    const contract = fs.readFileSync(path.join(process.cwd(), 'lib/seoFactory/ownershipContract.ts'), 'utf8')
    expect(contract).toContain('export const HOST_PUBLIC')
    expect(contract).not.toMatch(/seoDataLoaders|node:fs|node:path/)
  })
})
