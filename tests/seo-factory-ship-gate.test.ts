/**
 * Estate ship-gate: host ↔ repo ↔ path ↔ content type.
 */
import { validateShipPlan, validateRenderedPayload } from '@/lib/seoFactory/shipGate'
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
