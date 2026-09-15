import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('Content Studio Codex second-review production seams', () => {
  test('SSE route determines contract boundary from the stored job, not a client opt-in flag', () => {
    const src = read('app/api/seo-factory/generate-stream/route.ts')
    expect(src).toMatch(/existingJobId[\s\S]{0,800}(generationRequiresWritingContract|job.*contract)/i)
    expect(src).not.toMatch(/if \(!isContractBound\(body\)\)\s*\{?\s*return legacyUncontractedPOST/)
  })

  test('strict SSE owns one execution lease for the whole producer lifetime', () => {
    const src = read('lib/seoFactory/contentStudioPipeline.ts')
    expect(src).not.toMatch(/runInContentStudioExecution\(state,\s*\(\)\s*=>\s*iterator\.next\(\)\)/)
    expect(src).toMatch(/runInContentStudioExecution[\s\S]{0,1000}runSeoFactoryPipelineStream/)
    expect(src).toMatch(/startExecutionLeaseHeartbeat/)
    expect(src).toMatch(/renewContentStudioExecution/)
  })

  test('contracted Linear Desk executes the immutable saved brief instead of rebriefing', () => {
    const src = read('lib/seoFactory/linearDesk.ts')
    expect(src).toMatch(/if \(contractBrief\)/)
    expect(src).toMatch(/brief\s*=\s*contractBrief/)
    expect(src).toMatch(/executeBriefPrompt\(brief\)/)
    expect(src).toMatch(/rebriefing disabled/i)
  })

  test('shared production desk supplies canonical before/after audits when callers omit an override', () => {
    const desk = read('lib/seoFactory/linearDesk.ts')
    expect(desk).toMatch(/auditContent/)
    expect(desk).toMatch(/const auditRewrite[\s\S]{0,1200}auditContent/)
    expect(desk).toMatch(/previousAudit:\s*auditRewrite\(content\)/)
    expect(desk).toMatch(/nextAudit:\s*auditRewrite\(next\)/)
    expect(desk).toMatch(/keywordTerms/)
  })

  test('contract hydration pins reader question and model while strict runner enforces saved ownership', () => {
    const contract = read('lib/seoFactory/pipelineContract.ts')
    const runner = read('lib/seoFactory/contentStudioPipeline.ts')
    const provider = read('lib/contentAiProvider.ts')
    expect(contract).toMatch(/reader\.primaryQuestion/)
    expect(contract).not.toMatch(/topic:\s*input\.topic\s*\|\|\s*contract\.reader\.primaryQuestion/)
    expect(contract).toMatch(/requestedModel/)
    expect(runner).toMatch(/contract\.ownership\.(host|repo|filePath|canonicalUrl)/)
    expect(runner).toMatch(/assertContractOwnershipBeforeAuthoring/)
    expect(provider).toMatch(/assertContractProviderSelection/)
  })

  test('actual rendered/Git ship boundary checks strict content, owner and execution lease', () => {
    const renderer = read('lib/seoFactory/renderTarget.ts')
    const git = read('lib/githubContents.ts')
    expect(renderer).toMatch(/assertStrictShipContent\(opts\.content\)/)
    expect(renderer).toMatch(/assertStrictOwnerTarget/)
    expect(git).toMatch(/strict Content Studio Git mutation blocked/)
    expect(git).toMatch(/renewContentStudioExecution/)
  })

  test('SSE error and premature EOF cannot be treated as successful completion', () => {
    const wrapper = read('lib/seoFactory/contentStudioPipeline.ts')
    const route = read('app/api/seo-factory/generate-stream/route.ts')
    expect(wrapper).toMatch(/event\.type\s*===\s*['"]error['"][\s\S]{0,700}persistExecutionFailure/)
    expect(wrapper).toMatch(/stream.*ended.*without.*final|without final event/i)
    expect(route).toMatch(/finally[\s\S]{0,700}iterator\?\.return|finally[\s\S]{0,700}iterator\.return/)
  })

  test('same-job execution has atomic claim/renew/check fencing and expiry-conditioned terminal writes', () => {
    const runner = read('lib/seoFactory/contentStudioPipeline.ts')
    const store = read('lib/seoFactory/writingContractStore.ts')
    expect(store).toMatch(/claimContentStudioExecution/)
    expect(store).toMatch(/renewContentStudioExecution/)
    expect(store).toMatch(/assertContentStudioExecution/)
    expect(runner).toMatch(/execution_owner/)
    expect(runner).toMatch(/execution_attempt/)
    expect(runner).toMatch(/execution_lease_expires_at/)
    expect(runner).toMatch(/\.gt\(['"]execution_lease_expires_at['"]/)
  })

  test('publication proof binds both repository artifact and live substantive body digests', () => {
    const proof = read('lib/seoFactory/publicationProof.ts')
    const monitor = read('lib/seoFactory/publicationMonitor.ts')
    const live = read('lib/seoFactory/liveVerify.ts')
    expect(proof).toMatch(/approvedArtifactHash/)
    expect(proof).toMatch(/approvedBodyHash/)
    expect(monitor).toMatch(/approvedArtifactHash/)
    expect(live).toMatch(/approvedBodyHash/)
  })
})
