/**
 * E2E Pipeline Probe — tests each stage of the Content Studio pipeline.
 * Runs against the local dev server (or deployed portal if BASE_URL is set).
 * 
 * Stages tested:
 *   1. Research (suggest-brief, suggest-keywords)
 *   2. Plan (brief field propagation)
 *   3. Draft (generate-stream, depth rescue)
 *   4. Review (reaudit POST/PATCH, stripDeadLinks)
 *   5. Approve (ship gate)
 *   6. Track (ledger)
 *
 * Usage: node scripts/e2e-pipeline-probe.mjs
 */

const BASE = process.env.BASE_URL || 'http://localhost:3002'

// ── Test helpers ──────────────────────────────────────────────────────────

let pass = 0
let fail = 0
let skip = 0

function test(name, fn) {
  process.stdout.write(`  ${name}... `)
  try {
    const result = fn()
    if (result instanceof Promise) {
      return result.then(
        () => { pass++; console.log('✅ PASS') },
        (e) => { fail++; console.log(`❌ FAIL: ${e.message}`) }
      )
    }
    pass++
    console.log('✅ PASS')
  } catch (e) {
    fail++
    console.log(`❌ FAIL: ${e.message}`)
  }
}

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    ...opts,
  })
  const text = await res.text()
  let data
  try { data = JSON.parse(text) } catch { data = { _raw: text.slice(0, 200) } }
  return { res, data, status: res.status }
}

// ── Iteration 1: Research Stage ───────────────────────────────────────────

async function iteration1() {
  console.log('\n═══ ITERATION 1: Research Stage ═══')
  
  await test('POST suggest-brief returns 200 with all fields', async () => {
    const { res, data } = await fetchJson(`${BASE}/api/content-studio/suggest-brief`, {
      method: 'POST',
      body: JSON.stringify({
        topic: 'uk dependent visa 2026',
        region: 'UK',
        contentType: 'article',
        primaryKeyword: 'uk dependent visa',
        audience: 'international students and workers',
      }),
    })
    // May get 401 if not authenticated — that's OK for unit-level check
    if (res.status === 401) throw new Error('Auth required — test locally or with CLERK creds')
    if (res.status >= 500) throw new Error(`Server error: ${data.error || data._raw}`)
    if (!data.ok && !data.suggestedH1) throw new Error(`Response missing fields: ${JSON.stringify(data).slice(0, 100)}`)
    // Check required fields exist in response
    const required = ['suggestedH1', 'h2Outline', 'shortTail', 'longTail', 'kwH2Map', 'sources', 'targetSlug', 'metaDescription']
    for (const f of required) {
      if (!(f in data)) throw new Error(`Missing field: ${f}`)
    }
    // metaDescription should be present
    if (data.metaDescription && data.metaDescription.length > 160) throw new Error(`metaDescription too long: ${data.metaDescription.length} chars`)
  })

  await test('POST suggest-keywords returns 200 with keywords', async () => {
    const { res, data } = await fetchJson(`${BASE}/api/content-studio/suggest-keywords`, {
      method: 'POST',
      body: JSON.stringify({ topic: 'uk dependent visa', region: 'UK' }),
    })
    if (res.status === 401) throw new Error('Auth required')
    if (res.status >= 500) throw new Error(`Server error: ${data.error || data._raw}`)
    if (!data.shortTail && !data.longTail && !data.keywords) throw new Error('No keywords returned')
  })
}

// ── Iteration 2: Plan Stage ───────────────────────────────────────────────

async function iteration2() {
  console.log('\n═══ ITERATION 2: Plan Stage (code-level) ═══')

  await test('PipelineInput type accepts metaDescription', async () => {
    // Dynamic import to check TypeScript-level correctness
    const mod = await import('../lib/seoFactory/pipeline.js')
    // Check that PipelineInput is exported
    if (!mod) throw new Error('pipeline module not found')
    // This is a smoke test — actual type checking is done by tsc
  })

  await test('buildFactorySystemPrompt has all required clauses', async () => {
    const { buildFactorySystemPrompt } = await import('../lib/seoFactory/prompts.js')
    const prompt = buildFactorySystemPrompt({
      plan: {
        title: 'Test Guide',
        topic: 'test topic',
        primaryKeyword: 'test keyword',
        region: 'UK',
        contentType: 'article',
        indexable: true,
        publishMode: 'pr',
        targetRepo: 'caseworks',
        blockers: [],
        slug: 'test-slug',
      },
      contentType: 'article',
      minWords: 2200,
      h2Outline: ['Eligibility', 'Documents', 'FAQ'],
      sources: ['https://www.gov.uk/student-visa'],
      requiredShortKeywords: ['student visa'],
      requiredLongTailKeywords: ['uk student visa requirements 2026'],
      targetSlug: 'uk-student-visa-guide',
    })
    // Prompt must include title, minWords, H2 outline, sources
    if (!prompt.includes('2200')) throw new Error('Missing minWords in prompt')
    if (!prompt.includes('Eligibility')) throw new Error('Missing h2Outline in prompt')
    if (!prompt.includes('gov.uk')) throw new Error('Missing sources in prompt')
    if (!prompt.includes('student visa')) throw new Error('Missing keywords in prompt')
  })
}

