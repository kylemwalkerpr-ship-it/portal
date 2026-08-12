export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { generateContentText } from '@/lib/contentAiProvider'
import { suggestVerifiedInterlinks } from '@/lib/interlinkRegistry'
import { ensureBriefInterlinks, ESTATE_ANCHOR_LINKS } from '@/lib/seoFactory/linkAudit'
import { mergeBriefKeywords } from '@/lib/seoEngine/planner'
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
 * The Research-stage intelligence engine. GPT Luna ingests everything Stage I
 * (Discover) gathered — radar gaps, GSC demand, LLM visibility scores, backlink
 * gaps, completed prior work, verified interlinks — and produces a maximally
 * prescriptive brief so the drafting AI has zero room to hallucinate.
 *
 * Every field the generate-stream route needs is populated from live intel.
 */
export async function POST(req: NextRequest) {
  // 120s hard ceiling — if the AI cascade still hasn't produced a brief
  // after 2 minutes, abort so the client sees a clean error instead of
  // an infinite spinner. The per-provider timeoutMs (90s) is the primary
  // guard; this is the belt-and-suspenders safety net.
  const controller = new AbortController()
  const globalTimer = setTimeout(() => controller.abort(), 120_000)
  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const topic = String(body.topic || '').trim()
    if (!topic) return NextResponse.json({ error: 'topic is required' }, { status: 400 })

    const region = String(body.region || 'US')
    const contentType = String(body.contentType || 'article')
    const audience = String(body.audience || '')
    const primaryKeyword = String(body.primaryKeyword || topic)
    // Default to GPT-5.6 Terra (OpenAI) for Research — this is the model
    // optimized for structured planning tasks. The admin can override via
    // the provider dropdown in Configurator.
    const aiProvider = String(body.aiProvider || 'openai').trim() || 'openai'

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
    const completedWork = Array.isArray(body.completedWork)
      ? body.completedWork.map((w: any) => typeof w === 'object' && w ? { slug: String(w.slug || ''), topic: String(w.topic || '') } : { slug: '', topic: '' }).filter((w) => w.slug)
      : [] as Array<{ slug: string; topic: string }>

    // Verified interlink allowlist (from the registry, live-filtered)
    const interlinks = Array.isArray(body.interlinks)
      ? body.interlinks.map((l: any) => ({ label: String(l.label || ''), url: String(l.url || '') })).filter((l) => l.url)
      : [] as Array<{ label: string; url: string }>

    // Sitemap stats
    const sitemapCount = Number(body.sitemapCount) || 0

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
      '  "longTail": ["longer phrase", ...]          // 4–6 long-tail keywords (4+ words each)',
      '  "kwH2Map": { "keyword": "H2 section heading (exact match)" }  // place every keyword in exactly one H2 section',
      '  "sources": ["https://gov-or-edu-source.gov/page"]  // 3–5 authoritative URLs to cite',
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
      '1. NEVER suggest a URL not in the interlink allowlist — use ONLY verified internal links.',
      '2. NEVER duplicate an H2, keyword placement, or slug from completed prior work.',
      '3. Target the word count range based on content type + Google SEO floor (2,200 min for legal guides).',
      '4. Every short-tail keyword must appear in kwH2Map mapped to exactly one H2 section.',
      '5. Every long-tail keyword must also appear in kwH2Map.',
      '6. Sources must be real, authoritative .gov / .edu / institutional URLs — never Wikipedia.',
      '7. targetSlug must be kebab-case, descriptive, and not collide with any completedWork slug.',
      '8. The h2Outline order must follow search intent flow: answer-first → evidence → process → FAQ.',
      '9. Prefer keywords with clear informational or commercial intent — avoid terms without a search volume signal.',
      '10. Return ONLY valid JSON — no markdown wrapper, no explanations outside the JSON.',
      '',
      'QUALITY WARNING PREVENTION (these checks are enforced at draft time — the brief must preempt them):',
      '11. ANTI-WALL-OF-TEXT: design H2s so each section is 2-4 short paragraphs (1-3 sentences). No prose block may exceed 180 characters without a visual break — split into bullets, a table, a numbered step, or a checkpoint. Use the h2Outline to guarantee scannability: mix explanatory H2s with checklist, comparison, and FAQ H2s.',
      '12. CONCRETE WORKED EXAMPLE: every long-form page (≥1,000 words) MUST include at least one concrete example with a named individual, their real-world situation, the step they took, and the result. Your h2Outline MUST contain an "Example" or "Worked Example" H2 section. Example markers like "For example," or "For instance," must appear in the body.',
      '13. SCHEMA ARTICLE JSON-LD: the drafting system injects Article schema (`{"@type":"Article"}`) from the brief metadata. Your brief MUST supply: author name, datePublished, dateModified, description, and mainEntityOfPage URL. These appear in the response as metadata fields, not in the outline.',
      '14. SCHEMA FAQ JSON-LD: include 4-6 FAQ questions as H2 sections in the h2Outline. At minimum: eligibility, timeline, required documents, costs, DIY-vs-attorney, and denial/reapply questions. The drafting system wraps these in FAQPage JSON-LD (`{"@type":"FAQPage"}`) so the page qualifies for AI-overview rich results.',
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
        ? `VERIFIED INTERNAL LINK ALLOWLIST (only these URLs may be used):\n${interlinks.map((l) => `  - [${l.label}] ${l.url}`).join('\n')}`
        : 'VERIFIED INTERNAL LINK ALLOWLIST: none provided — rely exclusively on sitemap-verified estate URLs.',
      sitemapCount > 0
        ? `ESTATE SITEMAP SIZE: ${sitemapCount} pages live — find adjacency opportunities.`
        : '',
      contentType === 'blog_post'
        ? 'BLOG FORMAT: static blog page on yousafeconsultancy.com/blog/ — conversational "Step N:" walkthrough, 800–1,500 words, direct address, 2-3 legal-pillar links (see BLOG FORMAT SPEC rules 17-22).'
        : '',
      '',
      'Produce the complete editorial brief JSON now.',
    ].filter(Boolean).join('\n')

    // 90s deadline — GPT models (gpt-5.6-terra) can take 40-70s to generate
    // the full structured JSON brief. 45s was tight and caused timeouts on
    // every deployment with OpenAI as the Research provider.
    const ai = await generateContentText({
      aiProvider,
      // Pin GPT-5.6 Terra for Research/Discover — the model the admin
      // selected in Configurator. Sol and Luna are for Review (senior edit)
      // and Draft (high-volume) respectively. Terra is the balanced model
      // optimized for structured planning tasks.
      model: aiProvider === 'openai' ? 'gpt-5.6-terra' : undefined,
      system,
      prompt,
      maxTokens: 1600,
      temperature: 0.3,
      timeoutMs: 90_000,
    })

    // Strip markdown code fences + extract JSON object from model response.
    // Some models wrap JSON in ```json ... ``` fences, others add preamble
    // text before the JSON. Find the outermost { } block and parse only that.
    let rawText = (ai.text || '').trim()
    const firstBrace = rawText.indexOf('{')
    const lastBrace = rawText.lastIndexOf('}')
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      rawText = rawText.slice(firstBrace, lastBrace + 1)
    }
    rawText = rawText.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '')
    const parsed = JSON.parse(rawText || '{}')

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
    const modelShort = Array.isArray(parsed.shortTail) ? parsed.shortTail.map(String).filter(Boolean) : []
    const modelLong = Array.isArray(parsed.longTail) ? parsed.longTail.map(String).filter(Boolean) : []
    const merged = mergeBriefKeywords({
      modelShort,
      modelLong,
      primaryTerm: primaryKeyword,
    })

    return NextResponse.json({
      ok: true,
      suggestedH1: String(parsed.suggestedH1 || ''),
      h2Outline: Array.isArray(parsed.h2Outline) ? parsed.h2Outline.slice(0, 12) : [],
      shortTail: merged.short.slice(0, 8),
      longTail: merged.longTail.slice(0, 6),
      kwH2Map: parsed.kwH2Map && typeof parsed.kwH2Map === 'object' ? parsed.kwH2Map as Record<string, string> : {},
      sources: Array.isArray(parsed.sources) ? parsed.sources.slice(0, 6) : [],
      interlinkTargets: interlinkTargets.slice(0, 8),
      targetSlug: String(parsed.targetSlug || ''),
      metaDescription: String(parsed.metaDescription || '').slice(0, 160),
      recommendedTone: String(parsed.recommendedTone || 'professional'),
      recommendedAudience: String(parsed.recommendedAudience || ''),
      minWords: finalMin,
      maxWords: finalMax,
      readabilityLevel: String(parsed.readabilityLevel || ''),
      reasoning: String(parsed.reasoning || ''),
    })

  } catch (err) {
    clearTimeout(globalTimer)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  } finally {
    clearTimeout(globalTimer)
  }
}
