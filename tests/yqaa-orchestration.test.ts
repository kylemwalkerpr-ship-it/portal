import fs from 'fs'
import os from 'os'
import path from 'path'

describe('YQAA shared public knowledge selection', () => {
  it('ranks an explicitly requested jurisdiction ahead of trusted site context and keeps canonical facts', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yqaa-kb-'))
    try {
      fs.writeFileSync(path.join(dir, 'network-authority.md'), '# Network authority\nCanonical network facts.')
      const pages = [
        { id: 'network:usa:/', title: 'US services', site: 'usa', repository: 'kylemwalkerpr-ship-it/yousafe-consultancy', sourceUrl: 'https://usa.yousafeconsultancy.com/', body: 'Canada PGWP Canada PGWP Canada PGWP Canada PGWP Canada PGWP Canada PGWP Canada PGWP Canada PGWP Canada PGWP Canada PGWP Canada PGWP Canada PGWP Canada PGWP Canada PGWP US immigration service information.' },
        { id: 'network:canada:/', title: 'Canada PGWP guidance', site: 'canada', repository: 'kylemwalkerpr-ship-it/yousafe-consultancy', sourceUrl: 'https://ca.yousafeconsultancy.com/pgwp', body: 'Canada PGWP application guidance.' },
        { id: 'network:market:/', title: 'Public Marketplace catalog', site: 'market', repository: 'kylemwalkerpr-ship-it/portal', sourceUrl: 'https://market.yousafeconsultancy.com/', body: 'Public services catalog and Marketplace pricing listings.' },
      ]
      fs.writeFileSync(path.join(dir, 'network-pages.json'), JSON.stringify(pages))
      const { selectYqaaKnowledge } = await import('@/lib/messengerSiteKnowledge')
      const selected = selectYqaaKnowledge({ query: 'How do I apply for a Canada PGWP?', deep: true, hostname: 'usa.yousafeconsultancy.com', limit: 3, kbDir: dir })

      expect(selected[0].site).toBe('canada')
      expect(selected.map((item) => item.id)).toContain('network-authority#0')
      expect(selected[0].sourceUrl).toBe('https://ca.yousafeconsultancy.com/pgwp')
      const oneResult = selectYqaaKnowledge({ query: 'Canada PGWP steps', deep: true, hostname: 'usa.yousafeconsultancy.com', limit: 1, kbDir: dir })
      expect(oneResult[0].site).toBe('canada')
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('rejects crawler rows with invalid source hosts and provenance', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yqaa-kb-invalid-'))
    try {
      fs.writeFileSync(path.join(dir, 'network-pages.json'), JSON.stringify([
        { id: 'private', title: 'Private order', site: 'market', repository: 'org/portal', sourceUrl: 'https://evil.example/order', body: 'must not be retrieved' },
        { id: 'private-market-route', title: 'Private order', site: 'market', repository: 'kylemwalkerpr-ship-it/portal', sourceUrl: 'https://market.yousafeconsultancy.com/dashboard/orders/123', body: 'must not be retrieved' },
        { id: 'private-portal-host', title: 'Private order', site: 'market', repository: 'kylemwalkerpr-ship-it/portal', sourceUrl: 'https://portal.yousafeconsultancy.com/orders/123', body: 'must not be retrieved' },
        { id: 'missing-repo', title: 'No provenance', site: 'usa', sourceUrl: 'https://usa.yousafeconsultancy.com/', body: 'must not be retrieved' },
      ]))
      const { loadCuratedKbChunks } = await import('@/lib/messengerSiteKnowledge')
      expect(loadCuratedKbChunks(dir)).toEqual([])
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('uses trusted site and page context as soft relevance signals when no destination is stated', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yqaa-kb-context-'))
    try {
      fs.writeFileSync(path.join(dir, 'network-authority.md'), '# Network authority\nCanonical facts.')
      fs.writeFileSync(path.join(dir, 'network-pages.json'), JSON.stringify([
        { id: 'support', title: 'Support', site: 'support', repository: 'kylemwalkerpr-ship-it/support-saas', sourceUrl: 'https://support.yousafeconsultancy.com/', body: 'Human support and agent handoff.' },
        { id: 'market', title: 'Marketplace', site: 'market', repository: 'kylemwalkerpr-ship-it/portal', sourceUrl: 'https://market.yousafeconsultancy.com/', body: 'Marketplace public services.' },
      ]))
      const { selectYqaaKnowledge } = await import('@/lib/messengerSiteKnowledge')
      const selected = selectYqaaKnowledge({ query: 'What can I do here?', deep: true, hostname: 'support.yousafeconsultancy.com', pageContext: 'support live agent handoff', limit: 3, kbDir: dir })
      expect(selected[0].site).toBe('support')
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('YQAA Jev advisory and deterministic safety policy', () => {
  afterEach(() => { jest.resetModules(); jest.dontMock('@opennextjs/cloudflare') })

  it('marks explicit destination on a different host as cross-jurisdiction', async () => {
    const { yqaaJevTriggers } = await import('@/lib/jevAdvisory')
    expect(yqaaJevTriggers({ query: 'What are Canada PGWP steps?', hostname: 'usa.yousafeconsultancy.com', evidence: [{ id: 'c', title: 'Canada', body: 'public', source: 'https://ca.yousafeconsultancy.com', site: 'canada' }] })).toContain('cross_jurisdiction')
  })

  it('keeps deterministic simple turns independent of Jev and fails closed on high stakes or low evidence', async () => {
    const { requestJevAdvisory, applyYqaaSafetyPolicy, yqaaJevTriggers } = await import('@/lib/jevAdvisory')
    const simpleContext = { query: 'How do I find public information?', hostname: 'yousafeconsultancy.com', evidence: [
      { id: 'guide', title: 'Public information guide', body: 'Find public information in the verified site guide.', source: 'https://yousafeconsultancy.com/guide', site: 'main', score: 3 },
      { id: 'faq', title: 'Public information FAQ', body: 'Verified ways to find public information.', source: 'https://yousafeconsultancy.com/faq', site: 'main', score: 2 },
    ] }
    const timedOut = await requestJevAdvisory(simpleContext, (async () => { const error = new Error('timed out'); error.name = 'AbortError'; throw error }) as typeof fetch, { apiKey: 'test-typesafe-key' })
    expect(timedOut).toEqual({ available: false, reason: 'timeout' })
    expect(applyYqaaSafetyPolicy(simpleContext, timedOut)).toEqual({ answer: true, reason: 'deterministic_policy_clear' })
    expect(applyYqaaSafetyPolicy(simpleContext, { available: false, reason: 'not_configured' })).toEqual({ answer: true, reason: 'deterministic_policy_clear' })

    const zeroScoreTrustedEvidence = { ...simpleContext, evidence: [
      { id: 'canonical', title: 'Canonical public guide', body: 'Trusted canonical steps for finding public information.', source: 'https://yousafeconsultancy.com/guide', site: 'main', score: 0 },
      { id: 'site-aware', title: 'Site FAQ', body: 'Site-aware verified public information.', source: 'https://yousafeconsultancy.com/faq', site: 'main', score: 0 },
    ] }
    expect(yqaaJevTriggers(zeroScoreTrustedEvidence)).not.toContain('low_evidence')
    expect(applyYqaaSafetyPolicy(zeroScoreTrustedEvidence, { available: false, reason: 'not_configured' })).toEqual({ answer: true, reason: 'deterministic_policy_clear' })

    const lowEvidenceContext = { ...simpleContext, evidence: [] }
    expect(applyYqaaSafetyPolicy(lowEvidenceContext, { available: false, reason: 'not_configured' })).toEqual({ answer: false, reason: 'low_evidence_handoff' })
    expect(applyYqaaSafetyPolicy(lowEvidenceContext, { available: true, advisory: { sufficient: true, confidence: 0.99, conflict: false, needsHandoff: false, market: 'global' } })).toEqual({ answer: false, reason: 'low_evidence_handoff' })

    const highStakes = { ...simpleContext, query: 'What are my chances of winning this court case?' }
    expect(applyYqaaSafetyPolicy(highStakes, timedOut)).toEqual({ answer: false, reason: 'high_stakes_handoff' })
    expect(applyYqaaSafetyPolicy({ ...simpleContext, query: 'I have a court hearing next week; when is my deadline to respond?' }, { available: true, advisory: { sufficient: true, confidence: 0.99, conflict: false, needsHandoff: false, market: 'global' } })).toEqual({ answer: false, reason: 'high_stakes_handoff' })
    expect(applyYqaaSafetyPolicy({ ...simpleContext, query: 'I was refused a study permit; should I apply again?' }, timedOut).answer).toBe(false)
    expect(applyYqaaSafetyPolicy({ ...simpleContext, query: 'My landlord says I am being evicted tomorrow; what should I do?' }, timedOut).answer).toBe(false)
    expect(applyYqaaSafetyPolicy({ ...simpleContext, query: 'Can I appeal my visa refusal?' }, timedOut).answer).toBe(false)
    expect(applyYqaaSafetyPolicy({ ...simpleContext, query: 'These sources conflict; which is correct?', evidence: [
      { id: 'usa', title: 'US source', body: 'public', source: 'https://usa.yousafeconsultancy.com', site: 'usa', score: 5 },
      { id: 'canada', title: 'Canada source', body: 'public', source: 'https://ca.yousafeconsultancy.com', site: 'canada', score: 5 },
    ] }, { available: true, advisory: { sufficient: true, confidence: 0.99, conflict: false, needsHandoff: false, market: 'global' } })).toEqual({ answer: false, reason: 'conflicting_evidence_handoff' })
  })

  it('requires matching jurisdiction evidence during Jev outage, regardless of host affinity', async () => {
    const { applyYqaaSafetyPolicy } = await import('@/lib/jevAdvisory')
    const unavailable = { available: false as const, reason: 'not_configured' as const }
    const query = 'What public housing rules apply in Canada?'
    const wrongJurisdiction = { query, hostname: 'canada.yousafeconsultancy.com', evidence: [
      { id: 'usa', title: 'US guide', body: 'Verified general public guidance.', source: 'https://usa.gov/guide', site: 'usa', score: 0 },
    ] }
    expect(applyYqaaSafetyPolicy(wrongJurisdiction, unavailable)).toEqual({ answer: false, reason: 'jurisdiction_evidence_missing_handoff' })

    const matchingLocal = { ...wrongJurisdiction, hostname: 'usa.yousafeconsultancy.com', evidence: [
      { id: 'canada', title: 'Canada guide', body: 'Verified Canadian public guidance.', source: 'https://canada.ca/guide', site: 'canada', score: 0 },
    ] }
    expect(applyYqaaSafetyPolicy(matchingLocal, unavailable)).toEqual({ answer: true, reason: 'deterministic_policy_clear' })

    const matchingOfficialWeb = { ...wrongJurisdiction, hostname: 'usa.yousafeconsultancy.com', evidence: [
      { id: 'web', title: 'Canada official guide', body: 'Verified Canadian public guidance.', source: 'https://canada.ca/guide', sourceUrl: 'https://canada.ca/guide', sourceKey: 'xai:web_search', jurisdiction: 'Canada', site: 'official-web', score: 0 },
    ] }
    expect(applyYqaaSafetyPolicy(matchingOfficialWeb, unavailable)).toEqual({ answer: true, reason: 'deterministic_policy_clear' })

    const matchingBrowserWeb = { ...wrongJurisdiction, hostname: 'usa.yousafeconsultancy.com', evidence: [
      { id: 'browser-web', title: 'Canada official browser source', body: 'Verified Canadian public guidance.', source: 'https://canada.ca/guide', sourceUrl: 'https://canada.ca/guide', sourceKey: 'cloudflare:browser_search', jurisdiction: 'Canada', site: 'official-web', score: 0 },
    ] }
    expect(applyYqaaSafetyPolicy(matchingBrowserWeb, unavailable)).toEqual({ answer: true, reason: 'deterministic_policy_clear' })

    const multiple = { ...matchingLocal, query: 'Compare public housing rules in Canada and the United States.' }
    expect(applyYqaaSafetyPolicy(multiple, unavailable).answer).toBe(false)
  })

  it('allows a conflict only after cited web evidence and a clear sufficient advisory', async () => {
    const { applyYqaaSafetyPolicy } = await import('@/lib/jevAdvisory')
    const context = { query: 'These sources conflict about general housing rules; what is correct?', evidence: [
      { id: 'a', title: 'Source A', body: 'General public information.', source: 'https://a.example/guide', site: 'caseworks' },
      { id: 'b', title: 'Source B', body: 'General public information.', source: 'https://b.example/guide', site: 'usa' },
    ] }
    const clear = { available: true as const, advisory: { sufficient: true, confidence: 0.94, conflict: false, needsHandoff: false, market: 'global' as const } }
    expect(applyYqaaSafetyPolicy(context, clear).answer).toBe(false)
    const citedWeb = { id: 'web', title: 'Official web source', body: 'Authoritative current public information.', source: 'https://www.hud.gov/guide', sourceUrl: 'https://www.hud.gov/guide', sourceKey: 'xai:web_search', site: 'official-web' }
    expect(applyYqaaSafetyPolicy({ ...context, evidence: [citedWeb, ...context.evidence] }, clear)).toEqual({ answer: true, reason: 'jev_advisory_clear' })
    const browserWeb = { ...citedWeb, id: 'browser-web', sourceKey: 'cloudflare:browser_search' }
    expect(applyYqaaSafetyPolicy({ ...context, evidence: [browserWeb, ...context.evidence] }, clear)).toEqual({ answer: true, reason: 'jev_advisory_clear' })
    const uncitedEvidence = { ...citedWeb, sourceKey: 'database' } as any
    expect(applyYqaaSafetyPolicy({ ...context, evidence: [
      uncitedEvidence, ...context.evidence,
    ] }, clear).answer).toBe(false)
  })

  it.each(['not_configured', 'timeout', 'invalid_response', 'request_failed'] as const)(
    'hands an ambiguous or cross-jurisdiction request off when Jev is %s',
    async (reason) => {
      const { applyYqaaSafetyPolicy } = await import('@/lib/jevAdvisory')
      const result = { available: false as const, reason }
      const ambiguous = { query: 'Which option should I choose?', hostname: 'yousafeconsultancy.com', evidence: [
        { id: 'a', title: 'Option A', body: 'Public option A.', source: 'https://yousafeconsultancy.com/a', site: 'main', score: 3 },
        { id: 'b', title: 'Option B', body: 'Public option B.', source: 'https://yousafeconsultancy.com/b', site: 'main', score: 2 },
      ] }
      expect(applyYqaaSafetyPolicy(ambiguous, result)).toEqual({ answer: false, reason: 'jev_unavailable_handoff' })

      const crossJurisdiction = { ...ambiguous, query: 'What are Canada PGWP steps?', hostname: 'usa.yousafeconsultancy.com', evidence: [
        ...ambiguous.evidence,
        { id: 'canada', title: 'Canada PGWP steps', body: 'Verified Canada steps.', source: 'https://ca.yousafeconsultancy.com/pgwp', site: 'canada', score: 3 },
      ] }
      expect(applyYqaaSafetyPolicy(crossJurisdiction, result)).toEqual({ answer: true, reason: 'deterministic_policy_clear' })
    },
  )

  it('bounds Jev input to public snippets and sends no conversation history or private page data', async () => {
    const { requestJevAdvisory } = await import('@/lib/jevAdvisory')
    let payload = ''
    let requestUrl: RequestInfo | URL = ''
    let requestInit: RequestInit | undefined
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
      requestUrl = input
      requestInit = init
      payload = String(init?.body)
      return new Response(JSON.stringify({ model: 'jev-1.13.0', answers: {
        sufficient: { type: 'noul', noul: 0.95 }, conflict: { type: 'noul', noul: 0.05 },
        needs_handoff: { type: 'noul', noul: 0.05 }, market: { type: 'choice', choice: 'global', confidence: 0.9 },
      }, usage: { input_tokens: 100, output_tokens: 20 } }), { status: 200 })
    }) as typeof fetch
    const result = await requestJevAdvisory({ query: 'Public question jane@example.com sk-live-secretvalue123456 DEEPSEEK_API_KEY=do-not-send-this-value', hostname: 'portal.yousafeconsultancy.com', evidence: [{ id: 'pub', title: 'Public source', body: 'x'.repeat(5000), source: 'https://market.yousafeconsultancy.com/', sourceUrl: 'https://market.yousafeconsultancy.com/', site: 'market' }] }, fetcher, { apiKey: 'test-only-token' })
    const sent = JSON.parse(payload)
    expect(requestUrl).toBe('https://api.typesafe.ai/v1/systemone')
    expect(requestInit?.headers).toMatchObject({ Authorization: 'Bearer test-only-token', 'Content-Type': 'application/json' })
    expect(sent.model).toBe('jev-latest')
    expect(sent.state.trustedSite).toBe('market')
    expect(sent.state.publicEvidence[0].excerpt).toHaveLength(600)
    expect(JSON.stringify(sent).length).toBeLessThan(4500)
    expect(JSON.stringify(sent)).not.toContain('conversation history')
    expect(payload).not.toContain('private order')
    expect(payload).not.toContain('jane@example.com')
    expect(payload).not.toContain('sk-live-secretvalue123456')
    expect(payload).not.toContain('do-not-send-this-value')
    expect(result).toEqual({ available: true, advisory: { sufficient: true, confidence: 0.9, conflict: false, needsHandoff: false, market: 'global' } })
  })

  it('reads the server-only Worker key binding and fails closed when it is absent', async () => {
    jest.doMock('@opennextjs/cloudflare', () => ({ getCloudflareContext: () => ({ env: { TYPESAFE_API_KEY: 'worker-bound-key' } }) }))
    const { requestJevAdvisory } = await import('@/lib/jevAdvisory')
    const context = { query: 'Compare two public options', hostname: 'market.yousafeconsultancy.com', evidence: [{ id: 'a', title: 'A', body: 'public evidence', source: 'https://market.yousafeconsultancy.com/', site: 'market', score: 2 }] }
    const fetcher = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer worker-bound-key')
      return new Response(JSON.stringify({ answers: {
        sufficient: { noul: 0.9 }, conflict: { noul: 0.1 }, needs_handoff: { noul: 0.1 }, market: { choice: 'global' },
      } }), { status: 200 })
    }) as typeof fetch
    await expect(requestJevAdvisory(context, fetcher)).resolves.toMatchObject({ available: true })
    jest.resetModules()
    jest.doMock('@opennextjs/cloudflare', () => ({ getCloudflareContext: () => ({ env: {} }) }))
    const unconfigured = await import('@/lib/jevAdvisory')
    await expect(unconfigured.requestJevAdvisory(context, fetcher)).resolves.toEqual({ available: false, reason: 'not_configured' })
  })
})

describe('YQAA provider pin and fallback policy', () => {
  it('defaults to Grok and only selects DeepSeek V4.1 when its exact fallback pin is configured', async () => {
    const { configuredYqaaProviders } = await import('@/lib/yqaaGeneration')
    expect(configuredYqaaProviders({})).toEqual({ primary: 'grok', fallback: null })
    expect(configuredYqaaProviders({ YQAA_PRIMARY_PROVIDER: 'grok', YQAA_FALLBACK_PROVIDER: 'deepseek-v41-flash' })).toEqual({ primary: 'grok', fallback: 'deepseek-v41-flash' })
    expect(() => configuredYqaaProviders({ YQAA_PRIMARY_PROVIDER: 'deepseek-flash' })).toThrow('Grok must remain the YQAA primary provider')
    expect(() => configuredYqaaProviders({ YQAA_PRIMARY_PROVIDER: 'deepseek-v41-flash' })).toThrow('Grok must remain the YQAA primary provider')
  })

  it('classifies only deterministic transient failures as fallback eligible', async () => {
    const { classifyYqaaProviderFailure } = await import('@/lib/yqaaGeneration')
    expect(classifyYqaaProviderFailure(new Error('request timed out')).eligible).toBe(true)
    expect(classifyYqaaProviderFailure(new Error('responses=401 unauthorized')).eligible).toBe(false)
    expect(classifyYqaaProviderFailure(new Error('Assistant model unavailable after bounded recovery (responses=408 request timeout; chat=408 request timeout)')).kind).toBe('timeout')
    expect(classifyYqaaProviderFailure(new Error('Assistant model unavailable after bounded recovery (responses=409 conflict; chat=409 conflict)')).eligible).toBe(true)
    expect(classifyYqaaProviderFailure(new Error('DeepSeek is not configured')).kind).toBe('configuration')
  })

  it('selects the pinned first-party DeepSeek adapter only after an eligible Grok failure', async () => {
    jest.resetModules()
    const adapterComplete = jest.fn(async () => ({ text: 'Fallback answer', model: 'deepseek-flash', provider: 'deepseek-v41-flash' }))
    jest.doMock('@/lib/superGrokAssistant', () => ({ callSystemSuperGrok: jest.fn(async () => { throw new Error('request timed out') }) }))
    jest.doMock('@/lib/contentAiRegistry', () => ({ DEEPSEEK_V41_FLASH_PIN: 'deepseek-v41-flash', adapterFor: jest.fn(() => ({ complete: adapterComplete })) }))
    process.env.YQAA_PRIMARY_PROVIDER = 'grok'
    process.env.YQAA_FALLBACK_PROVIDER = 'deepseek-v41-flash'
    try {
      const { generateYqaaAnswer } = await import('@/lib/yqaaGeneration')
      const result = await generateYqaaAnswer('public system', [{ role: 'user', content: 'question' }])
      expect(result).toMatchObject({ text: 'Fallback answer', provider: 'deepseek-v41-flash', fallback: true, failureEvidence: { kind: 'timeout', eligible: true } })
      expect(adapterComplete).toHaveBeenCalledTimes(1)
    } finally {
      delete process.env.YQAA_PRIMARY_PROVIDER
      delete process.env.YQAA_FALLBACK_PROVIDER
      jest.dontMock('@/lib/superGrokAssistant')
      jest.dontMock('@/lib/contentAiRegistry')
    }
  })

  it('keeps internal provider names out of the visitor-facing response contract', async () => {
    const { publicYqaaProviderLabel } = await import('@/lib/yqaaGeneration')
    expect(publicYqaaProviderLabel()).toBe('system-ai')
  })

  it('pins the production fallback explicitly while retaining Grok as primary', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const config = fs.readFileSync(path.join(process.cwd(), 'wrangler.toml'), 'utf8')
    expect(config).toContain('YQAA_PRIMARY_PROVIDER = "grok"')
    expect(config).toContain('YQAA_FALLBACK_PROVIDER = "deepseek-v41-flash"')
    expect(config).toContain('api.deepseek.com/v1 only')
  })

  it('declares privileged Supabase Worker secrets by name only', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const config = fs.readFileSync(path.join(process.cwd(), 'wrangler.toml'), 'utf8')
    const secretsBlock = config.match(/\[secrets\]\s*required\s*=\s*(\[[^\]]*\])/)
    expect(secretsBlock).not.toBeNull()
    const requiredSecrets = JSON.parse(secretsBlock![1]) as string[]
    expect(requiredSecrets).toContain('SUPABASE_SERVICE_ROLE_JWT')
    expect(requiredSecrets).toContain('SUPABASE_SERVICE_ROLE_KEY')

    // Ignore prose that documents the secret names. In active TOML, those
    // names may appear only in [secrets].required, never as credential values
    // or Worker vars.
    const activeConfigWithoutRequiredNames = config
      .replace(secretsBlock![0], '')
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('#'))
      .join('\n')
    expect(activeConfigWithoutRequiredNames).not.toMatch(/SUPABASE_SERVICE_ROLE_(?:JWT|KEY)/)
  })
})

