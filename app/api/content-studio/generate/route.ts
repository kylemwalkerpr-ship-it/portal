import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateText } from 'ai'
import { deepSeek } from '@ai-sdk/deepseek'
import { createOpenAI } from '@ai-sdk/openai'

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

function pickModel() {
  const provider = (process.env.AI_PROVIDER ?? 'deepseek').toLowerCase()

  if (provider === 'openai') {
    if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set')
    const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY })
    return {
      model: openai(process.env.OPENAI_MODEL ?? 'gpt-4o-mini'),
      label: 'openai',
    }
  }

  // Default: DeepSeek
  if (!process.env.DEEPSEEK_API_KEY) throw new Error('DEEPSEEK_API_KEY not set')
  return {
    model: deepSeek(process.env.DEEPSEEK_MODEL ?? 'deepseek-chat'),
    label: 'deepseek',
  }
}

function buildPrompt(data: GenerateRequest): { system: string; prompt: string } {
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
    'Output format:',
    '- YAML front matter: title, date (today), slug, region, tags (array), content_type',
    '- H2 sections with concrete, actionable information',
    '- Strong opening (no rhetorical questions) and a concise closing with a marketplace CTA',
    '- Inline SOURCES section at the bottom citing official .gov/.edu URLs',
    '- Article + FAQPage JSON-LD schema in a <script type="application/ld+json"> block at the end',
    '',
    'Do NOT wrap output in ``` fences. Emit raw markdown/MDX only.',
  ].join('\n')

  const prompt = [
    `Title: ${data.title || '(derive a strong, SEO-optimized title from the topic)'}`,
    `Topic: ${data.topic}`,
    `Tone: ${data.tone}`,
    data.audience ? `Target audience: ${data.audience}` : '',
    data.keywords?.length ? `Naturally weave in these keywords: ${data.keywords.join(', ')}` : '',
    '',
    `Word count target: ${wordCount}.`,
    `Return valid Markdown${isArticle || isRegional ? ' (MDX-compatible)' : ''} with YAML front matter.`,
  ].filter(Boolean).join('\n')

  return { system, prompt }
}

