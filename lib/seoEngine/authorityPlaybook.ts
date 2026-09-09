/**
 * Authority + conversion playbook — the ranking brain for Discover.
 *
 * Encodes Google-quality, people-first SEO (Helpful Content, one-intent-one-URL,
 * YMYL E-E-A-T) together with a conversion funnel that never uses doorway
 * pages, keyword stuffing, or a CTA as the H1.
 *
 * Cadence (docs/CONTENT_STUDIO_PORTABLE_SEO_PLAYBOOK.md):
 *   1. Protect clusters (cannibal)
 *   2. Harvest impressions already earned (pos 4–20, high imp, low CTR)
 *   3. Fill distinct-intent spokes on money topics (MOFU/BOFU)
 *   4. Fill missing pillars (lifecycle × country)
 *   5. Expand owner sections (geo/audience) — no thin siblings
 *   6. YMYL freshness on live owners
 *   7. Hide housekeeping refreshes of work already shipped
 */
import { classifyCoverageIntent, isSameIntentOwner, type CoverageKind } from './coverageIntent'
import { isFunnelStage } from './scoring'

export type FunnelStage = 'tofu' | 'mofu' | 'bofu'
export type PlaybookMove =
  | 'protect_cluster'
  | 'harvest_impressions'
  | 'fill_spoke'
  | 'fill_pillar'
  | 'expand_section'
  | 'ymyl_freshness'
  | 'housekeeping'

export const PLAYBOOK_MOVE_LABEL: Record<PlaybookMove, string> = {
  protect_cluster: 'Protect cluster',
  harvest_impressions: 'Harvest CTR',
  fill_spoke: 'Fill spoke',
  fill_pillar: 'Fill pillar',
  expand_section: 'Expand owner',
  ymyl_freshness: 'YMYL freshness',
  housekeeping: 'Already shipped',
}

export interface PlaybookInput {
  topic: string
  play?: string
  category?: string
  impressions?: number
  clicks?: number
  ctr?: number
  position?: number | null
  intent?: string
  stage?: string
  coverageKind?: CoverageKind
  valueScore?: number
  opportunityScore?: number
}

export interface PlaybookVerdict {
  move: PlaybookMove
  funnel: FunnelStage
  deskScore: number
  hideByDefault: boolean
  qualityLine: string
  conversionLine: string
  whyLine: string
}

const BOFU_RE = /\b(hire|lawyer|attorney|consultant|consultants|service|editing|writing|apply for|application help|document kit|file (for|my))\b/i
const MOFU_RE = /\b(requirements?|documents?|checklist|fees?|costs?|price|pricing|timeline|eligibility|vs|versus|compared|calculator|crs|interview|processing)\b/i

export function classifyFunnel(topic: string, intent?: string): FunnelStage {
  const t = String(topic || '')
  const i = String(intent || '')
  if (BOFU_RE.test(t) || /transactional/i.test(i)) return 'bofu'
  if (MOFU_RE.test(t) || /commercial/i.test(i)) return 'mofu'
  return 'tofu'
}

/**
 * Soft marketplace next-step AFTER the query is answered. Never an H1, never
 * a doorway page, never a guaranteed outcome — Google quality first.
 */
export function marketplaceNextStep(topic: string, funnel: FunnelStage): string {
  const t = String(topic || '').toLowerCase()
  if (/\b(spouse|marriage|i-130|i-485|k-1|fiancé|fiance)\b/.test(t)) return 'spouse / family filing-pack review'
  if (/\b(express entry|crs|pgwp)\b/.test(t)) return 'Express Entry profile / document review'
  if (/\b(485|subclass 500|skilled migrant)\b/.test(t)) return 'skilled-visa document kit'
  if (/\b(f-1|opt|cpt|sevis|student visa|study permit)\b/.test(t)) return 'student-route document kit'
  if (/\b(h-1b|skilled worker|work permit|sponsor)\b/.test(t)) return 'work-visa brief review'
  if (/\b(hire|lawyer|attorney)\b/.test(t)) return 'attorney matching on the marketplace'
  if (funnel === 'bofu') return 'filing-pack / specialist review'
  if (funnel === 'mofu') return 'get this reviewed'
  return 'journey-neighbor guide (then marketplace only if supply exists)'
}

function conversionCopy(topic: string, funnel: FunnelStage): string {
  const next = marketplaceNextStep(topic, funnel)
  if (funnel === 'bofu') {
    return `Conversion: answer the query fully, then one ${next} module after the last H2 — never the H1, never a doorway.`
  }
  if (funnel === 'mofu') {
    return `Conversion: comparison/cost/eligibility first; a single “${next}” after the answer.`
  }
  return `Conversion: earn trust with the explainer; link the ${next}, not a sales interstitial.`
}

function isCtrGoldmine(input: PlaybookInput): boolean {
  const pos = Number(input.position) || 99
  const impressions = Number(input.impressions) || 0
  const ctr = Number(input.ctr) || 0
  if (impressions < 40) return false
  if (pos < 4 || pos > 20) return false
  // Expected CTR at #10 is ~3%; below that with real impressions is harvestable.
  return ctr < 0.03 || (impressions >= 80 && (Number(input.clicks) || 0) < impressions * 0.025)
}

function isYmylFreshness(input: PlaybookInput): boolean {
  const stage = String(input.stage || '')
  const topic = String(input.topic || '')
  const ymyl = isFunnelStage(stage) || /\b(visa|permit|green card|citizenship|sponsorship|opt|sevis|ircc|uscis|ukvi|express entry|immigration|permanent residence|crs|skilled)\b/i.test(topic)
  const impressions = Number(input.impressions) || 0
  return ymyl && impressions >= 120 && isSameIntentOwner(input.coverageKind || 'paraphrase')
}

