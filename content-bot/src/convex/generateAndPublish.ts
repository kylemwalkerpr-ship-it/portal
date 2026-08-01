"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { internal } from "./_generated/api";
import { action } from "./_generated/server";

// ---------- AI provider helpers ----------

type Provider = "openai" | "anthropic" | "nvidia";

function pickProvider(): Provider {
  const raw = (process.env.AI_PROVIDER ?? "openai").toLowerCase();
  if (raw === "nvidia" || raw === "deepseek") return "nvidia";
  return raw === "anthropic" ? "anthropic" : "openai";
}

function buildProvider(provider: Provider) {
  if (provider === "openai") {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
    const openai = createOpenAI({ apiKey });
    return {
      model: openai(process.env.OPENAI_MODEL ?? "gpt-4o-mini"),
      label: "openai",
    };
  }
  if (provider === "nvidia") {
    const apiKey = process.env.NVIDIA_API_KEY;
    if (!apiKey) throw new Error("NVIDIA_API_KEY is not set");
    const openai = createOpenAI({
      apiKey,
      baseURL:
        process.env.NVIDIA_BASE_URL ??
        "https://integrate.api.nvidia.com/v1",
    });
    return {
      model: openai(process.env.NVIDIA_MODEL ?? "deepseek-ai/deepseek-v4-pro"),
      label: "nvidia-deepseek",
    };
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  const anthropic = createAnthropic({ apiKey });
  return {
    model: anthropic(
      process.env.ANTHROPIC_MODEL ?? "claude-3-5-sonnet-latest",
    ),
    label: "anthropic",
  };
}

async function generateWithNvidia(args: {
  system: string;
  prompt: string;
  maxOutputTokens?: number;
  temperature?: number;
}): Promise<string> {
  const apiKey = process.env.NVIDIA_API_KEY;
  const baseUrl =
    process.env.NVIDIA_BASE_URL ?? "https://integrate.api.nvidia.com/v1";
  const model = process.env.NVIDIA_MODEL ?? "deepseek-ai/deepseek-v4-pro";
  if (!apiKey) throw new Error("NVIDIA_API_KEY is not set");

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: args.system },
        { role: "user", content: args.prompt },
      ],
      temperature: args.temperature ?? 0.7,
      top_p: 0.95,
      max_tokens: args.maxOutputTokens ?? 4000,
      stream: false,
      extra_body: {
        chat_template_kwargs: { thinking: false },
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`NVIDIA API ${res.status} ${res.statusText}: ${text.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("NVIDIA API returned empty content");
  return content;
}

// ---------- Slug + content helpers ----------

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function todayStamp(): string {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// ---------- Ship quality gate (voice / tone / compliance) ----------

const GUARANTEE_PATTERNS: Array<{ label: string; re: RegExp }> = [
  {
    label: "guarantee language",
    re: /\bguarantee[sd]?\b/gi,
  },
  {
    label: "outcome promise (success/approval rate)",
    re: /\b(?:100\s*%|high|higher)\s*(?:success|approval|acceptance|grant)\s*(?:rate)?\b|\bsuccess\s*rate\b|\bapproval\s*rate\b/gi,
  },
  {
    label: "promised results (visa/green card/permit)",
    re: /\b(?:promise[sd]?|assure[sd]?)\s+(?:approval|a visa|success|a green card|a permit|an outcome)\b/gi,
  },
  {
    label: "certain outcome framing",
    re: /\b(?:will|certainly|definitely|guaranteed)\s+(?:get|receive|obtain|secure|be granted|be approved|be accepted)\b/gi,
  },
];

function countDashes(content: string): number {
  return (content.match(/[\u2014\u2013]/g) ?? []).length;
}

function findRepeatedSentenceOpenings(content: string): { count: number; opening: string } | null {
  // Strip front matter + code fences so we only scan the prose body
  const body = content
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "")
    .replace(/```[\s\S]*?```/g, " ");
  const sentences = body
    .split(/(?<=[.!?])\s+/)
    .filter((s) => s.trim().length > 20);
  if (sentences.length < 8) return null;

  const starts = sentences.map((s) => s.trim().slice(0, 12).toLowerCase());
  const freq = new Map<string, number>();
  for (const s of starts) freq.set(s, (freq.get(s) || 0) + 1);
  let worst = 0;
  let worstKey = "";
  for (const [k, v] of freq) {
    if (v > worst) {
      worst = v;
      worstKey = k;
    }
  }
  return worst >= 7 ? { count: worst, opening: worstKey } : null;
}

function checkQualityGate(content: string): string[] {
  const issues: string[] = [];

  for (const pattern of GUARANTEE_PATTERNS) {
    if (pattern.re.test(content)) {
      issues.push(
        `Outcome / guarantee language forbidden: ${pattern.label} → rewrite without promising visa approval, success rates, or guaranteed results. Educational only.`,
      );
    }
  }

  const dashCount = countDashes(content);
  if (dashCount > 5) {
    issues.push(
      `Overuse of em/en dashes (${dashCount}) — common machine cadence → rewrite with periods or commas. Prefer short sentences over dash chains.`,
    );
  }

  const repeated = findRepeatedSentenceOpenings(content);
  if (repeated) {
    issues.push(
      `Same sentence opening repeated ${repeated.count}× ("${repeated.opening}…") — robotic rhythm → Vary sentence openings. Mix short and medium sentences. Lead with the reader's situation or a concrete noun.`,
    );
  }

  return issues;
}

