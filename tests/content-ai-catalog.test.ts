import {
  canonicalizePin,
  hostsForModel,
  modelsForLane,
  parseStudioPin,
  pinFor,
} from '@/lib/contentAiCatalog'

describe('content AI catalog — model × host', () => {
  it('lists Parasail as a host for DeepSeek V4 Flash and GLM 5.2', () => {
    const deepseekHosts = hostsForModel('deepseek-v4-flash').map((h) => h.id)
    expect(deepseekHosts).toEqual(['baseten', 'nvidia', 'parasail'])
    const glmHosts = hostsForModel('glm-5.2').map((h) => h.id)
    expect(glmHosts).toEqual(['nvidia', 'parasail'])
  })

  it('does not offer GPT on the drafting lane', () => {
    const draft = modelsForLane('draft').map((m) => m.id)
    expect(draft).not.toContain('gpt-5.6-sol')
    expect(draft).not.toContain('gpt-5.6-terra')
    expect(draft).toContain('deepseek-v4-flash')
    expect(draft).toContain('glm-5.2')
  })

  it('composes pins from model + host', () => {
    expect(pinFor('deepseek-v4-flash', 'parasail')).toBe('parasail-deepseek')
    expect(pinFor('deepseek-v4-flash', 'baseten')).toBe('baseten-deepseek')
    expect(pinFor('glm-5.2', 'parasail')).toBe('parasail-glm')
    expect(pinFor('glm-5.2-fast', 'aihubmix')).toBe('aihubmix-glm-fast')
  })

  it('parses existing pins back into model + host', () => {
    expect(parseStudioPin('parasail-deepseek')).toMatchObject({
      model: { id: 'deepseek-v4-flash' },
      host: { id: 'parasail' },
    })
    expect(parseStudioPin('parasail')).toMatchObject({
      model: { id: 'deepseek-v4-flash' },
      host: { id: 'parasail' },
    })
    expect(parseStudioPin('gpt-5.6-sol')).toMatchObject({
      model: { id: 'gpt-5.6-sol' },
      host: { id: 'openai' },
    })
    expect(canonicalizePin('GROK-4.6')).toBe('grok')
  })
})
