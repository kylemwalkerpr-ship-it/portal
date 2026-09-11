import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const source = fs.readFileSync(path.join(root, 'components/marketplace/GigDetailPage.tsx'), 'utf8')

describe('marketplace gig search tags', () => {
  test('renders gig tags as category-scoped marketplace search links', () => {
    expect(source).toContain("const tagSearchBase = subcategory")
    expect(source).toContain("?q=${encodeURIComponent(tag)}")
    expect(source).toContain("aria-label={`Search ${subcategory?.name || category?.name || 'Marketplace'} for ${tag}`}")
    expect(source).toMatch(/gig\.tags\.map[\s\S]{0,500}<Link[\s\S]{0,500}href=\{`\$\{tagSearchBase\}\?q=\$\{encodeURIComponent\(tag\)\}`\}/)
    expect(source).not.toContain('<span key={index} style={tagBadge}>{tag}</span>')
  })

  test('keeps tag links visually pill-shaped while making intent obvious', () => {
    expect(source).toMatch(/const tagBadge[\s\S]{0,500}textDecoration:\s*'none'/)
    expect(source).toMatch(/const tagBadge[\s\S]{0,500}cursor:\s*'pointer'/)
    expect(source).toContain('title={`Search for ${tag}`}')
  })
})