// ---------- Internal interlink registry (ecosystem link map) ----------
//
// Maps topic keywords → internal URLs across caseworks (SEO hub),
// yousafe-consultancy (regional sites), and portal (marketplace).
// Inserted into every generation prompt so the AI naturally weaves
// 1–3 internal links into the output. Add entries as content grows.

interface InterlinkRule {
  label: string
  url: string
  triggers: string[]
  priority: number
  site: "caseworks" | "regional" | "marketplace"
  note?: string
}

const INTERLINK_RULES: InterlinkRule[] = [
  // Marketplace (primary funnel)
  { label: "YouSafe Marketplace — Browse Services", url: "https://portal.yousafeconsultancy.com/", triggers: ["services", "hire", "lawyer", "attorney", "consultation", "help", "apply", "filing"], priority: 10, site: "marketplace", note: "Primary conversion target" },
  { label: "Find an Immigration Attorney", url: "https://portal.yousafeconsultancy.com/attorneys", triggers: ["attorney", "lawyer", "legal help", "representation", "legal advice", "counsel", "barrister", "solicitor"], priority: 10, site: "marketplace" },
  // Caseworks country hubs
  { label: "US Immigration — Complete Guide", url: "https://caseworks.com/us/", triggers: ["us immigration", "united states", "usa", "uscis", "green card", "f-1", "h-1b", "opt", "cpt", "i-765", "i-485", "i-130", "i-140", "ds-160", "n-400", "naturalization", "daca", "tps"], priority: 10, site: "caseworks" },
  { label: "F-1 OPT: Complete Timeline", url: "https://caseworks.com/us/f1-opt/", triggers: ["f-1 opt", "optional practical training", "opt timeline", "opt application", "stem opt", "ead", "employment authorization", "sevis", "dso"], priority: 10, site: "caseworks" },
  { label: "H-1B Visa: Application & Timeline", url: "https://caseworks.com/us/h1b/", triggers: ["h-1b", "h1b", "work visa", "specialty occupation", "lca", "i-129", "h1b cap", "h1b lottery"], priority: 10, site: "caseworks" },
  { label: "Canada Immigration — Complete Guide", url: "https://caseworks.com/ca/", triggers: ["canada", "canadian", "express entry", "ircc", "pr card", "study permit", "pgwp", "provincial nominee", "pnp", "cec"], priority: 10, site: "caseworks" },
  { label: "Study Permit & PGWP — Canada", url: "https://caseworks.com/ca/study-permit/", triggers: ["study permit", "pgwp", "post graduation work permit", "dlis", "canadian university", "canada college"], priority: 10, site: "caseworks" },
  { label: "Express Entry: CRS & Timeline", url: "https://caseworks.com/ca/express-entry/", triggers: ["express entry", "crs", "comprehensive ranking system", "fswp", "fstp", "canadian experience class", "ita"], priority: 10, site: "caseworks" },
  { label: "UK Immigration — Complete Guide", url: "https://caseworks.com/uk/", triggers: ["uk immigration", "british", "home office", "ukvi", "ilr", "indefinite leave", "british citizenship"], priority: 10, site: "caseworks" },
  { label: "Skilled Worker Visa (UK)", url: "https://caseworks.com/uk/skilled-worker/", triggers: ["skilled worker visa", "tier 2", "uk work visa", "certificate of sponsorship", "cos", "nhs visa"], priority: 10, site: "caseworks" },
  { label: "UK Spouse Visa: Financial Requirement", url: "https://caseworks.com/uk/spouse-visa/", triggers: ["spouse visa", "partner visa", "family visa uk", "minimum income", "financial requirement", "Appendix FM"], priority: 10, site: "caseworks" },
  { label: "Australia Immigration — Complete Guide", url: "https://caseworks.com/au/", triggers: ["australia", "australian", "skillselect", "subclass 189", "subclass 190", "subclass 491", "anzsco", "skills assessment"], priority: 10, site: "caseworks" },
  { label: "Australian Student Visas (Subclass 500)", url: "https://caseworks.com/au/student-visas/", triggers: ["student visa australia", "subclass 500", "australian university", "gs requirement", "genuine student"], priority: 9, site: "caseworks" },
  { label: "Compare Countries: US vs Canada vs UK vs AU", url: "https://caseworks.com/compare/", triggers: ["compare", "comparison", "vs", "versus", "which country", "best country", "difference between", "move to", "immigrate to"], priority: 9, site: "caseworks" },
  // Content hubs
  { label: "Immigration Articles Library", url: "https://caseworks.com/articles/", triggers: ["articles", "blog", "reading", "resources", "learn more", "further reading", "guides", "in-depth"], priority: 7, site: "caseworks" },
  { label: "Immigration Glossary", url: "https://caseworks.com/glossary/", triggers: ["glossary", "definition", "term", "terminology", "acronym", "what does"], priority: 7, site: "caseworks" },
  { label: "FAQ", url: "https://caseworks.com/faq/", triggers: ["faq", "frequently asked", "common question", "q&a"], priority: 6, site: "caseworks" },
  { label: "Free Templates & Checklists", url: "https://caseworks.com/templates/", triggers: ["template", "checklist", "form", "document", "download", "sample"], priority: 8, site: "caseworks" },
  { label: "Step-by-Step Tracks", url: "https://caseworks.com/tracks/", triggers: ["step by step", "track", "pathway", "roadmap", "timeline", "process overview"], priority: 8, site: "caseworks" },
  { label: "Services Overview", url: "https://caseworks.com/services/", triggers: ["services", "what we do", "help available", "offering"], priority: 7, site: "caseworks" },
  { label: "Pricing & Plans", url: "https://caseworks.com/pricing/", triggers: ["pricing", "cost", "fee", "price", "how much", "affordable", "budget", "package"], priority: 7, site: "caseworks" },
  // Regional landing pages
  { label: "YouSafe Consultancy", url: "https://yousafeconsultancy.com/", triggers: ["yousafe", "you safe", "consultancy"], priority: 6, site: "regional" },
  { label: "US Immigration Services", url: "https://yousafeconsultancy.com/usa", triggers: ["us immigration service", "usa immigration help"], priority: 8, site: "regional" },
  { label: "Canada Immigration Services", url: "https://yousafeconsultancy.com/ca", triggers: ["canada immigration service", "canadian immigration help"], priority: 8, site: "regional" },
  { label: "UK Immigration Services", url: "https://yousafeconsultancy.com/uk", triggers: ["uk immigration service", "british immigration help"], priority: 8, site: "regional" },
  { label: "Australia Immigration Services", url: "https://yousafeconsultancy.com/au", triggers: ["australia immigration service", "australian immigration help"], priority: 8, site: "regional" },
]

