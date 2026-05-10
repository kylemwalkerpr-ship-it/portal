const LEGAL_FEED_URL =
  process.env.LEGAL_ARTICLES_FEED_URL || 'https://legal.yousafeconsultancy.com/api/articles/feed'

const FALLBACK_ARTICLES = [
  {
    path: '/ca/study-permit-document-checklist',
    title: 'Canada study permit document checklist',
    description:
      'A practical checklist for LOA, PAL/TAL, proof of funds, GIC, tuition, ties, study plan, medicals, biometrics, and refusal risks.',
    region: 'CA',
    cluster: 'Canadian immigration',
    url: 'https://legal.yousafeconsultancy.com/ca/study-permit-document-checklist',
  },
  {
    path: '/ca/pgwp-document-checklist',
    title: 'Canada PGWP document checklist',
    description:
      'Documents, timing, eligibility checks, common pitfalls, and next-step review options for post-graduation work permit planning.',
    region: 'CA',
    cluster: 'Canadian immigration',
    url: 'https://legal.yousafeconsultancy.com/ca/pgwp-document-checklist',
  },
  {
    path: '/uk/immigration/uk-spouse-visa-document-checklist-2026',
    title: 'UK spouse visa document checklist (2026)',
    description:
      'Relationship, finance, English, and accommodation evidence under Appendix FM and FM-SE, including bank statement timing rules.',
    region: 'UK',
    cluster: 'Family and permanent residence',
    url: 'https://legal.yousafeconsultancy.com/uk/immigration/uk-spouse-visa-document-checklist-2026',
  },
  {
    path: '/uk/tenancy/renters-rights-act-2025-international-students',
    title: "UK Renters' Rights Act 2025: a guide for international students",
    description:
      'What changed for international students renting in the UK, including possession grounds, periodic tenancies, rent rules, and existing contracts.',
    region: 'UK',
    cluster: 'Tenancy and housing',
    url: 'https://legal.yousafeconsultancy.com/uk/tenancy/renters-rights-act-2025-international-students',
  },
  {
    path: '/us/student-visas/f1-visa-rights-international-student-complete-guide',
    title: "F-1 visa rights: the international student's complete guide",
    description:
      'A guide to maintaining F-1 status, CPT, OPT, STEM OPT, travel, and practical steps when student status problems appear.',
    region: 'US',
    cluster: 'International students',
    url: 'https://legal.yousafeconsultancy.com/us/student-visas/f1-visa-rights-international-student-complete-guide',
  },
]

function cleanLimit(value: string | null) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 6
  return Math.min(Math.max(Math.floor(parsed), 1), 12)
}

function buildFeedUrl(request: Request) {
  const requestUrl = new URL(request.url)
  const feedUrl = new URL(LEGAL_FEED_URL)
  const region = requestUrl.searchParams.get('region')

  if (region) feedUrl.searchParams.set('region', region)

  return feedUrl
}

function shapeArticles(payload: unknown, request: Request) {
  const requestUrl = new URL(request.url)
  const limit = cleanLimit(requestUrl.searchParams.get('limit'))
  const region = requestUrl.searchParams.get('region')?.toUpperCase()
  const articles = Array.isArray((payload as { articles?: unknown[] })?.articles)
    ? (payload as { articles: unknown[] }).articles
    : []

  return articles
    .filter((article) => {
      if (!region) return true
      return String((article as { region?: string })?.region || '').toUpperCase() === region
    })
    .slice(0, limit)
}

export async function GET(request: Request) {
  const feedUrl = buildFeedUrl(request)

  try {
    const response = await fetch(feedUrl, {
      next: { revalidate: 3600 },
      headers: { Accept: 'application/json' },
    })

    if (!response.ok) throw new Error(`Legal feed returned ${response.status}`)

    const payload = await response.json()
    const articles = shapeArticles(payload, request)

    return Response.json(
      {
        source: payload?.source || feedUrl.origin,
        fallback: false,
        articles,
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=3600',
        },
      },
    )
  } catch (error) {
    const requestUrl = new URL(request.url)
    const limit = cleanLimit(requestUrl.searchParams.get('limit'))
    const region = requestUrl.searchParams.get('region')?.toUpperCase()
    const fallbackArticles = region
      ? FALLBACK_ARTICLES.filter((article) => article.region === region)
      : FALLBACK_ARTICLES

    return Response.json(
      {
        source: 'portal-fallback',
        fallback: true,
        articles: fallbackArticles.slice(0, limit),
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=1800',
        },
      },
    )
  }
}
