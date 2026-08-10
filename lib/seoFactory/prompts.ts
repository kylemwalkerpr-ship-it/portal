/**
 * SEO Factory prompt builders — SERP/AEO/GEO quality-first generation.
 * Strategy corpus is injected via strategyBlock (from formatStrategyForPrompt).
 * War-room plays map through opportunityAction + writeHint for playbook wins.
 */

import type { OwnerPlan } from './ownership'
import {
  depthPromptClause,
  minWordsForType as depthMinWords,
  targetWordsForType,
  maxWordsForType as depthMaxWords,
} from './contentDepth'
import { qualityPromptBlock, formattingRequirementsBlock } from './contentQualityGate'

export function buildFactorySystemPrompt(opts: {
  plan: OwnerPlan
  contentType: string
  minWords: number
  maxWords?: number
  /** Compact pack from SEO strategies directory */
  strategyBlock?: string
}): string {
  const { plan, contentType, minWords, strategyBlock } = opts
  const target = targetWordsForType(contentType)
  const maxWords = opts.maxWords ?? depthMaxWords(contentType)
  return [
    'You are the YouSafe / MyCaseworks SEO content factory for immigration law content.',
    'Voice: calm, precise, practitioner-grade. Second person ("you"). Plain English.',
    'ZERO outcome promises. No guarantees of visas, approvals, timelines, or results.',
    'BANNED: delve, streamline, game-changer, revolutionize, leverage (verb), robust, seamless, holistic, bespoke, unpack, navigate the complexities, "In today\'s fast-paced", ultimate guide (as clickbait), "everything you need to know".',
    'Cite official sources with full https URLs: USCIS, IRCC, UKVI/GOV.UK, Home Affairs, SEVP as relevant.',
    '',
    'RANKING OBJECTIVE (beat SERP with substance, not tricks):',
    '- Google Helpful Content: fully satisfy the query — thin stubs will be rejected by our audit and will NOT ship.',
    '- Google: clear primary intent match, entity coverage, helpful depth, crawlable structure, E-E-A-T signals (who this is for, what steps, which official rules).',
    '- CTR: title + meta must earn the click honestly (concrete action, year when accurate, audience/region).',
    '- AEO / AI Overviews: definition-first, self-contained FAQ answers, citable facts, official URLs.',
    '- GEO: short factual sentences with named agencies/forms; lists and tables over fluff.',
    '- NEVER keyword-stuff, NEVER invent stats, NEVER fake case results, NEVER pad with filler to hit word count.',
    '',
    depthPromptClause(contentType),
    '',
    qualityPromptBlock(),
    '',
    formattingRequirementsBlock(),
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
    '   - For guides with 4+ H2 sections: ## Table of contents immediately after the opening,',
    '     as `- [Section](#section-slug)` links where the slug EXACTLY matches each H2',
    '     (lowercase, spaces/punctuation → hyphens). Never emit anchors that differ from',
    '     the headings.',
    '   - ≥4 H2 sections with concrete procedures, documents, risks, eligibility',
    '   - ### only nested under ##, never skip heading levels, never use ####+',
    '   - Wrap long optional reading (fee tables, big checklists, deep FAQ answers) in',
    '     <details><summary>…</summary>…</details> — never inside code fences',
    '   - Plain English (~8th-grade): define legal/technical terms on first use,',
    '     prefer sentences under 20 words, active voice, address the reader as "you"',
    '   - Prefer one comparison or checklist table where it helps skimmers',
    '   - ## FAQ (4–6 Q&A) — each answer 40–80 words, self-contained for LLM citation',
    '   - ## Sources (bullet list of official URLs only)',
    '   - Article + FAQPage JSON-LD in <script type="application/ld+json"> blocks',
    '   - Short disclaimer: educational only, not legal advice',
    '6) Authority: use precise immigration entities (forms, visas, agencies, subclasses). No fluff.',
    '7) Professional voice: calm, accurate, no outcome guarantees, no salesy bait.',
    `8) HARD MINIMUM ${minWords} words of body prose (not counting YAML, JSON-LD, or code fences). Aim for ~${target} words. HARD MAX ${maxWords} words — do NOT exceed or you will be penalized by the SEO audit.`,
    `9) Content type: ${contentType}`,
    '10) Do NOT wrap output in markdown code fences. Emit raw markdown only.',
    '11) Front-matter title must be CTR-ready (≤60 chars ideal); description 140–160 chars with a concrete next step.',
    '12) If you are under the word minimum, keep expanding with real procedures/documents/FAQs until you clear it — short drafts are discarded.',
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

/**
 * Ranking-model guidance threaded into the generation prompt: the model's
 * recommendedActions + 30/60/90 forecast, so every draft is written against
 * the topic's weak signal families instead of generic advice.
 */
export interface ModelGuidanceInput {
  total?: number
  confidence?: number
  recommendedActions?: string[]
  forecast?: {
    points?: Array<{
      horizonDays?: number
      projectedPosition?: number
      projectedImpressions?: number
      projectedClicks?: number
      probabilityOfTop10?: number
    }>
  }
}

/** Render the model guidance as a directive block for the generation prompt. */
export function modelGuidanceBlock(guidance: ModelGuidanceInput): string {
  const actions = Array.isArray(guidance.recommendedActions)
    ? guidance.recommendedActions.map((a) => String(a)).filter(Boolean).slice(0, 6)
    : []
  const points = Array.isArray(guidance.forecast?.points) ? guidance.forecast.points.filter((p) => p && p.projectedPosition != null) : []
  const total = Number(guidance.total) || 0
  const confidence = Number(guidance.confidence) || 0
  const lines: string[] = [
    'RANKING MODEL GUIDANCE — the ranking model scored this exact topic. Write the draft so it closes the model\'s flagged weak families:',
  ]
  // Never fabricate a zero: each fragment renders only when actually present.
  const scoreLine = [
    total > 0 ? `Model total: ${Math.round(total)}/100` : '',
    confidence > 0 ? `confidence ${Math.round(confidence * 100)}%` : '',
  ].filter(Boolean).join(' · ')
  if (scoreLine) lines.push(`- ${scoreLine}`)
  if (actions.length) {
    lines.push('- Model-recommended actions — fold each into the structure, do not just mention it:')
    for (const a of actions) lines.push(`  · ${a}`)
  }
  if (points.length >= 1) {
    const last = points[points.length - 1]
    const mid = points.length >= 2 ? points[Math.floor(points.length / 2)] : null
    const head = points[0]
    const chain = [head, ...(mid && mid !== head && mid !== last ? [mid] : []), last]
      .map((p) => `#${Math.round(Number(p.projectedPosition))}${p.horizonDays ? ` (${p.horizonDays}d)` : ''}`)
      .join(' → ')
    lines.push(`- Model forecast: projected position ${chain}${last.probabilityOfTop10 != null ? ` · top-10 probability ${Math.round(Number(last.probabilityOfTop10) * 100)}% at ${last.horizonDays || 90}d` : ''}`)
  }
  lines.push(
    '- Weak-family rule: model says answer/FAQ/schema → lead with a quotable 60-second answer, self-contained FAQ, Article+FAQPage JSON-LD. Model says E-E-A-T → named author, official .gov citations, YMYL disclaimer. Model says links/interlinks → naturally link the estate hub + pillar. Model says depth → concrete procedures, document checklists, timelines.',
  )
  return lines.filter(Boolean).join('\n')
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
  /** Existing draft to revise (keeps human/model fixes across retries). */
  draft?: string
  /** Ranking-model guidance (recommendedActions + forecast) — threads into the prompt. */
  modelGuidance?: ModelGuidanceInput | null
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
    opts.modelGuidance ? modelGuidanceBlock(opts.modelGuidance) : '',
    '',
    playbookDirective(opts.opportunityAction),
    '',
    'Write the full page now. Front matter first, then body. Raw markdown only.',
    'LENGTH: legal guides must clear ~1,800+ body words; thin stubs are auto-rejected and rewritten. Prefer long, concrete sections over short summaries.',
  ]
  if (opts.refineNotes) {
    parts.push(
      '',
      '## REVISION REQUIRED',
      'A previous draft failed the SEO audit. Fix ALL of the following issues in a complete rewrite (must stay as long or longer):',
      opts.refineNotes,
    )
  }
  if (opts.draft) {
    parts.push(
      '',
      '## EXISTING DRAFT — REVISE, DO NOT REWRITE FROM SCRATCH',
      'A saved draft exists for this page. Keep its good sections, facts, headings, and interlinks. ' +
        'Apply the requested fixes and improvements to it; do not discard it or shorten it.',
      '',
      '```markdown',
      opts.draft.length > 14000 ? opts.draft.slice(0, 14000) + '\n\n[…truncated…]' : opts.draft,
      '```',
    )
  }
  return parts.filter(Boolean).join('\n')
}

/** Re-export depth floors so pipeline/audit share one Google-aligned table. */
export function minWordsForType(contentType: string): number {
  return depthMinWords(contentType)
}

/**
 * Dedicated DEPTH EXPAND prompt — used when a draft is under the Google floor.
 * Keeps the draft as base; forces a complete longer page (not a short rewrite).
 */
export function buildDepthExpandPrompt(opts: {
  title: string
  topic: string
  primaryKeyword: string
  region: string
  contentType: string
  minWords: number
  targetWords: number
  maxWords?: number
  currentWords: number
  draft: string
}): string {
  const deficit = Math.max(0, opts.minWords - opts.currentWords)
  const maxWords = opts.maxWords ?? 99999
  const draftSlice = opts.draft.length > 14000 ? opts.draft.slice(0, 14000) + '\n\n[…truncated…]' : opts.draft
  return [
    '## DEPTH EXPANSION PASS (mandatory — previous draft was REJECTED as thin)',
    `Topic: ${opts.topic}`,
    `Primary keyword: ${opts.primaryKeyword}`,
    `Region: ${opts.region}`,
    `Content type: ${opts.contentType}`,
    `CURRENT body word count: ${opts.currentWords}`,
    `HARD MINIMUM: ${opts.minWords} body words of real prose (YAML + JSON-LD + code fences do NOT count)`,
    `TARGET: ~${opts.targetWords} words`,
    `HARD MAX: ${maxWords} words — do NOT exceed. Long output is penalized by the SEO audit.`,
    `You must ADD about ${deficit + 200} more words of substance — but stay under ${maxWords} total. Short output will be discarded again.`,
    '',
    'RULES:',
    '1) Return the COMPLETE page (YAML front matter + full body + FAQ + Sources + JSON-LD + disclaimer).',
    '2) KEEP accurate facts from the draft; EXPAND every thin section — do not shrink.',
    '3) Each H2 body (not the heading) should be ~180–350 words with concrete steps, documents, risks, or examples.',
    '4) Required sections if missing or thin:',
    '   - ## In 60 seconds (3–5 direct bullets)',
    '   - Opening answer paragraph',
    '   - ## Who this is for / who it is not for',
    '   - ## Eligibility / requirements (numbered steps)',
    '   - ## Documents checklist (detailed list + why each item matters)',
    '   - ## Step-by-step process / timeline',
    '   - ## Common mistakes and risks',
    '   - ## Costs, fees, or practical logistics (when relevant — no invented numbers; say "check official schedule")',
    '   - ## FAQ (6 Q&A, each answer 50–90 words, self-contained)',
    '   - ## Sources (official https URLs only)',
    '   - Disclaimer: educational only, not legal advice',
    '5) Practitioner voice: second person, plain English, NO AI clichés, NO outcome guarantees.',
    '6) Do NOT wrap in markdown code fences. Raw markdown only.',
    '7) Before you finish, mentally count: if under ' + opts.minWords + ' words of body prose, keep writing.',
    '',
    '## PREVIOUS DRAFT (expand this — do not replace with a shorter page)',
    draftSlice,
    '',
    'Write the FULL expanded page now. Front matter first. Make it long enough to clear the floor.',
  ].join('\n')
}

/**
 * Append-only expansion when full rewrite still came back short.
 * Model returns ONLY new H2 sections; caller merges into draft.
 */
export function buildDepthAppendPrompt(opts: {
  primaryKeyword: string
  region: string
  minWords: number
  currentWords: number
  existingH2s: string[]
  draftExcerpt: string
}): string {
  const need = Math.max(400, opts.minWords - opts.currentWords + 150)
  return [
    '## APPEND SECTIONS ONLY (depth rescue)',
    `Primary keyword: ${opts.primaryKeyword}`,
    `Region: ${opts.region}`,
    `Current body words: ${opts.currentWords}. Need ~${need} MORE words.`,
    'Return ONLY new markdown H2 sections (no front matter, no JSON-LD, no duplicate of existing sections).',
    'Existing H2 titles (do not repeat these headings):',
    ...(opts.existingH2s.length ? opts.existingH2s.map((h) => `- ${h}`) : ['- (none parsed)']),
    '',
    'Write 3–5 NEW H2 sections, each 200–400 words, covering gaps such as:',
    '- Document checklist deep dive',
    '- Step-by-step filing process',
    '- Timelines and what happens after filing',
    '- Common refusals / mistakes and how to avoid them',
    '- Regional or dependent-family nuances',
    '- Practical preparation checklist before you apply',
    '',
    'Voice: calm practitioner, second person, official-source minded, no guarantees, no AI filler.',
    'Raw markdown only. No code fences.',
    '',
    'Context excerpt from current draft:',
    opts.draftExcerpt.slice(0, 4000),
  ].join('\n')
}

/** Turn audit failures into revision instructions for a refine pass. */
export function auditToRefineNotes(audit: {
  blockers: Array<{ message: string; fix?: string }>
  warnings: Array<{ message: string; fix?: string }>
  wordCount: number
  score: number
  /** When known, force expansion language */
  minWords?: number
  targetWords?: number
}): string {
  const min = audit.minWords ?? 2200
  const target = audit.targetWords ?? Math.round(min * 1.1)
  const lines: string[] = [
    `Previous score: ${audit.score}. Body word count was ${audit.wordCount} (HARD MIN ${min}, target ~${target}).`,
  ]
  if (audit.wordCount < min) {
    lines.push(
      `- BLOCKER DEPTH: Draft has only ${audit.wordCount} body words — ILLEGAL for ship. Produce a COMPLETE page of at least ${min} words (aim ${target}).`,
      `- Every H2 needs 180–350 words of real procedures, documents, risks, timelines — not stubs.`,
      `- FAQ: 6 answers × 50–90 words each.`,
      `- Do NOT return a shorter page. Do NOT pad with repeated sentences. Do NOT count JSON-LD toward the total.`,
    )
  }
  for (const b of audit.blockers.slice(0, 8)) {
    if ('code' in b && b.code === 'outcome_promise') {
      lines.push('- BLOCKER: Remove affirmative promises about approval, success, timelines, or results. Do not repeat the flagged wording or discuss this instruction in the article. Use neutral wording such as outcomes and requirements vary.')
    } else if ('code' in b && b.code === 'sentence_start_repetition') {
      const ev = ('evidence' in b ? (b as any).evidence : '') || ''
      lines.push(`- BLOCKER [sentence_start_repetition]: Too many sentences start with "${ev}…". TARGETED SWEEP — rewrite only those sentences with varied openings. Do NOT regenerate the whole article.`)
    } else {
      lines.push(`- BLOCKER: ${b.message}${b.fix ? ` → Fix: ${b.fix}` : ''}`)
    }
  }
  for (const w of audit.warnings.slice(0, 8)) {
    lines.push(`- WARNING: ${w.message}${w.fix ? ` → Fix: ${w.fix}` : ''}`)
  }
  lines.push(
    'Ensure: official .gov/.edu URLs, TL;DR block, opening answer ≤40 words, ≥4 H2s, FAQ + FAQPage schema, Article schema, disclaimer, meta description 140–160 chars, CTR-ready title ≤60 chars ideal, body word count ≥ hard minimum.',
    'VOICE: sound human — second person, varied sentence length, no AI clichés (delve/leverage/robust/seamless/navigate the complexities/in conclusion), no outcome guarantees, no hype.',
  )
  return lines.join('\n')
}

/** Merge append-only H2 sections into an existing markdown draft (before trailing schema if possible). */
export function mergeAppendedSections(draft: string, appendMarkdown: string): string {
  const append = (appendMarkdown || '')
    .replace(/^```(?:markdown|md)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()
  if (!append) return draft

  // Insert before JSON-LD / script blocks if present
  const schemaIdx = draft.search(/<script\b|```json|"@type"\s*:\s*"Article"/i)
  if (schemaIdx > 0) {
    return `${draft.slice(0, schemaIdx).trimEnd()}\n\n${append}\n\n${draft.slice(schemaIdx)}`
  }
  // Insert before trailing disclaimer if last
  const disc = draft.search(/\n##?\s*disclaimer|\nthis (guide|article|page) is educational/i)
  if (disc > 0) {
    return `${draft.slice(0, disc).trimEnd()}\n\n${append}\n\n${draft.slice(disc)}`
  }
  return `${draft.trimEnd()}\n\n${append}\n`
}

export function extractH2Titles(markdown: string): string[] {
  const body = String(markdown || '').replace(/^---[\s\S]*?---\r?\n/, '')
  const out: string[] = []
  for (const m of body.matchAll(/^##\s+(.+)$/gm)) {
    out.push(m[1].trim())
  }
  return out
}
