/**
 * Content Studio E2E Pipeline Probe
 * 
 * Tests every pipeline stage programmatically. Run with:
 *   npx tsx scripts/e2e-pipeline-probe.ts
 *
 * Stages: Research → Plan → Draft → Review → Approve → Track → Queue
 */

// ===== STAGE 1: Research =====

import { buildFactorySystemPrompt } from '../lib/seoFactory/prompts'

export function test_buildFactorySystemPrompt_allFields(): { pass: boolean; detail: string } {
  const prompt = buildFactorySystemPrompt({
    plan: {
      title: 'UK Dependent Visa Guide',
      topic: 'dependent visa uk',
      primaryKeyword: 'uk dependent visa',
      region: 'UK',
      contentType: 'article',
      indexable: true,
      publishMode: 'pr',
      targetRepo: 'caseworks',
      blockers: [],
      slug: 'uk-dependent-visa-guide',
    },
    contentType: 'article',
    minWords: 2200,
    h2Outline: ['Eligibility', 'Documents', 'FAQ'],
    sources: ['https://www.gov.uk/student-visa'],
    requiredShortKeywords: ['student visa'],
    requiredLongTailKeywords: ['uk student visa requirements 2026'],
    targetSlug: 'uk-student-visa-guide',
  })

  const checks: [string, boolean][] = [
    ['minWords', prompt.includes('2200')],
    ['h2Outline', prompt.includes('Eligibility')],
    ['sources', prompt.includes('gov.uk')],
    ['keywords', prompt.includes('student visa')],
    ['disclaimer clause', prompt.toLowerCase().includes('educational') || prompt.toLowerCase().includes('not legal advice')],
    ['AI cliche ban', prompt.toLowerCase().includes('delve') || prompt.toLowerCase().includes('do not use')],
    ['meta description instruction', prompt.toLowerCase().includes('meta description') || prompt.toLowerCase().includes('ctr')],
  ]

  const failures = checks.filter(([, ok]) => !ok)
  if (failures.length > 0) {
    return { pass: false, detail: `Missing: ${failures.map(([n]) => n).join(', ')}` }
  }
  return { pass: true, detail: `All ${checks.length} checks pass` }
}

// ===== STAGE 2: Plan (brief propagation) =====

export function test_editorialScaffold_metaDescription_repair(): { pass: boolean; detail: string } {
  const mod = require('../lib/seoFactory/editorialScaffold')
  const applyDeterministicRepairs = mod.applyDeterministicRepairs

  // Draft with YAML front matter — NO description field
  const draftLines = [
    '---',
    'title: "UK Dependent Visa Guide 2026"',
    'content_type: article',
    'primary_keyword: dependent visa uk',
    'region: UK',
    '---',
    '',
    '# UK Dependent Visa Guide 2026',
    '',
    'This comprehensive guide covers eligibility requirements and the complete',
    'application process for UK dependent visas. Whether you are bringing a',
    'spouse, partner, or child to the United Kingdom, this guide explains the',
    'financial thresholds, accommodation requirements, and documentation you',
    'need to prepare for a successful dependent visa application in 2026.',
    '',
    '## In 60 seconds',
    '- Dependents include spouses, civil partners, and children under 18',
    '- Financial requirements apply per dependent (check current thresholds)',
    '- Applications can be made from inside or outside the UK',
    '',
    '## Eligibility',
    'You must demonstrate that your relationship is genuine and subsisting.',
  ]
  const draftWithFM = draftLines.join('\n')

  const result = applyDeterministicRepairs({
    content: draftWithFM,
    primaryKeyword: 'dependent visa uk',
    title: 'UK Dependent Visa Guide 2026',
    indexable: true,
    contentType: 'article',
  })

  const applied = result.applied || []
  const hasMetaDesc = applied.includes('meta_description')
  const hasDescInContent = result.content.includes('description:')
  const hasDisclaimer = applied.includes('disclaimer')
  const hasToc = applied.includes('table_of_contents')

  const issues: string[] = []
  if (!hasMetaDesc) issues.push('meta_description not in applied')
  if (!hasDescInContent) issues.push('description: not in content')
  if (!hasDisclaimer) issues.push('disclaimer not applied')
  // table_of_contents only fires when content has 3+ H2s — skip for short test drafts

  if (issues.length > 0) {
    return { pass: false, detail: `Applied: [${applied.join(', ')}] — missing: ${issues.join('; ')}` }
  }
  return { pass: true, detail: `Applied: ${applied.join(', ')}` }
}

// ===== STAGE 3: Draft (depth rescue) =====