function buildInterlinksBlock(topic: string, keywords: string[] = []): string {
  const combined = [topic, ...keywords].filter(Boolean).map((s) => s.toLowerCase())
  if (combined.length === 0) return ""

  const matches: { rule: InterlinkRule; score: number }[] = []
  for (const rule of INTERLINK_RULES) {
    let matched = 0
    for (const trigger of rule.triggers) {
      const t = trigger.toLowerCase()
      for (const input of combined) {
        if (input.includes(t) || t.includes(input)) { matched++; break }
      }
    }
    if (matched > 0) matches.push({ rule, score: rule.priority * matched })
  }
  matches.sort((a, b) => b.score - a.score)
  const top5 = matches.slice(0, 5)
  if (top5.length === 0) return ""

  return [
    "",
    "=== INTERNAL LINKING (SEO funnel: caseworks → regional → marketplace) ===",
    "Weave 1-3 of these links into the content body naturally, where contextually relevant.",
    "Use descriptive anchor text (never \"click here\"). Always link at least one marketplace or service page.",
    "",
    ...top5.map((m, i) => {
      const suffix = m.rule.note ? ` — ${m.rule.note}` : ""
      return `${i + 1}. [${m.rule.label}](${m.rule.url}) (${m.rule.site})${suffix}`
    }),
    "",
    "Only include links that fit naturally. Do not force irrelevant links.",
    "=== END INTERNAL LINKING ===",
    "",
  ].join("\n")
}

