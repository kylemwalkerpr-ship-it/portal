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

  test('strict SSE keeps the verified producer inside one execution lease for its whole lifetime', () => {
    const facade = read('lib/seoFactory/contentStudioPipeline.ts')
    const core = read('lib/seoFactory/contentStudioPipelineCore.ts')
    expect(facade).toMatch(/core\.runContentStudioPipelineStream\(request\)/)
    expect(facade).not.toMatch(/const result\s*=\s*await[\s\S]{0,250}core\.runContentStudioPipeline\(request\)/)
    expect(core).not.toMatch(/runInContentStudioExecution\(state,\s*\(\)\s*=>\s*iterator\.next\(\)\)/)
    expect(core).toMatch(/const producer\s*=\s*runInContentStudioExecution\(prepared\.state/)
    expect(core).toMatch(/runSeoFactoryPipelineStream\(hydrated\)/)
    expect(core).toMatch(/startExecutionLeaseHeartbeat/)
    expect(core).toMatch(/renewContentStudioExecution/)
  })

  test('contracted Linear Desk executes the immutable saved brief instead of rebriefing', () => {
    const facade = read('lib/seoFactory/linearDesk.ts')
    const core = read('lib/seoFactory/linearDeskCore.ts')
    expect(facade).toContain("from './linearDeskCore'")
    expect(facade).toMatch(/contractQueryCoverage/)
    expect(core).toMatch(/if \(contractBrief\)/)
    expect(core).toMatch(/brief\s*=\s*contractBrief/)
    expect(core).toMatch(/executeBriefPrompt\(brief\)/)
    expect(core).toMatch(/rebriefing disabled/i)
  })

  test('shared production desk supplies canonical before/after audits with immutable provenance', () => {
    const facade = read('lib/seoFactory/linearDesk.ts')
    const core = read('lib/seoFactory/linearDeskCore.ts')
    expect(facade).toMatch(/contractQueryCoverage/)
    expect(facade).toMatch(/requiredShortKeywords:\s*\[\.\.\.coverage\.requiredShortKeywords\]/)
    expect(facade).toMatch(/requiredLongTailKeywords:\s*\[\.\.\.coverage\.requiredLongTailKeywords\]/)
    expect(facade).toMatch(/shortKeywordTerms:\s*coverage\.shortKeywordTerms/)
    expect(facade).toMatch(/longTailKeywordTerms:\s*coverage\.longTailKeywordTerms/)
    expect(core).toMatch(/auditContent/)
    expect(core).toMatch(/const auditRewrite[\s\S]{0,1200}auditContent/)
    expect(core).toMatch(/previousAudit:\s*auditRewrite\(content\)/)
    expect(core).toMatch(/nextAudit:\s*auditRewrite\(next\)/)
    expect(core).toMatch(/keywordTerms/)
  })

  test('contract hydration pins reader question and model while strict runner enforces saved ownership', () => {
    const contract = read('lib/seoFactory/pipelineContract.ts')
    const runner = read('lib/seoFactory/contentStudioPipelineCore.ts')
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
    const core = read('lib/seoFactory/contentStudioPipelineCore.ts')
    const route = read('app/api/seo-factory/generate-stream/route.ts')
    expect(core).toMatch(/event\.type\s*===\s*['"]error['"][\s\S]{0,700}persistExecutionFailure/)
    expect(core).toMatch(/stream.*ended.*without.*final|without final event/i)
    expect(route).toMatch(/finally[\s\S]{0,700}iterator\?\.return|finally[\s\S]{0,700}iterator\.return/)
  })

  test('same-job execution has atomic claim/renew/check fencing and expiry-conditioned terminal writes', () => {
    const runner = read('lib/seoFactory/contentStudioPipelineCore.ts')
    const storeFacade = read('lib/seoFactory/writingContractStore.ts')
    const storeCore = read('lib/seoFactory/writingContractStoreCore.ts')
    expect(storeFacade).toMatch(/claimContentStudioExecution/)
    expect(storeFacade).toMatch(/p_allow_failed_retry/)
    expect(storeCore).toMatch(/renewContentStudioExecution/)
    expect(storeCore).toMatch(/assertContentStudioExecution/)
    expect(runner).toMatch(/execution_owner/)
    expect(runner).toMatch(/execution_attempt/)
    expect(runner).toMatch(/execution_lease_expires_at/)
    expect(runner).toMatch(/\.gt\(['"]execution_lease_expires_at['"]/)
  })

  test('strict stream early writes and compatibility retries pass through the exact owner fence', () => {
    const stream = read('lib/seoFactory/pipelineStream.ts')
    const fence = read('lib/seoFactory/streamContentJobFence.ts')
    const persist = read('lib/seoFactory/persistContentJob.ts')
    expect(stream).toMatch(/fenceStreamContentJobsClient\(createClient/)
    expect(fence).toMatch(/\.eq\(['"]execution_owner['"],\s*identity\.owner\)/)
    expect(fence).toMatch(/\.eq\(['"]execution_attempt['"],\s*identity\.attempt\)/)
    expect(fence).toMatch(/\.gt\(['"]execution_lease_expires_at['"]/)
    expect(fence).toMatch(/COMPAT_COLUMNS/)
    expect(fence).toMatch(/insert['"]\s*\|\|\s*tableProperty\s*===\s*['"]upsert/)
    expect(persist).toMatch(/strictFence\([\s\S]{0,500}update\(baseRow\)/)
    expect(persist).toMatch(/strictFence\([\s\S]{0,500}update\(legacyRow\)/)
    expect(persist).not.toMatch(/\.neq\(['"]id['"]/)
    expect(persist).not.toMatch(/core\.persistPipelineJob\(input\)[\s\S]{0,300}execution\?\.strict/)
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
