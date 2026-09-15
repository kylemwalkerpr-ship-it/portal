export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import { resolveBriefAiProvider, generateBriefText, parseBriefJson } from '@/lib/seoFactory/briefModel'
import { suggestVerifiedInterlinks } from '@/lib/interlinkRegistry'
import { assembleDraftSourceAllowlist, ensureBriefInterlinks, filterLiveInternalUrls, ESTATE_ANCHOR_LINKS } from '@/lib/seoFactory/linkAudit'
import { applyEvidenceRegionFloor, collectDiscoverCitationUrls, mergeCitationUrlLists, sourcesForBrief } from '@/lib/seoFactory/officialSources'
import { mergeBriefKeywords } from '@/lib/seoEngine/planner'
import { ensureMinimumOutline, filterKeywordsByRegion, filterOutlineByRegion, formatResearchPromptBlock, loadResearchDemandContext, pickResearchKeywords, resolveBriefRegion } from '@/lib/seoEngine/researchDemand'
import { assembleMasterEngineFeed } from '@/lib/seoFactory/masterEngineFeed'
import { formatContractBriefBlock } from '@/lib/seoFactory/formatContract'
import { keywordContractForDraft, renderKeywordContractBrief, sanitizeBriefOutline } from '@/lib/seoFactory/keywordContract'
import { buildSectionBudgets } from '@/lib/seoFactory/prompts'
import { suggestInventoryInterlinks } from '@/lib/seoFactory/estateInterlinks'
import { preferRegionInterlinks } from '@/lib/seoFactory/studioInterlinks'
import {
  clampBriefWordBudget,
  depthPromptClause,
  maxWordsForType,
  minWordsForType,
  targetWordsForType,
} from '@/lib/seoFactory/contentDepth'
import { resolveProviderAuthors, citedProvidersPromptBlock, citedProvidersPublic, isMarketplaceServiceUrl, mergeMarketplaceServiceLinks } from '@/lib/seoFactory/providerAuthors'
import { BriefInvalidError, sealBriefFromAssembly } from '@/lib/seoFactory/sealedBrief'

/**
 * POST /api/content-studio/suggest-brief
 *
 * The Research-stage intelligence engine. The selected Brief model ingests
 * live Discover signals that actually reach this route — selected opportunity
 * contract, GSC demand (when provided), research-demand context, master engine
 * feed (incl. LLM visibility evidence when assembled server-side), completed
 * prior work, and verified interlinks — and produces a maximally prescriptive
 * brief so the drafting AI has zero room to hallucinate.
 *
 * Optional body keys radarGaps / llmVisibility / backlinkGaps are accepted if
 * a caller supplies them, but Discover does not currently populate those
 * radarMeta fields — do not advertise them as guaranteed Stage I inputs.
 */
