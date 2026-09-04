/**
 * Studio catalog — LIVE POLICY (2026-09-02): the pickers offer EXACTLY the
 * three live models (Entrim Qwen3.6 27B lead, Entrim DeepSeek V4 Flash, Grok
 * 4.6). Retired families/hosts (Claude, GLM, MiniMax, Nemotron, GPT-5.6, Run
 * BiOS, NVIDIA, Baseten, Parasail, OpenAI, …) are not selectable; a saved
 * legacy pin parses to the Entrim Qwen default and the server gate routes it
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
  it('lane host allowlists carry Entrim + xAI in every lane', () => {
    expect(LANE_HOSTS.draft).toEqual(['entrim', 'xai'])
    expect(LANE_HOSTS.brief).toEqual(['entrim', 'xai'])
    expect(LANE_HOSTS.review).toEqual(['entrim', 'xai'])
    expect(LANE_HOSTS.command).toEqual(['entrim', 'xai'])
  })

  it('DeepSeek V4 Flash runs on the Entrim host only, labeled with the exact upstream id', () => {
    expect(hostsForModel('deepseek-v4-flash').map((h) => h.id)).toEqual(['entrim'])
    const model = modelsForLane('brief').find((m) => m.id === 'deepseek-v4-flash')
    expect(model?.label).toBe('deepseek-ai/DeepSeek-V4-Flash')
  })

  it('draft lane offers exactly the three live models (no retired families)', () => {
    const ids: Set<string> = new Set(modelsForLane('draft').map((m) => m.id))
    expect(ids).toEqual(new Set(['qwen3.6-27b', 'deepseek-v4-flash', 'grok-4.6']))
    for (const retired of ['auto', 'gpt-5.6-sol', 'claude-opus-5', 'claude-sonnet-5', 'cloudflare-llama', 'gemini', 'openrouter', 'glm-5.2-fast', 'minimax-m3', 'nemotron-3-ultra', 'glm-5.3-flash', 'kimi-k2.7-code', 'qwen3.5', 'bios-adaptive'] as const) {
      expect({ retired, inDraft: ids.has(retired) }).toEqual({ retired, inDraft: false })
    }
  })

  it('brief lane offers exactly the three live models (Qwen lead first)', () => {
    expect(modelsForLane('brief').map((m) => m.id)).toEqual(['qwen3.6-27b', 'deepseek-v4-flash', 'grok-4.6'])
  })

  it('review lane offers the three live models (Qwen lead first)', () => {
    expect(modelsForLane('review').map((m) => m.id)).toEqual(['qwen3.6-27b', 'deepseek-v4-flash', 'grok-4.6'])
    expect(modelPickerLabel(modelsForLane('review')[0], 'review')).toBe('Qwen/Qwen3.6-27B')
  })

  it('command lane offers the same three live models (Qwen lead first)', () => {
    expect(modelsForLane('command').map((m) => m.id)).toEqual(['qwen3.6-27b', 'deepseek-v4-flash', 'grok-4.6'])
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

  it('legacy/retired pins render as the Entrim Qwen default — no selectable legacy host', () => {
    expect(parseStudioPin('parasail-deepseek')).toMatchObject({
      model: { id: 'qwen3.6-27b' },
      host: { id: 'entrim' },
    })
    expect(canonicalizePin('GROK-4.6')).toBe('grok')
    expect(canonicalizePin('openai')).toBe('entrim-qwen-27b')
    expect(canonicalizePin('nvidia-minimax')).toBe('entrim-qwen-27b')
    expect(canonicalizePin('')).toBe('entrim-qwen-27b')
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

  it('defaults: draft = brief = review = Entrim Qwen3.6 27B', () => {
    expect(DEFAULT_DRAFT_PIN).toBe('entrim-qwen-27b')
    expect(DEFAULT_BRIEF_PIN).toBe('entrim-qwen-27b')
    expect(DEFAULT_REVIEW_PIN).toBe('entrim-qwen-27b')
    for (const pin of [DEFAULT_DRAFT_PIN, DEFAULT_BRIEF_PIN, DEFAULT_REVIEW_PIN]) {
      expect(parseStudioPin(pin)).toMatchObject({
        model: { id: 'qwen3.6-27b' },
        host: { id: 'entrim' },
      })
    }
  })
})
