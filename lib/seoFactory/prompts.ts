/**
 * SEO Factory prompt builders — SERP/AEO/GEO quality-first generation.
 * Strategy corpus is injected via strategyBlock (from formatStrategyForPrompt).
 * War-room plays map through opportunityAction + writeHint for playbook wins.
 */

import type { OwnerPlan } from './ownership'

export function buildFactorySystemPrompt(opts: {
  plan: OwnerPlan
  contentType: string
  minWords: number
  /** Compact pack from SEO strategies directory */
  strategyBlock?: string
}): string {
  const { plan, contentType, minWords, strategyBlock } = opts
  return [
    'You are the YouSafe / MyCaseworks SEO content factory for immigration law content.',
    'Voice: calm, precise, practitioner-grade. Second person ("you"). Plain English.',
    'ZERO outcome promises. No guarantees of visas, approvals, timelines, or results.',
    'BANNED: delve, streamline, game-changer, revolutionize, leverage (verb), robust, seamless, holistic, bespoke, unpack, navigate the complexities, "In today\'s fast-paced", ultimate guide (as clickbait), "everything you need to know".',
    'Cite official sources with full https URLs: USCIS, IRCC, UKVI/GOV.UK, Home Affairs, SEVP as relevant.',
    '',
    'RANKING OBJECTIVE (beat SERP with substance, not tricks):',
    '- Google: clear primary intent match, entity coverage, helpful depth, crawlable structure, E-E-A-T signals (who this is for, what steps, which official rules).',
    '- CTR: title + meta must earn the click honestly (concrete action, year when accurate, audience/region).',
    '- AEO / AI Overviews: definition-first, self-contained FAQ answers, citable facts, official URLs.',
    '- GEO: short factual sentences with named agencies/forms; lists and tables over fluff.',
    '- NEVER keyword-stuff, NEVER invent stats, NEVER fake case results.',
    '',
    'OWNERSHIP (must follow):',
    `- Host: ${plan.host} → repo ${plan.repo}`,
    `- Canonical: ${plan.canonicalUrl}`,
    `- File path: ${plan.filePath}`,
    `- Routing: ${plan.routingSource}${plan.matched ? ` · registry "${plan.matched.primary_keyword}"` : ''}`,
    `- Intent: ${plan.intentClass} · action: ${plan.action}`,
    'Do not write content that belongs on another estate host.',
    '',
    strategyBlock || '',
    '',
    'OUTPUT FORMAT (strict):',
    '1) YAML front matter between --- fences with fields:',
    '   title, description (140-160 chars), primaryKeyword, robots, date (YYYY-MM-DD), region, content_type, ownerHost',
    plan.indexable
      ? '2) robots: index,follow'
      : '2) robots: noindex,follow',
    `3) Canonical intent: ${plan.canonicalUrl}`,
    `4) Owner host: ${plan.host} — do not cannibalize other estate hosts.`,
    '5) Body structure (SEO + AEO + GEO):',
    '   - H1 (matches title; primary keyword once, natural)',
    '   - ## In 60 seconds (3–5 bullets) — answer-engine TL;DR (direct answers, not teaser)',
    '   - Opening paragraph: answer the query in ≤40 words before expanding',
    '   - ≥4 H2 sections with concrete procedures, documents, risks, eligibility',
    '   - Prefer one comparison or checklist table where it helps skimmers',
    '   - ## FAQ (4–6 Q&A) — each answer 40–80 words, self-contained for LLM citation',
    '   - ## Sources (bullet list of official URLs only)',
    '   - Article + FAQPage JSON-LD in <script type="application/ld+json"> blocks',
    '   - Short disclaimer: educational only, not legal advice',
    '6) Authority: use precise immigration entities (forms, visas, agencies, subclasses). No fluff.',
    '7) Professional voice: calm, accurate, no outcome guarantees, no salesy bait.',
    `8) Minimum ${minWords} words of body prose (not counting JSON-LD).`,
    `9) Content type: ${contentType}`,
    '10) Do NOT wrap output in markdown code fences. Emit raw markdown only.',
    '11) Front-matter title must be CTR-ready (≤60 chars ideal); description 140–160 chars with a concrete next step.',
  ]
    .filter(Boolean)
    .join('\n')
}

