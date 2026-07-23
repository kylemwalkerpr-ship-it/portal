import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Buffer } from 'node:buffer'
import { buildGscContentBrief, formatGscBriefForPrompt } from '@/lib/gscContentBrief'
import { generateContentText } from '@/lib/contentAiProvider'
import { requireAdminUser } from '@/lib/portalAuth'
import { resolveOwner, assertPlanRepoConsistency } from '@/lib/seoFactory/ownership'
import { renderTargetFile } from '@/lib/seoFactory/renderTarget'

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

// ── GitHub helpers ──

async function gh(path: string, init: RequestInit): Promise<any> {
  const token = process.env.GITHUB_TOKEN || process.env.CONTENT_STUDIO_GITHUB_TOKEN
  if (!token) throw new Error('GITHUB_TOKEN (or CONTENT_STUDIO_GITHUB_TOKEN) not set')
  const base = process.env.GITHUB_API_BASE ?? 'https://api.github.com'
  // GitHub rejects Workers' default UA with 403 administrative rules.
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'yousafe-portal-content-studio',
      ...(init.headers ?? {}),
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`GitHub ${res.status}: ${text.slice(0, 200)}`)
  }
  return res.json()
}

async function getDefaultBranchSha(owner: string, repo: string, branch: string): Promise<string> {
  const refPath = `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`
  try {
    const resp = await gh(refPath, { method: 'GET' })
    return resp.object.sha
  } catch {
    const branches = await gh(`/repos/${owner}/${repo}/branches`, { method: 'GET' })
    const b = (branches as Array<{ name: string; commit: { sha: string } }>).find(x => x.name === branch)
    if (!b) throw new Error(`Branch '${branch}' not found`)
    return b.commit.sha
  }
}

async function createBranch(owner: string, repo: string, branchName: string, fromSha: string): Promise<void> {
  await gh(`/repos/${owner}/${repo}/git/refs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha: fromSha }),
  })
}

function encodeRepoPath(filePath: string): string {
  return String(filePath || '')
    .replace(/^\//, '')
    .split('/')
    .filter(Boolean)
    .map((seg) => encodeURIComponent(seg))
    .join('/')
}

/** Blob SHA when path exists on branch; undefined if free (create). Required for updates. */
async function getFileSha(
  owner: string,
  repo: string,
  path: string,
  branch: string,
): Promise<string | undefined> {
  const token = process.env.GITHUB_TOKEN || process.env.CONTENT_STUDIO_GITHUB_TOKEN
  if (!token) throw new Error('GITHUB_TOKEN not set')
  const base = process.env.GITHUB_API_BASE ?? 'https://api.github.com'
  const res = await fetch(
    `${base}/repos/${owner}/${repo}/contents/${encodeRepoPath(path)}?ref=${encodeURIComponent(branch)}`,
    {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'yousafe-portal-content-studio',
      },
    },
  )
  if (res.status === 404) return undefined
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`GitHub ${res.status} getFileSha: ${text.slice(0, 200)}`)
  }
  const file = await res.json()
  if (Array.isArray(file)) throw new Error(`Path is a directory: ${path}`)
  return file.sha as string | undefined
}

async function putFile(
  owner: string,
  repo: string,
  branch: string,
  path: string,
  content: string,
  message: string,
): Promise<void> {
  const b64 = Buffer.from(content, 'utf8').toString('base64')
  let sha = await getFileSha(owner, repo, path, branch)
  const body: Record<string, string> = { message, branch, content: b64 }
  if (sha) body.sha = sha

  try {
    await gh(`/repos/${owner}/${repo}/contents/${encodeRepoPath(path)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    // File exists but we missed sha (or sha stale) — re-fetch and retry once
    if (!/422|409/.test(msg)) throw e
    sha = await getFileSha(owner, repo, path, branch)
    if (!sha) throw e
    await gh(`/repos/${owner}/${repo}/contents/${encodeRepoPath(path)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, branch, content: b64, sha }),
    })
  }
}

async function openPR(owner: string, repo: string, head: string, base: string, title: string, body: string): Promise<{ url: string; number: number }> {
  const pr = await gh(`/repos/${owner}/${repo}/pulls`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, head, base, body, draft: false }),
  })
  return { url: pr.html_url, number: pr.number }
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

    const sha = await getDefaultBranchSha(target.owner, target.repo, target.defaultBranch)
    await createBranch(target.owner, target.repo, branchName, sha)

    const commitMsg = `content(${plan.host}/${body.content_type}): add "${body.title || safeSlug}" [Content Studio · ${plan.routingSource}]`
    await putFile(target.owner, target.repo, branchName, filePath, fileContent, commitMsg)

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

    const pr = await openPR(target.owner, target.repo, branchName, target.defaultBranch, prTitle, prBody)

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
        pr_url: pr.url,
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
        pr_url: pr.url,
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
