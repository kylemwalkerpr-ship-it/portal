import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { buildGscContentBrief, formatGscBriefForPrompt } from '@/lib/gscContentBrief'
import { generateContentText } from '@/lib/contentAiProvider'
import { requireAdminUser } from '@/lib/portalAuth'
import { resolveOwner, assertPlanRepoConsistency } from '@/lib/seoFactory/ownership'
import { renderTargetFile } from '@/lib/seoFactory/renderTarget'
import {
  createBranchFrom,
  getBranchHeadSha,
  openPullRequest,
  putRepoFile,
} from '@/lib/githubContents'

// ── Types ──
interface GenerateRequest {
  content_type: 'blog_post' | 'article' | 'regional_page' | 'marketplace_gig'
  region: 'US' | 'CA' | 'AU' | 'UK' | 'COMPARE'
  tone: 'professional' | 'educational' | 'persuasive' | 'authoritative' | 'casual'
  title?: string
  topic: string
  audience?: string
  keywords?: string[]
}

// ── Helpers ──

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70)
}

function todayStamp(): string {
  const d = new Date()
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

// AI generation uses lib/contentAiProvider (Cloudflare Workers AI primary,
// then xAI / OpenAI / DeepSeek / Groq fallbacks).

function buildPrompt(
  data: GenerateRequest,
  gscBlock: string,
): { system: string; prompt: string } {
  const isArticle = data.content_type === 'article'
  const isRegional = data.content_type === 'regional_page'
  const isGig = data.content_type === 'marketplace_gig'

  // ── House style (from yousafe-consultancy/docs/seo-briefs/00_HOUSE_STYLE.md) ──
  const houseStyle = [
    'Voice: calm, precise, authoritative immigration practitioner perspective. Use second person ("you").',
    'Plain English. Concrete details. No marketing gloss. Active voice preferred.',
    'Paragraphs: 2–4 sentences. No more than one em dash per three paragraphs.',
    'BANNED words: delve, streamline, game-changer, revolutionize, cutting-edge, leverage (verb), robust, seamless, holistic, bespoke, curated, unpack, navigate the complexities.',
    'BANNED constructions: rhetorical questions, "It\'s not just X…" framing, "In today\'s fast-paced…"',
    'ZERO outcome promises. No guarantees. Every statistic/rule must cite an official authority (USCIS, IRCC, UKVI, Home Affairs).',
    'Every article MUST include: Article + FAQPage JSON-LD schema, BreadcrumbList, official .gov/.edu citations in an inline SOURCES section.',
  ].join('\n')

  // ── SEO Master Plan requirements ──
  const wordCount = isArticle ? '1,800+ words (pillar article)' : isRegional ? '1,200+ words (mid-funnel landing)' : isGig ? '600–900 words (marketplace description)' : '900+ words (blog post)'
  const internalLinks = isRegional
    ? 'Include 3+ cross-links to specific caseworks articles and 2+ marketplace CTAs'
    : isGig
      ? 'Include 1 marketplace CTA to the full gig listing'
      : 'Include 2+ cross-links to related caseworks articles and 1+ marketplace CTA'

  // ── Region context ──
  const regionContext: Record<string, string> = {
    US: 'Focus on US immigration: F-1, OPT, STEM OPT, H-1B, green cards, I-765, I-983, DS-160, I-134, USCIS processes. Cite USCIS, DHS, SEVP, ICE.',
    CA: 'Focus on Canadian immigration: study permits, PGWP, Express Entry, Atlantic Immigration Program, family sponsorship. Cite IRCC, provincial nominee programs.',
    AU: 'Focus on Australian immigration: Student Visa 500, Temporary Graduate 485, Genuine Student requirement, skilled migration points, PR pathways. Cite Home Affairs, Department of Education.',
    UK: 'Focus on UK immigration: Student visa, Graduate Route, Skilled Worker visa, sponsorship. Cite UKVI, Home Office.',
    COMPARE: 'Compare immigration pathways across countries. Cover at least two regions with pros/cons. Cite official sources for each country.',
  }

  const system = [
    'You are a precise, authoritative immigration practitioner writing for the YouSafe Consultancy legal library.',
    `Content type: ${data.content_type.replace(/_/g, ' ')}.`,
    `Target word count: ${wordCount}.`,
    houseStyle,
    '',
    `Region context: ${regionContext[data.region] ?? 'General immigration content.'}`,
    `Internal linking requirements: ${internalLinks}.`,
    '',
    'SEO demand rules (from Google Search Console):',
    '- Treat the GSC keyword/page block as ground truth for demand. Prefer those queries over invented keywords.',
    '- Put the #1 primary query (or closest natural variant) in the title and first H2 where accurate.',
    '- Use secondary GSC queries as H2/H3 or FAQ questions when they match intent.',
    '- When GSC shows high impressions + deep position, expand with concrete local/legal detail (not fluff).',
    '- When GSC shows pos 4–20 + low CTR, write a click-worthy title/meta description (include year, place, and action).',
    '- Prefer internal links to related estate URLs listed in the GSC block when relevant.',
    '',
    'Output format:',
    '- YAML front matter: title, date (today), slug, region, tags (array), content_type, gsc_primary_keyword',
    '- H2 sections with concrete, actionable information',
    '- Strong opening (no rhetorical questions) and a concise closing with a marketplace CTA',
    '- Inline SOURCES section at the bottom citing official .gov/.edu URLs',
    '- Article + FAQPage JSON-LD schema in a <script type="application/ld+json"> block at the end',
    '',
    'Do NOT wrap output in ``` fences. Emit raw markdown/MDX only.',
  ].join('\n')

  const prompt = [
    `Title: ${data.title || '(derive a strong, SEO-optimized title from the topic AND the #1 GSC primary keyword)'}`,
    `Topic: ${data.topic}`,
    `Tone: ${data.tone}`,
    data.audience ? `Target audience: ${data.audience}` : '',
    data.keywords?.length ? `Editor-supplied keywords (secondary to GSC list): ${data.keywords.join(', ')}` : '',
    '',
    gscBlock,
    '',
    `Word count target: ${wordCount}.`,
    `Return valid Markdown${isArticle || isRegional ? ' (MDX-compatible)' : ''} with YAML front matter.`,
  ].filter(Boolean).join('\n')

  return { system, prompt }
}

function computeEeatScore(content: string, data: GenerateRequest): number {
  // Google E-E-A-T compliance scoring (Experience, Expertise, Authoritativeness, Trustworthiness)
  let score = 0
  const max = 12
  const words = content.split(/\s+/).length

  // Experience: first-hand knowledge signals
  if (/according to|based on|in our experience|we found|our analysis/i.test(content)) score += 1
  if (/case study|example|scenario|real.world/i.test(content)) score += 1

  // Expertise: depth and accuracy
  const h2s = (content.match(/^## /gm) ?? []).length
  if (h2s >= 5) score += 1  // comprehensive coverage
  if (words >= 1200) score += 1  // substantive content

  // Authoritativeness: citations and credentials
  if (/\.gov|\.edu|uscis\.gov|canada\.ca|homeaffairs\.gov|gov\.uk/i.test(content)) score += 2
  if (/according to (the )?[A-Z][a-z]+ [A-Z]|official|regulation|statute|section \d/i.test(content)) score += 1

  // Trustworthiness: transparency and accuracy
  if (/last updated|published|disclaimer|not legal advice|consult an? (attorney|lawyer|solicitor)/i.test(content)) score += 1
  if (/source|reference|citation|footnote/i.test(content)) score += 1

  // Structured data completeness
  if (/"@type":\s*"Article"/.test(content)) score += 1
  if (/"@type":\s*"FAQPage"/.test(content)) score += 1
  if (/datePublished|dateModified/.test(content)) score += 1

  // No banned words (penalty)
  const banned = /\b(delve|streamline|game.changer|revolutionize|cutting.edge|leverage|robust|seamless|holistic|bespoke|curated|unpack)\b/gi
  if (!banned.test(content)) score += 1

  return Math.min(Math.round((score / max) * 100), 100)
}

function computeSeoScore(content: string, data: GenerateRequest): number {
  let score = 0
  const max = 10

  const words = content.split(/\s+/).length
  if (words >= 1800) score += 2
  else if (words >= 900) score += 1

  if (content.startsWith('---')) score += 1

  const h2Count = (content.match(/^## /gm) ?? []).length
  if (h2Count >= 4) score += 1

  if (data.keywords?.length) {
    const keywordHits = data.keywords.filter(kw => content.toLowerCase().includes(kw.toLowerCase())).length
    if (keywordHits >= data.keywords.length * 0.7) score += 1
  }

  if (/\.gov|\.edu|uscis|ircc|homeaffairs|ukvi/i.test(content)) score += 2

  if (/marketplace|yousafeconsultancy\.com|gig|template|consultation/i.test(content)) score += 1

  if (/application\/ld\+json/.test(content)) score += 1

  const avgParaLen = words / Math.max(1, (content.match(/\n\n/g) ?? []).length)
  if (avgParaLen >= 25 && avgParaLen <= 100) score += 1

  return Math.min(Math.round((score / max) * 100), 100)
}

// ── Main handler ──

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }
    const userId =
      (auth.profile as { clerk_user_id?: string } | undefined)?.clerk_user_id ||
      auth.profileId ||
      'admin'

    const body: GenerateRequest = await request.json()

    if (!body.topic?.trim()) {
      return NextResponse.json({ error: 'Topic is required' }, { status: 400 })
    }

    // ── 1. GSC demand brief (live SA/OAuth or CSV snapshot) ──
    const gscBrief = await buildGscContentBrief({
      topic: body.topic,
      region: body.region,
      keywords: body.keywords,
    })
    const gscBlock = formatGscBriefForPrompt(gscBrief)

    // ── 2. AI Generation (Cloudflare Workers AI primary) ──
    const { system, prompt } = buildPrompt(body, gscBlock)
    const ai = await generateContentText({
      system,
      prompt,
      maxTokens: 5000,
      temperature: 0.65,
    })
    const content = ai.text
    const label = ai.provider
    const slug = slugify(body.title || body.topic)
    const safeSlug = slug || `post-${Date.now()}`
    const wordCount = content.split(/\s+/).length
    const seoScore = computeSeoScore(content, body)
    const eeatScore = computeEeatScore(content, body)

    // ── 3. Ownership (SEO strategies registry) → correct repo/path ──
    const primaryKeyword =
      (Array.isArray(body.keywords) && body.keywords[0]) ||
      gscBrief.primaryKeywords[0]?.term ||
      body.topic
    const plan = await resolveOwner({
      primaryKeyword: String(primaryKeyword),
      contentType: body.content_type,
      region: body.region,
      slug: safeSlug,
    })
    assertPlanRepoConsistency(plan)

    const owner = process.env.GITHUB_CONTENT_OWNER ?? 'kylemwalkerpr-ship-it'
    const target = {
      owner,
      repo: plan.repo,
      defaultBranch: 'main',
    }

    const { filePath, fileContent } = renderTargetFile({
      plan,
      content,
      title: body.title || body.topic,
      region: body.region,
      contentType: body.content_type,
      primaryKeyword: String(primaryKeyword),
      indexable: plan.indexable,
      canonicalUrl: plan.canonicalUrl,
    })

    const jobSuffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
    const branchName = `content-studio/${safeSlug}-${jobSuffix}`.slice(0, 240)

    const headSha = await getBranchHeadSha(target.owner, target.repo, target.defaultBranch)
    await createBranchFrom(target.owner, target.repo, branchName, headSha)

    const commitMsg = `content(${plan.host}/${body.content_type}): add "${body.title || safeSlug}" [Content Studio · ${plan.routingSource}]`
    // Always resolves blob sha when path already exists on the forked branch
    await putRepoFile({
      owner: target.owner,
      repo: target.repo,
      path: filePath,
      branch: branchName,
      content: fileContent,
      message: commitMsg,
    })

    const prTitle = body.title
      ? `[Content Studio] ${body.title}`
      : `[Content Studio] ${safeSlug}`
    const prBody = [
      '🤖 Generated by Content Studio (ownership from SEO strategies registry).',
      '',
      `- **Topic:** ${body.topic}`,
      `- **Region:** ${body.region}`,
      `- **Type:** ${body.content_type.replace(/_/g, ' ')}`,
      `- **Tone:** ${body.tone}`,
      `- **Owner host:** ${plan.host}`,
      `- **Repo:** \`${plan.repo}\``,
      `- **Routing:** ${plan.routingSource}${plan.matched ? ` · matched "${plan.matched.primary_keyword}" (${plan.matchScore})` : ''}`,
      `- **Canonical:** ${plan.canonicalUrl}`,
      body.audience ? `- **Audience:** ${body.audience}` : '',
      body.keywords?.length ? `- **Keywords:** ${body.keywords.join(', ')}` : '',
      `- **AI Provider:** ${label}`,
      `- **Word Count:** ${wordCount}`,
      `- **SEO Score:** ${seoScore}%`,
      `- **GSC source:** ${gscBrief.source}/${gscBrief.mode}`,
      gscBrief.primaryKeywords[0]
        ? `- **GSC primary keyword:** ${gscBrief.primaryKeywords[0].term} (${gscBrief.primaryKeywords[0].impressions} imp)`
        : '',
      `- **File:** \`${filePath}\``,
      plan.blockers.length ? `\n### Ownership blockers\n${plan.blockers.map((b) => `- ${b}`).join('\n')}` : '',
      '',
      '---',
      '> Review the content and merge when ready. The webhook will update the job status automatically.',
    ].filter(Boolean).join('\n')

    const pr = await openPullRequest({
      owner: target.owner,
      repo: target.repo,
      head: branchName,
      base: target.defaultBranch,
      title: prTitle,
      body: prBody,
    })

    // ── 4. Save to Supabase ──
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    const { data: job, error: dbError } = await supabase
      .from('content_jobs')
      .insert({
        user_id: userId,
        title: body.title || null,
        topic: body.topic,
        content_type: body.content_type,
        tone: body.tone,
        region: body.region,
        target_repo: target.repo,
        status: 'pr_created',
        slug: safeSlug,
        content,
        branch_name: branchName,
        content_path: filePath,
        pr_url: pr.html_url,
        pr_number: pr.number,
        ai_provider: label,
        word_count: wordCount,
        seo_score: seoScore,
        owner_host: plan.host,
        primary_keyword: String(primaryKeyword),
        canonical_url: plan.canonicalUrl,
        indexable: plan.indexable,
        ship_mode: 'pr',
      })
      .select()
      .single()

    if (dbError) throw new Error(`Supabase insert failed: ${dbError.message}`)

    return NextResponse.json({
      ok: true,
      job: {
        id: job.id,
        title: job.title,
        status: job.status,
        pr_url: pr.html_url,
        pr_number: pr.number,
        branch_name: branchName,
        content_path: filePath,
        target_repo: plan.repo,
        owner_host: plan.host,
        canonical_url: plan.canonicalUrl,
        word_count: wordCount,
        seo_score: seoScore,
        gsc: {
          source: gscBrief.source,
          mode: gscBrief.mode,
          primaryKeywords: gscBrief.primaryKeywords.slice(0, 6),
          opportunityKeywords: gscBrief.opportunityKeywords.slice(0, 6),
          warnings: gscBrief.warnings,
        },
      },
      plan: {
        host: plan.host,
        repo: plan.repo,
        filePath: plan.filePath,
        canonicalUrl: plan.canonicalUrl,
        routingSource: plan.routingSource,
        matchScore: plan.matchScore,
        matchedKeyword: plan.matched?.primary_keyword ?? null,
        blockers: plan.blockers,
        warnings: plan.warnings,
      },
    }, { status: 201 })

  } catch (err) {
    console.error('[content-studio/generate]', err)
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Internal error',
    }, { status: 500 })
  }
}