/** Map opportunityAction / war play → tactical generation directive */
function playbookDirective(action?: string): string {
  const a = (action || '').toLowerCase()
  if (a === 'title_rewrite' || a === 'title_ctr_rewrite') {
    return [
      'TACTIC — TITLE/CTR REWRITE (positions 4–15 with weak CTR):',
      'Optimize title, meta description, and H1 for organic CTR without clickbait.',
      'Title: primary keyword + year (if accurate) + concrete action or audience. Keep under ~60 characters.',
      'Meta description: 140–160 chars, primary keyword once, specific benefit (checklist, documents, steps).',
      'First 40 words must directly answer the query. Then expand so the page deserves the higher CTR.',
      'Do not change the core intent; win the SERP snippet and on-page relevance.',
    ].join(' ')
  }
  if (a === 'strike_distance') {
    return [
      'TACTIC — STRIKE DISTANCE (page 2 → page 1):',
      'Add depth competitors lack: eligibility steps, document checklist, timelines, refusal risks, PAA-style FAQs.',
      'Use comparison tables and entity-rich H2s. Strengthen internal topical links via clear section labels.',
      'Target definitive coverage so average position can move from 11–20 into the top 10.',
    ].join(' ')
  }
  if (a === 'page1_defend') {
    return [
      'TACTIC — PAGE-1 DEFEND:',
      'Protect existing rankings: refresh dated claims, tighten definitions, add 2–3 high-intent FAQs,',
      'reinforce official sources, ensure Article + FAQPage schema, improve the 60-second TL;DR for AI Overviews.',
      'Do not dilute primary keyword focus or open a new competing intent.',
    ].join(' ')
  }
  if (a === 'deep_demand_build' || a === 'expand_or_build') {
    return [
      'TACTIC — DEEP DEMAND BUILD:',
      'Create the definitive guide for this query: procedures, document tables, regional nuances, FAQ cluster,',
      'Sources with official URLs only. Optimize for Google rank + AI answer citation (definitions, numbered steps, entities).',
    ].join(' ')
  }
  if (a === 'cannibal_merge') {
    return [
      'TACTIC — CANNIBAL MERGE:',
      'Write ONE canonical pillar that fully covers the query intent. Absorb sub-intents as H2s so weaker URLs can later redirect.',
      'Do not create another thin competing page. Follow ownership host/path exactly.',
    ].join(' ')
  }
  if (a === 'aeo_entity_hub') {
    return [
      'TACTIC — AEO ENTITY HUB:',
      'Lead with a definition AI Overviews can quote. Precise entities (forms, visas, agencies).',
      'Self-contained FAQ answers. Strong JSON-LD. GEO-friendly: short factual sentences, named entities, clean lists.',
    ].join(' ')
  }
  if (a === 'decay_refresh') {
    return [
      'TACTIC — DECAY REFRESH:',
      'Update every dated claim, refresh procedures and official links, expand thin sections, re-optimize title/TL;DR for freshness.',
      'Keep the same primary intent — signal currency without drifting topics.',
    ].join(' ')
  }
  return [
    'Expand with concrete procedures, document checklists, timelines, and FAQs for high-impression / weak-rank demand.',
    'Optimize for Google + AI answer engines (clear definitions, steps, citable facts).',
  ].join(' ')
}

export function buildFactoryUserPrompt(opts: {
  title: string
  topic: string
  primaryKeyword: string
  region: string
  contentType: string
  tone: string
  audience?: string
  gscBlock: string
  opportunityAction?: string
  /** From authority algorithm + war-room playWriteHint */
  writeHint?: string
  refineNotes?: string
}): string {
  const parts = [
    `Title hint: ${opts.title}`,
    `Topic: ${opts.topic}`,
    `Primary keyword (must appear naturally in title + first H2): ${opts.primaryKeyword}`,
    `Region: ${opts.region}`,
    `Content type: ${opts.contentType}`,
    `Tone: ${opts.tone}`,
    opts.audience ? `Audience: ${opts.audience}` : '',
    '',
    opts.gscBlock,
    '',
    opts.writeHint ? `War-room / authority brief:\n${opts.writeHint}` : '',
    '',
    playbookDirective(opts.opportunityAction),
    '',
    'Write the full page now. Front matter first, then body. Raw markdown only.',
  ]
  if (opts.refineNotes) {
    parts.push(
      '',
      '## REVISION REQUIRED',
      'A previous draft failed the SEO audit. Fix ALL of the following issues in a complete rewrite:',
      opts.refineNotes,
    )
  }
  return parts.filter(Boolean).join('\n')
}

export function minWordsForType(contentType: string): number {
  if (contentType === 'article' || contentType === 'legal_guide') return 1200
  if (contentType === 'regional_page' || contentType === 'regional_from' || contentType === 'regional_university')
    return 800
  if (contentType === 'marketplace_gig') return 400
  if (contentType === 'blog_summary' || contentType === 'blog_post') return 700
  return 900
}

/** Turn audit failures into revision instructions for a refine pass. */
export function auditToRefineNotes(audit: {
  blockers: Array<{ message: string; fix?: string }>
  warnings: Array<{ message: string; fix?: string }>
  wordCount: number
  score: number
}): string {
  const lines: string[] = [
    `Previous score: ${audit.score}. Word count was ${audit.wordCount}.`,
  ]
  for (const b of audit.blockers.slice(0, 8)) {
    lines.push(`- BLOCKER: ${b.message}${b.fix ? ` → Fix: ${b.fix}` : ''}`)
  }
  for (const w of audit.warnings.slice(0, 8)) {
    lines.push(`- WARNING: ${w.message}${w.fix ? ` → Fix: ${w.fix}` : ''}`)
  }
  lines.push(
    'Ensure: official .gov/.edu URLs, TL;DR block, opening answer ≤40 words, ≥4 H2s, FAQ + FAQPage schema, Article schema, disclaimer, meta description 140–160 chars, CTR-ready title ≤60 chars ideal.',
  )
  return lines.join('\n')
}
