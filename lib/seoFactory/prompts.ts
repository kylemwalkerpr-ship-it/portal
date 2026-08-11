/**
 * SEO Factory prompt builders — SERP/AEO/GEO quality-first generation.
 * Strategy corpus is injected via strategyBlock (from formatStrategyForPrompt).
 * War-room plays map through opportunityAction + writeHint for playbook wins.
 */

import type { OwnerPlan } from './ownership'
import {
  depthPromptClause,
  depthSpecForType,
  minWordsForType as depthMinWords,
  targetWordsForType,
  maxWordsForType as depthMaxWords,
} from './contentDepth'
import { qualityPromptBlock, formattingRequirementsBlock } from './contentQualityGate'

/**
 * Destination format contract — deterministic instructions per host+repo+contentType.
 * The AI model receives these exact rules so content is formatted for the file
 * it will actually become (caseworks .tsx, consultancy .md, apex blog .md).
 */
export function destinationFormatBlock(plan: OwnerPlan, contentType: string): string {
  const repo = plan.repo
  const host = plan.host
  const spec = depthSpecForType(contentType)
  const isBlog = contentType === 'blog_summary' || contentType === 'blog_post'
  const isRegional = contentType === 'regional_page' || contentType === 'regional_from' || contentType === 'regional_university'
  const isLegal = contentType === 'legal_guide' || contentType === 'article'
  const fileExt = repo === 'caseworks' ? '.tsx' : '.md'

  const lines: string[] = [
    '## DESTINATION FORMAT CONTRACT — the file this becomes',
    '',
    `- Destination repo: ${repo} (${repo === 'caseworks' ? 'Next.js app router' : repo === 'yousafe-consultancy' ? 'Astro/Nuxt content site' : 'portal marketplace'})`,
    `- Output file: ${plan.filePath} (${fileExt})`,
    `- Live URL after deploy: ${plan.canonicalUrl}`,
    `- Host subdomain: ${host} → write for the audience that lands on ${plan.canonicalUrl}`,
    `- Content tier: ${spec.tier} · min ${spec.minWords} words · target ~${spec.targetWords} · max ${spec.maxWords}`,
    '',
  ]

  if (repo === 'caseworks' && isLegal) {
    // Caseworks legal guides — JSX page.tsx with ArticleLayout + CTAPanel
    lines.push(
      'CASEBOOKS / LEGAL GUIDE FORMAT (.tsx JSX page):',
      '- Output is a Next.js page.tsx — NOT markdown. The renderer converts your markdown to JSX.',
      '- Wrap body prose in <p> tags. Lists become <ul><li>. H2 → <h2>. H3 → <h3>.',
      '- Every page MUST end with a <CTAPanel> component:',
      '  <CTAPanel headline="…" body="…" cta="Get a free review" href="/intake?…" />',
      '- The CTA routes to the intake form, not to another article.',
      '- Metadata is a TypeScript export: export const metadata = { title, description, alternates: { canonical } }',
      '- Imports required: ArticleLayout, CTAPanel, Link from next/link.',
      '- Country in metadata is one of us|uk|ca|au.',
      '- Word count target: 2,200–2,800 body words (YMYL-adjacent, Google Helpful Content depth).',
      '- Practitioner tone: calm, second-person, no clickbait, cite official sources with URLs.',
      '',
    )
  } else if (repo === 'yousafe-consultancy' && isBlog) {
    // Apex blog or regional blog — .md with YAML front matter, images, specific blog layout
    lines.push(
      'LANDING-PAGE / BLOG FORMAT (.md with YAML front matter):',
      '- Output is a plain .md file with YAML front matter between --- fences.',
      '- Front matter fields REQUIRED: title, description (140–160 chars), canonical (full URL), date (YYYY-MM-DD), author, image (hero image path), category, tags[]',
      '- The blog lives at https://yousafeconsultancy.com/blog/{slug} — the slug is derived from the file name.',
      `- Blog tier: ${spec.minWords}–${spec.maxWords} words. Blogs are scannable, narrative, and helpful — shorter than legal guides.`,
      '- Images: reference as ![Alt text](/images/blog/slug-description.jpg). The build pipeline supplies actual images.',
      '- Use ## for sections, ### for sub-sections only under a ##.',
      '- Opening paragraph must hook the reader with a concrete problem or question.',
      '- Include a ## Key takeaways section (3–5 bullets) after the intro.',
      '- Blog posts may include a ## About the author snippet at the bottom.',
      '- Internal links naturally connect to related blog posts and deeper guides on legal.yousafeconsultancy.com.',
      '- Marketplace CTA: where relevant, link readers to market.yousafeconsultancy.com for services — do not promise outcomes.',
      '- Tone: conversational yet authoritative, plain English (~8th grade), no jargon without definition.',
      '',
    )
  } else if (repo === 'yousafe-consultancy' && isRegional) {
    // Regional pages — .md with YAML, geo-specific structure
    lines.push(
      'REGIONAL / GEO PAGE FORMAT (.md with YAML front matter):',
      '- Output is a plain .md file with YAML front matter between --- fences.',
      '- Front matter fields REQUIRED: title, description (140–160 chars), canonical (full URL), region, content_type, ownerHost, date (YYYY-MM-DD).',
      `- Regional tier: ${spec.minWords}–${spec.maxWords} words. Regional pages are definitive but scannable.`,
      '- Structure: H1 → ## In 60 seconds → opening answer → ## sections with procedures → ## FAQ → ## Sources → disclaimer.',
      '- Geo-specific: include country/city-specific details (agencies, forms, timelines, local context).',
      '- If this is a university page: include campus-specific housing, costs, international office contacts.',
      '- If this is a from-country page: include consulate locations, document requirements specific to that origin.',
      '- Links: connect to regional sister pages (other universities, other from-country pages), legal guides, and the marketplace.',
      '- Tone: informative, practical, second-person ("you"), no hype, no outcome promises.',
      '',
    )
  } else if (repo === 'portal') {
    // Marketplace pages — NOT created by the studio, but format contract for completeness
    lines.push(
      'MARKETPLACE FORMAT (.mdx catalogue file):',
      '- These are created by service providers from their dashboard — the studio does NOT generate them.',
      '- If you see this format contract, the pipeline routing is MISCONFIGURED — a marketplace keyword was routed to the studio.',
      '- STOP and route to the correct host (legal, usa, uk, ca, au, or apex).',
      '',
    )
  } else {
    // Default — markdown page (catch-all)
    lines.push(
      'DEFAULT MARKDOWN FORMAT (.md with YAML front matter):',
      '- Output is a plain .md file with YAML front matter between --- fences.',
      '- Front matter fields REQUIRED: title, description (140–160 chars), canonical (full URL), date (YYYY-MM-DD), region, content_type.',
      `- Word count: ${spec.minWords}–${spec.maxWords} words of body prose.`,
      '- Standard structure: H1 → TL;DR → sections → FAQ → Sources → disclaimer.',
      '',
    )
  }

  return lines.join('\n')
}