function buildPrompt(args: {
  title: string;
  topic: string;
  contentType: "blog_post" | "article";
  tone?: string;
  audience?: string;
  keywords?: string[];
}): { system: string; user: string } {
  const isArticle = args.contentType === "article";
  const frontmatterHint = isArticle
    ? "Include a YAML front matter block at the very top with fields: title, date (today), slug, tags."
    : "Include a YAML front matter block at the very top with fields: title, date (today), slug, tags.";

  // Pre-compute interlink suggestions for the prompt
  const interlinksBlock = buildInterlinksBlock(args.topic, args.keywords ?? []);

  const systemParts = [
    "You are a precise, opinionated writer for a modern product/tech blog.",
    "Write a complete, publish-ready piece of content in valid Markdown.",
    isArticle
      ? "Output MDX-compatible Markdown: standard markdown is fine, but you may also use fenced code blocks with a language identifier and short inline JSX-style callouts like <Note>...</Note>."
      : "Output plain Markdown (.md).",
    frontmatterHint,
    "Use clear H2 sections, short paragraphs, concrete examples, and a strong opening + closing.",
    "Do NOT wrap the output in ``` fences; emit raw markdown only.",
    "Do NOT include commentary, explanations, or anything other than the post content itself.",
    "Compliance (mandatory): Educational only. NEVER promise visa approval, success rates, or guaranteed results. No outcome guarantees of any kind. Cite official sources where relevant instead of making promises.",
    "Style (mandatory): Avoid em/en dashes entirely. Use periods and commas. Prefer short, declarative sentences. Do not chain clauses with dashes.",
    "Rhythm (mandatory): Vary sentence openings. Never start more than two sentences with the same first few words. Mix short and medium sentences. Lead with the reader's situation or a concrete noun (agency, form, document, step), not a repeated generic phrase.",
    interlinksBlock,
  ];

  const system = systemParts.filter(Boolean).join("\n\n");

  const userParts: string[] = [];
  userParts.push(`Title: ${args.title || "(derive a strong title from the topic)"}`);
  userParts.push(`Topic: ${args.topic}`);
  if (args.tone) userParts.push(`Tone: ${args.tone}`);
  if (args.audience) userParts.push(`Target audience: ${args.audience}`);
  if (args.keywords && args.keywords.length > 0) {
    userParts.push(
      `Naturally weave in these keywords: ${args.keywords.join(", ")}`,
    );
  }
  userParts.push(
    isArticle
      ? "Aim for ~1200-1800 words. Treat this as an in-depth article."
      : "Aim for ~700-1100 words. Treat this as a focused blog post.",
  );

  return { system, user: userParts.join("\n") };
}

