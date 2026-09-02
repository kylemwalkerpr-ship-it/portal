export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { resolveBriefAiProvider, generateBriefText, parseBriefJson } from '@/lib/seoFactory/briefModel'
import { suggestVerifiedInterlinks } from '@/lib/interlinkRegistry'
import { assembleDraftSourceAllowlist, ensureBriefInterlinks, ESTATE_ANCHOR_LINKS } from '@/lib/seoFactory/linkAudit'
import { mergeBriefKeywords } from '@/lib/seoEngine/planner'
import { detectRegionFromText, ensureMinimumOutline, filterKeywordsByRegion, filterOutlineByRegion, formatResearchPromptBlock, loadResearchDemandContext, pickResearchKeywords } from '@/lib/seoEngine/researchDemand'
import { assembleMasterEngineFeed } from '@/lib/seoFactory/masterEngineFeed'
import { formatContractBriefBlock } from '@/lib/seoFactory/formatContract'
import { buildSectionBudgets } from '@/lib/seoFactory/prompts'
import { suggestInventoryInterlinks } from '@/lib/seoFactory/estateInterlinks'
import {
  clampBriefWordBudget,
  depthPromptClause,
  maxWordsForType,
  minWordsForType,
  targetWordsForType,
} from '@/lib/seoFactory/contentDepth'

/**
 * POST /api/content-studio/suggest-brief
 *
 * The Research-stage intelligence engine. The selected Brief model ingests
 * everything Stage I (Discover) gathered — radar gaps, GSC demand, LLM
 * visibility scores, backlink gaps, keyword research, completed prior work,
 * verified interlinks — and produces a maximally prescriptive brief so the
 * drafting AI has zero room to hallucinate.
 *
 * Every field the generate-stream route needs is populated from live intel.
 */
