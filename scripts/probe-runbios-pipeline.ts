/**
 * Live e2e: Master Engine seed → brief → factory pipeline (dryRun, no Git write)
 * using Run BiOS GLM 5.3 Flash. Slow reasoning is expected; we wait for a
 * finished draft instead of killing at 180s.
 *
 *   npx tsx scripts/probe-runbios-pipeline.ts
 */
import { generateEngineText } from '../lib/seoEngine/engineAi'
import { generateContentText } from '../lib/contentAiProvider'
import { runSeoFactoryPipeline } from '../lib/seoFactory/pipeline'
import { evaluateContentQuality } from '../lib/seoFactory/contentQualityGate'
import { LIFECYCLE_STAGES } from '../lib/seoEngine/ontology'

const PIN = 'runbios-glm-53-flash'

async function main() {
  const key = process.env.RUNBIOS_API_KEY?.trim()
  if (!key) {
    console.error('RUNBIOS_API_KEY is not set')
    process.exit(1)
  }
  process.env.CONTENT_AI_PROVIDER = PIN
  // One attempt — a 10-minute GLM draft must not be doubled on retry.
  delete process.env.CONTENT_AI_RETRY

  const schools = LIFECYCLE_STAGES.find((s) => s.key === 'schools')
  const cell = schools?.countries.UK
  const topic = cell?.seedKeywords[0] || 'uk student visa requirements'
  const keywords = (cell?.seedKeywords || [topic]).slice(0, 8)

  console.log(JSON.stringify({ stage: 'discover-seed', topic, region: 'UK', pin: PIN }))

  const engine = await generateEngineText({
    aiProvider: PIN,
    skipQualityContract: true,
    maxTokens: 800,
    system: 'You are the SEO Master Engine. Return 4 tight bullets: demand, intent, YMYL risk, next brief.',
    prompt: `Plan a content mission for keyword "${topic}" (UK student route). Seeds: ${keywords.join(', ')}. Official anchors: ${(cell?.statutoryAnchors || []).join(', ')}.`,
  })
  console.log(JSON.stringify({
    stage: 'discover',
    provider: engine.provider,
    model: engine.model,
    chars: engine.text.length,
  }))

  const brief = await generateContentText({
    aiProvider: PIN,
    maxTokens: 1600,
    skipQualityContract: true,
    exclusive: false,
    system: 'Write a compact SEO brief as Markdown: H2 outline, 5 short keywords, 4 long-tail, TL;DR, one FAQ H2. Keep under 700 words.',
    prompt: `Topic: ${topic}\nRegion: UK\nEngine notes:\n${engine.text.slice(0, 1800)}`,
  })
  console.log(JSON.stringify({
    stage: 'research-brief',
    provider: brief.provider,
    model: brief.model,
    chars: brief.text.length,
  }))

  const pipeline = await runSeoFactoryPipeline({
    topic,
    title: 'UK Student Visa Requirements 2026',
    primaryKeyword: topic,
    region: 'UK',
    contentType: 'blog_summary',
    keywords,
    aiProvider: PIN,
    shipMode: 'none',
    dryRun: true,
    maxRefine: 0,
    minAuditScore: 50,
    skipShipIfBelowScore: true,
    masterEngineBlock: engine.text.slice(0, 2000),
    writeHint: brief.text.slice(0, 4000),
  })

  const quality = evaluateContentQuality({
    content: pipeline.content,
    contentType: 'blog_summary',
    primaryKeyword: topic,
    indexable: true,
    requiredShortKeywords: keywords.filter((k) => k.split(/\s+/).length <= 3),
    requiredLongTailKeywords: keywords.filter((k) => k.split(/\s+/).length > 3),
    region: 'UK',
  })

  console.log(JSON.stringify({
    stage: 'draft-approve-track',
    provider: pipeline.provider,
    model: pipeline.model,
    attempts: pipeline.attempts,
    words: pipeline.audit.wordCount,
    auditScore: pipeline.audit.score,
    grade: pipeline.audit.grade,
    blockers: pipeline.audit.blockers.map((b) => b.code).slice(0, 12),
    qualityOk: quality.ok,
    shipReady: quality.ok && pipeline.audit.blockers.length === 0,
    shipMode: pipeline.shipMode,
    shipError: pipeline.shipError,
    shipStatus: pipeline.ship?.status ?? null,
    jobId: pipeline.jobId,
    contentChars: pipeline.content.length,
  }))
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack || err.message : err)
  process.exit(1)
})