// ---------- GitHub helpers ----------

type GithubCtx = {
  owner: string;
  repo: string;
  defaultBranch: string;
  token: string;
  apiBase: string;
};

function buildGithubContext(): GithubCtx {
  const owner = (process.env.GITHUB_REPO_OWNER ?? "").trim();
  const repo = (process.env.GITHUB_REPO_NAME ?? "").trim();
  const token = (process.env.GITHUB_TOKEN ?? "").trim();
  const defaultBranch =
    (process.env.GITHUB_DEFAULT_BRANCH ?? "main").trim() || "main";
  const apiBase = process.env.GITHUB_API_BASE ?? "https://api.github.com";
  if (!owner || !repo) {
    throw new Error(
      "GITHUB_REPO_OWNER and GITHUB_REPO_NAME must be set in API keys (the token is GITHUB_TOKEN).",
    );
  }
  if (!token) {
    throw new Error("GITHUB_TOKEN must be set in API keys.");
  }
  return { owner, repo, defaultBranch, token, apiBase };
}

async function gh<T>(
  ctx: GithubCtx,
  path: string,
  init: RequestInit,
): Promise<T> {
  const res = await fetch(`${ctx.apiBase}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${ctx.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "yousafe-content-studio",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GitHub ${res.status} ${res.statusText}: ${text}`);
  }
  return (await res.json()) as T;
}

async function getDefaultBranchSha(
  ctx: GithubCtx,
): Promise<{ sha: string; branch: string }> {
  const refPath = `/repos/${ctx.owner}/${ctx.repo}/git/ref/heads/${encodeURIComponent(ctx.defaultBranch)}`;
  type RefResp = { object: { sha: string } };
  let resp: RefResp;
  try {
    resp = await gh<RefResp>(ctx, refPath, { method: "GET" });
  } catch {
    type BranchResp = Array<{ name: string; commit: { sha: string } }>;
    const branches = await gh<BranchResp>(
      ctx,
      `/repos/${ctx.owner}/${ctx.repo}/branches`,
      { method: "GET" },
    );
    const b = branches.find((x) => x.name === ctx.defaultBranch);
    if (!b) {
      throw new Error(
        `Default branch '${ctx.defaultBranch}' not found on repo.`,
      );
    }
    return { sha: b.commit.sha, branch: ctx.defaultBranch };
  }
  return { sha: resp.object.sha, branch: ctx.defaultBranch };
}

async function createBranch(
  ctx: GithubCtx,
  fromSha: string,
  branchName: string,
): Promise<void> {
  await gh(ctx, `/repos/${ctx.owner}/${ctx.repo}/git/refs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ref: `refs/heads/${branchName}`,
      sha: fromSha,
    }),
  });
}

async function putFile(
  ctx: GithubCtx,
  branchName: string,
  path: string,
  content: string,
  message: string,
): Promise<void> {
  const b64 = Buffer.from(content, "utf8").toString("base64");
  await gh(ctx, `/repos/${ctx.owner}/${ctx.repo}/contents/${encodeURI(path).replace(/^\//, "")}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      branch: branchName,
      content: b64,
    }),
  });
}

async function openPullRequest(
  ctx: GithubCtx,
  branchName: string,
  title: string,
  body: string,
): Promise<{ url: string; number: number }> {
  type PrResp = { html_url: string; number: number };
  const pr = await gh<PrResp>(ctx, `/repos/${ctx.owner}/${ctx.repo}/pulls`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title,
      head: branchName,
      base: ctx.defaultBranch,
      body,
      draft: false,
    }),
  });
  return { url: pr.html_url, number: pr.number };
}

// ---------- Main action ----------

