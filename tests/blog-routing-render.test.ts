/**
 * Blog pipeline regression suite (2026-08):
 *  1. blog_post ownership → apex yousafe-consultancy static /blog/<slug>/ page
 *  2. renderTargetFile emits the established yousafe-consultancy blog format
 *     (rich Metadata, BlogDepthSection, serif layout, legal-guide CTA)
 *  3. insertBlogPostIntoData appends entries to blog-data.ts correctly
 *
 * Background: blog_post used to route to caseworks with the article 2200-word
 * depth floor, blocking legitimate blogs and deploying to the wrong repo.
 */
import { standingRulesHost, reconcileContentTypeWithPath } from '@/lib/seoFactory/ownership'
import {
  buildBlogPostEntry,
  insertBlogPostIntoData,
  renderTargetFile,
} from '@/lib/seoFactory/renderTarget'
import { minWordsForType, maxWordsForType } from '@/lib/seoFactory/contentDepth'
import type { OwnerPlan } from '@/lib/seoFactory/ownership'

function plan(partial: Partial<OwnerPlan> & Pick<OwnerPlan, 'host' | 'repo' | 'filePath' | 'canonicalUrl'>): OwnerPlan {
  return {
    matched: null,
    matchScore: 0,
    indexable: true,
    action: 'build',
    intentClass: 'news_summary',
    contentType: 'blog_post',
    warnings: [],
    blockers: [],
    ymy: false,
    routingSource: 'standing_rules',
    ...partial,
  }
}

const blogMarkdown = `---
title: Banking in Canada for International Students: Accounts, Credit & SIN (2026)
description: How new international students can open a Canadian bank account, build credit history, avoid fees, and get a SIN — a practical guide for your first semester.
---

## Step 1: Get your Social Insurance Number first
A SIN is a 9-digit number issued by Service Canada. Apply in person — bring your study permit, passport, and proof of enrolment.

## Step 2: Choose a student bank account
All five major Canadian banks offer student accounts with no monthly fees.

- Student accounts include unlimited debit transactions
- International student accounts offer extra perks

## FAQ
How long does a SIN take? It is issued on the spot.
`

describe('blog_post ownership routing', () => {
  it('routes blog_post to apex yousafe-consultancy (not caseworks)', () => {
    const rules = standingRulesHost({
      primaryKeyword: 'banking canada international students',
      contentType: 'blog_post',
      region: 'CA',
    })
    expect(rules.host).toBe('apex')
    expect(rules.contentType).toBe('blog_post')
  })

  it('reconciles landing-page/app/blog/* paths as blog content type', () => {
    const r = reconcileContentTypeWithPath({
      contentType: 'blog_post',
      filePath: 'landing-page/app/blog/canada-banking-international-students-2026/page.tsx',
      host: 'apex',
    })
    expect(r.contentType).toBe('blog_post')
    expect(r.intentClass).toBe('news_summary')
    // A non-blog type forced onto a blog path normalizes to blog_summary
    const forced = reconcileContentTypeWithPath({
      contentType: 'legal_guide',
      filePath: 'landing-page/app/blog/some-post/page.tsx',
      host: 'apex',
    })
    expect(forced.contentType).toBe('blog_summary')
  })

  it('uses the blog depth budget (800-1500), never the 2200 article floor', () => {
    expect(minWordsForType('blog_post')).toBe(800)
    expect(maxWordsForType('blog_post')).toBe(1500)
  })
})

