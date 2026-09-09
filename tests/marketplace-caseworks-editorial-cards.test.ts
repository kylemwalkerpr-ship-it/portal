import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const source = fs.readFileSync(
  path.join(root, 'components/marketplace/CaseworksReadMoreRail.tsx'),
  'utf8',
)
const styles = fs.readFileSync(
  path.join(root, 'components/marketplace/CaseworksReadMoreRail.module.css'),
  'utf8',
)

describe('marketplace MyCaseworks editorial rail', () => {
  test('presents editorial links as titled information cards instead of raw URLs', () => {
    expect(source).toContain('MyCaseworks guide')
    expect(source).toContain('Read guide')
    expect(source).toContain('{item.title}')
    expect(source).not.toContain('legal.yousafeconsultancy.com{item.path}')
    expect(source).not.toContain('Editorial resource')
  })

  test('keeps every card fully clickable and preserves marketplace attribution', () => {
    expect(source).toContain('href={`${CASEWORKS_HOST}${item.path}/?utm_source=marketplace')
    expect(source).toContain('aria-label={`Read ${item.title} on MyCaseworks`}')
    expect(source).toContain('className={styles.card}')
  })

  test('uses dedicated CSS rather than relying on unavailable utility styling', () => {
    expect(source).toContain("import styles from './CaseworksReadMoreRail.module.css'")
    expect(source).toContain('className={styles.rail}')
    expect(styles).toContain('list-style: none !important')
    expect(styles).toContain('display: grid !important')
    expect(styles).toContain('background: var(--ys-vellum, #ffffff) !important')
    expect(styles).toContain('border-radius: 16px')
  })

  test('keeps the flash cards mobile-first and upgrades to two columns on larger screens', () => {
    expect(styles).toContain('grid-template-columns: minmax(0, 1fr)')
    expect(styles).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))')
    expect(styles).toContain('width: min(calc(100% - 32px), 72rem)')
    expect(source).toContain('Browse all guides')
  })
})
