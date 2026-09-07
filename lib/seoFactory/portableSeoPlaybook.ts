/**
 * Content Studio — Portable SEO Playbook.
 *
 * SSOT: docs/CONTENT_STUDIO_PORTABLE_SEO_PLAYBOOK.md
 *
 * The playbook is a YouSafe-native adaptation of Sarvesh Shrivastava's ChatGPT
 * Astra local-SEO prompt pack. This module turns the human markdown into the
 * structured weeks / prompts the studio can actually run against:
 *
 *   · PORTABLE_WEEKS  — 6 sprint weeks (focus · done-when · stages · signals)
 *   · PORTABLE_PROMPTS — P0–P12 paste-ready prompt pack
 *   · buildPortablePlaybookPromptBlock — compact Master Engine directive
 *   · getPlaybookManifest — JSON payload for the API + Configure panel
 *
 * Worker-light: the structure lives in TS; the markdown stays the human SSOT.
 * No fs reads at runtime, so this module is safe in the Cloudflare Worker and
 * in Jest.
 */
import { SPECIALIST_ROLES, type SpecialistRole } from '@/lib/seoFactory/specialistFeeds'

export const PLAYBOOK_ID = 'portable-seo-playbook'
export const PLAYBOOK_VERSION = '2026.09.7'
export const PLAYBOOK_DOCS_PATH = 'docs/CONTENT_STUDIO_PORTABLE_SEO_PLAYBOOK.md'

export interface PortableSeoWeek {
  week: 1 | 2 | 3 | 4 | 5 | 6
  title: string
  /** Content Studio stages this week drives (discover/research/draft/review/approve/track/configure). */
  stages: string[]
  focus: string
  doneWhen: string
  /** Specialist Intel roles to prefer this week (see §5 of the SSOT doc). */
  preferredSignals: SpecialistRole[]
}

export interface PortableSeoPrompt {
  id: string
  title: string
  studioStages: string[]
  body: string
  /** Original Astra prompt this replaces (e.g. "GBP categories"); undefined = YouSafe-native. */
  wasAstra?: string
}

export const PORTABLE_WEEKS: PortableSeoWeek[] = [
  {
    week: 1,
    title: 'Context + competitor patterns',
    stages: ['Discover', 'Research'],
    focus: 'Refresh §1 Studio Business Context and run a competitive pattern pass per cash-cow intent.',
    doneWhen:
      '≤5 queued opportunities with owner URL or "needs owner" flagged; no new siblings without ownership check.',
    preferredSignals: ['competitor_radar', 'policy_desk'],
  },
  {
    week: 2,
    title: 'Page-2 / CTR goldmine',
    stages: ['Discover', 'Draft'],
    focus:
      'From GSC (Studio Discover / GSC Sync): queries at position 4–15 or 11–20, high impressions, low CTR → title/meta rewrite jobs on existing owners only.',
    doneWhen: 'top 10 goldmine rows have either a merged fix or an explicit defer reason.',
    preferredSignals: ['overnight_ops', 'policy_desk'],
  },
  {
    week: 3,
    title: 'On-page owner completeness',
    stages: ['Draft', 'Review'],
    focus:
      'Per priority owner: title/H1/first-100-words carry primary intent, depth vs SERP, FAQ + official citations, estate interlinks.',
    doneWhen: 'shipReady / audit gates green; no leaked markdown; no cannibal clusters opened',
    preferredSignals: ['support_triage', 'overnight_ops'],
  },
  {
    week: 4,
    title: 'Intent × region coverage',
    stages: ['Research', 'Draft', 'Approve'],
    focus:
      'From the ownership registry, build ONLY missing regional owners (usa/uk/ca/au) — never city-farm pages. Brief → Draft → Approve → live verify.',
    doneWhen: 'coverage matrix updated; orphans / duplicate titles = 0 for the batch',
    preferredSignals: ['lead_desk', 'marketplace_scout'],
  },
  {
    week: 5,
    title: 'Demand + support gaps',
    stages: ['Discover'],
    focus:
      'Support Triage patterns → FAQ / clarifying sections on owners; Lead Desk ICP tags → soft CTA / marketplace path only where supply_first allows; Marketplace Scout gaps → Shop SEO.',
    doneWhen: 'each gap is a Studio job or a dismissed signal with reason',
    preferredSignals: ['support_triage', 'marketplace_scout', 'lead_desk'],
  },
  {
    week: 6,
    title: 'Authority + Track',
    stages: ['Approve', 'Track'],
    focus:
      'On Approve, Authority Multiplexer repurpose pack (for approval only), Overnight Ops priorities → next week’s three ranking moves, rescore path-to-100 / Master Engine.',
    doneWhen: 'Track shows deploy green; no broken sitemaps; no orphaned ships',
    preferredSignals: ['authority_multiplexer', 'overnight_ops'],
  },
]

