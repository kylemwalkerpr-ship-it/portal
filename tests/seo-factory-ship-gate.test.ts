/**
 * Estate ship-gate: host ↔ repo ↔ path ↔ content type.
 */
import { validateShipPlan, validateRenderedPayload, assertShipAllowed } from '@/lib/seoFactory/shipGate'
import { renderTargetFile } from '@/lib/seoFactory/renderTarget'
import type { OwnerPlan } from '@/lib/seoFactory/ownership'

function plan(partial: Partial<OwnerPlan> & Pick<OwnerPlan, 'host' | 'repo' | 'filePath' | 'canonicalUrl'>): OwnerPlan {
  return {
    matched: null,
    matchScore: 0,
    indexable: true,
    action: 'build',
    intentClass: 'procedural',
    contentType: 'legal_guide',
    warnings: [],
    blockers: [],
    ymy: partial.host === 'legal',
    routingSource: 'standing_rules',
    ...partial,
  }
}

describe('validateShipPlan', () => {
  it('allows legal guide on caseworks path', () => {
    const r = validateShipPlan({
      plan: plan({
        host: 'legal',
        repo: 'caseworks',
        filePath: 'app/uk/administrative-review-letter-template-uk/page.tsx',
        canonicalUrl: 'https://legal.yousafeconsultancy.com/uk/administrative-review-letter-template-uk/',
      }),
      contentType: 'legal_guide',
    })
    expect(r.ok).toBe(true)
    expect(r.errors).toHaveLength(0)
  })

  it('blocks legal guide shipped to usa regional host', () => {
    const r = validateShipPlan({
      plan: plan({
        host: 'usa',
        repo: 'yousafe-consultancy',
        filePath: 'usa/content/from/nigeria.md',
        canonicalUrl: 'https://usa.yousafeconsultancy.com/from/nigeria/',
      }),
      contentType: 'legal_guide',
    })
    expect(r.ok).toBe(false)
    expect(r.errors.some((e) => /not allowed on host/i.test(e))).toBe(true)
  })

  it('blocks host/repo mismatch', () => {
    const r = validateShipPlan({
      plan: plan({
        host: 'legal',
        repo: 'portal',
        filePath: 'app/us/opt-guide/page.tsx',
        canonicalUrl: 'https://legal.yousafeconsultancy.com/us/opt-guide/',
      }),
      contentType: 'legal_guide',
    })
    expect(r.ok).toBe(false)
    expect(r.errors.some((e) => /Host\/repo mismatch/i.test(e))).toBe(true)
  })

  it('blocks wrong path layout for regional blog', () => {
    const r = validateShipPlan({
      plan: plan({
        host: 'uk',
        repo: 'yousafe-consultancy',
        filePath: 'uk/content/random/not-blog.md',
        canonicalUrl: 'https://uk.yousafeconsultancy.com/random/not-blog/',
      }),
      contentType: 'blog_summary',
    })
    expect(r.ok).toBe(false)
    expect(r.errors.some((e) => /blog/i.test(e))).toBe(true)
  })

  it('allows regional from-country page', () => {
    const r = validateShipPlan({
      plan: plan({
        host: 'usa',
        repo: 'yousafe-consultancy',
        filePath: 'usa/content/from/nigeria.md',
        canonicalUrl: 'https://usa.yousafeconsultancy.com/from/nigeria/',
      }),
      contentType: 'regional_from',
    })
    expect(r.ok).toBe(true)
  })

  it('allows caseworks guide / compare / templates trees (registry alignment)', () => {
    for (const filePath of [
      'app/guide/study-permit-guide/page.tsx',
      'app/compare/au-485-vs-canada-pgwp/page.tsx',
      'app/templates/financial-sponsor-letter-us-f1/page.tsx',
    ]) {
      const r = validateShipPlan({
        plan: plan({
          host: 'legal',
          repo: 'caseworks',
          filePath,
          canonicalUrl: `https://legal.yousafeconsultancy.com/${filePath.replace(/^app\//, '').replace(/\/page\.tsx$/, '')}/`,
        }),
        contentType: 'legal_guide',
      })
      expect(r.ok).toBe(true)
    }
  })

  it('blocks a blog kind on a non-blog legal canonical path', () => {
    const r = validateShipPlan({
      plan: plan({
        host: 'legal',
        repo: 'caseworks',
        filePath: 'app/ca/study-permit-refusal-reapply-2026/page.tsx',
        canonicalUrl: 'https://legal.yousafeconsultancy.com/ca/study-permit-refusal-reapply-2026/',
      }),
      contentType: 'blog_post',
    })
    expect(r.ok).toBe(false)
    expect(r.errors.some((e) => /Blog content on legal must use app\/blog/i.test(e))).toBe(true)
  })

  it('allows apex consultancy blog as landing-page/app/blog/{slug}/page.tsx', () => {
    const r = validateShipPlan({
      plan: plan({
        host: 'apex',
        repo: 'yousafe-consultancy',
        filePath: 'landing-page/app/blog/essay-editing-service/page.tsx',
        canonicalUrl: 'https://yousafeconsultancy.com/blog/essay-editing-service/',
        contentType: 'blog_post',
        intentClass: 'news_summary',
      }),
      contentType: 'blog_post',
    })
    expect(r.ok).toBe(true)
    expect(r.errors).toEqual([])
  })

  it('blocks market gig on legal', () => {
    const r = validateShipPlan({
      plan: plan({
        host: 'legal',
        repo: 'caseworks',
        filePath: 'app/us/hire-attorney/page.tsx',
        canonicalUrl: 'https://legal.yousafeconsultancy.com/us/hire-attorney/',
      }),
      contentType: 'marketplace_gig',
    })
    expect(r.ok).toBe(false)
  })
})