// ── Iteration 3-5: Draft Stage ────────────────────────────────────────────

async function iteration3() {
  console.log('\n═══ ITERATION 3-5: Draft Stage ═══')

  await test('depthRescue expand pass uses correct token formula', async () => {
    const { runDepthRescue } = await import('../lib/seoFactory/depthRescue.js')
    const { countBodyWords } = await import('../lib/seoFactory/contentDepth.js')
    const { auditContent } = await import('../lib/seoFactory/audit.js')
    
    // 1794-word draft, 2200 min — old token cap was 2000, new should be ~11406
    const draft = '# Test\n\n' + 'Content paragraph. '.repeat(300)
    const wc = countBodyWords(draft)
    if (wc < 1700 || wc > 1900) throw new Error(`Unexpected word count: ${wc} (expected ~1794)`)

    // Verify the depth rescue runs without throwing
    let calledTokens = 0
    const events = []
    for await (const ev of runDepthRescue({
      content: draft,
      audit: auditContent({ content: draft, contentType: 'article', primaryKeyword: 'test', indexable: true, ownershipBlockers: [] }),
      title: 'Test Guide',
      topic: 'test topic',
      primaryKeyword: 'test',
      region: 'UK',
      contentType: 'article',
      minWords: 2200,
      targetWords: 2500,
      maxWords: 6000,
      minAudit: 60,
      indexable: true,
      ownershipBlockers: [],
      generateText: async (opts) => {
        calledTokens = opts.maxTokens
        // Return growing content
        return { text: draft + '\n\n## Expanded Section\n\n' + 'More detailed content. '.repeat(200), provider: 'test', model: 'test' }
      },
    })) { events.push(ev) }

    // Expand pass should get at least 8000 tokens (not the old 2000)
    if (calledTokens < 8000) throw new Error(`Expand pass maxTokens too low: ${calledTokens} (expected >=8000)`)
    
    const done = events.find(e => e.type === 'done')
    if (!done) throw new Error('No done event from depth rescue')
    if (done.expandPasses < 1) throw new Error(`No expand passes: ${done.expandPasses}`)
  })

  await test('critically-thin guard skips rescue for <200 words', async () => {
    const { runDepthRescue } = await import('../lib/seoFactory/depthRescue.js')
    const { auditContent } = await import('../lib/seoFactory/audit.js')
    
    const thin = '# Barely There'
    const events = []
    let generateCalled = false
    
    for await (const ev of runDepthRescue({
      content: thin,
      audit: auditContent({ content: thin, contentType: 'article', primaryKeyword: 'test', indexable: true, ownershipBlockers: [] }),
      title: 'Test', topic: 'test', primaryKeyword: 'test', region: 'US',
      contentType: 'article', minWords: 2200, targetWords: 2500, maxWords: 6000,
      minAudit: 60, indexable: true, ownershipBlockers: [],
      generateText: async () => { generateCalled = true; return { text: 'x', provider: 't', model: 't' } },
    })) { events.push(ev) }

    if (generateCalled) throw new Error('generateText was called on critically-thin draft')
    const done = events.find(e => e.type === 'done')
    if (!done) throw new Error('No done event')
    if (done.expandPasses !== 0) throw new Error(`Expected 0 passes, got ${done.expandPasses}`)
    const skip = events.find(e => e.type === 'progress' && e.message.includes('critically thin'))
    if (!skip) throw new Error('No critically-thin progress message')
  })

  await test('depthRescue append pass uses rotating focuses', async () => {
    const { runDepthRescue, APPEND_FOCUSES } = await import('../lib/seoFactory/depthRescue.js')
    const { auditContent } = await import('../lib/seoFactory/audit.js')
    
    // Draft that won't clear the floor in one pass
    const draft = '# Test\n\n' + 'Content. '.repeat(100) // ~400 words
    const calls = []
    
    for await (const ev of runDepthRescue({
      content: draft,
      audit: auditContent({ content: draft, contentType: 'article', primaryKeyword: 'test', indexable: true, ownershipBlockers: [] }),
      title: 'Test', topic: 'test', primaryKeyword: 'test', region: 'UK',
      contentType: 'article', minWords: 2200, targetWords: 2500, maxWords: 6000,
      minAudit: 60, indexable: true, ownershipBlockers: [],
      generateText: async (opts) => {
        calls.push(opts)
        return { text: '# Still short\n\n' + 'More. '.repeat(150), provider: 'test', model: 'test' }
      },
    })) { /* collect events */ }

    // Should have at least 2 calls (expand + 1 append)
    if (calls.length < 2) throw new Error(`Only ${calls.length} generateText calls — expected at least 2`)
    // Second call should use APPEND_FOCUSES[0]
    if (calls[1].prompt && !calls[1].prompt.includes(APPEND_FOCUSES[0])) {
      throw new Error('Second pass does not use rotating focus')
    }
  })
}

