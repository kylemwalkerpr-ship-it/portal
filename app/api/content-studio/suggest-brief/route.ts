export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { generateContentText } from '@/lib/contentAiProvider'

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
  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const topic = String(body.topic || '').trim()
    if (!topic) return NextResponse.json({ error: 'topic is required' }, { status: 400 })

    const region = String(body.region || 'US')
    const contentType = String(body.contentType || 'article')
    const audience = String(body.audience || '')
    const primaryKeyword = String(body.primaryKeyword || topic)
    // Use the admin's selected provider, defaulting to whatever is configured.
    // The provider cascade (auto) tries each configured provider in order;
    // each uses its own default model — we do NOT override with an
    // OpenAI-specific model name that would break NVIDIA/Baseten/etc.
    const aiProvider = String(body.aiProvider || 'auto').trim() || 'auto'

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
      blog_post: 'blog post (~1,000 words, conversational, with images)',
      article: 'long-form legal guide (~2,200–2,800 words, educational, YMYL-safe)',
      regional_page: 'regional landing page (~1,600 words, location-signalled)',
    }

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
      '  "recommendedTone": "professional | educational | authoritative | persuasive",',
      '  "recommendedAudience": "1-sentence description of the ideal reader",',
      '  "minWords": 2200,',
      '  "maxWords": 2800,',
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
    ].join('\n')

    const prompt = [
      `TOPIC: ${topic}`,
      `PRIMARY KEYWORD: ${primaryKeyword}`,
      `REGION: ${region}`,
      `CONTENT TYPE: ${contentTypeLabels[contentType] || contentType}`,
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
      '',
      'Produce the complete editorial brief JSON now.',
    ].filter(Boolean).join('\n')

    const ai = await generateContentText({
      aiProvider,
      system,
      prompt,
      maxTokens: 1600,
      temperature: 0.3,
    })

    const parsed = JSON.parse(ai.text || '{}')

    if (!parsed.suggestedH1 && !parsed.h2Outline) {
      return NextResponse.json({
        error: 'AI returned incomplete brief',
        raw: ai.text?.slice(0, 300),
      }, { status: 502 })
    }

    return NextResponse.json({
      ok: true,
      suggestedH1: String(parsed.suggestedH1 || ''),
      h2Outline: Array.isArray(parsed.h2Outline) ? parsed.h2Outline.slice(0, 12) : [],
      shortTail: Array.isArray(parsed.shortTail) ? parsed.shortTail.slice(0, 8) : [],
      longTail: Array.isArray(parsed.longTail) ? parsed.longTail.slice(0, 6) : [],
      kwH2Map: parsed.kwH2Map && typeof parsed.kwH2Map === 'object' ? parsed.kwH2Map as Record<string, string> : {},
      sources: Array.isArray(parsed.sources) ? parsed.sources.slice(0, 6) : [],
      interlinkTargets: Array.isArray(parsed.interlinkTargets) ? parsed.interlinkTargets.slice(0, 8) : [],
      targetSlug: String(parsed.targetSlug || ''),
      recommendedTone: String(parsed.recommendedTone || 'professional'),
      recommendedAudience: String(parsed.recommendedAudience || ''),
      minWords: Number(parsed.minWords) || 2200,
      maxWords: Number(parsed.maxWords) || 2800,
      readabilityLevel: String(parsed.readabilityLevel || ''),
      reasoning: String(parsed.reasoning || ''),
    })

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
