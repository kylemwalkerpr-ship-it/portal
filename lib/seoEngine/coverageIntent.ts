/**
 * Coverage vs distinct search intent.
 *
 * Google's quality systems (helpful content, one-intent-one-URL) require us
 * to treat a *paraphrase of an existing page* as the same owner, and a
 * *different job-to-be-done* as a spoke that deserves its own URL.
 *
 * The old matcher used substring + 70% token overlap, so "express entry
 * canada calculator" was classed as a refresh of "express entry canada".
 * That starves topical authority and fills Discover with jobs already done.
 *
 * Kinds:
 *   exact           same normalized stem
 *   paraphrase      same intent after stripping years/guide filler
 *   section_expand  same intent + audience/geo — add an H2, do NOT ship a sibling
 *   spoke           distinct SERP intent (tool, cost, vs, interview, …)
 *   unrelated       new cluster / pillar
 */
import { normalizePlannerTopic } from './planner'

export type CoverageKind = 'exact' | 'paraphrase' | 'section_expand' | 'spoke' | 'unrelated'

const FILLER = new Set([
  '2024', '2025', '2026', '2027', '2028',
  'guide', 'guides', 'complete', 'updated', 'new', 'official',
  'step', 'steps', 'by', 'the', 'and', 'for', 'in', 'to', 'of', 'a', 'an',
  'your', 'you', 'with', 'from', 'how', 'what', 'is', 'are', 'can',
  'help', 'tips', 'overview', 'explained', 'ultimate', 'full',
  'application', 'apply', 'applying',
  'prep', 'questions', 'answers', 'faqs', 'faq',
  // Agency names are not a distinct SERP job — "express entry canada cic"
  // is the Express Entry pillar, not a new CIC spoke.
  'cic', 'ircc', 'uscis', 'ukvi',
])

/** Tokens that change the SERP job-to-be-done. Extra ones = a spoke, not a refresh. */
const SPOKE_MODIFIERS = new Set([
  'calculator', 'crs', 'tool', 'score',
  'fee', 'fees', 'cost', 'costs', 'price', 'pricing', 'increase', 'charges', 'charge',
  'vs', 'versus', 'compared', 'comparison', 'or',
  'interview', 'appointment', 'biometrics',
  'checklist', 'documents', 'document', 'forms', 'form',
  'timeline', 'processing', 'times', 'duration',
  'eligibility', 'eligible', 'requirements', 'requirement', 'rules', 'restrictions',
  'refusal', 'refused', 'rejected', 'denied', 'reapply',
  'diy', 'attorney', 'lawyer', 'consultant', 'consultants', 'service',
  'editing', 'editor', 'writing', 'writer',
  'salary', 'threshold', 'cap', 'lottery',
  'extension', 'renewal', 'switch', 'change',
])

/** Cost-language variants of the same commercial SERP (fee ≈ price ≈ charges ≈ fee increase). */
const MONEY_MODIFIERS = new Set([
  'fee', 'fees', 'cost', 'costs', 'price', 'pricing', 'charges', 'charge', 'increase',
])

/** Policy-language variants of the same SERP (rules ≈ restrictions ≈ regulations). */
const RULE_MODIFIERS = new Set(['rules', 'restrictions', 'restriction', 'regulations', 'regulation'])

/** Audience / geo extras — cover on the owner with a section, never a thin doorway. */
const AUDIENCE_GEO = new Set([
  'nigerians', 'nigeria', 'indians', 'india', 'filipinos', 'philippines',
  'kenyans', 'kenya', 'pakistan', 'pakistani', 'ghana', 'ghanaians',
  'bangladesh', 'bangladeshi', 'nepal', 'nepali', 'china', 'chinese',
  'students', 'graduates', 'founders', 'nurses', 'doctors',
  'from',
])

function contentTokens(term: string): string[] {
  return normalizePlannerTopic(term)
    .replace(/-/g, '')
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !FILLER.has(t))
}

function isSpokeToken(t: string): boolean {
  return SPOKE_MODIFIERS.has(t)
}

function isAudienceToken(t: string): boolean {
  return AUDIENCE_GEO.has(t)
}

function isMoneyToken(t: string): boolean {
  return MONEY_MODIFIERS.has(t)
}

function isRuleToken(t: string): boolean {
  return RULE_MODIFIERS.has(t)
}

function sameModifierFamily(
  cand: string[],
  own: string[],
  candExtra: string[],
  ownExtra: string[],
  family: (t: string) => boolean,
): boolean {
  if (!cand.some(family) || !own.some(family)) return false
  return candExtra.every(family) && ownExtra.every(family)
}

function sharedCount(candidate: string, owner: string): number {
  const cand = contentTokens(candidate)
  const ownSet = new Set(contentTokens(owner))
  let n = 0
  for (const t of cand) if (ownSet.has(t)) n += 1
  return n
}

/**
 * Classify how a candidate query relates to an already-shipped owner string
 * (primary keyword, title, or slug words).
 */
