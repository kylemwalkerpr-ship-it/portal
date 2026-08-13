/**
 * LIVE E2E DRAFT PROBE · Baseten GLM 5.2 Fast (zai-org/GLM-5.2-Fast)
 *
 * Runs the REAL SEO Factory pipeline end-to-end (plan → brief → AI draft →
 * refine → audit → ship gates) with the drafting provider pinned to
 * baseten-glm-fast. Verifies:
 *   1. The draft was actually written by GLM 5.2 Fast.
 *   2. Body word count lands inside the type's window (min–max).
 *   3. The full gate stack holds: depth floor, quality gate, ship gate.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/probe-glm-fast-live-draft.mts
 *
 * Exit 0 when all assertions pass, 1 otherwise. Never prints API keys.
 */
import { runSeoFactoryPipeline } from '../lib/seoFactory/pipeline'
import { depthSpecForType, countBodyWords } from '../lib/seoFactory/contentDepth'

const TOPIC = process.env.PROBE_TOPIC || 'UK dependent visa documents checklist'
const CONTENT_TYPE = process.env.PROBE_CONTENT_TYPE || 'blog_summary'

const fail = (msg: string): never => {
  console.error(`\n✗ FAIL: ${msg}`)
  process.exit(1)
}

async function main(): Promise<void> {
  console.log(`LIVE DRAFT PROBE · topic="${TOPIC}" contentType=${CONTENT_TYPE}`)
  console.log(`drafting provider pin: baseten-glm-fast (zai-org/GLM-5.2-Fast)`)
  const spec = depthSpecForType(CONTENT_TYPE)
  console.log(
    `depth window: min ${spec.minWords} · target ${spec.targetWords} · max ${spec.maxWords} · ` +
      `label "${spec.label}"`,
  )

  const started = Date.now()
  const result = await runSeoFactoryPipeline({
    topic: TOPIC,
    primaryKeyword: TOPIC,
    region: 'UK',
    contentType: CONTENT_TYPE,
    aiProvider: 'baseten-glm-fast',
    shipMode: 'none',
    dryRun: true,
    minAuditScore: 55,
    maxRefine: 1,
  })
  const elapsed = Math.round((Date.now() - started) / 1000)

  // Ownership resolution may legitimately reclassify the content type (e.g. a
  // topic owned by an existing legal_guide canonical). Assert against the
  // pipeline's RESOLVED type — that is the window the brief actually promised.
  const resolvedType = result.plan.contentType || CONTENT_TYPE
  const resolvedSpec = depthSpecForType(resolvedType)
  console.log(`\n[0] RESOLVED contentType: ${resolvedType} (input ${CONTENT_TYPE}) · canonical ${result.plan.canonicalUrl}`)
  console.log(`    resolved window: min ${resolvedSpec.minWords} · target ${resolvedSpec.targetWords} · max ${resolvedSpec.maxWords}`)

  // ── 1 · provider/model ──
  console.log(`\n[1] PROVIDER: ${result.provider} · model: ${result.model} (${elapsed}s)`)
  if (result.provider !== 'baseten-glm-fast') {
    fail(`expected baseten-glm-fast, drafted with ${result.provider} / ${result.model}`)
  }

  // ── 2 · word count window (assert against RESOLVED type) ──
  const bodyWords = countBodyWords(result.content)
  console.log(`[2] BODY WORDS: ${bodyWords} (resolved window ${resolvedSpec.minWords}–${resolvedSpec.maxWords})`)
  if (bodyWords < resolvedSpec.minWords) {
    fail(`below floor: ${bodyWords} < ${resolvedSpec.minWords}`)
  }
  if (bodyWords > resolvedSpec.maxWords) {
    fail(`over hard max: ${bodyWords} > ${resolvedSpec.maxWords}`)
  }
  console.log(`[2] ✓ inside window (target ${resolvedSpec.targetWords})`)

  // ── 3 · gates ──
  const audit = result.audit
  console.log(
    `[3] AUDIT: score ${audit.score} (${audit.grade}) · blockers ${audit.blockers.length} · ` +
      `warnings ${audit.warnings.length} · human ${audit.humanScore ?? 'n/a'}`,
  )
  for (const b of audit.blockers) console.log(`    ⛔ blocker: [${b.code}] ${b.message || b.title} ${b.evidence ? `· evidence "${b.evidence}"` : ''}`)
  for (const w of audit.warnings) console.log(`    ⚠ warning:  [${w.code}] ${w.message || w.title} ${w.evidence ? `· "${String(w.evidence).slice(0, 80)}"` : ''}`)

  const depthBlocked = audit.blockers.some((b) => b.code === 'word_count' || b.code === 'thin_content')
  if (depthBlocked) fail('depth floor gate blocked')
  if (audit.blockers.length > 0) fail(`ship quality gate blocked by ${audit.blockers.length} blocker(s)`)
  if (audit.humanScore != null && audit.humanScore < 55) {
    fail(`human-voice gate below 55: ${audit.humanScore}`)
  }

  // ── 4 · ship gate (dry-run exercises render + assertShipAllowed) ──
  console.log(`[4] SHIP: mode=${result.shipMode} status=${result.ship?.status ?? 'none'} error=${result.shipError ?? 'none'}`)
  if (result.ship && result.ship.status === 'dry_run') {
    console.log('[4] ✓ ship gate stack passed (depth · quality · host/path/format)')
  } else if (result.shipError) {
    fail(`ship gate held: ${result.shipError}`)
  } else {
    fail('no dry-run ship result produced')
  }

  console.log(`\n✓ ALL LIVE GATES PASS · ${bodyWords} words · provider ${result.provider}/${result.model} · ${elapsed}s`)
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)))
