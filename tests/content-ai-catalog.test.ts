import {
  canonicalizePin,
  DEEPSEEK_V4_FLASH_ID,
  DEEPSEEK_V4_PRO_ID,
  DEFAULT_BRIEF_PIN,
  DEFAULT_DRAFT_PIN,
  DEFAULT_REVIEW_PIN,
  hostsForModel,
  modelPickerLabel,
  modelsForLane,
  parseStudioPin,
  pinFor,
} from '@/lib/contentAiCatalog'

describe('content AI catalog — model × host', () => {
  it('lists Flash hosts in Parasail → Baseten → NVIDIA → DeepSeek order', () => {
    expect(hostsForModel('deepseek-v4-flash').map((h) => h.id)).toEqual([
      'parasail',
      'baseten',
      'nvidia',
      'deepseek',
    ])
  })

  it('lists Pro 0813 on Parasail first, then Baseten and official DeepSeek (not NVIDIA — Pro is EOL there)', () => {
    expect(hostsForModel('deepseek-v4-pro').map((h) => h.id)).toEqual([
      'parasail',
      'baseten',
      'deepseek',
    ])
  })

  it('lists GLM 5.2 on Parasail, NVIDIA, and Zai', () => {
    expect(hostsForModel('glm-5.2').map((h) => h.id)).toEqual([
      'parasail',
      'nvidia',
      'zai',
    ])
  })

  it('does not offer GPT or DeepSeek Pro on the drafting lane', () => {
    const draft = modelsForLane('draft').map((m) => m.id)
    expect(draft).not.toContain('gpt-5.6-sol')
    expect(draft).not.toContain('gpt-5.6-terra')
    expect(draft).not.toContain('deepseek-v4-pro')
    expect(draft).toContain('deepseek-v4-flash')
    expect(draft).toContain('glm-5.2')
    expect(draft[0]).toBe('auto')
    expect(draft[1]).toBe('minimax-m3')
    expect(draft[2]).toBe('deepseek-v4-flash')
    expect(draft[3]).toBe('grok-4.6')
  })

  it('puts Pro 0813 then GLM 5.2 first on Generate Full Brief', () => {
    const brief = modelsForLane('brief').map((m) => m.id)
    expect(brief.slice(0, 2)).toEqual(['deepseek-v4-pro', 'glm-5.2'])
    expect(brief).toContain('deepseek-v4-flash')
  })

  it('puts Pro then Flash first on Reviewer/Editor and labels them with the exact API ids', () => {
    const review = modelsForLane('review')
    expect(review.map((m) => m.id).slice(0, 2)).toEqual(['deepseek-v4-pro', 'deepseek-v4-flash'])
    const pro = review.find((m) => m.id === 'deepseek-v4-pro')!
    const flash = review.find((m) => m.id === 'deepseek-v4-flash')!
    expect(modelPickerLabel(pro, 'review')).toBe(DEEPSEEK_V4_PRO_ID)
    expect(modelPickerLabel(flash, 'review')).toBe(DEEPSEEK_V4_FLASH_ID)
    expect(modelPickerLabel(pro, 'brief')).toBe(DEEPSEEK_V4_PRO_ID)
    expect(modelPickerLabel(flash, 'draft')).toBe(DEEPSEEK_V4_FLASH_ID)
    expect(modelPickerLabel(pro, 'command')).toBe(DEEPSEEK_V4_PRO_ID)
  })

  it('composes pins from model + host', () => {
    expect(pinFor('deepseek-v4-flash', 'parasail')).toBe('parasail-deepseek')
    expect(pinFor('deepseek-v4-flash', 'baseten')).toBe('baseten-deepseek')
    expect(pinFor('deepseek-v4-flash', 'deepseek')).toBe('deepseek-flash')
    expect(pinFor('glm-5.2', 'parasail')).toBe('parasail-glm')
    expect(pinFor('glm-5.2', 'zai')).toBe('zai-glm')
    expect(pinFor('glm-5.2-fast', 'aihubmix')).toBe('aihubmix-glm-fast')
    expect(pinFor('deepseek-v4-pro', 'parasail')).toBe('parasail-deepseek-pro')
    expect(pinFor('deepseek-v4-pro', 'baseten')).toBe('baseten-deepseek-pro')
    expect(pinFor('deepseek-v4-pro', 'deepseek')).toBe('deepseek-pro')
    expect(pinFor('minimax-m3', 'nvidia')).toBe('nvidia-minimax')
  })

  it('defaults draft to NVIDIA MiniMax, brief to Pro-0813, and reviewer to Flash via Baseten', () => {
    expect(DEFAULT_DRAFT_PIN).toBe('nvidia-minimax')
    expect(DEFAULT_BRIEF_PIN).toBe('parasail-deepseek-pro')
    expect(DEFAULT_REVIEW_PIN).toBe('baseten-deepseek')
    expect(parseStudioPin(DEFAULT_DRAFT_PIN)).toMatchObject({
      model: { id: 'minimax-m3', apiModel: 'minimaxai/minimax-m3' },
      host: { id: 'nvidia' },
    })
    expect(parseStudioPin(DEFAULT_BRIEF_PIN)).toMatchObject({
      model: { apiModel: DEEPSEEK_V4_PRO_ID },
      host: { id: 'parasail' },
    })
    expect(parseStudioPin(DEFAULT_REVIEW_PIN)).toMatchObject({
      model: { apiModel: DEEPSEEK_V4_FLASH_ID },
      host: { id: 'baseten' },
    })
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
    expect(parseStudioPin('zai-glm')).toMatchObject({
      model: { id: 'glm-5.2' },
      host: { id: 'zai' },
    })
    expect(canonicalizePin('GROK-4.6')).toBe('grok')
  })
})
