/**
 * SEO Factory prompt builders — SERP/AEO/GEO quality-first generation.
 * Strategy corpus is injected via strategyBlock (from formatStrategyForPrompt).
 * War-room plays map through opportunityAction + writeHint for playbook wins.
 */

import type { OwnerPlan } from './ownership'
import {
  countBodyWords,
  depthPromptClause,
  depthSpecForType,
  minWordsForType as depthMinWords,
  targetWordsForType,
  maxWordsForType as depthMaxWords,
} from './contentDepth'
import { qualityPromptBlock, formattingRequirementsBlock } from './contentQualityGate'
import { formatContractBriefBlock } from './formatContract'
import { renderBriefRules, renderWriterRules } from './contentQualityPlaybook'
import type { ContentSpec } from './contentSpec'

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
      `- Word count target: ${spec.minWords}–${spec.maxWords} body words (YMYL-adjacent, Google Helpful Content depth).`,
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
  /**
   * Canonical ContentSpec for this job. When present, brief/writer rules and
   * the keyword/link/source allowlists are rendered from the registry
   * projections and the spec snapshot — never from duplicated arrays.
   */
  spec?: ContentSpec
}): string {
  const { plan, contentType, minWords, strategyBlock, h2Outline, sources, targetSlug, kwH2Map, interlinkAllowlist, spec } = opts
  const target = targetWordsForType(contentType)
  const maxWords = opts.maxWords ?? depthMaxWords(contentType)
  // Registry/spec-derived allowlists. A spec only ever NARROWS these lists to
  // what was verified for this job; when absent (or a field is empty) the
  // legacy brief-supplied lists are used unchanged.
  const specShortKeywords = spec
    ? spec.requiredKeywords.filter((k) => k.kind === 'short' && !k.optional).map((k) => k.phrase)
    : undefined
  const specLongTailKeywords = spec
    ? spec.requiredKeywords.filter((k) => k.kind === 'long_tail' && !k.optional).map((k) => k.phrase)
    : undefined
  const requiredShortKeywords = specShortKeywords?.length ? specShortKeywords : opts.requiredShortKeywords
  const requiredLongTailKeywords = specLongTailKeywords?.length ? specLongTailKeywords : opts.requiredLongTailKeywords
  const sourceList = spec && spec.approvedSources.length ? spec.approvedSources.map((s) => s.url) : sources
  const specInterlinks = spec && spec.verifiedEstateLinks.length
    ? spec.verifiedEstateLinks.map((l) => ({ label: l.anchor, url: l.url }))
    : undefined
  const interlinkList = specInterlinks ?? interlinkAllowlist
  const briefOutline = spec && spec.outline.length ? spec.outline.map((o) => o.heading) : h2Outline
  return [
    'You are the YouSafe / MyCaseworks SEO content factory for immigration law content.',
    'Voice: calm, precise, practitioner-grade. Second person ("you"). Plain English.',
    'ZERO outcome promises. No guarantees of visas, approvals, timelines, or results.',
    'BANNED: delve, streamline, game-changer, revolutionize, leverage (verb), robust, seamless, holistic, bespoke, unpack, navigate the complexities, "In today\'s fast-paced", ultimate guide (as clickbait), "everything you need to know".',
    'Cite official sources with full https URLs: immigration departments, government departments, official school pages, named intergovernmental bodies, AND the issuing body for the article’s claim (exam boards, licensing councils — e.g. NCSBN for NCLEX, IELTS.org for IELTS, NMC/GMC for UK professional registration). A host is valid because it issues that rule or exam, not because it is on a generic .gov list.',
    '',
    'SHIP GATES — pass ALL of these before you submit; the audit re-checks every one and blocks the ship on any failure:',
    `- DEPTH: ${minWords}–${maxWords} body words (target ~${target}). Under the minimum = thin (rejected); over the maximum = bloated (rejected).`,
    '- STRUCTURE: H1 + "## In 60 seconds" TL;DR (3–5 direct bullets) + opening answer ≤40 words + ≥4 H2 sections + FAQ (4–6 Q&A) + ## Sources + short educational disclaimer.',
    '- SCHEMA: Article JSON-LD AND FAQPage JSON-LD in <script type="application/ld+json"> blocks.',
    '- META: description 140–160 chars containing the primary keyword and a concrete next step.',
    '- LINKS: at least 2 internal estate links taken VERBATIM from the INTERNAL LINK ALLOWLIST below. ZERO invented, guessed, or modified URLs — a made-up URL is a hard error.',
    '- KEYWORDS: every short keyword appears ≥1× and ≤4×; every long-tail keyword ≥1× and ≤2× (details in KEYWORD COVERAGE below).',
    '- VOICE: human, second person, varied sentence length, no AI clichés, no outcome promises.',
    '- SOURCES: prefer URLs VERBATIM from SOURCES TO CITE / SOURCE ALLOWLIST. Same-region immigration departments, official school pages, and the issuing body for this topic (exam/licensing board) are always valid. On-topic institutional pages (.org / .edu / official boards) that directly support a claim are also valid. Never invent, guess, or modify a path. A 404 or made-up URL is a hard error. If you are not sure a URL exists, write the agency name as plain text.',
    '- EXTERNAL LINKS: no blogs, news, Wikipedia, competitors, social, or URL shorteners. The href must be the issuing body for the surrounding claim — exam/licensing board for that exam, immigration department for a visa, official school page for a campus rule. Do not swap a board URL for a generic immigration homepage. Do not invent paths.',
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
    ...(spec
      ? [
          renderBriefRules(spec),
          '',
          renderWriterRules(spec),
          '',
        ]
      : []),
    formattingRequirementsBlock(),
    '',
    formatContractBriefBlock(),
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
    ...(briefOutline && briefOutline.length ? [
      'BRIEF TEMPLATE — H2 OUTLINE (mandatory structure):',
      ...briefOutline.map((h, i) => {
        const placedKw = kwH2Map ? Object.entries(kwH2Map).filter(([, sec]) => sec === h).map(([k]) => k) : []
        return `${i + 1}. ## ${h}${placedKw.length ? ` [must include keyword(s): ${placedKw.join(', ')}]` : ''}`
      }),
      'You MUST follow this exact H2 structure. Do not add, remove, or reorder sections.',
      'If the brief supplies a keyword→section map, place each keyword naturally in its assigned H2.',
      '',
      'CONTRACT THINKING — engage the brief, never paste it:',
      '- Every section exists to satisfy ITS purpose from the outline. Before writing a section, ask: "what does the reader need from THIS section?" — then write from that need.',
      '- Keywords and long-tails are COVERAGE terms, never literal text. Never output a keyword string verbatim as a heading, a question, or a filler sentence.',
      '- FAQ questions are real reader questions in natural English with subject + verb + object ("Do I need a consultant to apply for an F-1 visa?", "How much does an Australia student visa cost?"). NEVER write "is it possible to [keyword]…", "do you need a [keyword]…", "requirements for a [keyword]…".',
      '- When the brief assigns a long-tail keyword to the FAQ section, the term appears in the ANSWER where it reads naturally — never as the question text. The question names the reader\'s situation ("What if I already hold a visa?") and the answer carries the keyword (e.g. "If you already hold a visa, a student visa fee increase plan may still apply to your renewal…").',
      '- TIME-SENSITIVE CONCLUDING SECTION: if the topic truly has time-sensitive facts (fees, deadlines, eligibility or government guidance that CHANGE in 2026), close with a current-information section under a TOPIC-SPECIFIC heading ("2026 Canada Study Permit Requirements", "Express Entry Requirements for 2026") — NEVER the generic "Updated Requirements and Guidance for 2026" used identically across articles. If the topic has no real 2026 changes, omit the section entirely; never add it as boilerplate. Only label a date that is the real publication/last-update date.',
      '- Long-tail coverage belongs INSIDE paragraphs and FAQ answers, where it reads naturally. If a term has no clean slot, omit it — a natural article without the term beats a stuffed one.',
      '- Scannability is substance: a table or checklist must add structure a reader uses; never pad a section to hit depth.',
      '',
    ] : [
      'HEADING REQUIREMENT (no brief template provided — you MUST create at least 4 H2 sections):',
      'Cover these topics as H2 sections (##): overview, eligibility/requirements, application process, required documents, timeline/costs, FAQ (4-6 Q&A), worked example, risks/warnings.',
      '',
    ]),
    ...(sourceList && sourceList.length ? [
      'SOURCES TO CITE / SOURCE ALLOWLIST (cite these VERBATIM; on-topic live institutional pages may be added):',
      ...sourceList.map((s, i) => `${i + 1}. ${s}`),
      'Cite a source only where it supports the surrounding claim. You may add a real, live institutional page (.gov / .edu / .org / official board) when it directly supports a specific claim — the reviewer live-checks every URL. Do not fabricate URLs. Do not invent a deeper path on the same host. No blogs, Wikipedia, social media, or content mills.',
      '',
    ] : [
      'SOURCE ALLOWLIST is EMPTY — prefer writing agency names as plain text (USCIS, IRCC, UKVI, Home Affairs). You may cite a real, live institutional page (.gov / .edu / .org / official board) only when you are certain of its exact URL and it directly supports the claim; the reviewer live-checks every URL. Inventing or guessing a path is a hard error. No blogs, Wikipedia, or social media.',
      '',
    ]),
    ...(interlinkList && interlinkList.length ? [
      'INTERNAL LINK ALLOWLIST (use ONLY these exact URLs for internal links — never invent, modify, or shorten them):',
      ...interlinkList.map((l, i) => `${i + 1}. ${l.label || l.url} -> ${l.url}`),
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
    '13) KEYWORD COVERAGE — the brief supplies ≥5 shortKeywords (≤3 words) and ≥4 longTailKeywords (≥4 words). Every keyword below is AUDIT-ENFORCED: missing any one = HARD BLOCK, and exceeding the per-keyword hit caps = HARD BLOCK. This is the #1 ship-killer — treat it like a checklist.',
    '    - Use EVERY short keyword at least once but NEVER more than 4 times in the body.',
    '    - Use EVERY long-tail keyword at least once but NEVER more than 2 times in the body.',
    '    - The PRIMARY keyword is exempt from these caps (it appears in title/H1 naturally) — but if it appears 12+ times the page is flagged as keyword stuffing anyway.',
    '    - PLACEMENT (plan before you write): assign each keyword a single natural slot — title/H1, the In 60 seconds block, one H2 heading, a checklist item, one FAQ question, or one step description. Do NOT repeat a keyword across several sections; one intentional placement per keyword is enough.',
    '    - Long-tail phrases read as spam when repeated: use the FULL phrase once (a FAQ question is the cleanest slot) and do not echo it again verbatim.',
    '    - After writing, MENTALLY SCAN the body: for each keyword below, confirm it appears at least once and not more than its cap. If you catch an over-repeat, replace the later occurrence with a synonym or rephrase.',
    ...(requiredShortKeywords
      ? [
          '    SHORT KEYWORDS TO USE (each exactly 1-4 times):',
          ...requiredShortKeywords.map((k) => `    - "${k}"`),
        ]
      : []),
    ...(requiredLongTailKeywords
      ? [
          '    LONG-TAIL KEYWORDS TO USE (each exactly 1-2 times, in DIFFERENT contexts):',
          ...requiredLongTailKeywords.map((k) => `    - "${k}"`),
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
  /** Master SEO Engine pack (scoreMaster + fix plan + knowledge/cluster). */
  masterEngineBlock?: string | null
  /**
   * Mission economics — plan→composer handoff (Phase D). When a plan row
   * carries a marketplace CTA, the draft must name the service and its honest
   * price band once in the body and once in a FAQ answer, educational-first.
   */
  marketplaceCta?: { service?: string; slug?: string; priceBand?: string }
  /** Strict per-section word budgets (from the brief) — hardlined single-run
   *  word control so the drafter lands inside the window in ONE response. */
  sectionBudgets?: Array<{ heading: string; minWords: number; maxWords: number }>
  /** CTR-engineered reader-facing title (TitleLab/planner candidate) the H1
   *  must carry — derived naturally, core noun phrase kept. */
  titleCandidate?: string
}): string {
  // The word-count window is dictated by the canonical depth spec for THIS
  // content type — never a hardcoded floor. The brief, the audit, and the
  // ship gate all enforce these exact numbers, so the drafting prompt must
  // state them verbatim and cap the overshoot that produced 3,000-word pages.
  const spec = depthSpecForType(opts.contentType)
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
    opts.masterEngineBlock ? opts.masterEngineBlock : '',
    '',
    playbookDirective(opts.opportunityAction),
    '',
    `LENGTH (${spec.label}): ${spec.minWords}–${spec.maxWords} body words, target ~${spec.targetWords}. BOTH under ${spec.minWords} (thin) and over ${spec.maxWords} (bloated) are rejected by the audit — this is a measured gate, not a suggestion. YAML front matter, JSON-LD, and code fences do NOT count. Write complete but tight: concrete procedures, documents, risks, and FAQs earn length; padding and repetition do not. If you exceed ${spec.maxWords}, stop and trim to the last complete sentence inside the window.`,
    ...(opts.marketplaceCta && String(opts.marketplaceCta.service || '').trim() ? [
      'MISSION ECONOMICS — the marketplace CTA:',
      `- Service: ${String(opts.marketplaceCta.service).trim()}${opts.marketplaceCta.slug ? ` (marketplace landing: ${opts.marketplaceCta.slug})` : ''}.`,
      opts.marketplaceCta.priceBand
        ? `- Honest price band from the brief: ${opts.marketplaceCta.priceBand}. State it plainly, exactly twice — one natural placement in the body and one inside a FAQ answer. Never invent prices, tiers, or features; if a reader's case sits outside the band, say prices depend on the specifics.`
        : '- No price band in the brief — never invent one. Where a price belongs, write that prices depend on the case.',
      '- The CTA is educational-first ("book a consult for your specific case" style), never "buy now" and never an outcome promise. One natural placement in the body where the reader decides the next step, plus the same service named once in a FAQ answer.',
      '- The service gains no invented features or outcomes: name it, price it honestly, and route the reader to a licensed review of their specifics.',
      '',
    ] : []),
    ...(opts.titleCandidate && String(opts.titleCandidate).trim() ? [
      `TITLE CONTRACT: the H1 must carry this reader-facing title (candidate): ${String(opts.titleCandidate).trim()} — derive it naturally but keep the core noun phrase.`,
      '',
    ] : []),
    ...((opts.sectionBudgets && opts.sectionBudgets.length) ? [
      'ABSOLUTE SECTION QUOTAS — hard inclusive ranges. A section under its min or over its max is a ship failure, same as missing the page window:',
      ...opts.sectionBudgets.map((s) => `- ## ${s.heading}: MUST be ${s.minWords}–${s.maxWords} body words (inclusive). Never fewer than ${s.minWords}. Never more than ${s.maxWords}.`),
      '- Honour every range. Σ(section mins) meets the page floor; Σ(section maxes) stays under the page cap. Do not pad a short section by stealing from another, and do not dump overflow into FAQ/Sources.',
      '- Write exactly ONE article — the sections above, in this order. Never echo the brief, never paste a previous draft, never append a second copy. If a section approaches its cap, stop that section and continue to the next.',
      '',
    ] : []),
    ...(opts.refineNotes ? [
      'TARGETED REVISION — apply ONLY the listed fixes to the REFERENCE DRAFT below.',
      '- The REFERENCE DRAFT is read-only context. Your response is the COMPLETE revised article — emitted EXACTLY ONCE, in full, never preceded by a quote of the reference.',
      '- Make the smallest edits that clear every listed issue; keep everything else byte-for-byte. Do NOT add new sections beyond the fixes; do NOT restructure.',
      '- Total body words must stay inside the LENGTH gate above. If the reference is over the gate, that is a listed fix: trim it — never append more.',
    ] : [
      'ONE-GO CONTRACT — write the ENTIRE article in this single response:',
      '- Every outline section, then ## FAQ (4-6 Q&A), ## Sources, the Article + FAQPage JSON-LD, and the educational disclaimer. All of it, in this one response.',
      '- There is NO part 2, no continuation run, no separate back-matter pass. Do not end with "to be continued", placeholders, or a promise that a later section will be written.',
      '- If the response budget tightens, compress proportionally across the middle sections and ALWAYS finish with FAQ + Sources + JSON-LD + disclaimer. A complete back matter beats a long body that stops mid-document.',
      '- Never echo, duplicate, or copy the brief\'s draft block into the response — the article exists exactly once in your output.',
      '- IMPORTANT: do NOT start a new article. If you have a reference draft below, expand and revise IT — do not write a fresh article from scratch. A fresh article that ignores the reference is a hard failure.',
    ]),
    'Write the full page now. Front matter first, then body. Raw markdown only. Follow the DOCUMENT FORMAT CONTRACT exactly.',
  ]
  if (opts.refineNotes) {
    parts.push(
      '',
      '## REVISION REQUIRED — SURGICAL FIXES ONLY',
      'A previous draft failed the SEO audit. Fix ONLY the specific issues listed below — do NOT regenerate the whole article.',
      'For each issue, edit the smallest affected text (the flagged sentences, a single section, or the front matter) and keep everything that already passes. ' +
        'Rewriting sections that already pass re-introduces voice/schema/depth failures and wastes tokens.',
      'Keep the total body words inside the LENGTH window above.',
      opts.refineNotes,
    )
  }
  if (opts.draft) {
    parts.push(
      '',
      '## REFERENCE DRAFT — READ-ONLY CONTEXT (never quote it back)',
      'Your response is the revised article in full, emitted exactly once. Do not begin with the reference text, do not append a second copy, do not wrap in a code fence. ' +
        'Keep the reference\'s good sections, facts, headings, and interlinks; apply the fixes above.',
      '',
      '```markdown',
      opts.draft.length > 45000 ? opts.draft.slice(0, 45000) + '\n\n[…truncated…]' : opts.draft,
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
 * Strict per-section word budgets for the single-run drafter contract.
 * Allocates the page window across the brief's outline sections — TLDR, FAQ
 * and Sources get fixed reserves; the remaining budget is distributed
 * proportionally to each section's target (equal share when no target is
 * given) and clamped with a floor of 120 words per content section. The
 * returned ranges SUM to the page window, so a drafter that honours them
 * lands inside (pageMin, pageMax) in one run — no rescue, no echo.
 */
export function buildSectionBudgets(opts: {
  sections: Array<{ heading: string; targetWords?: number | null }>
  pageMin: number
  pageMax: number
  /** Anchor for the pack — the page TARGET (models anchor on it and
   *  overshoot, so the pack must land at the target, not the min). */
  pageTarget?: number
  reserveFaq?: number
  reserveTldr?: number
  reserveSources?: number
}): Array<{ heading: string; minWords: number; maxWords: number }> {
  const sections = (opts.sections || []).map((s) => String(s.heading || '').trim()).filter(Boolean)
  if (!sections.length) return []
  const target = opts.pageTarget && opts.pageTarget >= opts.pageMin && opts.pageTarget <= opts.pageMax
    ? opts.pageTarget
    : Math.round((opts.pageMin + opts.pageMax) / 2)
  // FAQ contract is 4–6 questions × 40–80 word answers + placement prose:
  // reserve UP TO 35% of the window (never under 450) so the FAQ never
  // overruns its own reserve.
  const reserveFaq = Math.min(
    opts.pageMax * 0.22,
    Math.max(opts.pageMin <= 1200 ? 160 : 320, opts.reserveFaq ?? Math.round(opts.pageMin * 0.18)),
  )
  const reserveTldr = Math.max(0, opts.reserveTldr ?? 80)
  const reserveSources = Math.max(0, opts.reserveSources ?? 40)
  const structural = (h: string) => {
    const lower = h.toLowerCase()
    return lower === 'in 60 seconds' || lower === 'table of contents' || lower.includes('source') || lower === 'related guides' || lower.includes('faq')
  }
  const hasFaq = sections.some((h) => h.toLowerCase().includes('faq'))
  const hasToc = sections.some((h) => h.toLowerCase() === 'table of contents')
  const structuralReserve =
    (sections.some((h) => h.toLowerCase() === 'in 60 seconds') ? reserveTldr : 0) +
    (hasToc ? 30 : 0) +
    (sections.some((h) => h.toLowerCase().includes('source')) ? reserveSources : 0) +
    (hasFaq ? reserveFaq : 0)
  const contentSections = sections.filter((h) => !structural(h))
  if (!contentSections.length) {
    return sections.map((h) => {
      const lower = h.toLowerCase()
      if (lower.includes('faq')) return { heading: h, minWords: Math.min(reserveFaq, 360), maxWords: reserveFaq }
      if (lower.includes('source')) return { heading: h, minWords: 10, maxWords: reserveSources }
      return { heading: h, minWords: 0, maxWords: 80 }
    })
  }
  // ── SUM INVARIANTS (single-run contract, committee-mandated) ──────────
  // The brief contract must leave NO room for a restart: honouring every
  // section MINIMUM must reach the page floor, and honouring every section
  // MAXIMUM must not exceed the page ceiling. Previously mins were 75% of
  // allocations, so Σmins ≈ 1650 against a 2200 floor — a drafter that met
  // every section minimum was still 550 words "under par", inviting the
  // append-a-second-copy failure mode.
  // Structural MINS (not maxs) are fixed small reserves; the content sections
  // split whatever remains of the page floor, so Σ(all mins) == pageMin.
  const structuralMinSum =
    (sections.some((h) => h.toLowerCase() === 'in 60 seconds') ? Math.min(60, reserveTldr) : 0) +
    (hasToc ? 0 : 0) +
    (sections.some((h) => h.toLowerCase().includes('source')) ? Math.min(10, reserveSources) : 0) +
    (hasFaq ? Math.min(reserveFaq, 360) : 0)
  const contentMinTotal = Math.max(contentSections.length * 120, opts.pageMin - structuralMinSum)
  const contentBudget = Math.max(
    contentMinTotal,
    Math.min(opts.pageMax - structuralReserve, target - structuralReserve),
  )
  const weights = contentSections.map((h) => {
    const entry = opts.sections.find((s) => String(s.heading || '').trim() === h)
    const w = Number(entry?.targetWords) || 0
    return w > 0 ? Math.max(1, w) : 1
  })
  const totalWeight = weights.reduce((a, b) => a + b, 0)
  const allocs = weights.map((w) => Math.round((contentBudget * w) / totalWeight))
  const correction = contentBudget - allocs.reduce((a, b) => a + b, 0)
  if (correction !== 0 && allocs.length) allocs[allocs.length - 1] += correction
  // Section minimums: an even share of the PAGE FLOOR remaining after the
  // structural reserves — so Σ(mins) == pageMin exactly (>= when the 120-word
  // per-section floor kicks in on section-heavy outlines). A drafter that
  // meets every section minimum lands AT the floor in one sweep.
  const perSectionFloor = Math.floor(contentMinTotal / contentSections.length)
  const floorRemainder = contentMinTotal - perSectionFloor * contentSections.length
  const byHeading = new Map<string, { heading: string; minWords: number; maxWords: number }>()
  contentSections.forEach((h, i) => {
    const minW = Math.max(120, perSectionFloor + (i < floorRemainder ? 1 : 0))
    const alloc = Math.max(minW, allocs[i] ?? minW)
    byHeading.set(h, { heading: h, minWords: minW, maxWords: alloc })
  })
  // Structural sections carry fixed small minimums (Σ with the content mins
  // equals the page floor) and their reserve maxes.
  sections.forEach((h) => {
    const lower = h.toLowerCase()
    if (byHeading.has(h)) return
    if (lower === 'in 60 seconds') byHeading.set(h, { heading: h, minWords: Math.min(60, reserveTldr), maxWords: reserveTldr })
    else if (lower === 'table of contents') byHeading.set(h, { heading: h, minWords: 0, maxWords: 30 })
    else if (lower.includes('faq')) byHeading.set(h, { heading: h, minWords: Math.min(reserveFaq, 360), maxWords: reserveFaq })
    else if (lower.includes('source') || lower === 'related guides') byHeading.set(h, { heading: h, minWords: Math.min(10, reserveSources), maxWords: reserveSources })
    else byHeading.set(h, { heading: h, minWords: 0, maxWords: 120 })
  })
  const budgets = sections.map((h) => byHeading.get(h)!)
  // Σ(maxs) may exceed pageMax when max(120, alloc) floors individual
  // sections on very short pages — rescale the maxes down proportionally so
  // the ceiling holds without ever pushing a max below its min.
  const maxSum = budgets.reduce((a, b) => a + b.maxWords, 0)
  if (maxSum > opts.pageMax) {
    const overflow = maxSum - opts.pageMax
    let remaining = overflow
    const flexible = budgets.filter((b) => b.maxWords > b.minWords)
    const flexTotal = flexible.reduce((a, b) => a + (b.maxWords - b.minWords), 0)
    if (flexTotal > 0) {
      for (const b of flexible) {
        const cut = Math.min(b.maxWords - b.minWords, Math.floor((overflow * (b.maxWords - b.minWords)) / flexTotal))
        b.maxWords -= cut
        remaining -= cut
      }
    }
    // Any residual overflow (rounding) comes off the largest flexible max.
    while (remaining > 0) {
      const target2 = flexible.slice().sort((a, b) => b.maxWords - a.maxWords)[0]
      if (!target2 || target2.maxWords <= target2.minWords) break
      target2.maxWords -= 1
      remaining -= 1
    }
  }
  return budgets
}

/**
 * Deterministic per-section budgets for a canonical window — used by the
 * pipelines when a brief arrives WITHOUT sectionBudgets (older briefs, cron
 * drafts, manual composer runs). Guarantees the committee invariants:
 * Σ(mins) ≥ pageMin and Σ(maxs) ≤ pageMax, so a drafter honouring the
 * contract cannot land outside the window in a single sweep.
 */
export function ensureSectionBudgets(
  existing: Array<{ heading: string; minWords: number; maxWords: number }> | undefined | null,
  opts: { h2Outline?: string[]; pageMin: number; pageMax: number; pageTarget?: number },
): Array<{ heading: string; minWords: number; maxWords: number }> {
  const provided = Array.isArray(existing) ? existing.filter((s) => s && String(s.heading || '').trim()) : []
  if (provided.length) {
    const minSum = provided.reduce((a, b) => a + Math.max(0, Number(b.minWords) || 0), 0)
    const maxSum = provided.reduce((a, b) => a + Math.max(0, Number(b.maxWords) || 0), 0)
    if (minSum >= opts.pageMin && maxSum <= opts.pageMax) return provided
    // Repair a non-conforming pack: rescale maxes into the ceiling, then
    // lift mins to the floor via a deterministic rebuild keyed on the same
    // headings (keeps the brief's section order and any custom headings).
    return buildSectionBudgets({
      sections: provided.map((s) => ({
        heading: String(s.heading),
        targetWords: Math.max(0, Number(s.maxWords) || 0) || undefined,
      })),
      pageMin: opts.pageMin,
      pageMax: opts.pageMax,
      pageTarget: opts.pageTarget,
    })
  }
  const sections = (opts.h2Outline || []).map((h) => String(h || '').trim()).filter(Boolean)
  if (!sections.length) return []
  return buildSectionBudgets({
    sections: sections.map((h) => ({ heading: h.replace(/^#+\s*/, '') })),
    pageMin: opts.pageMin,
    pageMax: opts.pageMax,
    pageTarget: opts.pageTarget,
  })
}

/** Keep per-H2 min–max attached when the outline is edited; rebuild if a heading is new or sums break the page window. */
export function syncSectionBudgetsToOutline(
  outline: string[],
  existing: Array<{ heading: string; minWords: number; maxWords: number }> | null | undefined,
  opts: { pageMin: number; pageMax: number; pageTarget?: number },
): Array<{ heading: string; minWords: number; maxWords: number }> {
  const headings = (outline || []).map((h) => String(h || '').replace(/^#+\s*/, '').trim()).filter(Boolean)
  if (!headings.length) return []
  const prev = new Map(
    (existing || []).map((s) => [String(s.heading || '').trim().toLowerCase(), s]),
  )
  const carried = headings.map((h) => {
    const p = prev.get(h.toLowerCase())
    if (p && Number(p.minWords) > 0 && Number(p.maxWords) >= Number(p.minWords)) {
      return { heading: h, minWords: Math.round(Number(p.minWords)), maxWords: Math.round(Number(p.maxWords)) }
    }
    return null
  })
  if (carried.every(Boolean)) {
    return ensureSectionBudgets(carried as Array<{ heading: string; minWords: number; maxWords: number }>, {
      h2Outline: headings,
      pageMin: opts.pageMin,
      pageMax: opts.pageMax,
      pageTarget: opts.pageTarget,
    })
  }
  return buildSectionBudgets({
    sections: headings.map((h) => ({ heading: h })),
    pageMin: opts.pageMin,
    pageMax: opts.pageMax,
    pageTarget: opts.pageTarget,
  })
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
  const draftSlice = opts.draft.length > 45000 ? opts.draft.slice(0, 45000) + '\n\n[…truncated…]' : opts.draft
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
    maxWords < 99999 ? `HARD MAXIMUM: ${maxWords} body words — the audit ALSO rejects bloated pages over the cap. Stop adding once you pass ${opts.targetWords}; do not overshoot into ${maxWords}+ territory.` : '',
    `This is a measured gate: the audit counts every body word and REJECTS the page below ${opts.minWords}. Under-delivering is the ONLY failure that matters. If you pass ${opts.targetWords} words the audit is satisfied.`,
    `You must ADD at least ${deficit + 250} more words of substance than the current draft. Do not stop writing until the total body prose clears ${opts.minWords} words.`,
    '',
    'RULES:',
    '1) EXPAND THE DRAFT INTO A COMPLETE PAGE — keep every existing section, fact, heading, and interlink from the draft below. Add substance to thin sections; never drop or replace what is already there.',
    '2) KEEP accurate facts from the draft; EXPAND every thin section — do not shrink.',
    '3) Do NOT write a fresh article from scratch. The draft below is your base — build on it. A full rewrite that ignores the draft is a hard failure.',
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
    // Rhythm guard — a full rewrite is where robotic openers get baked in: the
    // model reproduces its own repeated subjects across the whole page. Vary
    // openings up front (same 12-char rule the audit enforces) so the rewrite
    // never re-creates sentence_start_repetition. Applies to prose sentences
    // AND bullets (TL;DR list, FAQ answers) — bullets with the same opener are
    // just as robotic as sentences.
    '7) SENTENCE OPENINGS: vary every opening across the whole page — prose AND bullets. Do NOT start 5 or more sentences (or list items) with the same 12 characters (for example, do not open several bullets with the same subject phrase like "The UK dependent visa"). After the first mention, use pronouns, connectives, and concrete nouns.',
    '8) Before you finish, mentally count your body prose words: if under ' + opts.minWords + ', keep writing. A 2000-word page does not clear a 2200-word floor — the audit will reject it again.',
    '',
    '## PREVIOUS DRAFT (expand this — do not replace with a shorter page)',
    draftSlice,
    '',
    'Write the FULL expanded page now. Front matter first. Build on the draft below — do NOT start a fresh article. Write until the body prose is comfortably above the hard minimum.',
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
  maxWords?: number
  currentWords: number
  existingH2s: string[]
  draftExcerpt: string
  h2Outline?: string[]
  /** Rotating focus — each rescue pass targets a different gap so repeated
   *  appends add NEW substance instead of repeating the same sections. */
  focus?: string
}): string {
  const maxWords = opts.maxWords ?? 99999
  const deficit = Math.max(0, opts.minWords - opts.currentWords)
  // Add the full measured deficit in ONE pass — this draft is thin, so the
  // model must bridge the whole gap now (single-pass writer contract), not
  // nibble a third of it and force another rescue round. The ceiling only
  // tightens when the page is already close to the hard max.
  const need = Math.max(120, deficit + 120)
  const available = Math.max(0, maxWords - opts.currentWords)
  const appendCeiling = available > 0 ? Math.max(need, Math.min(available, need + 300)) : need + 300
  // More sections = each stays focused + it's easier for the model to fill a
  // large deficit with several distinct H2s than one giant one.
  const sectionCount = Math.max(1, Math.min(5, Math.ceil(need / 250)))
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
    `Current body words: ${opts.currentWords}. Add ${need}–${appendCeiling} NEW body words this pass. The gate needs ${opts.minWords} total and the audit re-measures after every pass.`,
    maxWords < 99999 ? `HARD CEILING: the FULL page must stay at or under ${maxWords} body words — if current + new would exceed ${maxWords}, write the minimum needed to clear ${opts.minWords} and stop.` : '',
    'Return ONLY new markdown H2 sections (no front matter, no JSON-LD, no duplicate of existing sections).',
    'Existing H2 titles (do not repeat these headings):',
    ...(opts.existingH2s.length ? opts.existingH2s.map((h) => `- ${h}`) : ['- (none parsed)']),
    '',
    focusLine,
    '',
    'ONE-PASS CONTRACT: this is the only expansion call — write EVERYTHING needed to clear the word gate in this single response. Budget your prose across the sections below so the total lands inside `${need}–${appendCeiling}` WORDS; do not emit a short section and expect a follow-up call. If the response window tightens, deepen each section progressively rather than stopping early.',
    `Write ${sectionCount} NEW H2 section${sectionCount === 1 ? '' : 's'} totalling ${need}–${appendCeiling} words in this one response. Stop at the ceiling. Choose the highest-value uncovered gaps from:`,
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
    // Rhythm guard — appended sections must not re-create the
    // sentence_start_repetition warning. The deterministic repair (applied to
    // the merged draft afterward) catches leftovers, but instructing the model
    // up front means new sections rarely need it.
    'SENTENCE OPENINGS: vary every opening. Do NOT start 5 or more sentences across the page with the same 12 characters (for example, don\'t open several sentences with the same subject phrase like "The UK dependent visa"). Use pronouns, connectives, and concrete nouns after the first mention.',
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
  /** When known, force a hard ceiling so drafts stop overshooting. */
  maxWords?: number
}): string {
  const min = audit.minWords ?? 2200
  const target = audit.targetWords ?? Math.round(min * 1.1)
  const max = audit.maxWords
  const lines: string[] = [
    `Previous score: ${audit.score}. Body word count was ${audit.wordCount} (HARD MIN ${min}, target ~${target}${max ? `, HARD MAX ${max}` : ''}).`,
  ]
  if (max && audit.wordCount > max) {
    lines.push(
      `- BLOCKER OVER-LENGTH: Draft is ${audit.wordCount} words — ABOVE the HARD MAX ${max}. Trim redundant sections, condense padding, and return a page between ${min} and ${max} words. Do NOT add new sections; tighten what exists.`,
    )
  }
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

  // Echo guard (draft-time bleed): an "appended" response that opens with
  // its own H1 or a frontmatter block is the model echoing a near-full
  // rewrite, not new sections. Appending it would double the word count
  // (the observed "meets window then appends near-equivalent draft"
  // signature). Refuse the whole append — the revision path handles full
  // rewrites; the append path only ever accepts section fragments.
  if (/^#{1}\s+/m.test(append) || /^---\s*$/m.test(append)) return draft
  // A near-full-size response (≥85% of the draft) with its own H1 anywhere
  // is still a rewrite, just one that quoted a draft block first.
  if (/^#{1}\s+/m.test(append) && countBodyWords(append) >= countBodyWords(draft) * 0.85) return draft

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
  /** Preferred body words for this part — sums to the document target. */
  wordTarget: number
  /** Hard ceiling for this part — sums to the document hard maximum. */
  wordCeiling: number
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
  targetWords?: number
  maxWords?: number
  segmentCount?: number
}): WriteSegment[] {
  const count = Math.max(1, Math.min(4, Math.floor(opts.segmentCount ?? 2)))
  const outline = (opts.h2Outline || []).map((h) => h.trim()).filter(Boolean)
  const floor = Math.max(200, opts.minWords)
  const target = Math.max(floor, opts.targetWords ?? floor)
  const ceiling = Math.max(target, opts.maxWords ?? target)
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
        wordTarget: target,
        wordCeiling: ceiling,
        priorSections: [],
      },
    ]
  }
  // Split the outline into contiguous balanced chunks. Generic briefs use
  // equal weights; the final segment owns FAQ/sources/back matter.
  const chunks: string[][] = outline.length
    ? Array.from({ length: effective }, (_, i) =>
        outline.slice(
          Math.floor((i * outline.length) / effective),
          Math.floor(((i + 1) * outline.length) / effective),
        ),
      )
    : Array.from({ length: effective }, () => [])
  const weights = chunks.map((c) => Math.max(1, c.length))
  const totalWeight = weights.reduce((a, b) => a + b, 0)
  const segments: WriteSegment[] = []
  const allocate = (total: number, weight: number, used: number, isLast: boolean) =>
    isLast ? Math.max(100, total - used) : Math.max(100, Math.floor(total * (weight / totalWeight)))
  chunks.forEach((sections, i) => {
    const isLast = i === effective - 1
    const wordFloor = allocate(floor, weights[i], segments.reduce((a, s) => a + s.wordFloor, 0), isLast)
    const wordTarget = allocate(target, weights[i], segments.reduce((a, s) => a + s.wordTarget, 0), isLast)
    const wordCeiling = allocate(ceiling, weights[i], segments.reduce((a, s) => a + s.wordCeiling, 0), isLast)
    segments.push({
      index: i + 1,
      total: effective,
      sections,
      wordFloor,
      wordTarget: Math.max(wordFloor, wordTarget),
      wordCeiling: Math.max(wordFloor, wordTarget, wordCeiling),
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
    `MEASURED WORD WINDOW FOR THIS PART: ${segment.wordFloor}–${segment.wordCeiling} body words; target ${segment.wordTarget}. YAML front matter, JSON-LD, and code fences do NOT count. The full article target is ${opts.targetWords} words. Stop at this part's ceiling—do not compensate by rewriting or adding sections assigned to another part.`,
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
    '5) Cite official sources with full https URLs where they support a claim — immigration departments AND the issuing body for this topic (exam/licensing board). Use exact allowlist URLs only.',
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
    `Write PART ${segment.index} now. Keep it between ${segment.wordFloor} and ${segment.wordCeiling} body words. If short, add concrete substance; if long, tighten this part before returning it.`,
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
