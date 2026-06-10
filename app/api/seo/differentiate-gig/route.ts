// One-click cannibalization fix.
//
// The SEO Analytics surface now shows a "Differentiate" button next
// to every cannibalized keyword pill. Clicking it POSTs here with:
//   { gigId, cannibalKeyword, siblingGigIds }
//
// We load the clicked gig + each sibling that surfaces the keyword,
// then ask the AI to:
//   1. Decide WHICH gig should OWN the keyword (the one whose body
//      content is most semantically aligned with it).
//   2. Pick a NEW primary keyword from the same cluster for the
//      LOSING (displaced) gig — distinct enough not to re-cannibalize.
//   3. Rewrite the displaced gig's title + SEO title + meta to lead
//      with the new keyword.
//
// The route WRITES NOTHING. It returns the proposal as JSON and the
// client commits via PATCH /api/gigs/<displacedGigId>. That keeps the
// trust boundary identical to the rest of the SEO modal.
//
// Auth: owner-or-admin — must own ALL siblings + the clicked gig.

import { ok, fail } from '@/lib/apiEnvelope'
import { requirePortalUser } from '@/lib/portalAuth'
import { getChatProvider } from '@/lib/chatProvider'
// Heavy static keyword data (~1.5k lines) is lazy-loaded inside the handler
// so its evaluation cost stays off the worker cold-start path.
import type { Cluster, StrategicKeyword } from '@/lib/seoKnowledgeBase'

interface GigSnapshotRow {
  id: string
  title: string | null
  pitch: string | null
  description: string | null
  tags: string[] | null
  category: string | null
  subcategory: string | null
  jurisdiction: string | null
  seo_title: string | null
  seo_description: string | null
  provider_id: string
  provider_type: string | null
}

