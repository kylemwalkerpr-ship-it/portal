import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const heroPath = path.join(root, 'components/design/landing/Hero.tsx')
const posterPath = path.join(root, 'public/hero-poster.jpg')

describe('Ahrefs landing hero media regression guard', () => {
  it('uses the existing same-origin poster without runtime R2 hero dependencies', () => {
    const source = fs.readFileSync(heroPath, 'utf8')

    expect(source).not.toContain('media.yousafeconsultancy.com/hero')
    expect(source).toContain('src="/hero-poster.jpg"')
    expect(fs.existsSync(posterPath)).toBe(true)
    expect(fs.statSync(posterPath).size).toBeGreaterThan(0)
  })
})