export function classifyCoverageIntent(candidate: string, owner: string): CoverageKind {
  const candNorm = normalizePlannerTopic(candidate)
  const ownNorm = normalizePlannerTopic(owner)
  if (!candNorm || !ownNorm) return 'unrelated'
  if (candNorm === ownNorm) return 'exact'

  const cand = contentTokens(candidate)
  const own = contentTokens(owner)
  if (cand.length === 0 || own.length === 0) return 'unrelated'

  // A one-token owner ("visa", "rates") is only an owner on exact match —
  // otherwise every visa query would refresh a single page.
  if (own.length < 2) return 'unrelated'

  const candSet = new Set(cand)
  const ownSet = new Set(own)
  let shared = 0
  for (const t of cand) if (ownSet.has(t)) shared += 1
  const union = new Set([...cand, ...own]).size
  const jaccard = shared / Math.max(1, union)

  const candExtra = cand.filter((t) => !ownSet.has(t))
  const ownExtra = own.filter((t) => !candSet.has(t))

  const extrasAreFiller = candExtra.length === 0 && ownExtra.length === 0
  if (extrasAreFiller) return 'paraphrase'

  // Fee / price / charges / fee-increase are one commercial SERP. A second
  // URL here is a doorway, not a spoke. Same for rules ≈ restrictions.
  const candMoney = cand.filter(isMoneyToken)
  const ownMoney = own.filter(isMoneyToken)
  if (shared >= 2 && candMoney.length > 0 && ownMoney.length > 0) {
    const candRest = candExtra.filter((t) => !isMoneyToken(t))
    const ownRest = ownExtra.filter((t) => !isMoneyToken(t))
    if (candRest.length === 0 && ownRest.length === 0) return 'paraphrase'
  }
  if (shared >= 2 && sameModifierFamily(cand, own, candExtra, ownExtra, isRuleToken)) return 'paraphrase'

  const candSpokes = candExtra.filter(isSpokeToken)
  const ownSpokes = ownExtra.filter(isSpokeToken)
  const candAudience = candExtra.filter(isAudienceToken)
  const ownAudience = ownExtra.filter(isAudienceToken)
  const candOther = candExtra.filter((t) => !isSpokeToken(t) && !isAudienceToken(t))
  const ownOther = ownExtra.filter((t) => !isSpokeToken(t) && !isAudienceToken(t))

  // Shared entity + a modifier the CANDIDATE has that the owner does not →
  // distinct SERP intent (calculator / fee / vs). If the owner is narrower
  // (owner has extra spoke tokens, candidate does not) this is the parent
  // pillar, not a spoke under the narrower page.
  if (shared >= 2 && candSpokes.length > 0 && candSpokes.join() !== ownSpokes.join()) {
    return 'spoke'
  }

  // Same entity, only audience/geo differs → expand the owner, don't doorway.
  if (shared >= 2 && candOther.length === 0 && ownOther.length === 0 && candSpokes.length === 0 && ownSpokes.length === 0
    && (candAudience.length > 0 || ownAudience.length > 0)) {
    return 'section_expand'
  }

  // High overlap, leftover tokens are weak (prep/questions/help) → paraphrase.
  if (jaccard >= 0.72 && candSpokes.length === 0 && ownSpokes.length === 0) return 'paraphrase'
  if (shared >= Math.min(cand.length, own.length) && candSpokes.length === 0 && ownSpokes.length === 0 && jaccard >= 0.55) {
    return 'paraphrase'
  }

  return 'unrelated'
}

export function isSameIntentOwner(kind: CoverageKind): boolean {
  return kind === 'exact' || kind === 'paraphrase'
}

/** Best owner among shipped strings for this candidate, if any. */
export function bestOwnerMatch(
  candidate: string,
  owners: Iterable<string>,
): { owner: string; kind: CoverageKind } | null {
  let best: { owner: string; kind: CoverageKind; rank: number; shared: number; lengthGap: number; ownerLen: number } | null = null
  const rankOf = (k: CoverageKind): number =>
    k === 'exact' ? 0 : k === 'paraphrase' ? 1 : k === 'section_expand' ? 2 : k === 'spoke' ? 3 : 9
  const candLen = contentTokens(candidate).length
  for (const owner of owners) {
    const kind = classifyCoverageIntent(candidate, owner)
    const rank = rankOf(kind)
    if (rank >= 9) continue
    const shared = sharedCount(candidate, owner)
    const ownerLen = contentTokens(owner).length
    const lengthGap = Math.abs(candLen - ownerLen)
    const better =
      !best
      || rank < best.rank
      || (rank === best.rank && shared > best.shared)
      || (rank === best.rank && shared === best.shared && (
        // Spokes attach to the parent pillar (shorter owner), not a sibling tool.
        rank === 3 ? ownerLen < best.ownerLen : lengthGap < best.lengthGap
      ))
    if (better) best = { owner, kind, rank, shared, lengthGap, ownerLen }
  }
  return best ? { owner: best.owner, kind: best.kind } : null
}