export function verdictFor(input: PlaybookInput): PlaybookVerdict {
  const funnel = classifyFunnel(input.topic, input.intent)
  const play = String(input.play || input.category || '')
  const kind = input.coverageKind
  const base = Math.max(0, Number(input.valueScore ?? input.opportunityScore) || 0)
  const impressions = Number(input.impressions) || 0
  const conversionLine = conversionCopy(input.topic, funnel)

  const qualityPeopleFirst =
    'People-first: one URL per intent, official sources on YMYL claims, no doorway or sibling page.'

  if (play === 'cannibalization' || play === 'cannibal') {
    return {
      move: 'protect_cluster',
      funnel,
      deskScore: Math.max(88, Math.min(100, 90 + Math.round(base * 0.05))),
      hideByDefault: false,
      qualityLine: 'Two URLs fighting one intent dilutes PageRank and trips helpful-content systems. Merge to one owner.',
      conversionLine,
      whyLine: 'Protect the cluster — consolidate before creating anything new.',
    }
  }

  if (isCtrGoldmine(input)) {
    return {
      move: 'harvest_impressions',
      funnel,
      deskScore: Math.max(82, Math.min(100, 84 + Math.round(Math.log10((impressions || 40) + 1) * 6))),
      hideByDefault: false,
      qualityLine: 'Rewrite title/meta/H1 on the existing owner. Improving the snippet is guideline-safe; cloaking is not.',
      conversionLine,
      whyLine: 'Harvest impressions already earned — position 4–20 with a CTR gap is the fastest conversion lift.',
    }
  }

  if (kind === 'spoke') {
    const bofuBoost = funnel === 'bofu' ? 12 : funnel === 'mofu' ? 8 : 0
    return {
      move: 'fill_spoke',
      funnel,
      deskScore: Math.max(70, Math.min(96, 72 + bofuBoost + Math.round(base * 0.15))),
      hideByDefault: false,
      qualityLine: qualityPeopleFirst,
      conversionLine,
      whyLine: 'Distinct search intent — a spoke under the pillar, not a refresh of the parent.',
    }
  }

  if (kind === 'section_expand') {
    return {
      move: 'expand_section',
      funnel,
      deskScore: Math.max(48, Math.min(72, 52 + Math.round(base * 0.1))),
      hideByDefault: false,
      qualityLine: 'Add an H2 on the live owner. A geo/audience sibling would be a thin doorway.',
      conversionLine,
      whyLine: 'Expand the owner with a section — do not ship another URL.',
    }
  }

  // Strategy-corpus / deep-tail TOFU with no real demand is not a ranking bet.
  // Keep BOFU/MOFU (hire, fees, vs) even at low impressions — those convert.
  // Zero impressions is the live knowledge-corpus case (engine zeros synthetic rows).
  const thinTofu = play === 'content_gap' && impressions < 20 && funnel === 'tofu'
  if (thinTofu) {
    return {
      move: 'housekeeping',
      funnel,
      deskScore: Math.min(16, Math.max(4, Math.round(base * 0.2))),
      hideByDefault: true,
      qualityLine: qualityPeopleFirst,
      conversionLine,
      whyLine: 'No real demand evidence — not a ranking or conversion bet.',
    }
  }

  if (play === 'content_gap' || play === 'gap' || play === 'quick_win') {
    const bofuBoost = funnel === 'bofu' ? 10 : funnel === 'mofu' ? 6 : 0
    return {
      move: 'fill_pillar',
      funnel,
      deskScore: Math.max(68, Math.min(94, 70 + bofuBoost + Math.round(base * 0.12))),
      hideByDefault: false,
      qualityLine: qualityPeopleFirst,
      conversionLine,
      whyLine: play === 'quick_win'
        ? 'Strike-distance — expand the owner until it owns page one.'
        : 'Missing cluster — a new pillar the estate does not yet own.',
    }
  }

  if (isYmylFreshness(input)) {
    return {
      move: 'ymyl_freshness',
      funnel,
      deskScore: Math.max(54, Math.min(74, 56 + Math.round(base * 0.08))),
      hideByDefault: false,
      qualityLine: 'YMYL freshness: dates, statutes, and fees go stale. Cite the live official page; no outcome guarantees.',
      conversionLine,
      whyLine: 'Refresh the live owner — claims on this topic expire.',
    }
  }

  // Housekeeping refresh of an already-tackled paraphrase.
  return {
    move: 'housekeeping',
    funnel,
    deskScore: Math.min(22, Math.max(6, Math.round(base * 0.25))),
    hideByDefault: true,
    qualityLine: 'Already shipped. Re-opening it as a job would duplicate intent and waste crawl budget.',
    conversionLine,
    whyLine: 'Already on the estate — hidden unless you show shipped work.',
  }
}

export function coverageKindFromPlay(play: string | undefined, topic: string, ownerHints: string[] = []): CoverageKind | undefined {
  if (!play) return undefined
  if (play === 'content_gap' || play === 'gap') {
    for (const owner of ownerHints) {
      const kind = classifyCoverageIntent(topic, owner)
      if (kind === 'spoke' || kind === 'section_expand') return kind
    }
    return 'unrelated'
  }
  if (play === 'refresh' || play === 'defend') {
    for (const owner of ownerHints) {
      const kind = classifyCoverageIntent(topic, owner)
      if (kind === 'section_expand' || kind === 'spoke') return kind
    }
    return 'paraphrase'
  }
  return undefined
}