describe('renderTargetFile blog page format', () => {
  it('emits the established yousafe-consultancy blog page contract', () => {
    const p = plan({
      host: 'apex',
      repo: 'yousafe-consultancy',
      filePath: 'landing-page/app/blog/canada-banking-international-students-2026/page.tsx',
      canonicalUrl: 'https://yousafeconsultancy.com/blog/canada-banking-international-students-2026/',
      contentType: 'blog_post',
    })
    const { filePath, fileContent } = renderTargetFile({
      plan: p,
      content: blogMarkdown,
      title: 'Banking in Canada for International Students (2026)',
      region: 'CA',
      contentType: 'blog_post',
      primaryKeyword: 'banking canada international students',
      indexable: true,
      canonicalUrl: p.canonicalUrl,
    })

    expect(filePath).toContain('landing-page/app/blog/')
    expect(filePath.endsWith('page.tsx')).toBe(true)
    // Blog format contract — precedence from existing blog pages
    expect(fileContent).toContain('import type { Metadata } from "next"')
    expect(fileContent).toContain('BlogDepthSection')
    expect(fileContent).toContain('mx-auto max-w-2xl px-4 py-16 sm:px-6 lg:px-8')
    expect(fileContent).toContain('font-sans text-3xl tracking-[-0.02em] text-foreground sm:text-4xl')
    expect(fileContent).toContain('font-sans text-2xl font-semibold tracking-[-0.02em] text-balance text-foreground')
    expect(fileContent).toContain('text-muted-foreground')
    expect(fileContent).toContain('Need the full legal guide?')
    expect(fileContent).toContain('https://legal.yousafeconsultancy.com')
    // Blog canonical on apex, not legal host
    expect(fileContent).toContain('https://yousafeconsultancy.com/blog/')
    // Blog must NOT leak caseworks-only components or raw markdown fences
    expect(fileContent).not.toContain('ArticleLayout')
    expect(fileContent).not.toContain('CTAPanel')
    expect(fileContent).not.toMatch(/```/)
    expect(fileContent).not.toMatch(/<script/i)
  })

  it('handles UK blog region routing to uk legal guides', () => {
    const p = plan({
      host: 'apex',
      repo: 'yousafe-consultancy',
      filePath: 'landing-page/app/blog/uk-graduate-route-changes-2026/page.tsx',
      canonicalUrl: 'https://yousafeconsultancy.com/blog/uk-graduate-route-changes-2026/',
      contentType: 'blog_post',
    })
    const { fileContent } = renderTargetFile({
      plan: p,
      content: blogMarkdown.replace(/Canada|SIN/g, 'UK').replace(/canadian/gi, 'British'),
      title: 'UK Graduate Route Changes 2026',
      region: 'UK',
      contentType: 'blog_post',
      primaryKeyword: 'uk graduate route 2026',
      indexable: true,
      canonicalUrl: p.canonicalUrl,
    })
    expect(fileContent).toContain('https://legal.yousafeconsultancy.com/uk/')
  })
})

describe('blog-data.ts index insertion', () => {
  const sampleData = `export interface BlogPost {
  slug: string
  title: string
  metaDescription: string
  category: "usa" | "canada" | "both" | "uk"
  date: string
  readTime: string
  content: string
}

export const blogPosts: BlogPost[] = [
  {
    slug: "existing-post",
    title: "Existing Post",
    metaDescription: "old",
    category: "usa",
    date: "2026-01-01",
    readTime: "5 min read",
    content: \`old content\`,
  },
]
`

  it('builds a BlogPost entry from a blog plan', () => {
    const p = plan({
      host: 'apex',
      repo: 'yousafe-consultancy',
      filePath: 'landing-page/app/blog/my-new-post/page.tsx',
      canonicalUrl: 'https://yousafeconsultancy.com/blog/my-new-post/',
      contentType: 'blog_post',
    })
    const entry = buildBlogPostEntry({
      plan: p,
      content: blogMarkdown,
      title: 'My New Post',
      region: 'CA',
    })
    expect(entry.slug).toBe('my-new-post')
    expect(entry.category).toBe('canada')
    expect(entry.title).toBe('Banking in Canada for International Students: Accounts, Credit & SIN (2026)')
    // US region maps to the 'usa' category chip, not the generic 'both'
    const usEntry = buildBlogPostEntry({
      plan: plan({
        host: 'apex',
        repo: 'yousafe-consultancy',
        filePath: 'landing-page/app/blog/us-post/page.tsx',
        canonicalUrl: 'https://yousafeconsultancy.com/blog/us-post/',
        contentType: 'blog_post',
      }),
      content: blogMarkdown,
      title: 'US Post',
      region: 'US',
    })
    expect(usEntry.category).toBe('usa')
    expect(entry.content).toContain('Step 1')
    expect(entry.readTime).toMatch(/min read/)
  })

  it('inserts the new entry at the top of blogPosts without breaking the file', () => {
    const p = plan({
      host: 'apex',
      repo: 'yousafe-consultancy',
      filePath: 'landing-page/app/blog/brand-new-post/page.tsx',
      canonicalUrl: 'https://yousafeconsultancy.com/blog/brand-new-post/',
      contentType: 'blog_post',
    })
    const entry = buildBlogPostEntry({
      plan: p,
      content: blogMarkdown,
      title: 'Brand New Post',
      region: 'US',
    })
    const updated = insertBlogPostIntoData(sampleData, entry)
    expect(updated).toContain('export const blogPosts: BlogPost[] = [')
    // New entry first
    const newIdx = updated.indexOf('slug: "brand-new-post"')
    const oldIdx = updated.indexOf('slug: "existing-post"')
    expect(newIdx).toBeGreaterThan(-1)
    expect(oldIdx).toBeGreaterThan(newIdx)
    // Existing entry survives verbatim
    expect(updated).toContain('content: `old content`')
    // Balanced braces — the file remains valid TS
    const opens = (updated.match(/\{/g) || []).length
    const closes = (updated.match(/\}/g) || []).length
    expect(opens).toBe(closes)
  })

  it('throws when the blogPosts array marker is missing', () => {
    expect(() => insertBlogPostIntoData('export const other = []', {
      slug: 'x', title: 'x', metaDescription: 'x', category: 'usa', date: '2026-01-01', readTime: '1 min read', content: 'x',
    })).toThrow(/blogPosts array marker not found/)
  })
})