function computeSeoScore(content: string, data: GenerateRequest): number {
  let score = 0
  const max = 10

  // Length scoring
  const words = content.split(/\s+/).length
  if (words >= 1800) score += 2
  else if (words >= 900) score += 1

  // Front matter
  if (content.startsWith('---')) score += 1

  // H2 sections
  const h2Count = (content.match(/^## /gm) ?? []).length
  if (h2Count >= 4) score += 1

  // Keyword presence
  if (data.keywords?.length) {
    const keywordHits = data.keywords.filter(kw => content.toLowerCase().includes(kw.toLowerCase())).length
    if (keywordHits >= data.keywords.length * 0.7) score += 1
  }

  // Official citations
  if (/\.gov|\.edu|uscis|ircc|homeaffairs|ukvi/i.test(content)) score += 2

  // Marketplace CTA
  if (/marketplace|yousafeconsultancy\.com|gig|template|consultation/i.test(content)) score += 1

  // Schema
  if (/application\/ld\+json/.test(content)) score += 1

  // Readability (paragraph length)
  const avgParaLen = words / Math.max(1, (content.match(/\n\n/g) ?? []).length)
  if (avgParaLen >= 25 && avgParaLen <= 100) score += 1

  return Math.min(Math.round((score / max) * 100), 100)
}

// ── GitHub helpers ──

async function gh(path: string, init: RequestInit): Promise<any> {
  const token = process.env.GITHUB_TOKEN
  if (!token) throw new Error('GITHUB_TOKEN not set')
  const base = process.env.GITHUB_API_BASE ?? 'https://api.github.com'
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
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

async function putFile(owner: string, repo: string, branch: string, path: string, content: string, message: string): Promise<void> {
  const b64 = Buffer.from(content, 'utf8').toString('base64')
  await gh(`/repos/${owner}/${repo}/contents/${encodeURI(path).replace(/^\//, '')}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, branch, content: b64 }),
  })
}

async function openPR(owner: string, repo: string, head: string, base: string, title: string, body: string): Promise<{ url: string; number: number }> {
  const pr = await gh(`/repos/${owner}/${repo}/pulls`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, head, base, body, draft: false }),
  })
  return { url: pr.html_url, number: pr.number }
}

// ── Target repo resolution ──

function resolveTargetRepo(contentType: string, region: string): { owner: string; repo: string; defaultBranch: string; folder: string } {
  const owner = process.env.GITHUB_CONTENT_OWNER ?? 'kylemwalkerpr-ship-it'

  switch (contentType) {
    case 'blog_post':
    case 'article':
      return { owner, repo: 'caseworks', defaultBranch: 'main', folder: `app/articles/${region.toLowerCase()}` }
    case 'regional_page':
      return { owner, repo: 'yousafe-consultancy', defaultBranch: 'main', folder: `${region.toLowerCase()}/content` }
    case 'marketplace_gig':
      return { owner, repo: 'portal', defaultBranch: 'main', folder: 'catalogue' }
    default:
      return { owner, repo: 'caseworks', defaultBranch: 'main', folder: 'app/articles' }
  }
}

// ── Main handler ──

export async function POST(request: NextRequest) {
  try {
    // Auth: Clerk middleware already enforces admin role on /dashboard/admin routes.
    // Belt-and-braces: re-check via Clerk headers.
    const userId = request.headers.get('x-clerk-user-id')
    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const body: GenerateRequest = await request.json()

    if (!body.topic?.trim()) {
      return NextResponse.json({ error: 'Topic is required' }, { status: 400 })
    }

    // ── 1. AI Generation ──
    const { model, label } = pickModel()
    const { system, prompt } = buildPrompt(body)

    const aiResult = await generateText({
      model,
      system,
      prompt,
      maxOutputTokens: 6000,
      temperature: 0.65,
    })

    const content = aiResult.text.trim()
    const slug = slugify(body.title || body.topic)
    const safeSlug = slug || `post-${Date.now()}`
    const wordCount = content.split(/\s+/).length
    const seoScore = computeSeoScore(content, body)

    // ── 2. GitHub PR ──
    const target = resolveTargetRepo(body.content_type, body.region)
    const stamp = todayStamp()
    const jobSuffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
    const branchName = `content-studio/${safeSlug}-${jobSuffix}`.slice(0, 240)
    const ext = body.content_type === 'blog_post' ? 'md' : 'mdx'
    const filePath = `${target.folder}/${stamp}-${safeSlug}-${jobSuffix}.${ext}`

    const sha = await getDefaultBranchSha(target.owner, target.repo, target.defaultBranch)
    await createBranch(target.owner, target.repo, branchName, sha)

    const commitMsg = `content(${body.content_type}): add "${body.title || safeSlug}" [Content Studio]`
    await putFile(target.owner, target.repo, branchName, filePath, content, commitMsg)

    const prTitle = body.title
      ? `[Content Studio] ${body.title}`
      : `[Content Studio] ${safeSlug}`
    const prBody = [
      '🤖 Generated by Content Studio.',
      '',
      `- **Topic:** ${body.topic}`,
      `- **Region:** ${body.region}`,
      `- **Type:** ${body.content_type.replace(/_/g, ' ')}`,
      `- **Tone:** ${body.tone}`,
      body.audience ? `- **Audience:** ${body.audience}` : '',
      body.keywords?.length ? `- **Keywords:** ${body.keywords.join(', ')}` : '',
      `- **AI Provider:** ${label}`,
      `- **Word Count:** ${wordCount}`,
      `- **SEO Score:** ${seoScore}%`,
      `- **File:** \`${filePath}\``,
      '',
      '---',
      '> Review the content and merge when ready. The webhook will update the job status automatically.',
    ].filter(Boolean).join('\n')

    const pr = await openPR(target.owner, target.repo, branchName, target.defaultBranch, prTitle, prBody)

    // ── 3. Save to Supabase ──
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
        word_count: wordCount,
        seo_score: seoScore,
      },
    }, { status: 201 })

  } catch (err) {
    console.error('[content-studio/generate]', err)
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Internal error',
    }, { status: 500 })
  }
}
