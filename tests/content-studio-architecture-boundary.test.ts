import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8')

describe('Content Studio Approach B architecture boundary', () => {
  it('has no temporary *Legacy.ts pipeline/provider/shipper implementation copies', () => {
    for (const relative of [
      'lib/seoFactory/pipelineLegacy.ts',
      'lib/seoFactory/pipelineStreamLegacy.ts',
      'lib/seoFactory/shipLegacy.ts',
      'lib/contentAiProviderLegacy.ts',
    ]) {
      expect(fs.existsSync(path.join(root, relative))).toBe(false)
    }
    expect(fs.existsSync(path.join(root, 'lib/seoFactory/pipeline.ts'))).toBe(true)
    expect(fs.existsSync(path.join(root, 'lib/seoFactory/pipelineStream.ts'))).toBe(true)
    expect(fs.existsSync(path.join(root, 'lib/seoFactory/ship.ts'))).toBe(true)
    expect(fs.existsSync(path.join(root, 'lib/contentAiProviderCore.ts'))).toBe(true)
  })

  it('keeps the public provider as the only guarded authoring door', () => {
    const provider = read('lib/contentAiProvider.ts')
    expect(provider).toContain("from './contentAiProviderCore'")
    expect(provider).toContain('assertIsolatedAuthoringAllowed()')
    expect(provider).not.toMatch(/contentAiProviderLegacy/)
  })

  it('binds JSON and SSE routes to contract runners before legacy compatibility paths', () => {
    const json = read('app/api/seo-factory/generate/route.ts')
    const sse = read('app/api/seo-factory/generate-stream/route.ts')
    expect(json).toContain('runContentStudioPipeline')
    expect(json).toMatch(/contractBound[\s\S]*runContentStudioPipeline/)
    expect(sse).toContain('runContentStudioPipelineStream')
    expect(sse).toContain('generationRequiresWritingContract')
    expect(sse).toMatch(/existingJobId[\s\S]*generationRequiresWritingContract\(\{ existingJobId \}\)[\s\S]*if \(!contractBound\) return legacyUncontractedPOST\(request\)[\s\S]*runContentStudioPipelineStream\(input\)/)
  })

  it('requires the Content Studio compatibility generate route itself to be contract-bound', () => {
    const route = read('app/api/content-studio/generate/route.ts')
    expect(route).not.toContain('runSeoFactoryPipeline')
    expect(route).toContain('runContentStudioPipeline')
    expect(route).toMatch(/writing contract.*required|contract.*required/i)
  })

  it('routes cron and manual retries through the stored-job contract decision', () => {
    const cron = read('app/api/cron/content-studio-retry/route.ts')
    const jobs = read('app/api/content-studio/jobs/route.ts')
    const stored = read('lib/seoFactory/storedJobExecution.ts')
    expect(cron).toContain('runStoredContentJob')
    expect(jobs).toContain('runStoredContentJob')
    expect(stored).toContain('runContentStudioPipeline')
    expect(stored).toContain('contract_id')
  })

  it('reconciliation only schedules recovery and cannot execute a raw or contract pipeline', () => {
    const reconcile = read('app/api/cron/reconcile-content-jobs/route.ts')
    expect(reconcile).not.toMatch(/runSeoFactoryPipeline\s*\(/)
    expect(reconcile).not.toMatch(/runContentStudioPipeline\s*\(/)
    expect(reconcile).not.toMatch(/generateContentText\s*\(/)
    expect(reconcile).toMatch(/retry cron|staged for retry/i)
  })

  it('has no independently registered Content Studio route that directly calls the raw pipeline', () => {
    const apiRoot = path.join(root, 'app/api/content-studio')
    const routeFiles: string[] = []
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes:true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) walk(full)
        else if (entry.name === 'route.ts') routeFiles.push(full)
      }
    }
    walk(apiRoot)
    const offenders = routeFiles
      .filter((file) => /runSeoFactoryPipeline\s*\(/.test(fs.readFileSync(file, 'utf8')))
      .map((file) => path.relative(root, file))
    expect(offenders).toEqual([])
  })

  it('keeps the only registered jobs HTTP route in route.ts; legacy.ts is internal compatibility, not a route', () => {
    expect(fs.existsSync(path.join(root, 'app/api/content-studio/jobs/route.ts'))).toBe(true)
    expect(fs.existsSync(path.join(root, 'app/api/content-studio/jobs/legacy.ts'))).toBe(true)
    const wrapper = read('app/api/content-studio/jobs/route.ts')
    expect(wrapper).toContain("from './legacy'")
    expect(wrapper).toContain('loadWritingContract')
    expect(wrapper).toContain('runWithPublicationIdentity')
  })
})