describe('YQAA pricing authority guard', () => {
  it('requires exact server-authoritative listing or checkout claims', async () => {
    const { guardYqaaPricingClaims } = await import('@/lib/assistantPricingGuard')
    const guarded = guardYqaaPricingClaims('How much does it cost?', 'The offer is $49 and the platform fee is 20%.')
    expect(guarded.corrected).toBe(true)
    expect(guarded.text).toContain('checkout screen shows the final offer and fee breakdown')
    expect(guardYqaaPricingClaims('How much does it cost?', 'The listed package is $49.').corrected).toBe(true)
    expect(guardYqaaPricingClaims('How much does it cost?', 'The listed package is $49.', { source: 'marketplace-listing', claims: ['$49'] }).corrected).toBe(false)
    expect(guardYqaaPricingClaims('How much does it cost?', 'The listed package is $149.', { source: 'marketplace-listing', claims: ['$49'] }).corrected).toBe(true)
    expect(guardYqaaPricingClaims('How much does it cost?', 'The fee is 20%.', { source: 'checkout', claims: ['20%'] }).corrected).toBe(false)
    expect(guardYqaaPricingClaims('How much does it cost?', 'It is USD 49.', { source: 'marketplace-listing', claims: ['$49'] }).corrected).toBe(true)
    expect(guardYqaaPricingClaims('Can you explain the platform?', 'The platform has several sections.').corrected).toBe(false)
    expect(guardYqaaPricingClaims('Do you provide student application help?', 'The service costs $49.').corrected).toBe(true)
    expect(guardYqaaPricingClaims('Can you help with applications?', 'The fee is 49.').corrected).toBe(true)
    expect(guardYqaaPricingClaims('Do you offer admission support?', 'The package is £49.').corrected).toBe(true)
    expect(guardYqaaPricingClaims('What is the process?', 'No amount is quoted; check the official listing.').corrected).toBe(false)
  })
})

