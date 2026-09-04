import { buildTopicGraph, extractEntities, extractHeadings, queryTopicGraph } from '@/lib/seoFactory/topicGraph'

describe('topic graph (Phase 4, local)', () => {
  it('extracts headings and lexicon/proper entities from markdown', () => {
    const md = `# Study Permit\n\n## Canada study permit requirements\n\nIRCC processes a Canada study permit. The Designated Learning Institution list matters.\n`
    expect(extractHeadings(md)).toContain('Canada study permit requirements')
    const ents = extractEntities(md, ['canada study permit'])
    expect(ents.some((e) => /study permit/i.test(e) || /canada study permit/i.test(e))).toBe(true)
  })

  it('builds a queryable graph from a small corpus without network', () => {
    const graph = buildTopicGraph([
      {
        id: '1',
        url: 'https://example.com/permit',
        title: 'Canada Study Permit Guide',
        bodyText: '## Requirements\n\nCanada study permit documents. IRCC checklist. Designated Learning Institution.',
        category: 'legal_guide',
      },
      {
        id: '2',
        url: 'https://example.com/permit-fees',
        title: 'Canada Study Permit Fees',
        bodyText: '## Cost\n\nCanada study permit fees and IRCC processing.',
        category: 'legal_guide',
      },
      {
        id: '3',
        url: 'https://example.com/uk-graduate',
        title: 'UK Graduate Route',
        bodyText: '## Graduate Route\n\nUKVI skilled worker is a different path.',
        category: 'blog_post',
      },
    ], [{ id: 'cl1', label: 'Canada Study Permit', keywords: ['canada study permit', 'study permit documents'] }])
    expect(graph.nodes.some((n) => n.type === 'page')).toBe(true)
    expect(graph.edges.some((e) => e.relationship === 'mentions')).toBe(true)
    const q = queryTopicGraph(graph)
    expect(q.strongTopics.some((t) => t.label === 'legal_guide' && t.pages >= 2)).toBe(true)
    expect(q.linkCandidates.length).toBeGreaterThan(0)
  })
})
