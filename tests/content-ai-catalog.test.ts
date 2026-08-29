import {
  canonicalizePin,
  DEEPSEEK_V4_FLASH_ID,
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
  it('lists Flash hosts in Run BiOS → Parasail → Baseten → NVIDIA → DeepSeek order (no lane filter)', () => {
    expect(hostsForModel('deepseek-v4-flash').map((h) => h.id)).toEqual([
      'runbios',
      'parasail',
      'baseten',
      'nvidia',
      'deepseek',
    ])
  })

  it('draft lane only exposes Run BiOS + NVIDIA hosts', () => {
    expect(hostsForModel('deepseek-v4-flash', 'draft').map((h) => h.id)).toEqual([
      'runbios',
      'nvidia',
    ])
    expect(hostsForModel('glm-5.3-flash', 'draft').map((h) => h.id)).toEqual(['runbios'])
  })

  it('brief lane exposes only Run BiOS + Baseten for DeepSeek V4 Flash', () => {
    expect(hostsForModel('deepseek-v4-flash', 'brief').map((h) => h.id)).toEqual([
      'runbios',
      'baseten',
    ])
  })

  it('lists Pro 0813 on Parasail first, then Baseten and official DeepSeek (not NVIDIA — Pro is EOL there)', () => {
    expect(hostsForModel('deepseek-v4-pro').map((h) => h.id)).toEqual([
      'runbios',
      'parasail',
      'baseten',
      'deepseek',
    ])
  })

  it('draft lane: Run BiOS + NVIDIA models only, sorted alphabetically by label, no Auto', () => {
    const draft = modelsForLane('draft')
    const ids = draft.map((m) => m.id)
    expect(ids).not.toContain('auto')
    expect(ids).not.toContain('grok-4.6')
    expect(ids).not.toContain('gpt-5.6-sol')
    expect(ids).not.toContain('gpt-5.6-terra')
    expect(ids).not.toContain('deepseek-v4-pro')
    expect(ids).not.toContain('cloudflare-llama')
    expect(ids).not.toContain('gemini')
    expect(ids).not.toContain('openrouter')
    expect(ids).not.toContain('glm-5.2-fast')
    expect(ids).toContain('minimax-m3')
    expect(ids).toContain('deepseek-v4-flash')
    expect(ids).toContain('glm-5.2')
    expect(ids).toContain('glm-5.3-flash')
    expect(ids).toContain('kimi-k2.7-code')
    expect(ids).toContain('qwen3.5')
    expect(ids).toContain('bios-adaptive')
    expect(ids).toContain('nemotron-3-ultra')
    const labels = draft.map((m) => m.label)
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b)))
  })

  it('brief lane: exactly three families — Claude Opus 5 (default), Grok, DeepSeek V4 Flash', () => {
    const brief = modelsForLane('brief').map((m) => m.id)
    expect(brief).toEqual(['claude-opus-5', 'grok-4.6', 'deepseek-v4-flash'])
    expect(hostsForModel('claude-opus-5', 'brief').map((h) => h.id)).toEqual(['runbios'])
    expect(hostsForModel('grok-4.6', 'brief').map((h) => h.id)).toEqual(['xai'])
  })

  it('review lane: exactly four — Grok, Claude Opus 5, Claude Sonnet 5, GLM 5.3 Flash (default)', () => {
    const review = modelsForLane('review').map((m) => m.id)
    expect(review).toEqual(['grok-4.6', 'claude-opus-5', 'claude-sonnet-5', 'glm-5.3-flash'])
    expect(hostsForModel('glm-5.3-flash', 'review').map((h) => h.id)).toEqual(['runbios'])
    expect(hostsForModel('claude-sonnet-5', 'review').map((h) => h.id)).toEqual(['runbios'])
    expect(modelPickerLabel(modelsForLane('review')[3], 'review')).toBe('glm-5.3-flash')
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
    expect(pinFor('glm-5.3-flash', 'runbios')).toBe('runbios-glm-53-flash')
    expect(pinFor('minimax-m3', 'runbios')).toBe('runbios-minimax')
    expect(pinFor('glm-5.2', 'runbios')).toBe('runbios-glm-52')
    expect(pinFor('bios-adaptive', 'runbios')).toBe('runbios-adaptive')
    expect(pinFor('claude-opus-5', 'runbios')).toBe('runbios-claude-opus')
    expect(pinFor('claude-sonnet-5', 'runbios')).toBe('runbios-claude-sonnet')
    expect(pinFor('grok-4.6', 'xai')).toBe('grok')
  })

  it('defaults: draft = MiniMax M3 via NVIDIA; brief = Claude Opus 5 via Run BiOS; review = GLM 5.3 Flash via Run BiOS', () => {
    expect(DEFAULT_DRAFT_PIN).toBe('nvidia-minimax')
    expect(DEFAULT_BRIEF_PIN).toBe('runbios-claude-opus')
    expect(DEFAULT_REVIEW_PIN).toBe('runbios-glm-53-flash')
    expect(parseStudioPin(DEFAULT_DRAFT_PIN)).toMatchObject({
      model: { id: 'minimax-m3' },
      host: { id: 'nvidia' },
    })
    expect(parseStudioPin(DEFAULT_BRIEF_PIN)).toMatchObject({
      model: { id: 'claude-opus-5' },
      host: { id: 'runbios' },
    })
    expect(parseStudioPin(DEFAULT_REVIEW_PIN)).toMatchObject({
      model: { id: 'glm-5.3-flash' },
      host: { id: 'runbios' },
    })
    // DeepSeek V4 Flash has exactly two brief hosts (three families / four
    // pins across the Brief lane: opus, grok, deepseek×2).
    expect(pinFor('deepseek-v4-flash', 'runbios')).toBe('runbios-deepseek-flash')
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
    expect(parseStudioPin('zai-glm')).toMatchObject({
      model: { id: 'glm-5.2' },
      host: { id: 'zai' },
    })
    expect(canonicalizePin('GROK-4.6')).toBe('grok')
  })
})