describe('YQAA public chat privacy boundary', () => {
  afterEach(() => { jest.resetModules(); jest.clearAllMocks() })

  it('omits private portal page data from the generated prompt and hides provider identity', async () => {
    jest.resetModules()
    let capturedSystem = ''
    const getClerkUserId = jest.fn(async () => 'private-viewer')
    jest.doMock('@/lib/auth', () => ({ getClerkUserId }))
    jest.doMock('@/lib/supabase', () => ({
      createSupabaseAdminClient: jest.fn(),
      getSupabaseAdminClient: jest.fn(),
      isServiceRoleAchieved: () => false,
    }))
    jest.doMock('@/lib/liveKnowledge', () => ({ fetchLiveKnowledge: jest.fn(async () => null) }))
    jest.doMock('@/lib/yqaaKnowledgeDb', () => ({ loadYqaaEvidence: async () => ({
      chunks: [
        { id: 'public-1', title: 'Public overview', body: 'Public general housing overview.', source: 'https://yousafeconsultancy.com/guide', site: 'main', score: 8 },
        { id: 'public-2', title: 'Public FAQ', body: 'General housing FAQ.', source: 'https://yousafeconsultancy.com/faq', site: 'main', score: 7 },
      ], source: 'database', retrievalConfidence: 0.9, freshEnough: true, jurisdictions: [], sites: ['main'],
    }) }))
    jest.doMock('@/lib/yqaaGeneration', () => ({
      generateYqaaAnswer: jest.fn(async (system: string) => { capturedSystem = system; return { text: 'A safe public answer.', provider: 'deepseek-v41-flash', model: 'deepseek-flash', fallback: true } }),
      publicYqaaProviderLabel: () => 'system-ai',
    }))
    jest.doMock('@/lib/jevAdvisory', () => {
      const actual = jest.requireActual('@/lib/jevAdvisory')
      return { ...actual, yqaaJevTriggers: () => [], requestJevAdvisory: async () => ({ available: true, advisory: { sufficient: true, confidence: 0.95, conflict: false, needsHandoff: false, market: 'global' } }) }
    })
    const { POST } = await import('@/app/api/chat/route')
    const privateValue = 'PRIVATE-ORDER-93844-CONTEXT'
    const response = await POST(new Request('https://portal.yousafeconsultancy.com/api/chat', {
      method: 'POST',
      headers: { Origin: 'https://portal.yousafeconsultancy.com', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'How does YouSafe help with a housing matter?' }],
        pageContext: { hostname: 'portal.yousafeconsultancy.com', url: 'https://portal.yousafeconsultancy.com/orders/93844', pathname: '/orders/93844', title: privateValue, pageText: privateValue },
      }),
    }))
    const responseBody = await response.text()
    expect(capturedSystem).not.toContain(privateValue)
    expect(capturedSystem).not.toContain('/orders/93844')
    expect(responseBody).not.toContain('deepseek')
    expect(responseBody).not.toContain('grok')
    expect(responseBody).toContain('system-ai')
    expect(getClerkUserId).not.toHaveBeenCalled()
  })
})