export const PORTABLE_PROMPTS: PortableSeoPrompt[] = [
  {
    id: 'P0',
    title: 'Context lock',
    studioStages: ['Configure'],
    body:
      'Use §1 Studio Business Context. Add: "Reference this for every audit and brief. Never re-ask. Prefer update-on-owner. YMYL honesty."',
  },
  {
    id: 'P1',
    title: 'Competitor pattern table',
    studioStages: ['Discover', 'Research'],
    wasAstra: 'GBP categories',
    body:
      'Using Competitor Radar deltas + these competitor URLs […], build a table for region [US|UK|CA|AU] and cash-cow intents […]: competitor, URL, title angle, overlap with our owner [url or none], recommended action (update-owner | ignore | new-owner-only-if-gap), impact high/med/low. No invented metrics. Cite sources.',
  },
  {
    id: 'P2',
    title: 'Attribute → on-page trust checklist',
    studioStages: ['Draft', 'Review'],
    wasAstra: 'GBP attributes',
    body:
      'Compare our owner [url] vs competitors [urls] for trust/SERP-feature parity: E-E-A-T signals, FAQ, tables, official citations, CTA clarity, freshness. Table: signal | we have | they have | action on our owner. No Map Pack attributes.',
  },
  {
    id: 'P3',
    title: 'Review/support language mining',
    studioStages: ['Discover', 'Research'],
    wasAstra: 'review teardown',
    body:
      'From Support Triage patterns + public competitor FAQ/blog themes (cited), list top phrases customers use for [intent]. Propose FAQ questions for owner [url]. Do not fabricate reviews or star ratings.',
  },
  {
    id: 'P4',
    title: 'Response / FAQ templates',
    studioStages: ['Research', 'Draft'],
    wasAstra: 'review responses',
    body:
      'Draft 3 YMYL-safe FAQ answers for owner [url] that clarify process without guarantees or legal advice. 40–80 words each. Cite official source links to add in Research.',
  },
  {
    id: 'P5',
    title: 'Distribution calendar → Authority Multiplexer',
    studioStages: ['Approve', 'Track'],
    wasAstra: 'GBP posts',
    body:
      'After Approve of [canonical], draft repurpose pack: 5 X posts, 6–8 beat thread, 3 video hooks, 4-para newsletter tease. Soft CTA to owner or market gig only if supply exists. Mark lead hook. Never schedule external sends.',
  },
  {
    id: 'P6',
    title: 'Owner services / scope block',
    studioStages: ['Draft', 'Review'],
    wasAstra: 'GBP services',
    body:
      'Audit owner [url] vs site nav/marketplace categories. List missing scope bullets that belong on this owner (not new URLs). Write 40–60 word scope blurbs, YMYL-safe.',
  },
  {
    id: 'P7',
    title: 'Title / meta / intro variants',
    studioStages: ['Draft', 'Review'],
    wasAstra: 'GBP description',
    body:
      'Write 3 title (<60) + meta (<155) + 100-word intro variants for owner [url]: (A) ranking clarity (B) CTR/conversion (C) trust/E-E-A-T. Include primary keyword naturally; no stuffing; no outcome promises.',
  },
  {
    id: 'P8',
    title: 'Visual / evidence plan',
    studioStages: ['Draft', 'Review'],
    wasAstra: 'photo audit',
    body:
      'For owner [url], list evidence assets to add (official diagrams, process steps, citation screenshots we have rights to — not stock). Skip geotag photo velocity.',
  },
  {
    id: 'P9',
    title: 'Keyword gap (GSC/Ahrefs first)',
    studioStages: ['Discover'],
    body:
      'From Studio GSC + Ahrefs issues for [host], list keywords competitors rank 1–20 where we have no owner or a weak owner. Filter cash-cow intents only. Columns: keyword, volume/difficulty if known else unknown, competitor positions, action Optimize existing | Create owner | Defer. No guesses dressed as data.',
  },
  {
    id: 'P10',
    title: 'Money-page / cannibal pass',
    studioStages: ['Discover', 'Research'],
    body:
      'For hosts […], find pages ranking for the wrong intent or competing with the true owner. Output: query | current URL | correct owner | action (consolidate | retarget | 301 proposal).',
  },
  {
    id: 'P11',
    title: 'Intent × region page brief',
    studioStages: ['Research', 'Draft', 'Approve'],
    body:
      'Missing owner: [intent] × [region]. Produce Studio brief: slug, title, H1, outline H2s, official sources, internal links to existing owners, CTA to market only if supply_first OK. Refuse city-farm variants.',
  },
  {
    id: 'P12',
    title: 'GSC 30-day sprint',
    studioStages: ['Discover', 'Draft'],
    body:
      'From last 90d GSC: page-2 + low-CTR lists. Build 30-day sprint: Week1 titles/H1s, Week2 thin-content expands, Week3 interlinks, Week4 metas. For each item write the exact copy to paste — not instructions.',
  },
]

