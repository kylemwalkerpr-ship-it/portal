import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('Content Studio Codex second-review production seams', () => {
  test('SSE route determines contract boundary from the stored job, not a client opt-in flag', () => {
    const src = read('app/api/seo-factory/generate-stream/route.ts')
    expect(src).toMatch(/existingJobId[\s\S]{0,800}(loadJobWritingContract|resolvePipelineWritingContract|job.*contract)/i)
    expect(src).not.toMatch(/if \(!isContractBound\(body\)\)\s*\{?\s*return legacyUncontractedPOST/)
  })

  test('strict SSE owns one execution lease for the whole producer lifetime', () => {
    const src = read('lib/seoFactory/contentStudioPipeline.ts')
    expect(src).not.toMatch(/runInContentStudioExecution\(state,\s*\(\)\s*=>\s*iterator\.next\(\)\)/)
    expect(src).toMatch(/runInContentStudioExecution[\s\S]{0,500}runSeoFactoryPipelineStream/)
  })

  test('contracted Linear Desk executes an immutable saved brief instead of rebriefing', () => {
    const src = read('lib/seoFactory/linearDesk.ts')
    expect(src).toMatch(/contractBrief|persistedBrief|savedBrief/)
    expect(src).toMatch(/contractBrief[\s\S]{0,1800}executeBriefPrompt/)
  })

  test('both production pipelines provide the desk the real audit function', () => {
    const json = read('lib/seoFactory/pipeline.ts')
    const sse = read('lib/seoFactory/pipelineStream.ts')
    expect(json).toMatch(/runLinearDesk\([\s\S]{0,2200}audit:\s*runAudit/)
    expect(sse).toMatch(/runLinearDesk\([\s\S]{0,2200}audit:\s*runAudit/)
  })

  test('contract hydration pins reader question, ownership and requested model', () => {
    const src = read('lib/seoFactory/pipelineContract.ts')
    expect(src).toMatch(/reader\.primaryQuestion/)
    expect(src).not.toMatch(/topic:\s*input\.topic\s*\|\|\s*contract\.reader\.primaryQuestion/)
    expect(src).toMatch(/ownership\.(repo|filePath|canonicalUrl)/)
    expect(src).toMatch(/requestedModel/)
  })

  test('actual ship boundary checks strict accepted content', () => {
    const src = read('lib/seoFactory/ship.ts')
    expect(src).toMatch(/assertStrictShipContent\(.*content/)
  })

  test('SSE error and premature EOF cannot be treated as successful completion', () => {
    const wrapper = read('lib/seoFactory/contentStudioPipeline.ts')
    const route = read('app/api/seo-factory/generate-stream/route.ts')
    expect(wrapper).toMatch(/type\s*===\s*['"]error['"][\s\S]{0,700}persistExecutionFailure/)
    expect(wrapper).toMatch(/stream.*ended.*without.*final|without final event/i)
    expect(route).toMatch(/finally[\s\S]{0,700}iterator\?\.return|finally[\s\S]{0,700}iterator\.return/)
  })

  test('same-job execution has an atomic owner/attempt claim and owner-conditioned writes', () => {
    const runner = read('lib/seoFactory/contentStudioPipeline.ts')
    const store = read('lib/seoFactory/writingContractStore.ts')
    expect(store).toMatch(/claim.*Execution|acquire.*Execution|execution_owner/i)
    expect(runner).toMatch(/executionOwner|execution_owner/)
    expect(runner).toMatch(/executionAttempt|execution_attempt/)
  })

  test('publication proof binds both repository artifact and live substantive body digests', () => {
    const proof = read('lib/seoFactory/publicationProof.ts')
    const monitor = read('lib/seoFactory/publicationMonitor.ts')
    const live = read('lib/seoFactory/liveVerify.ts')
    expect(proof).toMatch(/approvedArtifactHash/)
    expect(proof).toMatch(/approvedBodyHash|approvedContentDigest/)
    expect(monitor).toMatch(/approvedArtifactHash/)
    expect(live).toMatch(/approvedBodyHash|approvedContentDigest/)
  })
})