export function buildFactorySystemPrompt(opts: {
  plan: OwnerPlan
  contentType: string
  minWords: number
  maxWords?: number
  /** Compact pack from SEO strategies directory */
  strategyBlock?: string
  /** Brief-supplied short keywords (≤3 words). The article must use each, max 4 hits. */
  requiredShortKeywords?: string[]
  /** Brief-supplied long-tail keywords (≥4 words). The article must use each, max 2 hits. */
  requiredLongTailKeywords?: string[]
  /** Admin-defined H2 section outline from the Brief Assembly Panel */
  h2Outline?: string[]
  /** Sources to cite — the AI must reference these authoritative URLs */
  sources?: string[]
  /** Verified internal links — the AI may use ONLY these exact URLs. */
  interlinkAllowlist?: Array<{ label?: string; url?: string }>
  /** Admin-specified target slug */
  targetSlug?: string
  /** Keyword → H2 section placement map from the Brief Assembly Panel */
  kwH2Map?: Record<string, string>
}): string {
  const { plan, contentType, minWords, strategyBlock, h2Outline, sources, targetSlug, kwH2Map, interlinkAllowlist } = opts
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
    destinationFormatBlock(plan, contentType),
    '',
    strategyBlock || '',
    '',
    // ══════ BRIEF ASSEMBLY TEMPLATE — admin-defined structure ══════
    ...(h2Outline && h2Outline.length ? [
      'BRIEF TEMPLATE — H2 OUTLINE (mandatory structure):',
      ...h2Outline.map((h, i) => {
        const placedKw = kwH2Map ? Object.entries(kwH2Map).filter(([, sec]) => sec === h).map(([k]) => k) : []
        return `${i + 1}. ## ${h}${placedKw.length ? ` [must include keyword(s): ${placedKw.join(', ')}]` : ''}`
      }),
      'You MUST follow this exact H2 structure. Do not add, remove, or reorder sections.',
      'If the brief supplies a keyword→section map, place each keyword naturally in its assigned H2.',
      '',
    ] : [
      'HEADING REQUIREMENT (no brief template provided — you MUST create at least 4 H2 sections):',
      'Cover these topics as H2 sections (##): overview, eligibility/requirements, application process, required documents, timeline/costs, FAQ (4-6 Q&A), worked example, risks/warnings.',
      '',
    ]),
    ...(sources && sources.length ? [
      'SOURCES TO CITE:',
      ...sources.map((s, i) => `${i + 1}. ${s}`),
      'Cite these sources where they support a claim. Do not fabricate additional URLs.',
      '',
    ] : []),
    ...(interlinkAllowlist && interlinkAllowlist.length ? [
      'INTERNAL LINK ALLOWLIST (use ONLY these exact URLs for internal links — never invent, modify, or shorten them):',
      ...interlinkAllowlist.map((l, i) => `${i + 1}. ${l.label || l.url} -> ${l.url}`),
      'NEVER create an internal link to any URL outside this list.',
      '',
    ] : [
      'INTERNAL LINKS: the verified allowlist is EMPTY — do NOT create ANY internal links to legal.yousafeconsultancy.com or any yousafe domain. Disable internal linking entirely for this draft. Only link externally to .gov / .edu sources if they appear in the SOURCES list above, using their EXACT URLs. Creating an invented or guessed internal URL is a hard error.',
      '',
    ]),
    ...(targetSlug ? [
      `TARGET SLUG: ${targetSlug}`,
      '',
    ] : []),
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
    `8) WORD COUNT GATE: ${minWords}–${maxWords} body words (not counting YAML, JSON-LD, or code fences). Target ~${target} words. BOTH under ${minWords} AND over ${maxWords} are hard failures — the audit rejects the page. Under-delivering is missing depth; over-delivering wastes tokens and creates reader fatigue. If you exceed ${maxWords}, stop writing immediately and truncate to the last complete sentence that keeps you within ${maxWords}.`,
    `9) Content type: ${contentType}`,
    '10) Do NOT wrap output in markdown code fences. Emit raw markdown only.',
    '11) Front-matter title must be CTR-ready (≤60 chars ideal); description 140–160 chars with a concrete next step.',
    '12) If you are under the word minimum, keep expanding with real procedures/documents/FAQs until you clear it — short drafts are discarded.',
    '13) KEYWORD COVERAGE — the brief supplies ≥5 shortKeywords (≤3 words) and ≥4 longTailKeywords (≥4 words).',
    '    - Use every short keyword at least once (cap ≤4 hits per keyword in the body).',
    '    - Use every long-tail keyword at least once (cap ≤2 hits per keyword in the body).',
    '    - Place at least one short keyword in the title slug, first H2, and the In 60 seconds block.',
    '    - Place at least one long-tail keyword in a natural FAQ question, a procedural heading, or step description.',
    '    - Missing any keyword = HARD BLOCK (the quality gate refuses ship). Stuffing = HARD BLOCK. Aim for natural distribution.',
    ...(opts.requiredShortKeywords
      ? [
          '    SHORT KEYWORDS TO USE:',
          ...opts.requiredShortKeywords.map((k) => `- "${k}"`),
        ]
      : []),
    ...(opts.requiredLongTailKeywords
      ? [
          '    LONG-TAIL KEYWORDS TO USE:',
          ...opts.requiredLongTailKeywords.map((k) => `- "${k}"`),
        ]
      : []),
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
  h2Outline?: string[]
}): string {
  const deficit = Math.max(0, opts.minWords - opts.currentWords)
  const maxWords = opts.maxWords ?? 99999
  const draftSlice = opts.draft.length > 14000 ? opts.draft.slice(0, 14000) + '\n\n[…truncated…]' : opts.draft
  const outlineBlock =
    opts.h2Outline && opts.h2Outline.length
      ? [
          '',
          'EXPAND EXACTLY THESE PLANNED SECTIONS (the approved brief outline — do not rename or drop any):',
          ...opts.h2Outline.map((h, i) => `${i + 1}. ## ${h}`),
        ].join('\n')
      : ''
  return [
    '## DEPTH EXPANSION PASS (mandatory — previous draft was REJECTED as thin)',
    `Topic: ${opts.topic}`,
    `Primary keyword: ${opts.primaryKeyword}`,
    `Region: ${opts.region}`,
    `Content type: ${opts.contentType}`,
    `CURRENT body word count: ${opts.currentWords}`,
    `HARD MINIMUM: ${opts.minWords} body words of real prose (YAML + JSON-LD + code fences do NOT count)`,
    `TARGET: ~${opts.targetWords} words`,
    `This is a measured gate: the audit counts every body word and REJECTS the page below ${opts.minWords}. Under-delivering is the ONLY failure that matters. If you pass ${opts.targetWords} words the audit is satisfied.`,
    `You must ADD at least ${deficit + 250} more words of substance than the current draft. Do not stop writing until the total body prose clears ${opts.minWords} words.`,
    '',
    'RULES:',
    '1) Return the COMPLETE page (YAML front matter + full body + FAQ + Sources + JSON-LD + disclaimer).',
    '2) KEEP accurate facts from the draft; EXPAND every thin section — do not shrink.',
    '3) Each H2 body (not the heading) should be ~180–350 words with concrete steps, documents, risks, or examples. Stub sections are rejected.',
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
    outlineBlock,
    '5) Practitioner voice: second person, plain English, NO AI clichés, NO outcome guarantees.',
    '6) Do NOT wrap in markdown code fences. Raw markdown only.',
    '7) Before you finish, mentally count your body prose words: if under ' + opts.minWords + ', keep writing. A 2000-word page does not clear a 2200-word floor — the audit will reject it again.',
    '',
    '## PREVIOUS DRAFT (expand this — do not replace with a shorter page)',
    draftSlice,
    '',
    'Write the FULL expanded page now. Front matter first. Write until the body prose is comfortably above the hard minimum.',
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
  h2Outline?: string[]
  /** Rotating focus — each rescue pass targets a different gap so repeated
   *  appends add NEW substance instead of repeating the same sections. */
  focus?: string
}): string {
  const deficit = Math.max(0, opts.minWords - opts.currentWords)
  // Demand at least the full remaining deficit, plus headroom so a
  // single successful append can clear the floor in one pass.
  const need = Math.max(500, deficit + 200)
  const focusLine = opts.focus
    ? `FOCUS THIS PASS ON: ${opts.focus}. Do not repeat sections you already wrote in a previous pass — pick a different angle.`
    : 'Write sections you have NOT already covered.'
  const outlineBlock =
    opts.h2Outline && opts.h2Outline.length
      ? [
          '',
          'If any of these planned outline sections are missing or thin in the current draft, cover THOSE first:',
          ...opts.h2Outline.map((h, i) => `${i + 1}. ## ${h}`),
        ].join('\n')
      : ''
  return [
    '## APPEND SECTIONS ONLY (depth rescue)',
    `Primary keyword: ${opts.primaryKeyword}`,
    `Region: ${opts.region}`,
    `Current body words: ${opts.currentWords}. You MUST add at least ${need} MORE words this pass — the gate needs ${opts.minWords} total and the audit re-measures after every pass.`,
    'Return ONLY new markdown H2 sections (no front matter, no JSON-LD, no duplicate of existing sections).',
    'Existing H2 titles (do not repeat these headings):',
    ...(opts.existingH2s.length ? opts.existingH2s.map((h) => `- ${h}`) : ['- (none parsed)']),
    '',
    focusLine,
    '',
    'Write 3–6 NEW H2 sections, each 200–400 words (aim for ~700+ words total this pass), covering gaps such as:',
    '- Document checklist deep dive',
    '- Step-by-step filing process',
    '- Timelines and what happens after filing',
    '- Common refusals / mistakes and how to avoid them',
    '- Regional or dependent-family nuances',
    '- Practical preparation checklist before you apply',
    '- Costs, fees, or logistics (official schedules only, no invented numbers)',
    outlineBlock,
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

// ════════════════════════════════════════════════════════════════════════════
// SEGMENTED WRITING — thinking mode stays ON, so long documents are written in
// sequential bounded parts. Each part is a fresh provider run targeting a slice
// of the outline, so thinking + content always fit the token budget and we never
// hit finish_reason:'length'. Part 1 writes front matter + H1 + opening + its
// sections; later parts continue WITHOUT repeating front matter or already
// written sections.
// ════════════════════════════════════════════════════════════════════════════

export interface WriteSegment {
  /** 1-based part number */
  index: number
  total: number
  /** H2 sections this part must cover (empty for generic continuation) */
  sections: string[]
  /** Minimum body words for this part — sum of floors ≈ full-document minWords */
  wordFloor: number
  /** Section titles already written by earlier parts (empty for part 1) */
  priorSections: string[]
}

/**
 * Split a document brief into contiguous segments. Prefers the admin H2
 * outline; falls back to a generic two-half split (body then FAQ/back-matter).
 */
export function planWriteSegments(opts: {
  h2Outline?: string[]
  minWords: number
  segmentCount?: number
}): WriteSegment[] {
  const count = Math.max(1, Math.min(4, Math.floor(opts.segmentCount ?? 2)))
  const outline = (opts.h2Outline || []).map((h) => h.trim()).filter(Boolean)
  const floor = Math.max(200, opts.minWords)
  // Never split an outline into more parts than it has sections — a one-section
  // brief stays a single part.
  const effective = outline.length ? Math.min(count, Math.max(1, outline.length)) : count
  if (effective <= 1) {
    return [
      {
        index: 1,
        total: 1,
        sections: outline,
        wordFloor: floor,
        priorSections: [],
      },
    ]
  }
  // If no outline, give part 1 the body halves and part 2 the back matter.
  if (!outline.length) {
    const half = Math.ceil(floor / 2)
    const segments: WriteSegment[] = []
    for (let i = 1; i <= effective; i++) {
      const isLast = i === effective
      segments.push({
        index: i,
        total: effective,
        sections: [],
        wordFloor: isLast ? floor - half * (effective - 1) : half,
        priorSections: segments.map((s) => s.sections).flat(),
      })
    }
    return segments
  }
  // Split the outline into effective contiguous chunks, as balanced as possible.
  const per = Math.ceil(outline.length / effective)
  const chunks: string[][] = []
  for (let i = 0; i < effective; i++) {
    chunks.push(outline.slice(i * per, (i + 1) * per))
  }
  const weights = chunks.map((c) => Math.max(1, c.length))
  const totalWeight = weights.reduce((a, b) => a + b, 0)
  const segments: WriteSegment[] = []
  chunks.forEach((sections, i) => {
    const isLast = i === effective - 1
    const share = weights[i] / totalWeight
    const wordFloor = isLast
      ? Math.max(100, floor - Math.floor(segments.reduce((a, s) => a + s.wordFloor, 0)))
      : Math.max(180, Math.floor(floor * share))
    segments.push({
      index: i + 1,
      total: effective,
      sections,
      wordFloor,
      priorSections: segments.map((s) => s.sections).flat(),
    })
  })
  return segments
}

/**
 * Per-part generation contract: write ONLY this part's sections, at this part's
 * word floor, and never repeat front matter / already-written sections.
 */
export function buildSegmentWritePrompt(opts: {
  title: string
  topic: string
  primaryKeyword: string
  region: string
  contentType: string
  tone: string
  segment: WriteSegment
  minWords: number
  targetWords: number
  gscBlock: string
  writeHint?: string
  opportunityAction?: string
}): string {
  const { segment } = opts
  const isFirst = segment.index === 1
  const isLast = segment.index === segment.total
  const sectionBlock =
    segment.sections.length > 0
      ? `
SECTIONS TO WRITE IN THIS PART (exactly these, in this order):
${segment.sections.map((h, i) => `${i + 1}. ## ${h}`).join('\n')}
`
      : `
SECTIONS TO WRITE IN THIS PART:
${isFirst
  ? '- H1 + opening answer + ## In 60 seconds, then the main body: eligibility, documents, step-by-step process, timeline, risks, costs (concrete and detailed).'
  : '- The remaining body depth: any sections not yet written, then ## FAQ (4-6 Q&A, self-contained), ## Sources (official https URLs only), JSON-LD, and the educational disclaimer.'}
`
  const priorBlock =
    segment.priorSections.length > 0
      ? `
ALREADY WRITTEN IN EARLIER PARTS — DO NOT REPEAT ANY OF THESE SECTIONS OR THE H1/TITLE:
${segment.priorSections.map((h) => `- ${h}`).join('\n')}
`
      : ''
  return [
    `## SEGMENTED WRITE — PART ${segment.index} OF ${segment.total} (${isFirst ? 'first part' : isLast ? 'final part' : 'continuation'})`,
    `Topic: ${opts.topic}`,
    `Primary keyword (already in the brief): ${opts.primaryKeyword}`,
    `Region: ${opts.region} · Content type: ${opts.contentType} · Tone: ${opts.tone}`,
    '',
    `This is PART ${segment.index} of ${segment.total} of one complete article. Each part is generated in a separate run. Your ONLY job: write this part's sections with substance. Do not write sections assigned to other parts — they will be written by their own run.`,
    '',
    `WORD FLOOR FOR THIS PART: at least ${segment.wordFloor} body words of real prose (YAML front matter, JSON-LD, and code fences do NOT count). The full article floor is ${opts.minWords} words across all parts — under-writing this part starves the whole article and the audit will reject it. Write until you are comfortably above this part's floor.`,
    sectionBlock,
    priorBlock,
    isFirst
      ? 'RULES FOR PART 1:'
      : isLast
        ? 'RULES FOR THE FINAL PART:'
        : 'RULES FOR CONTINUATION PARTS:',
    isFirst
      ? '1) Emit YAML front matter between --- fences (title, description, primaryKeyword, robots, date, region, content_type, ownerHost) + H1 + opening answer + ## In 60 seconds (3-5 direct bullets) + the sections listed above. Do NOT include the final ## Sources / JSON-LD / disclaimer — the final part writes those.'
      : '1) Do NOT emit YAML front matter, do NOT repeat the H1/title/intro, and do NOT wrap in code fences. Start directly with the first section heading of THIS part.'
    ,
    '2) Practitioner voice: second person, plain English (~8th grade), define legal terms on first use, sentences under ~20 words.',
    '3) ZERO outcome promises — no guarantees of visas, approvals, success rates, or results. Educational only.',
    '4) Use the brief keywords naturally (short + long-tail). Never stuff.',
    '5) Cite official sources with full https URLs (USCIS, IRCC, UKVI/GOV.UK, Home Affairs, SEVP) where they support a claim — inline where helpful.',
    isLast
      ? '6) This part closes the article: finish with ## FAQ (4-6 Q&A, each answer 40-80 words, self-contained for LLM citation), ## Sources (bullet list of official URLs only), Article + FAQPage JSON-LD in <script type="application/ld+json"> blocks, and a short educational disclaimer.'
      : '6) Stop cleanly at the end of this part\'s sections. Do not write the FAQ/Sources/JSON-LD — a later part owns them.'
    ,
    '7) Raw markdown only, no code fences around the whole output, no AI clichés, no filler.',
    '',
    opts.gscBlock,
    opts.writeHint ? `War-room / authority brief:\n${opts.writeHint}` : '',
    opts.opportunityAction ? `Tactic note: ${opts.opportunityAction}` : '',
    '',
    `Write PART ${segment.index} now. Before you finish, mentally count this part's body words — if under ${segment.wordFloor}, keep writing concrete procedures, documents, and risks.`,
  ]
    .filter(Boolean)
    .join('\n')
}

/**
 * Join sequentially generated parts into one document. Part 1 keeps its front
 * matter; later parts must not repeat YAML/H1/opening — strip any that slip in.
 */
export function mergeSegmentParts(parts: string[]): string {
  const cleaned = (parts || [])
    .map((raw) => String(raw || '').trim())
    .filter(Boolean)
    .map((part, i) => {
      if (i === 0) return part
      // Strip YAML front matter if a continuation part accidentally re-emitted it
      let p = part.replace(/^---[\s\S]*?---\r?\n/, '')
      // Strip a leading H1 if the model re-announced the title (tolerant of the
      // blank line the front-matter strip can leave behind)
      p = p.replace(/^\s*#\s+[^\n]+\n+/, '')
      // Strip a repeated 'In 60 seconds' opener only if it immediately follows the H1 strip
      return p.trim()
    })
    .filter(Boolean)
  return cleaned.join('\n\n')
}