export const PORTABLE_NON_GOALS = [
  'GBP / Map Pack category & attribute farming',
  'Map Pack photo velocity & geotag schemes',
  'City landing-page factories',
  'Keyword-stuffed "human at 11pm" YMYL copy',
  'Auto-posting to X / unsanctioned outreach',
  'Mixing PAIN into this playbook',
] as const

export function getPortableWeek(week: number): PortableSeoWeek | null {
  return PORTABLE_WEEKS.find((w) => w.week === week) ?? null
}

export function getPortablePrompt(id: string): PortableSeoPrompt | null {
  return PORTABLE_PROMPTS.find((p) => p.id.toUpperCase() === id.toUpperCase()) ?? null
}

/**
 * Compact Master Engine directive. Fail-open and deterministic — the writer
 * must never invent GSC/Ahrefs numbers, must update the existing owner before
 * opening a sibling, and must hold the YMYL line (official sources, no outcome
 * guarantees). No GBP / Map Pack tactics are ever in scope.
 */
export function buildPortablePlaybookPromptBlock(
  opts: {
    week?: number
    intent?: string
    region?: string
  } = {},
): string {
  const lines = [
    `PORTABLE SEO PLAYBOOK v${PLAYBOOK_VERSION} — run this sprint cadence, one intent → one owner:`,
  ]
  const week = opts.week != null ? getPortableWeek(Number(opts.week)) : null
  if (week) {
    lines.push(
      `- This week (${week.week} · ${week.title}): ${week.focus}`,
      `- Done when: ${week.doneWhen}`,
    )
  } else {
    lines.push(
      '- Cadence: week1 context+competitor patterns → week2 page-2/CTR rewrites → week3 on-page completeness → week4 intent×region owners → week5 support/demand gaps → week6 authority repurpose + track.',
    )
  }
  const scopeBits = [
    opts.region ? `region ${opts.region}` : '',
    opts.intent ? `intent ${opts.intent}` : '',
  ].filter(Boolean)
  if (scopeBits.length) lines.push(`- Scope: ${scopeBits.join(' · ')}`)
  lines.push(
    '- Rules: prefer update-on-owner over new siblings; fail-open (never invent GSC/Ahrefs numbers); YMYL — cite official sources, no outcome guarantees; no GBP / Map Pack tactics.',
    '- Ship only through Content Studio Approve gates; no auto-posting, no unsanctioned outreach.',
  )
  return lines.join('\n')
}

export interface PortablePlaybookManifest {
  id: string
  version: string
  docsPath: string
  weeks: PortableSeoWeek[]
  prompts: PortableSeoPrompt[]
  nonGoals: readonly string[]
  specialistRoles: typeof SPECIALIST_ROLES
}

/** JSON-serializable manifest for GET /api/content-studio/portable-playbook + the Configure panel. */
export function getPlaybookManifest(): PortablePlaybookManifest {
  return {
    id: PLAYBOOK_ID,
    version: PLAYBOOK_VERSION,
    docsPath: PLAYBOOK_DOCS_PATH,
    weeks: PORTABLE_WEEKS,
    prompts: PORTABLE_PROMPTS,
    nonGoals: PORTABLE_NON_GOALS,
    specialistRoles: SPECIALIST_ROLES,
  }
}