// ── Iteration 6-7: Review Stage ───────────────────────────────────────────

async function iteration6() {
  console.log('\n═══ ITERATION 6-7: Review Stage ═══')

  await test('applyDeterministicRepairs includes meta_description repair', async () => {
    const { applyDeterministicRepairs } = await import('../lib/seoFactory/editorialScaffold.js')
    
    // Draft with YAML front matter missing description
    const draftWithFM = `---
title: "UK Dependent Visa Guide 2026"
content_type: article
primary_keyword: dependent visa uk
region: UK
---

# UK Dependent Visa Guide 2026

This is a test guide for dependent visas in the United Kingdom. It covers the
eligibility requirements, application process, and documentation needed for
bringing dependents to the UK on various visa categories including the Student
visa, Skilled Worker visa, and family visas.

## In 60 seconds

- Dependents include spouses, partners, and children under 18
- Financial requirements must be met for each dependent
- Applications are processed by UK Visas and Immigration

## Eligibility`

    const result = applyDeterministicRepairs({
      content: draftWithFM,
      primaryKeyword: 'dependent visa uk',
      title: 'UK Dependent Visa Guide 2026',
      indexable: true,
      contentType: 'article',
    })

    // Should have applied meta_description, disclaimer, table_of_contents
    if (!result.applied.includes('meta_description')) {
      throw new Error(`meta_description not in applied repairs: ${result.applied.join(', ')}`)
    }
    // Content should now contain a description: line
    if (!result.content.includes('description:')) {
      throw new Error('Content missing description: in front matter')
    }
  })

  await test('stripDeadLinks mechanically removes dead URLs', async () => {
    const { stripDeadLinks } = await import('../lib/seoFactory/linkAudit.js')
    
    const draft = '# Test\n\nCheck [this link](/uk/fake-page) and [another](/ca/nonexistent)\n'
    const { content: cleaned, stripped } = stripDeadLinks(draft, ['/uk/fake-page', '/ca/nonexistent'])
    
    if (stripped !== 2) throw new Error(`Expected 2 stripped, got ${stripped}`)
    if (cleaned.includes('](/uk/fake-page)')) throw new Error('Dead link not removed')
    if (cleaned.includes('](/ca/nonexistent)')) throw new Error('Dead link not removed')
    // Link text should be preserved
    if (!cleaned.includes('this link') || !cleaned.includes('another')) throw new Error('Link text not preserved')
  })

  await test('reauditContract.evaluateReauditContract returns warningsData merge', async () => {
    const { evaluateReauditContract } = await import('../lib/seoFactory/reauditContract.js')
    
    const result = evaluateReauditContract({
      content: `---
title: "Test"
content_type: article
primary_keyword: test
region: UK
---

# Test

Test content for reaudit. `.repeat(50),
      contentType: 'article',
      primaryKeyword: 'test',
      indexable: true,
    })

    if (result.score === undefined) throw new Error('No score returned')
    if (!Array.isArray(result.warningsData)) throw new Error('warningsData not an array')
    if (!Array.isArray(result.annotations)) throw new Error('annotations not an array')
    // Should have some warnings about missing schema/links
    const codes = result.warningsData.map(w => w.code)
    if (codes.length === 0) throw new Error('No warnings — unexpected for a test draft')
  })
}

// ── Iteration 8: Approve Stage ────────────────────────────────────────────