describe('validateRenderedPayload', () => {
  it('rejects caseworks CTAPanel without href', () => {
    const r = validateRenderedPayload({
      plan: plan({
        host: 'legal',
        repo: 'caseworks',
        filePath: 'app/uk/foo/page.tsx',
        canonicalUrl: 'https://legal.yousafeconsultancy.com/uk/foo/',
      }),
      filePath: 'app/uk/foo/page.tsx',
      contentType: 'legal_guide',
      fileContent: `
import { ArticleLayout } from "@/components/article/ArticleLayout";
export const metadata = { title: "x" };
export default function Page() {
  return <ArticleLayout meta={{} as any}><CTAPanel title="x" body="y" /></ArticleLayout>;
}
`,
    })
    expect(r.ok).toBe(false)
    expect(r.errors.some((e) => /CTAPanel|headline|href/i.test(e))).toBe(true)
  })

  it('validates apex blog JSX by BlogDepthSection, not caseworks CTAPanel', () => {
    const filePath = 'landing-page/app/blog/essay-editing-service/page.tsx'
    const r = validateRenderedPayload({
      plan: plan({
        host: 'apex',
        repo: 'yousafe-consultancy',
        filePath,
        canonicalUrl: 'https://yousafeconsultancy.com/blog/essay-editing-service/',
        contentType: 'blog_post',
        intentClass: 'news_summary',
      }),
      filePath,
      contentType: 'blog_post',
      fileContent: `
import type { Metadata } from "next";
import { BlogDepthSection } from "@/components/blog-depth-section";
export const metadata: Metadata = { title: "Essay editing" };
export default function Page() {
  return (
    <article>
      <p className="mt-4">Hire an editor before you file.</p>
      <ul className="mt-4">
        <li>I-20</li>
      </ul>
      <BlogDepthSection />
    </article>
  );
}
`,
    })
    expect(r.errors).toEqual([])
    expect(r.ok).toBe(true)
  })

  it('lets a rendered apex blog page.tsx through assertShipAllowed', () => {
    const filePath = 'landing-page/app/blog/essay-editing-service/page.tsx'
    const owner = plan({
      host: 'apex',
      repo: 'yousafe-consultancy',
      filePath,
      canonicalUrl: 'https://yousafeconsultancy.com/blog/essay-editing-service/',
      contentType: 'blog_post',
      intentClass: 'news_summary',
    })
    const rendered = renderTargetFile({
      plan: owner,
      content: `---
title: Essay Editing Service for F-1 Students
description: How F-1 students use an essay editor before a school or visa file.
---

An editor checks structure, citations, and school-specific prompts.

## What to send
- Form I-20
- Personal statement draft

## FAQ
Should you hire an editor? Only if the school allows outside review.
`,
      title: 'Essay Editing Service for F-1 Students',
      region: 'US',
      contentType: 'blog_post',
      primaryKeyword: 'essay editing service',
      indexable: true,
      canonicalUrl: owner.canonicalUrl,
    })
    expect(() =>
      assertShipAllowed({
        plan: owner,
        contentType: 'blog_post',
        title: 'Essay Editing Service for F-1 Students',
        primaryKeyword: 'essay editing service',
        filePath: rendered.filePath,
        fileContent: rendered.fileContent,
      }),
    ).not.toThrow()
  })

  it('requires markdown front matter for consultancy', () => {
    const r = validateRenderedPayload({
      plan: plan({
        host: 'usa',
        repo: 'yousafe-consultancy',
        filePath: 'usa/content/blog/hello.md',
        canonicalUrl: 'https://usa.yousafeconsultancy.com/blog/hello/',
      }),
      filePath: 'usa/content/blog/hello.md',
      contentType: 'blog_summary',
      fileContent: '# Hello only no front matter\n\n' + 'word '.repeat(100),
    })
    expect(r.ok).toBe(false)
    expect(r.errors.some((e) => /front matter/i.test(e))).toBe(true)
  })
})