export async function POST(req: Request) {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  if (!['attorney', 'consultant', 'admin'].includes(auth.role)) return fail('Forbidden.', 403)

  const body = await req.json().catch(() => ({}))
  const gigId = String(body.gigId || '')
  const cannibalKeyword = String(body.cannibalKeyword || '').trim().slice(0, 200)
  const siblingGigIds = Array.isArray(body.siblingGigIds)
    ? (body.siblingGigIds as unknown[]).filter((v): v is string => typeof v === 'string' && !!v).slice(0, 8)
    : []
  if (!gigId) return fail('Missing gigId.', 400)
  if (!cannibalKeyword) return fail('Missing cannibalKeyword.', 400)
  if (siblingGigIds.length === 0) return fail('siblingGigIds must contain at least one sibling sharing the keyword.', 400)

  // Load the clicked gig.
  const { data: gigRow, error: gigErr } = await auth.db
    .from('gigs')
    .select('id, title, pitch, description, tags, category, subcategory, jurisdiction, seo_title, seo_description, provider_id, provider_type')
    .eq('id', gigId)
    .single()
  if (gigErr || !gigRow) return fail('Gig not found.', 404)
  const gig = gigRow as GigSnapshotRow
  if (gig.provider_id !== auth.profileId && auth.role !== 'admin') return fail('Forbidden.', 403)

  // Load all siblings — must belong to the same provider.
  const { data: sibRows } = await auth.db
    .from('gigs')
    .select('id, title, pitch, description, tags, category, subcategory, jurisdiction, seo_title, seo_description, provider_id, provider_type')
    .in('id', siblingGigIds)
  const siblings: GigSnapshotRow[] = (sibRows ?? []) as GigSnapshotRow[]
  // Self-heal: if no qualifying siblings (e.g. they were deleted, or
  // belong to a different provider), the cannibalization warning is
  // stale — return a soft signal the UI can hide on.
  const ownedSiblings = siblings.filter((s) =>
    s.id !== gig.id
    && s.provider_id === gig.provider_id
    && (s.provider_type ?? null) === (gig.provider_type ?? null),
  )
  if (ownedSiblings.length === 0) {
    return ok({
      ownerGigId: gig.id,
      displacedGigId: null,
      newTitle: null,
      newSeoTitle: null,
      newSeoDescription: null,
      newPrimaryKeyword: null,
      rationale: 'No sibling gigs found that share this keyword. The cannibalization warning is stale — refresh the audit.',
      stale: true,
    })
  }

  // Resolve the role + primary cluster for the keyword bank. We need
  // these to suggest a new primary keyword from the same cluster.
  const role: 'attorney' | 'consultant' =
    gig.provider_type === 'consultant' ? 'consultant'
    : gig.provider_type === 'attorney' ? 'attorney'
    : auth.role === 'consultant' ? 'consultant' : 'attorney'

  const cat = String(gig.category || '').trim().toLowerCase()
  const sub = String(gig.subcategory || '').trim().toLowerCase()
  const jx = (String(gig.jurisdiction || '').trim().toLowerCase() as '' | 'us' | 'uk' | 'ca' | 'au')
  const isValidJx = jx === 'us' || jx === 'uk' || jx === 'ca' || jx === 'au'

  // Identify the cluster the cannibalized keyword belongs to so we can
  // pull alternative primaries from the SAME cluster — different enough
  // not to re-cannibalize but topically aligned.
  const { STRATEGIC_KEYWORDS, getStrategicKeywordsForGig } = await import('@/lib/seoKnowledgeBase')
  const matchedClusterKw = STRATEGIC_KEYWORDS.find((k) => k.term.toLowerCase() === cannibalKeyword.toLowerCase())
  const primaryCluster: Cluster | null = matchedClusterKw?.cluster
    ?? (isValidJx && cat
      ? (getStrategicKeywordsForGig({ category: cat, subcategory: sub, jurisdiction: jx, role })[0]?.cluster as Cluster | undefined) ?? null
      : null)

  const candidatePool: StrategicKeyword[] = primaryCluster
    ? STRATEGIC_KEYWORDS.filter((k) =>
        k.cluster === primaryCluster
        && k.term.toLowerCase() !== cannibalKeyword.toLowerCase(),
      ).slice(0, 14)
    : []

  // Filter out candidates that ALREADY appear in any of the gigs in
  // play (this gig + siblings) — we don't want to swap one
  // cannibalization for another.
  const allGigsText = [gig, ...ownedSiblings]
    .map((g) => `${g.title ?? ''} ${g.seo_title ?? ''} ${g.description ?? ''}`)
    .join(' \n ')
    .toLowerCase()
  const safeCandidates = candidatePool.filter((k) => !allGigsText.includes(k.term.toLowerCase()))
  // Always offer SOME candidates — when the cluster bag is exhausted,
  // fall back to the cluster bag without the "not in any gig" filter.
  const offered = (safeCandidates.length > 0 ? safeCandidates : candidatePool).slice(0, 8)

  const provider = getChatProvider()
  if (!provider) {
    return fail('AI assistant is not configured. Add GROQ_API_KEY, GEMINI_API_KEY, or Cloudflare AI creds.', 503)
  }

  const system = [
    'You are an SEO strategist resolving keyword cannibalization between two gigs from the same seller on a services marketplace.',
    'Decide which gig should OWN the contested keyword based on semantic alignment with the gig body content — not based on title length, age, or seller preference.',
    'For the LOSING gig, pick a NEW primary keyword from the supplied candidate pool that is distinct enough not to re-compete.',
    'Rewrite the displaced gig\'s title (55-75 chars), seo_title (50-60 chars, primary keyword in first 30 chars), and seo_description (140-155 chars, primary keyword in first 60 chars, soft CTA).',
    'You may NOT invent credentials, prices, jurisdictions, or services that aren\'t already in the gig body.',
    'Return STRICT JSON ONLY — no markdown, no preamble, no commentary outside the JSON envelope.',
  ].join(' ')

  const gigBlock = (g: GigSnapshotRow): string => [
    `### Gig ${g.id}`,
    `- title: ${g.title ?? ''}`,
    `- seo_title: ${g.seo_title ?? ''}`,
    `- seo_description: ${g.seo_description ?? ''}`,
    `- pitch: ${g.pitch ?? ''}`,
    `- description (first 600 chars): ${(g.description ?? '').slice(0, 600)}`,
    `- tags: ${Array.isArray(g.tags) ? g.tags.join(', ') : ''}`,
    `- jurisdiction: ${g.jurisdiction ?? ''} / category: ${g.category ?? ''} / sub: ${g.subcategory ?? ''}`,
  ].join('\n')

  const user = [
    `## Contested keyword`,
    `"${cannibalKeyword}"`,
    primaryCluster ? `(cluster: ${primaryCluster})` : '',
    '',
    `## Gig the seller clicked from`,
    gigBlock(gig),
    '',
    `## Sibling gigs that also surface this keyword`,
    ...ownedSiblings.map(gigBlock),
    '',
    `## Candidate replacement primary keywords from the same cluster`,
    offered.length > 0
      ? offered.map((k) => `- "${k.term}" (intent: ${k.intent})`).join('\n')
      : '(no clean cluster candidates — propose a precise long-tail variant that does not appear in any of the gigs above)',
    '',
    `## Output format`,
    'Return STRICT JSON ONLY with this shape (no markdown, no fence):',
    '{',
    '  "ownerGigId": "<id of the gig that should KEEP the contested keyword>",',
    '  "displacedGigId": "<id of the gig that should DROP the contested keyword>",',
    '  "newPrimaryKeyword": "<the replacement keyword for the displaced gig>",',
    '  "newTitle": "<55-75 chars, leads with the new primary keyword>",',
    '  "newSeoTitle": "<50-60 chars, new primary in first 30 chars>",',
    '  "newSeoDescription": "<140-155 chars, new primary in first 60 chars, soft CTA>",',
    '  "rationale": "<one-sentence reason the owner gig is the better semantic fit>"',
    '}',
    `Pick the displacedGigId from this set: ${[gig.id, ...ownedSiblings.map((s) => s.id)].join(', ')}.`,
  ].filter(Boolean).join('\n')

  let raw: string
  try {
    raw = await provider.reply(system, [{ role: 'user', content: user }], { maxOutputTokens: 1400 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return fail(`AI differentiation failed: ${msg}`, 502)
  }

  // Reuse the same fence-tolerant parser as coherentFix.
  const parsed = parseJsonish(raw)
  if (!parsed || typeof parsed !== 'object') {
    return fail('Model returned malformed JSON. Try Re-roll.', 502)
  }
  const obj = parsed as Record<string, unknown>
  const ownerGigId = typeof obj.ownerGigId === 'string' ? obj.ownerGigId : ''
  const displacedGigId = typeof obj.displacedGigId === 'string' ? obj.displacedGigId : ''
  const allIds = new Set<string>([gig.id, ...ownedSiblings.map((s) => s.id)])
  if (!allIds.has(ownerGigId) || !allIds.has(displacedGigId) || ownerGigId === displacedGigId) {
    return fail('Model returned invalid owner/displaced ids.', 502)
  }
  const newPrimaryKeyword = typeof obj.newPrimaryKeyword === 'string' ? obj.newPrimaryKeyword.trim().slice(0, 200) : ''
  const newTitle = typeof obj.newTitle === 'string' ? obj.newTitle.trim().slice(0, 120) : ''
  const newSeoTitle = typeof obj.newSeoTitle === 'string' ? obj.newSeoTitle.trim().slice(0, 70) : ''
  const newSeoDescription = typeof obj.newSeoDescription === 'string' ? obj.newSeoDescription.trim().slice(0, 200) : ''
  const rationale = typeof obj.rationale === 'string' ? obj.rationale.trim().slice(0, 320) : ''
  if (!newPrimaryKeyword || !newTitle || !newSeoTitle || !newSeoDescription) {
    return fail('Model response missing required fields.', 502)
  }

  // Surface the displaced gig's BEFORE values so the client can render
  // a diff alongside the proposed rewrite.
  const displacedBefore = displacedGigId === gig.id
    ? gig
    : (ownedSiblings.find((s) => s.id === displacedGigId) ?? null)

  return ok({
    ownerGigId,
    displacedGigId,
    newPrimaryKeyword,
    newTitle,
    newSeoTitle,
    newSeoDescription,
    rationale,
    contestedKeyword: cannibalKeyword,
    cluster: primaryCluster,
    displacedBefore: displacedBefore ? {
      id: displacedBefore.id,
      title: displacedBefore.title,
      seo_title: displacedBefore.seo_title,
      seo_description: displacedBefore.seo_description,
    } : null,
  })
}

function parseJsonish(raw: string): unknown {
  let s = raw.trim()
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  const firstBrace = s.indexOf('{')
  if (firstBrace > 0) s = s.slice(firstBrace)
  const lastBrace = s.lastIndexOf('}')
  if (lastBrace >= 0 && lastBrace < s.length - 1) s = s.slice(0, lastBrace + 1)
  try { return JSON.parse(s) } catch { return null }
}
