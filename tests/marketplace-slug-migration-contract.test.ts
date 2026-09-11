/// <reference types="jest" />

import fs from 'node:fs'
import path from 'node:path'

describe('marketplace slug migration contract', () => {
  const root = process.cwd()

  it('uses a permanent redirect for historical gig slugs', () => {
    const source = fs.readFileSync(path.join(root, 'app/marketplace/gigs/[slug]/page.tsx'), 'utf8')
    expect(source).toContain("import { notFound, permanentRedirect } from 'next/navigation'")
    expect(source).toContain('permanentRedirect(`/gigs/${redirected}`)')
    expect(source).not.toContain('permanentRedirect(`/marketplace/gigs/${redirected}`)')
    expect(source).not.toContain("import { notFound, redirect } from 'next/navigation'")
  })

  it('renders linked semantic category breadcrumbs with the current service identified by its adjacent h1', () => {
    const source = fs.readFileSync(path.join(root, 'components/marketplace/GigDetailPage.tsx'), 'utf8')
    expect(source).toContain('getCategoryById')
    expect(source).toContain('getSubcategoryById')
    expect(source).toContain('aria-label="Breadcrumb"')
    expect(source).toContain('href={`/categories/${category.id}`}')
    expect(source).toContain('href={`/categories/${subcategory.id}`}')
    expect(source).toContain('<h1 id="ys-gig-title" style={gigTitle}>{gig.title}</h1>')
    expect(source).not.toContain('<span aria-current="page" style={{ color: T.onPaper }}>{gig.title}</span>')
  })
})