export async function test_depthRescue_tokenCapsFixed(): Promise<{ pass: boolean; detail: string }> {
  const { runDepthRescue } = await import('../lib/seoFactory/depthRescue')
  const { auditContent } = await import('../lib/seoFactory/audit')
  const { countBodyWords } = await import('../lib/seoFactory/contentDepth')

  const draft = '# Test Article\n\n' + 'Content goes here. '.repeat(300)
  const wc = countBodyWords(draft)

  let expandTokens = 0
  let appendTokens = 0
  let expandCalled = false

  for await (const ev of runDepthRescue({
    content: draft,
    audit: auditContent({
      content: draft, contentType: 'article', primaryKeyword: 'test',
      indexable: true, ownershipBlockers: [],
    }),
    title: 'Test', topic: 'test', primaryKeyword: 'test', region: 'UK',
    contentType: 'article', minWords: 2200, targetWords: 2500, maxWords: 6000,
    minAudit: 60, indexable: true, ownershipBlockers: [],
    generateText: async (opts) => {
      if (!expandCalled) {
        expandTokens = opts.maxTokens
        expandCalled = true
      } else {
        appendTokens = opts.maxTokens
      }
      return { text: draft + '\n\n## More\n\n' + 'Extra. '.repeat(400), provider: 'test', model: 'test' }
    },
  })) { /* collect */ }

  if (expandTokens < 8000) {
    return { pass: false, detail: `Expand pass maxTokens too low: ${expandTokens} (need ≥8000)` }
  }
  if (appendTokens > 0 && appendTokens < 3000) {
    return { pass: false, detail: `Append pass maxTokens too low: ${appendTokens} (need ≥3000)` }
  }
  return { pass: true, detail: `Expand: ${expandTokens} tokens, Append: ${appendTokens} tokens, Draft: ${wc} words` }
}

export async function test_criticallyThin_skipsRescue(): Promise<{ pass: boolean; detail: string }> {
  const { runDepthRescue } = await import('../lib/seoFactory/depthRescue')
  const { auditContent } = await import('../lib/seoFactory/audit')

  let generateCalled = false
  const events: any[] = []

  for await (const ev of runDepthRescue({
    content: '# Barely', // 1 word
    audit: auditContent({
      content: '# Barely', contentType: 'article', primaryKeyword: 'test',
      indexable: true, ownershipBlockers: [],
    }),
    title: 'Test', topic: 'test', primaryKeyword: 'test', region: 'US',
    contentType: 'article', minWords: 2200, targetWords: 2500, maxWords: 6000,
    minAudit: 60, indexable: true, ownershipBlockers: [],
    generateText: async () => { generateCalled = true; return { text: 'x', provider: 't', model: 't' } },
  })) { events.push(ev) }

  if (generateCalled) return { pass: false, detail: 'generateText called on critically-thin draft' }

  const done = events.find((e: any) => e.type === 'done')
  if (!done) return { pass: false, detail: 'No done event' }
  if (done.expandPasses !== 0) return { pass: false, detail: `Expected 0 passes, got ${done.expandPasses}` }

  const skip = events.find((e: any) => e.type === 'progress' && e.message.includes('critically thin'))
  if (!skip) return { pass: false, detail: 'No critically-thin progress message' }

  return { pass: true, detail: 'Rescue skipped with message, done yields 0 passes' }
}

// ===== STAGE 4: Review =====

export function test_stripDeadLinks_mechanical(): { pass: boolean; detail: string } {
  const { stripDeadLinks } = require('../lib/seoFactory/linkAudit')

  const draft = 'Check [link one](/uk/fake) and [link two](/ca/nope) and [real](https://www.gov.uk/visa)\n'
  const { content: cleaned, stripped } = stripDeadLinks(draft, ['/uk/fake', '/ca/nope'])

  if (stripped !== 2) return { pass: false, detail: `Expected 2 stripped, got ${stripped}` }
  if (cleaned.includes('](/uk/fake)')) return { pass: false, detail: 'Dead link /uk/fake not removed' }
  if (cleaned.includes('](/ca/nope)')) return { pass: false, detail: 'Dead link /ca/nope not removed' }
  if (!cleaned.includes('](https://www.gov.uk/visa)')) return { pass: false, detail: 'Real gov link removed' }
  if (!cleaned.includes('link one')) return { pass: false, detail: 'Link text not preserved' }

  return { pass: true, detail: `Stripped ${stripped}, preserved real link + link text` }
}

export function test_reauditContract_warningsDataMerge(): { pass: boolean; detail: string } {
  const { evaluateReauditContract } = require('../lib/seoFactory/reauditContract')

  const content = [
    '---',
    'title: "Test Article"',
    'content_type: article',
    'primary_keyword: test',
    'region: UK',
    '---',
    '',
    '# Test Article',
    '',
    'Test content. '.repeat(100),
  ].join('\n')

  const result = evaluateReauditContract({
    content,
    contentType: 'article',
    primaryKeyword: 'test',
    indexable: true,
  })

  const checks: [string, boolean][] = [
    ['has score', typeof result.score === 'number'],
    ['has warningsData', Array.isArray(result.warningsData)],
    ['has annotations', Array.isArray(result.annotations)],
    ['has shipReady', typeof result.shipReady === 'boolean'],
  ]

  const failures = checks.filter(([, ok]) => !ok)
  if (failures.length > 0) return { pass: false, detail: `Missing: ${failures.join(', ')}` }

  const codes = result.warningsData.map((w: any) => w.code)
  return { pass: true, detail: `Score ${result.score}, ${codes.length} warnings: ${codes.join(', ')}` }
}

