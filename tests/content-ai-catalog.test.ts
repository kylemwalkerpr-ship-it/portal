/**
 * Studio catalog — LIVE POLICY (2026-09-02): the pickers offer EXACTLY the
 * three live models (Grok 4.6 lead, Entrim Qwen3.6 27B, Entrim DeepSeek V4 Flash). Retired families/hosts (Claude, GLM, MiniMax, Nemotron, GPT-5.6, Run
 * BiOS, NVIDIA, Baseten, Parasail, OpenAI, …) are not selectable; a saved
 * legacy pin parses to the Grok default and the server gate routes it
 * there. No `auto` model exists in the catalog.
 */
import {
  canonicalizePin,
  resolveJobPickerPin,
  resolveOwnerProviderPin,
  DEFAULT_BRIEF_PIN,
  DEFAULT_DRAFT_PIN,
  DEFAULT_REVIEW_PIN,
  LANE_HOSTS,
  hostsForModel,
  modelPickerLabel,
  modelsForLane,
  parseStudioPin,
  pinFor,
} from '@/lib/contentAiCatalog'

describe('content AI catalog — live Entrim + Grok model × host', () => {
  it('lane host allowlists carry xAI + Entrim in every lane', () => {
    expect(LANE_HOSTS.draft).toEqual(['xai', 'entrim'])
    expect(LANE_HOSTS.brief).toEqual(['xai', 'entrim'])
    expect(LANE_HOSTS.review).toEqual(['xai', 'entrim'])
    expect(LANE_HOSTS.command).toEqual(['xai', 'entrim'])
  })

  it('DeepSeek V4 Flash runs on the Entrim host only, labeled with the exact upstream id', () => {
    expect(hostsForModel('deepseek-v4-flash').map((h) => h.id)).toEqual(['entrim'])
    const model = modelsForLane('brief').find((m) => m.id === 'deepseek-v4-flash')
    expect(model?.label).toBe('deepseek-ai/DeepSeek-V4-Flash')
  })

  it('draft lane offers exactly the three live models (no retired families)', () => {
    const ids: Set<string> = new Set(modelsForLane('draft').map((m) => m.id))
    expect(ids).toEqual(new Set(['grok-4.6', 'qwen3.6-27b', 'deepseek-v4-flash']))
    for (const retired of ['auto', 'gpt-5.6-sol', 'claude-opus-5', 'claude-sonnet-5', 'cloudflare-llama', 'gemini', 'openrouter', 'glm-5.2-fast', 'minimax-m3', 'nemotron-3-ultra', 'glm-5.3-flash', 'kimi-k2.7-code', 'qwen3.5', 'bios-adaptive'] as const) {
      expect({ retired, inDraft: ids.has(retired) }).toEqual({ retired, inDraft: false })
    }
  })

  it('brief lane offers exactly the three live models (Grok lead first)', () => {
    expect(modelsForLane('brief').map((m) => m.id)).toEqual(['grok-4.6', 'qwen3.6-27b', 'deepseek-v4-flash'])
  })

  it('review lane offers the three live models (Grok lead first)', () => {
    expect(modelsForLane('review').map((m) => m.id)).toEqual(['grok-4.6', 'qwen3.6-27b', 'deepseek-v4-flash'])
    expect(modelPickerLabel(modelsForLane('review')[0], 'review')).toBe('grok-4.6')
  })

  it('command lane offers the same three live models (Grok lead first)', () => {
    expect(modelsForLane('command').map((m) => m.id)).toEqual(['grok-4.6', 'qwen3.6-27b', 'deepseek-v4-flash'])
  })

  it('all three models execute in all four lanes through their host', () => {
    for (const lane of ['draft', 'brief', 'review', 'command'] as const) {
      expect(modelsForLane(lane).some((m) => m.id === 'qwen3.6-27b')).toBe(true)
      expect(hostsForModel('qwen3.6-27b', lane).map((h) => h.id)).toEqual(['entrim'])
      expect(hostsForModel('deepseek-v4-flash', lane).map((h) => h.id)).toEqual(['entrim'])
      expect(hostsForModel('grok-4.6', lane).map((h) => h.id)).toEqual(['xai'])
    }
  })

  it('composes live pins from model + host', () => {
    expect(pinFor('deepseek-v4-flash', 'entrim')).toBe('entrim-deepseek')
    expect(pinFor('qwen3.6-27b', 'entrim')).toBe('entrim-qwen-27b')
    expect(pinFor('grok-4.6', 'xai')).toBe('grok')
    expect(parseStudioPin('entrim-deepseek')).toMatchObject({
      model: { id: 'deepseek-v4-flash' },
      host: { id: 'entrim' },
    })
    expect(parseStudioPin('entrim-qwen-27b')).toMatchObject({
      model: { id: 'qwen3.6-27b' },
      host: { id: 'entrim' },
    })
    expect(parseStudioPin('grok')).toMatchObject({
      model: { id: 'grok-4.6' },
      host: { id: 'xai' },
    })
  })

  it('legacy/retired pins render as the Grok default — no selectable legacy host', () => {
    expect(parseStudioPin('parasail-deepseek')).toMatchObject({
      model: { id: 'grok-4.6' },
      host: { id: 'xai' },
    })
    expect(canonicalizePin('GROK-4.6')).toBe('grok')
    expect(canonicalizePin('openai')).toBe('grok')
    expect(canonicalizePin('nvidia-minimax')).toBe('grok')
    expect(canonicalizePin('')).toBe('grok')
  })

  it('owner pin survives cascade runtime when resolving persist + picker', () => {
    expect(resolveOwnerProviderPin('grok', 'entrim-qwen-27b')).toBe('grok')
    expect(resolveOwnerProviderPin('GROK-4.6', 'entrim-qwen-27b')).toBe('grok')
    expect(resolveOwnerProviderPin('auto', 'entrim-deepseek')).toBe('entrim-deepseek')
    expect(resolveOwnerProviderPin(null, 'entrim-qwen-27b')).toBe('entrim-qwen-27b')
    expect(resolveOwnerProviderPin(null, null)).toBe(DEFAULT_DRAFT_PIN)
    expect(resolveJobPickerPin({
      ai_provider: 'entrim-qwen-27b',
      lineage: { ownerProvider: 'grok' },
    })).toBe('grok')
    expect(resolveJobPickerPin({
      ai_provider: 'entrim-qwen-27b',
      audit_json: { ownerProvider: 'grok', runtimeProvider: 'entrim-qwen-27b' },
    })).toBe('grok')
    expect(resolveJobPickerPin({ ai_provider: 'grok' })).toBe('grok')
  })

  it('defaults: draft = brief = review = Grok 4.6', () => {
    expect(DEFAULT_DRAFT_PIN).toBe('grok')
    expect(DEFAULT_BRIEF_PIN).toBe('grok')
    expect(DEFAULT_REVIEW_PIN).toBe('grok')
    for (const pin of [DEFAULT_DRAFT_PIN, DEFAULT_BRIEF_PIN, DEFAULT_REVIEW_PIN]) {
      expect(parseStudioPin(pin)).toMatchObject({
        model: { id: 'grok-4.6' },
        host: { id: 'xai' },
      })
    }
  })
})
