/// <reference types="jest" />

import fs from 'node:fs'
import path from 'node:path'

describe('marketplace slug migration contract', () => {
  const root = process.cwd()

  it('uses a permanent redirect for historical gig slugs', () => {
    const source = fs.readFileSync(path.join(root, 'app/marketplace/gigs/[slug]/page.tsx'), 'utf8')
    expect(source).toContain("import { notFound, permanentRedirect } from 'next/navigation'")
    expect(source).toContain('permanentRedirect(`/marketplace/gigs/${redirected}`)')
    expect(source).not.toContain("import { notFound, redirect } from 'next/navigation'")
  })

  it('renders linked semantic category and subcategory breadcrumbs on the buyer page', () => {
    const source = fs.readFileSync(path.join(root, 'components/marketplace/GigDetailPage.tsx'), 'utf8')
    expect(source).toContain('getCategoryById')
    expect(source).toContain('getSubcategoryById')
    expect(source).toContain('aria-label="Breadcrumb"')
    expect(source).toContain('href={`/categories/${category.id}`}')
    expect(source).toContain('href={`/categories/${subcategory.id}`}')
    expect(source).toContain('aria-current="page"')
  })
})