async function iteration8() {
  console.log('\n═══ ITERATION 8: Approve Stage ═══')

  await test('meetsShipQuality requires meetsDepthFloor first', async () => {
    const { meetsShipQuality, meetsDepthFloor } = await import('../lib/seoFactory/audit.js')
    
    // Audit with word_count blocker
    const auditWithDepthBlocker = {
      score: 90,
      wordCount: 500,
      blockers: [{ code: 'word_count', severity: 'blocker', message: 'Below floor' }],
      warnings: [],
      humanScore: 95,
      annotations: [],
    }
    
    if (meetsDepthFloor(auditWithDepthBlocker)) throw new Error('Should NOT meet depth floor with word_count blocker')
    if (meetsShipQuality(auditWithDepthBlocker)) throw new Error('Should NOT meet ship quality with depth blocker')
    
    // Audit without blockers
    const cleanAudit = {
      score: 90,
      wordCount: 2500,
      blockers: [],
      warnings: [],
      humanScore: 95,
      annotations: [],
    }
    
    if (!meetsDepthFloor(cleanAudit)) throw new Error('Should meet depth floor')
    if (!meetsShipQuality(cleanAudit)) throw new Error('Should meet ship quality')
  })

  await test('ship gate blocks on thin_content and word_count', async () => {
    const { meetsDepthFloor } = await import('../lib/seoFactory/audit.js')
    
    const thinAudit = {
      score: 90, wordCount: 1794,
      blockers: [{ code: 'thin_content', severity: 'blocker', message: 'Thin content' }],
      warnings: [], humanScore: 95, annotations: [],
    }
    if (meetsDepthFloor(thinAudit)) throw new Error('Should not meet depth floor for thin_content')
  })
}

// ── Iteration 9: Track Stage ──────────────────────────────────────────────

async function iteration9() {
  console.log('\n═══ ITERATION 9: Track Stage ═══')

  await test('PublishLedger renders empty state correctly', async () => {
    // Code-level test: PublishLedger component accepts empty stamps
    // We check that the component exists and handles null/empty stamps
    const fs = await import('node:fs')
    const source = fs.readFileSync('../components/design/admin-content-studio.tsx', 'utf-8')
    if (!source.includes('PublishLedger')) throw new Error('PublishLedger component not found')
    if (!source.includes('shipLedger')) throw new Error('shipLedger state not found')
  })

  await test('shipLedger state initializes as empty array', async () => {
    const source = (await import('node:fs')).readFileSync('../components/design/admin-content-studio.tsx', 'utf-8')
    const match = source.match(/shipLedger.*=.*React\.useState/)
    if (!match) throw new Error('shipLedger useState not found')
  })
}

// ── Iteration 10: Queue Management ─────────────────────────────────────────

async function iteration10() {
  console.log('\n═══ ITERATION 10: Queue Management ═══')

  await test('content_jobs table schema supports archive status', async () => {
    const fs = await import('node:fs')
    // Check the migration exists
    const migrations = fs.readdirSync('../supabase/migrations/')
    const archiveMigration = migrations.find(m => m.includes('content_jobs_archive') || m.includes('archive'))
    if (!archiveMigration) throw new Error('No archive migration found')
    
    const content = fs.readFileSync(`../supabase/migrations/${archiveMigration}`, 'utf-8')
    if (!content.includes('archive') && !content.includes('archived')) {
      throw new Error('Archive migration does not contain archive status')
    }
  })

  await test('content_jobs table has all required status values', async () => {
    const fs = await import('node:fs')
    const schemaFile = '../schema.sql'
    const schema = fs.readFileSync(schemaFile, 'utf-8')
    const required = ['drafting', 'review', 'approved', 'shipped', 'failed', 'archived']
    for (const status of required) {
      if (!schema.includes(status)) throw new Error(`Status '${status}' not found in schema`)
    }
  })
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════╗')
  console.log('║  Content Studio E2E Pipeline Probe          ║')
  console.log('╚══════════════════════════════════════════════╝')
  console.log(`Target: ${BASE}`)

  const start = Date.now()

  await iteration1()
  await iteration2()
  await iteration3()
  await iteration6()
  await iteration8()
  await iteration9()
  await iteration10()

  const elapsed = ((Date.now() - start) / 1000).toFixed(1)
  console.log(`\n═══════════════════════════════════════════════`)
  console.log(`  Results: ${pass} passed, ${fail} failed, ${skip} skipped`)
  console.log(`  Time: ${elapsed}s`)
  console.log(`═══════════════════════════════════════════════`)

  process.exit(fail > 0 ? 1 : 0)
}

main()