export const generateAndPublish = action({
  args: {
    jobId: v.id("contentJobs"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");

    const job = await ctx.runQuery(internal.contentJobs._getJob, {
      id: args.jobId,
    });
    if (job === null) throw new Error("Job not found");
    if (job.userId !== userId) throw new Error("Forbidden");

    const ghCtx = buildGithubContext();

    // Stage 1: drafting
    await ctx.runMutation(internal.contentJobs._setDrafting, {
      id: args.jobId,
    });

    const provider = pickProvider();
    const { model, label } = buildProvider(provider);

    const { system, user: userPrompt } = buildPrompt({
      title: job.title,
      topic: job.topic,
      contentType: job.contentType,
      tone: job.tone,
      audience: job.audience,
      keywords: job.keywords,
    });

    const generate = async (sys: string, prompt: string): Promise<string> => {
      if (provider === "nvidia") {
        return await generateWithNvidia({
          system: sys,
          prompt,
          maxOutputTokens: 4000,
          temperature: 0.7,
        });
      }
      const aiRes = await generateText({
        model,
        system: sys,
        prompt,
        maxOutputTokens: 4000,
        temperature: 0.7,
      });
      return aiRes.text;
    };

    let content = (await generate(system, userPrompt)).trim();

    // Ship quality gate
    const gateIssues = checkQualityGate(content);
    if (gateIssues.length > 0) {
      const rewriteSystem = [
        system,
        "",
        "REVISION REQUIRED: the draft failed the content quality gate. Address every point below.",
        ...gateIssues.map((issue) => `- ${issue}`),
        "",
        "Rewrite the ENTIRE piece in full, complying with every rule. Emit only the corrected markdown.",
      ].join("\n");

      content = (
        await generate(
          rewriteSystem,
          `Rewrite this draft to fully comply:\n\n${content}`,
        )
      ).trim();

      const remaining = checkQualityGate(content);
      if (remaining.length > 0) {
        throw new Error(`Ship refused — content quality gate: ${remaining.join("; ")}`);
      }
    }
    content = content.trim();
    const slug = slugify(job.title || job.topic);
    const safeSlug = slug.length > 0 ? slug : `post-${Date.now()}`;

    // Stage 2: publishing
    await ctx.runMutation(
      internal.contentJobs._setPublishingWithContent,
      {
        id: args.jobId,
        content,
        slug: safeSlug,
      },
    );

    // Stage 3: open PR
    try {
      const jobSuffix = args.jobId.slice(-8);
      const stamp = todayStamp();
      const branchName = `content/${safeSlug}-${jobSuffix}`.slice(0, 250);
      const isArticle = job.contentType === "article";
      const folder = isArticle ? "content/articles" : "content/blog";
      const ext = isArticle ? "mdx" : "md";
      const filePath = `${folder}/${stamp}-${safeSlug}-${jobSuffix}.${ext}`;

      const { sha } = await getDefaultBranchSha(ghCtx);
      await createBranch(ghCtx, sha, branchName);

      const commitMessage = isArticle
        ? `content(article): add "${job.title || safeSlug}"`
        : `content(blog): add "${job.title || safeSlug}"`;

      await putFile(ghCtx, branchName, filePath, content, commitMessage);

      const prTitle =
        job.title && job.title.length > 0
          ? `[Content Studio] ${job.title}`
          : `[Content Studio] ${safeSlug}`;

      const prBody = [
        "Generated by Content Studio.",
        "",
        `- Topic: ${job.topic}`,
        job.tone ? `- Tone: ${job.tone}` : "",
        job.audience ? `- Audience: ${job.audience}` : "",
        job.keywords && job.keywords.length > 0
          ? `- Keywords: ${job.keywords.join(", ")}`
          : "",
        `- Provider: ${label}`,
        `- File: \`${filePath}\``,
      ]
        .filter(Boolean)
        .join("\n");

      const pr = await openPullRequest(
        ghCtx,
        branchName,
        prTitle,
        prBody,
      );

      await ctx.runMutation(internal.contentJobs._setPrCreated, {
        id: args.jobId,
        branchName,
        contentPath: filePath,
        prUrl: pr.url,
        prNumber: pr.number,
      });
    } catch (err) {
      await ctx.runMutation(internal.contentJobs._setFailed, {
        id: args.jobId,
        errorMessage: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  },
});