export async function POST(req: NextRequest) {
  const controller = new AbortController()
  const globalTimer = setTimeout(() => controller.abort(), 660_000)
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const topic = String(body.topic || '').trim()
    if (!topic) return NextResponse.json({ error: 'topic is required' }, { status: 400 })

    let region = String(body.region || 'US')
    const contentType = String(body.contentType || 'article')
    const audience = String(body.audience || '')
    const primaryKeyword = String(body.primaryKeyword || topic)

    const resolvedRegion = resolveBriefRegion(typeof body.region === 'string' ? body.region : null, `${topic} ${primaryKeyword}`)
    region = resolvedRegion.region
    const regionAutoSelected = resolvedRegion.regionAutoSelected
    const { aiProvider, model: modelOverride } = resolveBriefAiProvider(
      String(body.aiProvider || ''),
    )

    const gscImpressions = Number(body.gscImpressions) || 0
    const gscPosition = Number(body.gscPosition) || 0
    const gscClicks = Number(body.gscClicks) || 0

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
    const seedKeywordContract = keywordContractForDraft({
      primaryKeyword,
      requiredShortKeywords: pickedKw.shortTail,
      requiredLongTailKeywords: pickedKw.longTail,
      shortKeywordTerms: (pickedKw.shortTail || []).map((term) => ({ term, source: 'demand' as const })),
      longTailKeywordTerms: (pickedKw.longTail || []).map((term) => ({ term, source: 'demand' as const })),
    })
    const completedWork = Array.isArray(body.completedWork)
      ? body.completedWork.map((w: any) => typeof w === 'object' && w ? { slug: String(w.slug || ''), topic: String(w.topic || '') } : { slug: '', topic: '' }).filter((w) => w.slug)
      : [] as Array<{ slug: string; topic: string }>
    for (const page of researchCtx.shipped) {
      const slug = String(page.url || '').replace(/^https?:\/\/[^/]+/, '') || page.primaryKeyword || ''
      if (slug && !completedWork.some((w) => w.slug === slug || w.topic === page.primaryKeyword)) {
        completedWork.push({ slug, topic: page.primaryKeyword || page.title })
      }
    }

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

    const minWords = minWordsForType(contentType)
    const targetWords = targetWordsForType(contentType)
    const maxWords = maxWordsForType(contentType)

    const system = [
      'You are the master editorial brief architect for an immigration legal marketplace.',
      'Your job: given EVERY available intelligence signal, produce a complete, prescriptive brief that leaves the drafting AI with ZERO room to guess or hallucinate.',
      '',
      'INPUTS you receive (only use what is actually present below — never invent missing intel):',
      '- Topic, primary keyword, region, content type, target audience',
      '- GSC demand data when provided (impressions, clicks, position)',
      '- Selected Discover opportunity contract when provided (priority, play, signals, cluster)',
      '- Master engine / research-demand blocks when assembled server-side',
      '- Completed prior work (slugs + topics of pages already published — never duplicate or cannibalize)',
      '- Verified interlink allowlist (the ONLY internal URLs the draft may link to)',
      '- Estate sitemap size (for context on topical breadth)',
      '- Optional extras only if present: radar gap list, body-level LLM visibility, backlink gap list',
      '',
      'OUTPUT: a single JSON object with EVERY field the drafting system needs:',
      '{',
      '  "suggestedH1": "SEO-optimized H1 title (include primary keyword, keep ≤70 chars)",',
      `  "h2Outline": ["H2: Section title", ...]  // ${
        contentType === 'blog_post' || contentType === 'blog_summary'
          ? '5–7'
          : contentType === 'regional_page' || contentType === 'regional_from' || contentType === 'regional_university'
            ? '6–8'
            : '8–10'
      } H2s paced so the PAGE window sums to ${minWords}–${maxWords} words. Per-H2 ranges are pacing, not independent mini-articles.`,
      '  "shortTail": ["kw", ...]                   // echo KEYWORD CONTRACT demand shorts (1–3 words). Do not invent replacements.',
      '  "longTail": ["longer phrase", ...]          // echo KEYWORD CONTRACT demand long-tails (4+ words). These are COVERAGE terms, never literal FAQ questions or H2s. The drafter uses them naturally in prose/FAQ answers.',
      '  "kwH2Map": { "keyword": "H2 section heading (exact match)" }  // map each demand topic to the H2 that already answers it; never invent a heading to park a phrase',
      '  "sources": ["<verbatim URL from VERIFIED SOURCE ALLOWLIST>"]  // 3–5 URLs copied VERBATIM from the VERIFIED OFFICIAL SOURCE ALLOWLIST below — cite these verbatim allowlist URLs; never add news/blogs/Wikipedia; every URL must be on-topic for THIS article',
      '  "interlinkTargets": [{ "label": "anchor text", "url": "/verified-path/", "placement": "which H2 section this link belongs in" }]  // pick from the allowlist — never invent URLs',
      '  "targetSlug": "kebab-case-slug-for-this-page",',
      '  "metaDescription": "140–160 character SEO meta description (compelling benefit + primary keyword, no clickbait)",',
      '  "recommendedTone": "professional | educational | authoritative | persuasive",',
      '  "recommendedAudience": "1-sentence description of the ideal reader",',
      `  "minWords": ${minWords},`,
      `  "maxWords": ${maxWords},`,
      '  "readabilityLevel": "8th grade — active voice, short sentences, direct address (‘you’)",',
      '  "reasoning": "3–5 sentences explaining the editorial strategy: what gap this fills, why these keywords, how H2s map to search intent, which competitors to outrank.",',
      '  "thesis": "one sentence the whole article argues — not the raw keyword",',
      '  "takeaways": ["complete claim with a verb", "complete claim", "complete claim"],',
      '  "lede": "2–3 sentences the opening MUST answer",',
      '  "faqQuestions": ["reader question the H2s did not already settle", "..."],',
      '  "unresolved": ["anything not in Discover that you would otherwise invent"]',
      '}',
      '',
      'RULES (NON-NEGOTIABLE):',
      '1. NEVER suggest a URL not in the interlink allowlist — use ONLY verified internal links. Select a cohesive reader journey, not merely the first URLs: topical authority → practical next step → service handoff only when the query has commercial intent.',
      '2. NEVER duplicate an H2, keyword placement, or slug from completed prior work.',
      `3. Word count is gated by estate type: blogs 800–1200 (apex yousafe-consultancy /blog), regional guides 1200–2000 (usa/uk/ca/au), caseworks canonicals 2200–2500. This brief is ${minWords}–${maxWords} (target ~${targetWords}). Subdivide that window across h2Outline — every H2 gets a min/max; honouring them must land the draft inside the gate.`,
      '4. Echo the KEYWORD CONTRACT demand terms. Do not invent extra required keywords or paraphrase them into unplaceable FAQ-question strings.',
      '5. Map each demand keyword to exactly one H2 in kwH2Map. Long-tails belong in the FAQ section as ANSWER coverage, never as the question text and never as an H2 heading.',
      '6. Sources must be real, live, and on-topic. PREFER the VERIFIED SOURCE ALLOWLIST verbatim (government departments, official school pages, intergovernmental bodies, issuing bodies). You may also cite institutional pages (.org / .edu / official exam boards) when they directly support a claim in THIS article. Never Wikipedia, social media, URL shorteners, content-mill blogs, or low-authority sites. Every URL is live-checked; dead or off-topic citations are stripped before ship.',
      '7. targetSlug must be kebab-case, descriptive, and not collide with any completedWork slug.',
      '8. The h2Outline order must follow search intent flow: answer-first → evidence → process → FAQ.',
      '9. Prefer keywords from MASTER ENGINE / UBERSUGGEST. Do not replace the KEYWORD CONTRACT with invented coverage terms.',
      '10. Return ONLY valid JSON — no markdown wrapper, no explanations outside the JSON.',
      '',
      formatContractBriefBlock(),
      '',
      renderKeywordContractBrief(seedKeywordContract, primaryKeyword),
      '',
      'TITLE SAFETY: suggestedH1 must be a reader-ready title, not the primary keyword alone. It must add a specific benefit, audience, process, comparison, or accurate year. Never return a lowercase keyword-only H1.',
      'LAYOUT SAFETY: h2Outline is the document skeleton. For legal_guide / article / regional pages include exactly one In 60 seconds H2, one Table of contents marker, one FAQ H2, and one Sources H2. For blog_post / blog_summary / news_summary do NOT force In 60 seconds, TOC, FAQ, or a Worked Example H2 — outline 3–6 purpose-led sections that advance one thesis.',
      '',
      'QUALITY WARNING PREVENTION (these checks are enforced at draft time — the brief must preempt them):',
      '11. ANTI-WALL-OF-TEXT: for guides/regional, design H2s so each section is 2-4 short paragraphs. Blogs may use a developed 4–6 sentence paragraph when it earns its place.',
      '12. CONCRETE PROCEDURE: long-form guides/regional must include procedural concreteness (forms, documents, sequences). Do NOT invent a named person, testimonial, or personal story. If EXPERIENCE_BEATS are supplied, use those anonymised beats only. Blogs never require a worked-example H2 or a protagonist.',
      '13. SCHEMA ARTICLE JSON-LD: the drafting system injects Article schema (`{"@type":"Article"}`) from the brief metadata. Your brief MUST supply: author name, datePublished, dateModified, description, and mainEntityOfPage URL. These appear in the response as metadata fields, not in the outline. When YMYL AUTHOR / MARKETPLACE CITATION lists a real attorney or consultant, that person is the author — never invent YouSafe Editorial Team.',
      '14. SCHEMA FAQ JSON-LD: include exactly one "## FAQ" H2 in h2Outline — never list individual FAQ questions as sibling H2s. The drafting AI writes 4–6 questions as ### H3s under that FAQ section (eligibility, timeline, required documents, costs, DIY-vs-attorney, denial/reapply). The system wraps those H3 Q&A pairs in FAQPage JSON-LD.',
      '15. META DESCRIPTION: write a 140–160 character meta description. Must include the primary keyword, a concrete benefit or timeline, and a call to action ("Learn", "Discover", "Check"). No clickbait. Never exceed 160 characters. This is the Google SERP snippet — make every character earn the click.',
      '16. INTERNAL LINKS (HARD REQUIREMENT): ALWAYS return at least 2 interlinkTargets — never fewer than 2, prefer 3–4. Each URL must come from the allowlist VERBATIM (no invented, guessed, or modified paths). The draft-time audit blocks on fewer than 2 internal estate links, so a thin interlinkTargets list forces rewrites.',
      '23. NO GUESSWORK: thesis, takeaways, lede, and faqQuestions are mandatory. Takeaways are complete claims (subject + verb + consequence), never keyword fragments. FAQ questions must not restate an H2. If a fee, date, URL, form, or statistic is not in Discover, put it in unresolved — the drafter will omit it rather than invent.',
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
    const discoverSources = collectDiscoverCitationUrls({
      region,
      topic,
      keywords: [primaryKeyword, topic, audience].filter(Boolean),
      signals: Array.isArray(opportunity?.signals) ? opportunity.signals.map(String) : [],
      extraUrls: [
        ...(Array.isArray(body.discoverSources) ? body.discoverSources.map(String) : []),
        ...(Array.isArray(body.competingUrls)
          ? body.competingUrls.map((c: unknown) => String((c as { url?: string })?.url || c || ''))
          : []),
      ],
    })
    const seedOfficialSources = await assembleDraftSourceAllowlist(region, discoverSources, citationCtx)
    const officialBankUrls = sourcesForBrief(citationCtx).map((s) => s.url)
    const verifiedAllowlist = seedOfficialSources.length ? seedOfficialSources : officialBankUrls
    const providerAuthors = await resolveProviderAuthors({
      region,
      topic,
      primaryKeyword,
      contentType,
    })
    if (providerAuthors.links.length) {
      const existing = new Set(interlinks.map((l) => String(l.url || '').replace(/\/+$/, '').toLowerCase()))
      for (const link of providerAuthors.links) {
        const key = link.url.replace(/\/+$/, '').toLowerCase()
        if (existing.has(key)) continue
        existing.add(key)
        interlinks.push({
          label: link.label,
          url: link.url,
          role: link.role,
          placement: link.placement,
          reason: link.reason,
          score: 100,
        } as typeof interlinks[number])
      }
    }

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
      renderKeywordContractBrief(seedKeywordContract, primaryKeyword),
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
      verifiedAllowlist.length
        ? `VERIFIED SOURCE ALLOWLIST (cite these verbatim allowlist URLs — copy URLs VERBATIM into "sources"; government/edu/intergov preferred, on-topic institutional pages allowed; no blogs/Wikipedia/social):\n${verifiedAllowlist.map((s) => `  - ${s}`).join('\n')}`
        : 'VERIFIED SOURCE ALLOWLIST: cite these verbatim allowlist URLs from the regional official bank.',
      citedProvidersPromptBlock(providerAuthors.cited),
      sitemapCount > 0
        ? `ESTATE SITEMAP SIZE: ${sitemapCount} pages live — find adjacency opportunities.`
        : '',
      contentType === 'blog_post'
        ? 'BLOG FORMAT: static blog page on yousafeconsultancy.com/blog/ — conversational "Step N:" walkthrough, 800–1,500 words, direct address, 2-3 legal-pillar links (see BLOG FORMAT SPEC rules 17-22).'
        : '',
      '',
      'Produce the complete editorial brief JSON now.',
    ].filter(Boolean).join('\n')

    const { ai, fallbackUsed } = await generateBriefText({
      aiProvider,
      model: modelOverride && String(modelOverride).toLowerCase().includes(String(aiProvider).split('-')[0].toLowerCase())
        ? modelOverride
        : undefined,
      system,
      prompt,
      maxTokens: 8000,
      temperature: 0.3,
      timeoutMs: 600_000,
    })

    const parsed = parseBriefJson(ai.text || '')

    if (!parsed.suggestedH1 && !parsed.h2Outline) {
      return NextResponse.json({
        error: 'AI returned incomplete brief',
        raw: ai.text?.slice(0, 300),
      }, { status: 502 })
    }

    let briefAllowlist = interlinks
    if (briefAllowlist.length === 0) {
      try {
        const verified = await suggestVerifiedInterlinks(primaryKeyword, [topic, primaryKeyword], 6, region)
        briefAllowlist = verified.map((v) => ({ label: v.label, url: v.url }))
      } catch { /* fall through to region anchors below */ }
    }
    if (briefAllowlist.length === 0) {
      const regionKey = (region || 'US').toUpperCase().slice(0, 2)
      briefAllowlist = (ESTATE_ANCHOR_LINKS[regionKey] || ESTATE_ANCHOR_LINKS.US).map((a) => ({ label: a.label, url: a.url }))
    }
    const paddedInterlinks = preferRegionInterlinks(
      ensureBriefInterlinks(
        briefAllowlist,
        Array.isArray(parsed.interlinkTargets) ? parsed.interlinkTargets : [],
        { region, min: 2, max: 6 },
      ),
      region,
      2,
    ).kept
    const liveInternal = new Set(await filterLiveInternalUrls(paddedInterlinks.map((t) => t.url)))
    const interlinkTargets = paddedInterlinks.filter((t) =>
      isMarketplaceServiceUrl(t.url)
      || liveInternal.has(t.url.replace(/\/+$/, ''))
      || liveInternal.has(t.url)
      || [...liveInternal].some((u) => u.replace(/\/+$/, '') === t.url.replace(/\/+$/, '')),
    )
    const enrichedInterlinkTargets = interlinkTargets.map((target) => {
      const source = interlinks.find((link) => link.url.replace(/\/+$/, '').toLowerCase() === target.url.replace(/\/+$/, '').toLowerCase())
      return { ...source, ...target, placement: target.placement || source?.placement || 'Contextually relevant section' }
    })

    const { minWords: finalMin, maxWords: finalMax } = clampBriefWordBudget(
      contentType,
      parsed.minWords as number | undefined,
      parsed.maxWords as number | undefined,
    )

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
      researchShort: pickedKw.shortTail,
      researchLong: pickedKw.longTail,
      modelShort: shortFilter.kept,
      modelLong: longFilter.kept,
      primaryTerm: primaryKeyword,
    })

    const normalizeHeading = (value: string) => String(value || '').replace(/^#{1,3}\s*/, '').replace(/^H2:\s*/i, '').trim()
    const sanitizedModelOutline = sanitizeBriefOutline(
      outlineFilter.kept,
      [...merged.short, ...merged.longTail, primaryKeyword],
    )
    const structural = /^(in 60 seconds|table of contents|faq|sources)$/i
    const substantiveCount = sanitizedModelOutline.filter((heading) => !structural.test(normalizeHeading(heading))).length
    const requiredSubstantive = contentType === 'blog_post' || contentType === 'blog_summary' || contentType === 'news_summary' ? 3 : 4
    if (!sanitizedModelOutline.length || substantiveCount < requiredSubstantive) {
      throw new BriefInvalidError([
        `outline: briefing produced ${substantiveCount} substantive section(s); need at least ${requiredSubstantive} evidence-led sections`,
        'outline: generic eligibility/documents/process/cost/example sections are not manufactured as fallback',
      ])
    }
    const finalOutlineUncapped = ensureMinimumOutline(sanitizedModelOutline, contentType)
    const finalOutline = finalOutlineUncapped.slice(0, 12)

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
    const sectionBudgets = buildSectionBudgets({
      sections: finalOutline.map((h) => ({
        heading: h,
        targetWords: /^(in 60 seconds|table of contents|sources)$/i.test(h) ? 80 : sectionTarget,
      })),
      pageMin: finalMin,
      pageMax: finalMax,
      pageTarget: targetWords,
    })
    const assembledSources = await assembleDraftSourceAllowlist(
      region,
      mergeCitationUrlLists(
        discoverSources,
        Array.isArray(parsed.sources) ? parsed.sources.slice(0, 8).map(String) : [],
        12,
      ),
      citationCtx,
    )
    const regionalSources = applyEvidenceRegionFloor(assembledSources, region)
    const finalSources = regionalSources.lines
    if (regionalSources.fallbackUsed && regionalSources.fallbackNote) {
      droppedOffRegion.push(regionalSources.fallbackNote)
    }

    return NextResponse.json({
      ok: true,
      provider: ai.provider,
      model: ai.model,
      ownerProvider: aiProvider,
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
      shortKeywordTerms: merged.shortTerms.slice(0, 8),
      longTailKeywordTerms: merged.longTailTerms.slice(0, 6),
      kwH2Map: completedKwH2Map,
      sectionPlan,
      sources: finalSources,
      sourceRegionFallback: regionalSources.fallbackUsed,
      sourceRegionFallbackNote: regionalSources.fallbackNote,
      interlinkTargets: mergeMarketplaceServiceLinks(
        preferRegionInterlinks(enrichedInterlinkTargets, region, 2).kept.slice(0, Math.max(2, 8 - providerAuthors.links.length)),
        providerAuthors.links,
      ),
      authorPack: providerAuthors.author,
      citedProviders: citedProvidersPublic(providerAuthors.cited),
      targetSlug: String(parsed.targetSlug || ''),
      metaDescription: String(parsed.metaDescription || '').slice(0, 160),
      recommendedTone: String(parsed.recommendedTone || 'professional'),
      recommendedAudience: String(parsed.recommendedAudience || ''),
      minWords: finalMin,
      targetWords,
      maxWords: finalMax,
      readabilityLevel: String(parsed.readabilityLevel || ''),
      reasoning: String(parsed.reasoning || ''),
      thesis: String(parsed.thesis || ''),
      takeaways: Array.isArray(parsed.takeaways) ? parsed.takeaways.map(String).filter(Boolean).slice(0, 5) : [],
      lede: String(parsed.lede || ''),
      faqQuestions: Array.isArray(parsed.faqQuestions) ? parsed.faqQuestions.map(String).filter(Boolean).slice(0, 6) : [],
      sealedBrief: sealBriefFromAssembly({
        title: String(parsed.suggestedH1 || ''),
        primaryKeyword,
        audience: String(parsed.recommendedAudience || audience || ''),
        contentType,
        h2Outline: finalOutline,
        kwH2Map: completedKwH2Map,
        sectionPlan,
        thesis: String(parsed.thesis || ''),
        takeaways: Array.isArray(parsed.takeaways) ? parsed.takeaways.map(String) : [],
        faqQuestions: Array.isArray(parsed.faqQuestions) ? parsed.faqQuestions.map(String) : [],
        lede: String(parsed.lede || ''),
      }),
      briefCompleteness: {
        identity: Boolean(parsed.suggestedH1 && parsed.targetSlug),
        outline: substantiveCount >= requiredSubstantive,
        keywords: merged.short.length >= 5 && merged.longTail.length >= 4,
        placements: allKeywords.every((keyword) => Boolean(completedKwH2Map[keyword])),
        sources: finalSources.length >= 3,
        interlinks: interlinkTargets.length >= 2,
      },
    })

  } catch (err) {
    clearTimeout(globalTimer)
    const message = err instanceof Error ? err.message : 'Unknown error'
    const status = err instanceof BriefInvalidError ? 422 : 500
    return NextResponse.json({ error: message }, { status })
  } finally {
    clearTimeout(globalTimer)
  }
}
