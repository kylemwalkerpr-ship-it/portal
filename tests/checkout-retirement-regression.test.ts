import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const runtimeRoots = ['app', 'components', 'lib', 'scripts']
const retiredHost = 'checkout.yousafeconsultancy.com'

function sourceFiles(dir: string, out: string[] = []) {
  const absolute = path.join(root, dir)
  if (!fs.existsSync(absolute)) return out
  for (const entry of fs.readdirSync(absolute)) {
    if (['node_modules', '.next', '.open-next', 'out'].includes(entry)) continue
    const rel = path.join(dir, entry)
    const full = path.join(root, rel)
    const stat = fs.statSync(full)
    if (stat.isDirectory()) sourceFiles(rel, out)
    else if (/\.(?:tsx?|jsx?|mjs|cjs|json)$/i.test(entry)) out.push(rel)
  }
  return out
}

describe('retired checkout estate regression protection', () => {
  test('active Portal and Marketplace runtime sources never reference the retired checkout host', () => {
    const offenders = runtimeRoots
      .flatMap((dir) => sourceFiles(dir))
      .filter((file) => fs.readFileSync(path.join(root, file), 'utf8').includes(retiredHost))

    expect(offenders).toEqual([])
  })

  test('public Marketplace source does not link new traffic through legacy /templates URLs', () => {
    const publicSources = [
      'components/marketplace/MarketIndexSeo.tsx',
      'app/marketplace/categories/[categoryId]/page.tsx',
    ]
    for (const file of publicSources) {
      const source = fs.readFileSync(path.join(root, file), 'utf8')
      expect(source).not.toContain('href="/templates"')
      expect(source).toContain('/shop')
    }
  })
})
