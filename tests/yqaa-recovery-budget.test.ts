describe('YQAA recovery budget on the slow failure path', () => {
  afterEach(() => { jest.restoreAllMocks(); jest.resetModules(); delete process.env.YQAA_FALLBACK_PROVIDER; jest.dontMock('@/lib/superGrokAssistant'); jest.dontMock('@/lib/contentAiRegistry'); jest.dontMock('@/lib/contentAiProviderCore') })
  test('a credentialed configured fallback actually runs after primary consumes its allowance', async () => {
    let now = 1700000000000
    jest.spyOn(Date, 'now').mockImplementation(() => now)
    const primary = jest.fn(async (_system, _turns, options) => { now += options.timeoutMs; throw new Error('synthetic provider timeout') })
    const complete = jest.fn(async () => ({ text: 'Synthetic bounded fallback answer', model: 'deepseek-v41-flash' }))
    const adapterFor = jest.fn((_provider: string, _options: { timeoutMs: number }) => ({ complete }))
    jest.doMock('@/lib/superGrokAssistant', () => ({ callSystemSuperGrok: primary }))
    jest.doMock('@/lib/contentAiRegistry', () => ({ DEEPSEEK_V41_FLASH_PIN: 'deepseek-v41-flash', adapterFor, resolveDeepseekFirstPartyApiKey: () => 'synthetic-credential' }))
    jest.doMock('@/lib/contentAiProviderCore', () => ({ refreshAiVault: jest.fn(async () => undefined) }))
    process.env.YQAA_FALLBACK_PROVIDER = 'deepseek-v41-flash'
    const { generateYqaaAnswer } = await import('@/lib/yqaaGeneration')
    const result = await generateYqaaAnswer('Synthetic policy', [{ role: 'user', content: 'Synthetic question' }])
    expect(result.fallback).toBe(true)
    expect(complete).toHaveBeenCalledTimes(1)
    expect(adapterFor.mock.calls[0]![1].timeoutMs).toBeGreaterThanOrEqual(8000)
    expect(now - 1700000000000).toBeLessThanOrEqual(33000)
  })
  test('a quick optional billing rejection leaves compact primary recovery available', async () => {
    let now = 1700000000000
    jest.spyOn(Date, 'now').mockImplementation(() => now)
    const primary = jest.fn().mockImplementationOnce(async (_system, _turns, options) => { now += options.timeoutMs; throw new Error('synthetic timeout') }).mockResolvedValueOnce({text: 'Recovered primary', model: 'grok-4.6'})
    const complete = jest.fn(async () => { now += 700; throw new Error('status=402') })
    jest.doMock('@/lib/superGrokAssistant', () => ({callSystemSuperGrok: primary}))
    jest.doMock('@/lib/contentAiRegistry', () => ({DEEPSEEK_V41_FLASH_PIN: 'deepseek-v41-flash', adapterFor: () => ({complete}), resolveDeepseekFirstPartyApiKey: () => 'synthetic-credential'}))
    jest.doMock('@/lib/contentAiProviderCore', () => ({refreshAiVault: jest.fn(async () => undefined)}))
    process.env.YQAA_FALLBACK_PROVIDER = 'deepseek-v41-flash'
    const {generateYqaaAnswer} = await import('@/lib/yqaaGeneration')
    await expect(generateYqaaAnswer('Synthetic policy', [{role: 'user', content: 'Question'}])).resolves.toMatchObject({text: 'Recovered primary', provider: 'grok', fallback: false})
    expect(complete).toHaveBeenCalledTimes(1)
    expect(primary).toHaveBeenCalledTimes(2)
    expect(primary.mock.calls[1][2].timeoutMs).toBe(8300)
  })

})