export async function POST(req: NextRequest) {
  // Grok 4.6 reasoning needs 1–3 minutes for a full brief. A 90s/120s
  // ceiling is what produced "timed out after 90s" in the studio.
  const controller = new AbortController()
  const globalTimer = setTimeout(() => controller.abort(), 660_000)
  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const topic = String(body.topic || '').trim()
    if (!topic) return NextResponse.json({ error: 'topic is required' }, { status: 400 })

    let region = String(body.region || 'US')
    const contentType = String(body.contentType || 'article')
    const audience = String(body.audience || '')
    const primaryKeyword = String(body.primaryKeyword || topic)

    // ── REGION AUTO-SELECT ──────────────────────────────────────────────
    // Same policy as suggest-keywords: when the topic text confidently names
    // a different country than the picker's (default-US) value, the topic
    // wins. Every downstream input (demand context, engine feed, source
    // allowlist, interlink anchors) is keyed off this ONE region value.
    const detected = detectRegionFromText(`${topic} ${primaryKeyword}`)
    let regionAutoSelected = false
    if (detected && detected.region !== region.toUpperCase().slice(0, 2)) {
      region = detected.region
      regionAutoSelected = true
    }
    // Claude Opus 5 via Run BiOS is the PRIMARY brief model (see
    // lib/seoFactory/briefModel). Grok and DeepSeek V4 Flash (Run BiOS +
    // Baseten) are the other two Brief families; every other value —
    // including 'auto' or a stale drafting provider id — coerces to the
    // Claude Opus 5 default. When the primary is unconfigured or fails, the
    // call below falls back to Grok.
    const { aiProvider, model: modelOverride } = resolveBriefAiProvider(
      String(body.aiProvider || ''),
    )

    // GSC live data
    const gscImpressions = Number(body.gscImpressions) || 0
    const gscPosition = Number(body.gscPosition) || 0
    const gscClicks = Number(body.gscClicks) || 0

    // Discover intel
    const radarGaps = Array.isArray(body.radarGaps)
      ? body.radarGaps.map(String).slice(0, 8)
      : [] as string[]
    const llmVisibility = typeof body.llmVisibility === 'object' && body.llmVisibility
      ? body.llmVisibility as Record<string, unknown>
      : null
    const backlinkGaps = Array.isArray(body.backlinkGaps)
      ? body.backlinkGaps.map(String).slice(0, 5)
      : [] as string[]
    const opportunity = body.opportunity && typeof body.opportunity === 'object'
      ? body.opportunity as Record<string, unknown>
      : null
    const researchCtx = await loadResearchDemandContext(topic, primaryKeyword, region)
    const pickedKw = pickResearchKeywords(researchCtx, topic)
    const researchBlock = formatResearchPromptBlock(researchCtx, pickedKw)
    const completedWork = Array.isArray(body.completedWork)
      ? body.completedWork.map((w: any) => typeof w === 'object' && w ? { slug: String(w.slug || ''), topic: String(w.topic || '') } : { slug: '', topic: '' }).filter((w) => w.slug)
      : [] as Array<{ slug: string; topic: string }>
    for (const page of researchCtx.shipped) {
      const slug = String(page.url || '').replace(/^https?:\/\/[^/]+/, '') || page.primaryKeyword || ''
      if (slug && !completedWork.some((w) => w.slug === slug || w.topic === page.primaryKeyword)) {
        completedWork.push({ slug, topic: page.primaryKeyword || page.title })
      }
    }

    // Canonical estate shortlist. Metadata tells the brief model why a page
    // belongs, where it should be placed, and whether it was live-verified.
    let interlinks = Array.isArray(body.interlinks)
      ? body.interlinks.map((l: any) => ({
          label: String(l.label || ''), url: String(l.url || ''),
          reason: String(l.reason || ''), placement: String(l.placement || ''),
          role: String(l.role || ''), liveStatus: String(l.liveStatus || ''),
          score: Number(l.score) || 0, site: String(l.site || ''),
        })).filter((l) => l.url)
      : [] as Array<{ label: string; url: string; reason?: string; placement?: string; role?: string; liveStatus?: string; score?: number; site?: string }>
    if (interlinks.length < 2) {
      const estate = await suggestInventoryInterlinks(topic, [primaryKeyword], 6, { region }).catch(() => null)
      if (estate?.suggestions.length) interlinks = estate.suggestions
    }

    // Sitemap stats
    const sitemapCount = Number(body.sitemapCount) || 0

    const engineFeed = await assembleMasterEngineFeed({
      topic,
      primaryKeyword,
      region,
      contentType,
      title: String(body.title || primaryKeyword || topic),
      gsc: {
        impressions: gscImpressions,
        clicks: gscClicks,
        position: gscPosition,
        ctr: gscImpressions > 0 ? gscClicks / gscImpressions : undefined,
      },
    })

    const contentTypeLabels: Record<string, string> = {
      blog_post: 'blog post (conversational, with images)',
      article: 'long-form legal guide (educational, YMYL-safe)',
      regional_page: 'regional landing page (location-signalled)',
    }

    // ── WORD COUNT BUDGET ────────────────────────────────────────────────
    // Dictated by the canonical Google-aligned depth spec (contentDepth.ts)
    // for THIS content type — never the model's whim or a hardcoded default.
    // The draft-time audit + ship gate enforce the same numbers, so the brief
    // must carry them verbatim and the model must plan sections to fill them.
    const minWords = minWordsForType(contentType)
    const targetWords = targetWordsForType(contentType)
    const maxWords = maxWordsForType(contentType)

    const system = [
      'You are the master editorial brief architect for an immigration legal marketplace.',
      'Your job: given EVERY available intelligence signal, produce a complete, prescriptive brief that leaves the drafting AI with ZERO room to guess or hallucinate.',
      '',
      'INPUTS you receive:',
      '- Topic, primary keyword, region, content type, target audience',
      '- Live GSC demand data (impressions, clicks, position)',
      '- Radar gap opportunities (underserved search demand the estate does not yet cover)',
      '- LLM visibility scores (how often this topic is cited in AI answers — target high-citation clusters)',
      '- Backlink gaps (topics where competing sites outrank us in backlink authority)',
      '- Completed prior work (slugs + topics of pages already published — never duplicate or cannibalize)',
      '- Verified interlink allowlist (the ONLY internal URLs the draft may link to)',
      '- Estate sitemap size (for context on topical breadth)',
      '',
      'OUTPUT: a single JSON object with EVERY field the drafting system needs:',
      '{',
      '  "suggestedH1": "SEO-optimized H1 title (include primary keyword, keep ≤70 chars)",',
      '  "h2Outline": ["H2: Section title", ...]  // 6–10 descriptive H2 section headings',
      '  "shortTail": ["kw", ...]                   // 5–8 short-tail keywords (1–3 words each)',
      '  "longTail": ["longer phrase", ...]          // 4–6 long-tail keywords (4+ words each). These are COVERAGE terms, never literal text: the drafter must use them naturally in prose/FAQ answers and must NEVER write the keyword string itself as an FAQ question — questions are in natural reader English ("How much does an Australia student visa cost?", never "is it possible to australia student visa…").',
      '  "kwH2Map": { "keyword": "H2 section heading (exact match)" }  // place every keyword in exactly one H2 section',
      '  "sources": ["https://www.uscis.gov/working-in-the-united-states"]  // 3–5 URLs copied VERBATIM from the VERIFIED OFFICIAL SOURCE ALLOWLIST below — never invent a path; never add news/blogs/Wikipedia; every URL must be on-topic for THIS article',
      '  "interlinkTargets": [{ "label": "anchor text", "url": "/verified-path/", "placement": "which H2 section this link belongs in" }]  // pick from the allowlist — never invent URLs',
      '  "targetSlug": "kebab-case-slug-for-this-page",',
      '  "metaDescription": "140–160 character SEO meta description (compelling benefit + primary keyword, no clickbait)",',
      '  "recommendedTone": "professional | educational | authoritative | persuasive",',
      '  "recommendedAudience": "1-sentence description of the ideal reader",',
      `  "minWords": ${minWords},   // minimum ${minWords} (Google depth floor)`,
      `  "maxWords": ${maxWords},   // HARD MAX ${maxWords} — never exceed`,
      '  "readabilityLevel": "8th grade — active voice, short sentences, direct address (‘you’)",',
      '  "reasoning": "3–5 sentences explaining the editorial strategy: what gap this fills, why these keywords, how H2s map to search intent, which competitors to outrank."',
      '}',
      '',
      'RULES (NON-NEGOTIABLE):',
      '1. NEVER suggest a URL not in the interlink allowlist — use ONLY verified internal links. Select a cohesive reader journey, not merely the first URLs: topical authority → practical next step → service handoff only when the query has commercial intent.',
      '2. NEVER duplicate an H2, keyword placement, or slug from completed prior work.',
      '3. Target the word count range based on content type + Google SEO floor (2,200 min for legal guides).',
      '4. Every short-tail keyword must appear in kwH2Map mapped to exactly one H2 section.',
      '5. Every long-tail keyword must also appear in kwH2Map. Word each long-tail keyword AS a natural FAQ question ("how much is australia student visa" → FAQ "How much does an Australia student visa cost?") and map it to the FAQ H2 so the drafting AI answers the real demand query instead of stuffing the term into prose.',
      '6. Sources must be real, live, and on-topic. PREFER the VERIFIED SOURCE ALLOWLIST verbatim (government departments, official school pages, intergovernmental bodies, issuing bodies). You may also cite institutional pages (.org / .edu / official exam boards) when they directly support a claim in THIS article. Never Wikipedia, social media, URL shorteners, content-mill blogs, or low-authority sites. Every URL is live-checked; dead or off-topic citations are stripped before ship.',
      '7. targetSlug must be kebab-case, descriptive, and not collide with any completedWork slug.',
      '8. The h2Outline order must follow search intent flow: answer-first → evidence → process → FAQ.',
      '9. Prefer keywords with clear informational or commercial intent — avoid terms without a search volume signal.',
      '10. Return ONLY valid JSON — no markdown wrapper, no explanations outside the JSON.',
      '',
      formatContractBriefBlock(),
      '',
      'TITLE SAFETY: suggestedH1 must be a reader-ready title, not the primary keyword alone. It must add a specific benefit, audience, process, comparison, or accurate year. Never return a lowercase keyword-only H1.',
      'LAYOUT SAFETY: h2Outline is the document skeleton. Include exactly one In 60 seconds H2, one Table of contents marker, one FAQ H2, one Sources H2, and one Worked Example H2; do not put Sources or Related guides into FAQ questions.',
      '',
      'QUALITY WARNING PREVENTION (these checks are enforced at draft time — the brief must preempt them):',
      '11. ANTI-WALL-OF-TEXT: design H2s so each section is 2-4 short paragraphs (1-3 sentences). No prose block may exceed 180 characters without a visual break — split into bullets, a table, a numbered step, or a checkpoint. Use the h2Outline to guarantee scannability: mix explanatory H2s with checklist, comparison, and FAQ H2s.',
      '12. CONCRETE WORKED EXAMPLE: every long-form page (≥1,000 words) MUST include at least one concrete example with a named individual, their real-world situation, the step they took, and the result. Your h2Outline MUST contain an "Example" or "Worked Example" H2 section. Example markers like "For example," or "For instance," must appear in the body.',
      '13. SCHEMA ARTICLE JSON-LD: the drafting system injects Article schema (`{"@type":"Article"}`) from the brief metadata. Your brief MUST supply: author name, datePublished, dateModified, description, and mainEntityOfPage URL. These appear in the response as metadata fields, not in the outline.',
      '14. SCHEMA FAQ JSON-LD: include exactly one "## FAQ" H2 in h2Outline — never list individual FAQ questions as sibling H2s. The drafting AI writes 4–6 questions as ### H3s under that FAQ section (eligibility, timeline, required documents, costs, DIY-vs-attorney, denial/reapply). The system wraps those H3 Q&A pairs in FAQPage JSON-LD.',
      '15. META DESCRIPTION: write a 140–160 character meta description. Must include the primary keyword, a concrete benefit or timeline, and a call to action ("Learn", "Discover", "Check"). No clickbait. Never exceed 160 characters. This is the Google SERP snippet — make every character earn the click.',
      '16. INTERNAL LINKS (HARD REQUIREMENT): ALWAYS return at least 2 interlinkTargets — never fewer than 2, prefer 3–4. Each URL must come from the allowlist VERBATIM (no invented, guessed, or modified paths). The draft-time audit blocks on fewer than 2 internal estate links, so a thin interlinkTargets list forces rewrites.',
      ...(contentType === 'blog_post'
        ? [
            '',
            'BLOG FORMAT SPEC (blog_post — the deployed artifact is a STATIC Next.js page on yousafeconsultancy.com/blog/<slug>/ following the established blog format):',
            '17. BLOG STRUCTURE: conversational strategy post, NOT a legal document. H1 = hook + year (e.g. "Banking in Canada for International Students: Accounts, Credit & SIN (2026)"). Opening paragraph (2-4 sentences) frames the situation and what the reader will learn.',
            '18. SECTIONS: use "Step N:" H2 sections for practical walkthroughs (Step 1: Get your SIN first, Step 2: Choose a student bank account) or thematic H2s for comparisons. Short paragraphs (2-4 sentences each). Bullet lists for checklists.',
            '19. VOICE: direct address ("you"), plain language, 8th-grade reading level, actionable and specific. No legalese, no disclaimer boilerplate in the body — the blog template appends the legal-guide CTA automatically.',
            '20. INTERLINKS: 2-3 links to the legal pillar on legal.yousafeconsultancy.com where readers go deeper (use the allowlist URLs verbatim).',
            '21. LENGTH: 800–1,500 words (target ~1,200). Blogs are scannable strategy walkthroughs — never a 2,200-word legal guide.',
            '22. NO JSON-LD or schema blocks in the body — the blog page template emits Metadata + BlogDepthSection automatically.',
          ]
        : []),
    ].join('\n')

    const citationCtx = { region, topic, keywords: [primaryKeyword, topic, audience].filter(Boolean) }
    const seedOfficialSources = await assembleDraftSourceAllowlist(region, [], citationCtx)

    const prompt = [
      `TOPIC: ${topic}`,
      `PRIMARY KEYWORD: ${primaryKeyword}`,
      `REGION: ${region}`,
      `CONTENT TYPE: ${contentTypeLabels[contentType] || contentType}`,
      `WORD COUNT BUDGET (NON-NEGOTIABLE — this dictates the drafting length): ${minWords}–${maxWords} words, target ~${targetWords}. ${depthPromptClause(contentType)}`,
      audience ? `TARGET AUDIENCE: ${audience}` : '',
      gscImpressions > 0
        ? `GSC LIVE DATA: ${gscImpressions.toLocaleString()} impressions · ${gscClicks.toLocaleString()} clicks · avg position #${Math.round(gscPosition)}`
        : 'GSC: not connected (treat as zero-demand baseline)',
      engineFeed.promptBlock || '',
      opportunity
        ? `SELECTED DISCOVER CONTRACT (canonical — preserve this strategy):\nPriority: ${String(opportunity.priorityTier || 'unranked')} · value ${Number(opportunity.valueScore) || 0}/100 · play ${String(opportunity.play || '')} · intent ${String(opportunity.intent || '')}\nHarmonized title: ${String(opportunity.title || '')}\nEvidence: ${Array.isArray(opportunity.signals) ? opportunity.signals.map(String).join(' | ') : ''}\nCluster: ${JSON.stringify(opportunity.cluster || null)}\nQUALITY-FIRST RULE: one canonical page must satisfy this whole cluster. Prefer expanding an existing owner when mode=expand. Do not split related queries into multiple pages and do not create a low-value page merely to increase output volume.`
        : '',
      researchBlock,
      radarGaps.length > 0
        ? `RADAR GAP OPPORTUNITIES (underserved demand — fill these): ${radarGaps.join(' | ')}`
        : '',
      llmVisibility
        ? `LLM / AEO VISIBILITY: ${llmVisibility.total ?? '?'} citations tracked · share-of-voice ${llmVisibility.shareOfVoice ?? '?'}% · fan-out coverage: ${JSON.stringify(llmVisibility.cited ?? 'unknown')}`
        : '',
      backlinkGaps.length > 0
        ? `BACKLINK GAPS (competitors outrank us on these — build authority): ${backlinkGaps.join(' | ')}`
        : '',
      completedWork.length > 0
        ? `COMPLETED PRIOR WORK (never duplicate — differentiate from these):\n${completedWork.map((w) => `  - ${w.slug} («${w.topic}»)`).join('\n')}`
        : 'COMPLETED PRIOR WORK: none yet — this is a greenfield topic.',
      interlinks.length > 0
        ? `CANONICAL ESTATE INTERLINK SHORTLIST (only these live/indexable URLs may be used):\n${interlinks.map((l) => `  - [${l.label}] ${l.url}\n    role=${l.role || 'topical-guide'}; relevance=${l.score || 'ranked'}; recommended placement=${l.placement || 'contextual section'}; reason=${l.reason || 'estate relevance match'}`).join('\n')}\nChoose 2–4 links that form a cohesive reader journey. Preserve each URL verbatim and use the recommended placement unless a more exact H2 exists.`
        : 'VERIFIED INTERNAL LINK ALLOWLIST: none provided — rely exclusively on sitemap-verified estate URLs.',
      seedOfficialSources.length
        ? `VERIFIED SOURCE ALLOWLIST (live-checked authorities for this topic — copy URLs VERBATIM into "sources"; government/edu/intergov preferred, on-topic institutional pages allowed; no blogs/Wikipedia/social):\n${seedOfficialSources.map((s) => `  - ${s}`).join('\n')}`
        : 'VERIFIED SOURCE ALLOWLIST: empty after live check — return an empty sources array or cite only institutional pages you are certain exist and are on-topic. Never invent a path.',
      sitemapCount > 0
        ? `ESTATE SITEMAP SIZE: ${sitemapCount} pages live — find adjacency opportunities.`
        : '',
      contentType === 'blog_post'
        ? 'BLOG FORMAT: static blog page on yousafeconsultancy.com/blog/ — conversational "Step N:" walkthrough, 800–1,500 words, direct address, 2-3 legal-pillar links (see BLOG FORMAT SPEC rules 17-22).'
        : '',
      '',
      'Produce the complete editorial brief JSON now.',
    ].filter(Boolean).join('\n')

    // Claude Opus 5 / Grok are reasoning models: 90s is too short (live
    // probe: a brief can land at ~43s, or take well over 90s on a loaded
    // session). Floor at 5 minutes.
    const { ai, fallbackUsed } = await generateBriefText({
      aiProvider,
      model: modelOverride,
      system,
      prompt,
      maxTokens: 8000,
      temperature: 0.3,
      timeoutMs: 600_000,
    })

    // Models occasionally return a raw newline/tab inside a quoted JSON
    // value. parseBriefJson performs only the narrow safe recovery for those
    // control characters and still fails closed on malformed JSON structure.
    const parsed = parseBriefJson(ai.text || '')

    if (!parsed.suggestedH1 && !parsed.h2Outline) {
      return NextResponse.json({
        error: 'AI returned incomplete brief',
        raw: ai.text?.slice(0, 300),
      }, { status: 502 })
    }

    // ── INTERNAL LINK GUARANTEE (≥2 verified estate links in EVERY brief) ──
    // The draft audit requires ≥2 internal/estate links; a brief with 0–1
    // targets leaves the drafting model to improvise. Guarantee it
    // mechanically: brief allowlist → live-verified registry → region anchors.
    let briefAllowlist = interlinks
    if (briefAllowlist.length === 0) {
      try {
        const verified = await suggestVerifiedInterlinks(primaryKeyword, [topic, primaryKeyword], 6)
        briefAllowlist = verified.map((v) => ({ label: v.label, url: v.url }))
      } catch { /* fall through to region anchors below */ }
    }
    if (briefAllowlist.length === 0) {
      const regionKey = (region || 'US').toUpperCase().slice(0, 2)
      briefAllowlist = (ESTATE_ANCHOR_LINKS[regionKey] || ESTATE_ANCHOR_LINKS.US).map((a) => ({ label: a.label, url: a.url }))
    }
    const interlinkTargets = ensureBriefInterlinks(
      briefAllowlist,
      Array.isArray(parsed.interlinkTargets) ? parsed.interlinkTargets : [],
      { region, min: 2, max: 6 },
    )
    const enrichedInterlinkTargets = interlinkTargets.map((target) => {
      const source = interlinks.find((link) => link.url.replace(/\/+$/, '').toLowerCase() === target.url.replace(/\/+$/, '').toLowerCase())
      return { ...source, ...target, placement: target.placement || source?.placement || 'Contextually relevant section' }
    })

    // The model may echo a sub-range INSIDE the canonical budget; anything
    // below the floor or above the hard max is clamped back to the spec so a
    // brief can never under-spec (or over-spec) the drafting length.
    const { minWords: finalMin, maxWords: finalMax } = clampBriefWordBudget(
      contentType,
      parsed.minWords as number | undefined,
      parsed.maxWords as number | undefined,
    )

    // ── KEYWORD FLOOR GUARANTEE (≥5 short / ≥4 long-tail) ──────────────
    // The quality gate hard-blocks drafts when the brief ships fewer than 5
    // short keywords ("Brief shipped only N short keyword(s); need at least
    // 5"). The model occasionally returns 3-4 shorts — merge its output with
    // the deterministic partitioner so the floor is ALWAYS met. The
    // partitioner derives short heads from the primary's own word windows
    // (handles long primaries like "study abroad statement of purpose").
    // ── BRIEF COHERENCE GUARD (deterministic, model-independent) ─────────
    // The prompt forbids cross-region keywords/H2s; this ENFORCES it. A
    // model that echoes "canada study permit" into a US brief gets it
    // stripped here — and the kwH2Map entry goes with it, so the drafting AI
    // can never inherit a mixed-region placement.
    const modelShortRaw = Array.isArray(parsed.shortTail) ? parsed.shortTail.map(String).filter(Boolean) : []
    const modelLongRaw = Array.isArray(parsed.longTail) ? parsed.longTail.map(String).filter(Boolean) : []
    const shortFilter = filterKeywordsByRegion(modelShortRaw, region)
    const longFilter = filterKeywordsByRegion(modelLongRaw, region)
    const droppedOffRegion = [...shortFilter.dropped, ...longFilter.dropped]

    const rawOutline = Array.isArray(parsed.h2Outline) ? parsed.h2Outline.map(String).filter(Boolean) : []
    const outlineFilter = filterOutlineByRegion(rawOutline, region)
    droppedOffRegion.push(...outlineFilter.dropped)

    const rawKwH2Map = parsed.kwH2Map && typeof parsed.kwH2Map === 'object' ? parsed.kwH2Map as Record<string, string> : {}
    const kwMapFilter = filterKeywordsByRegion(Object.keys(rawKwH2Map), region)
    const coherentKwH2Map: Record<string, string> = {}
    for (const k of kwMapFilter.kept) coherentKwH2Map[k] = String(rawKwH2Map[k] || '')
    droppedOffRegion.push(...kwMapFilter.dropped)

    const merged = mergeBriefKeywords({
      modelShort: [...pickedKw.shortTail, ...shortFilter.kept],
      modelLong: [...pickedKw.longTail, ...longFilter.kept],
      primaryTerm: primaryKeyword,
    })

    const normalizeHeading = (value: string) => String(value || '').replace(/^#{1,3}\s*/, '').replace(/^H2:\s*/i, '').trim()
    const finalOutlineUncapped = ensureMinimumOutline(outlineFilter.kept.length ? outlineFilter.kept : [
      'In 60 seconds',
      `What ${primaryKeyword} means for this reader`,
      'Eligibility and requirements',
      'Documents and evidence checklist',
      'Application process step by step',
      'Costs, timing and common risks',
      'Worked Example',
      'FAQ',
      'Sources',
    ])
    // Minimum-outline guarantee: legal/immigration guides need a real
    // skeleton — a 5-section brief invites truncated expansion, and the
    // review gate now BLOCKS when canonical outline sections are absent
    // from the body. Deterministically complete the skeleton (content
    // sections first, then structural) so sparse skeletons never ship again.
    const finalOutline = finalOutlineUncapped.slice(0, 12)

    // The keyword floor can add terms after the model response. Complete the
    // placement map deterministically so the UI and drafting contract never
    // show 9 required keywords beside an empty placement panel.
    const completedKwH2Map: Record<string, string> = {}
    const allKeywords = [...merged.short.slice(0, 8), ...merged.longTail.slice(0, 6)]
    const headingTokens = (heading: string) => new Set(heading.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2))
    const longTailSet = new Set(merged.longTail.slice(0, 6).map((k) => k.toLowerCase()))
    const faqHeading = finalOutline.find((h) => /^faq$/i.test(h.trim())) || finalOutline.find((h) => h.toLowerCase().includes('faq'))
    for (const keyword of allKeywords) {
      const modelHeading = normalizeHeading(coherentKwH2Map[keyword] || '')
      const exact = finalOutline.find((h) => h.toLowerCase() === modelHeading.toLowerCase())
      if (exact) {
        completedKwH2Map[keyword] = exact
        continue
      }
      // Long-tail keywords belong in the FAQ question slot because that is
      // where the drafting AI answers the demand query naturally. Prefer the
      // FAQ H2 over any prose heading; only fall back when no FAQ exists.
      if (longTailSet.has(keyword.toLowerCase())) {
        completedKwH2Map[keyword] = faqHeading || finalOutline[1] || finalOutline[0]
        continue
      }
      const kwTokens = keyword.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2)
      const ranked = finalOutline
        .filter((h) => !/^(in 60 seconds|table of contents|faq|sources)$/i.test(h))
        .map((heading) => ({ heading, overlap: kwTokens.filter((t) => headingTokens(heading).has(t)).length }))
        .sort((a, b) => b.overlap - a.overlap)
      completedKwH2Map[keyword] = ranked[0]?.heading || faqHeading || finalOutline[1] || finalOutline[0]
    }

    const substantiveOutline = finalOutline.filter((h) => !/^(table of contents|sources)$/i.test(h))
    const sectionTarget = Math.max(120, Math.round(targetWords / Math.max(1, substantiveOutline.length)))
    const sectionPlan = finalOutline.map((heading) => ({
      heading,
      intent: /in 60 seconds/i.test(heading) ? 'answer-first summary'
        : /faq/i.test(heading) ? 'related-question satisfaction'
          : /source/i.test(heading) ? 'evidence and citation record'
            : /example/i.test(heading) ? 'experience and applied evidence'
              : /cost|fee|tim/i.test(heading) ? 'decision support'
                : /step|process|document|require|eligib/i.test(heading) ? 'procedural satisfaction'
                  : 'topical depth',
      format: /in 60 seconds/i.test(heading) ? '3–5 bullets'
        : /faq/i.test(heading) ? '4–6 H3 questions with concise answers'
          : /source/i.test(heading) ? 'verified citation list'
            : /checklist|document/i.test(heading) ? 'checklist with short supporting paragraphs'
              : /cost|fee|compar|vs/i.test(heading) ? 'comparison table plus analysis'
                : '2–4 short paragraphs with a useful visual break',
      targetWords: /^(in 60 seconds|table of contents|sources)$/i.test(heading) ? 80 : sectionTarget,
      keywords: allKeywords.filter((keyword) => completedKwH2Map[keyword] === heading),
    }))
    // Strict per-section word budgets — the hardlined single-run contract the
    // drafter receives (page window distributed across the outline; TLDR/FAQ/
    // Sources reserved). The studio carries these into generate-stream so the
    // drafting prompt demands ONE article inside the window, never echoes.
    const sectionBudgets = buildSectionBudgets({
      sections: finalOutline.map((h) => ({
        heading: h,
        targetWords: /^(in 60 seconds|table of contents|sources)$/i.test(h) ? 80 : sectionTarget,
      })),
      pageMin: finalMin,
      pageMax: finalMax,
      pageTarget: targetWords,
    })
    const finalSources = await assembleDraftSourceAllowlist(
      region,
      Array.isArray(parsed.sources) ? parsed.sources.slice(0, 6).map(String) : [],
      citationCtx,
    )

    return NextResponse.json({
      ok: true,
      // Which model actually produced the brief — 'runbios-claude-opus'
      // (Claude Opus 5) or 'grok' (SuperGrok fallback) — so the UI can
      // surface a "primary unavailable — brief generated via Grok" notice.
      provider: ai.provider,
      model: ai.model,
      fallbackUsed,
      region,
      regionAutoSelected,
      droppedOffRegion: [...new Set(droppedOffRegion)].slice(0, 12),
      masterEngine: {
        ok: engineFeed.ok,
        intent: engineFeed.intent,
        composite: engineFeed.composite,
        grade: engineFeed.grade,
        recommendationCount: engineFeed.recommendationCount,
        coveragePct: engineFeed.coveragePct,
        computedSignals: engineFeed.computedSignals,
        totalSignals: engineFeed.totalSignals,
        phase: engineFeed.phase,
      },
      fromEngine: researchCtx.engineTerms.slice(0, 16),
      fromUbersuggest: researchCtx.uberTerms.slice(0, 16),
      blockedCanonicals: pickedKw.skippedCanonicals,
      competing: researchCtx.competing.competing.slice(0, 8),
      suggestedH1: String(parsed.suggestedH1 || ''),
      h2Outline: finalOutline,
      sectionBudgets,
      shortTail: merged.short.slice(0, 8),
      longTail: merged.longTail.slice(0, 6),
      kwH2Map: completedKwH2Map,
      sectionPlan,
      sources: finalSources,
      interlinkTargets: enrichedInterlinkTargets.slice(0, 8),
      targetSlug: String(parsed.targetSlug || ''),
      metaDescription: String(parsed.metaDescription || '').slice(0, 160),
      recommendedTone: String(parsed.recommendedTone || 'professional'),
      recommendedAudience: String(parsed.recommendedAudience || ''),
      minWords: finalMin,
      targetWords,
      maxWords: finalMax,
      readabilityLevel: String(parsed.readabilityLevel || ''),
      reasoning: String(parsed.reasoning || ''),
      briefCompleteness: {
        identity: Boolean(parsed.suggestedH1 && parsed.targetSlug),
        outline: finalOutline.length >= 6,
        keywords: merged.short.length >= 5 && merged.longTail.length >= 4,
        placements: allKeywords.every((keyword) => Boolean(completedKwH2Map[keyword])),
        sources: finalSources.length >= 3,
        interlinks: interlinkTargets.length >= 2,
      },
    })

  } catch (err) {
    clearTimeout(globalTimer)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  } finally {
    clearTimeout(globalTimer)
  }
}