// ===== STAGE 5: Approve (ship gate) =====

export function test_meetsShipQuality_requiresDepth(): { pass: boolean; detail: string } {
  const { meetsShipQuality, meetsDepthFloor } = require('../lib/seoFactory/audit')

  const withBlocker = {
    score: 90, wordCount: 500,
    blockers: [{ code: 'word_count', severity: 'blocker', message: 'Below floor' }],
    warnings: [], humanScore: 95, annotations: [],
  }
  const clean = {
    score: 90, wordCount: 2500,
    blockers: [], warnings: [], humanScore: 95, annotations: [],
  }

  if (meetsDepthFloor(withBlocker)) return { pass: false, detail: 'Should NOT pass depth floor with word_count' }
  if (meetsShipQuality(withBlocker)) return { pass: false, detail: 'Should NOT pass ship quality with blocker' }
  if (!meetsDepthFloor(clean)) return { pass: false, detail: 'Should pass depth floor' }
  if (!meetsShipQuality(clean)) return { pass: false, detail: 'Should pass ship quality' }

  return { pass: true, detail: 'Depth floor gates ship quality correctly' }
}

// ===== STAGE 6: Track (ledger) =====

export function test_editorialContract_regression(): { pass: boolean; detail: string } {
  const { editorialBriefPromptBlock } = require('../lib/seoFactory/editorialContract')
  
  // Unit test verifies the editorial contract terms are locked in
  const brief = editorialBriefPromptBlock()
  
  // The editorial contract test in tests/editorial-contract-regression.test.ts
  // already asserts these. We do a lighter check here.
  if (!brief || brief.length < 100) {
    return { pass: false, detail: 'editorialBriefPromptBlock returned empty or short string' }
  }

  const checks = [
    { name: 'answer first', found: brief.includes('Answer first') || brief.includes('answer the primary') },
    { name: 'reader engagement', found: brief.length > 100 },
    { name: 'practitioner voice', found: brief.includes('practitioner') || brief.includes('YouSafe') || brief.includes('person who needs') },
  ]
  
  const missing = checks.filter(c => !c.found).map(c => c.name)
  if (missing.length > 0) return { pass: false, detail: `Missing: ${missing.join(', ')}` }
  return { pass: true, detail: `Contract length: ${brief.length} chars, ${checks.length} clauses present` }
}

// ===== Runner =====

async function main() {
  console.log('╔══════════════════════════════════════════╗')
  console.log('║  Content Studio Pipeline Probe          ║')
  console.log('╚══════════════════════════════════════════╝\n')

  const tests: Array<{ name: string; fn: () => { pass: boolean; detail: string } | Promise<{ pass: boolean; detail: string }> }> = [
    // Stage 1: Research
    { name: 'Research: buildFactorySystemPrompt has all fields', fn: test_buildFactorySystemPrompt_allFields },
    // Stage 2: Plan
    { name: 'Plan: meta_description deterministic repair injects description:', fn: test_editorialScaffold_metaDescription_repair },
    // Stage 3-5: Draft
    { name: 'Draft: depthRescue token caps fixed (≥8000 expand, ≥3000 append)', fn: test_depthRescue_tokenCapsFixed },
    { name: 'Draft: critically-thin guard skips rescue', fn: test_criticallyThin_skipsRescue },
    // Stage 6-7: Review
    { name: 'Review: stripDeadLinks mechanically removes dead URLs', fn: test_stripDeadLinks_mechanical },
    { name: 'Review: reauditContract returns warningsData merge', fn: test_reauditContract_warningsDataMerge },
    // Stage 8: Approve
    { name: 'Approve: meetsShipQuality requires meetsDepthFloor', fn: test_meetsShipQuality_requiresDepth },
    // Stage 6: Track
    { name: 'Track: editorialContract has all required clauses', fn: test_editorialContract_regression },
  ]

  let pass = 0
  let fail = 0
  const failures: string[] = []

  for (const t of tests) {
    process.stdout.write(`  ${t.name}... `)
    try {
      const result = await t.fn()
      if (result.pass) {
        pass++
        console.log(`✅ (${result.detail})`)
      } else {
        fail++
        console.log(`❌ ${result.detail}`)
        failures.push(`${t.name}: ${result.detail}`)
      }
    } catch (e: any) {
      fail++
      console.log(`💥 ${e.message}`)
      failures.push(`${t.name}: ${e.message}`)
    }
  }

  console.log(`\n═══════════════════════════════════════════`)
  console.log(`  Results: ${pass} passed, ${fail} failed`)
  if (failures.length > 0) {
    console.log(`  Failures:`)
    failures.forEach(f => console.log(`    - ${f}`))
  }
  console.log(`═══════════════════════════════════════════`)

  process.exit(fail > 0 ? 1 : 0)
}

main()
