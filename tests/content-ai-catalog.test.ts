/**
 * Studio catalog — LIVE POLICY (2026-09-02): the pickers offer EXACTLY the
 * two live Entrim families (Qwen3.6 27B lead, DeepSeek V4 Flash complement)
 * plus Auto in the Command lane. Retired families/hosts (Grok, Claude, GLM,
 * MiniMax, Nemotron, GPT-5.6, Run BiOS, Baseten, Parasail, …) are not
 * selectable; a saved legacy pin parses to its label for display but the
 * server gate routes it to the Entrim default.
 */
import {
  canonicalizePin,
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

describe('content AI catalog — live Entrim-only model × host', () => {
  it('lane host allowlists carry only Entrim (+ Auto in command)', () => {
    expect(LANE_HOSTS.draft).toEqual(['entrim'])
    expect(LANE_HOSTS.brief).toEqual(['entrim'])
    expect(LANE_HOSTS.review).toEqual(['entrim'])
    expect(LANE_HOSTS.command).toEqual(['entrim', 'auto'])
  })

  it('DeepSeek V4 Flash runs on the Entrim host only, labeled with the exact upstream id', () => {
    expect(hostsForModel('deepseek-v4-flash').map((h) => h.id)).toEqual(['entrim'])
    expect(hostsForModel('deepseek-v4-flash', 'draft').map((h) => h.id)).toEqual(['entrim'])
    expect(hostsForModel('deepseek-v4-flash', 'brief').map((h) => h.id)).toEqual(['entrim'])
    const model = modelsForLane('brief').find((m) => m.id === 'deepseek-v4-flash')
    expect(model?.label).toBe('deepseek-ai/DeepSeek-V4-Flash')
  })

  it('draft lane offers exactly the two live Entrim families (no Auto, no retired families)', () => {
    const draft = modelsForLane('draft').map((m) => m.id)
    expect(draft).toEqual(['deepseek-v4-flash', 'qwen3.6-27b'])
    for (const retired of ['auto', 'grok-4.6', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'claude-opus-5', 'claude-sonnet-5', 'cloudflare-llama', 'gemini', 'openrouter', 'glm-5.2-fast', 'minimax-m3', 'nemotron-3-ultra', 'glm-5.2', 'glm-5.3-flash', 'kimi-k2.7-code', 'qwen3.5', 'bios-adaptive'] as const) {
      expect({ retired, inDraft: draft.includes(retired) }).toEqual({ retired, inDraft: false })
    }
  })

  it('brief lane offers exactly the two live Entrim families (Qwen lead first)', () => {
    expect(modelsForLane('brief').map((m) => m.id)).toEqual(['qwen3.6-27b', 'deepseek-v4-flash'])
  })

  it('review lane offers exactly the Entrim Qwen lead', () => {
    expect(modelsForLane('review').map((m) => m.id)).toEqual(['qwen3.6-27b'])
    expect(modelPickerLabel(modelsForLane('review')[0], 'review')).toBe('Qwen/Qwen3.6-27B')
  })

  it('command lane offers Auto plus the two live families (Qwen lead first)', () => {
    expect(modelsForLane('command').map((m) => m.id)).toEqual(['auto', 'qwen3.6-27b', 'deepseek-v4-flash'])
  })

  it('Qwen3.6 27B executes in all four lanes through the Entrim host', () => {
    for (const lane of ['draft', 'brief', 'review', 'command'] as const) {
      expect(modelsForLane(lane).some((m) => m.id === 'qwen3.6-27b')).toBe(true)
      expect(hostsForModel('qwen3.6-27b', lane).map((h) => h.id)).toEqual(['entrim'])
    }
  })

  it('composes live pins from model + host', () => {
    expect(pinFor('deepseek-v4-flash', 'entrim')).toBe('entrim-deepseek')
    expect(pinFor('qwen3.6-27b', 'entrim')).toBe('entrim-qwen-27b')
    expect(parseStudioPin('entrim-deepseek')).toMatchObject({
      model: { id: 'deepseek-v4-flash' },
      host: { id: 'entrim' },
    })
    expect(parseStudioPin('entrim-qwen-27b')).toMatchObject({
      model: { id: 'qwen3.6-27b' },
      host: { id: 'entrim' },
    })
  })

  it('retired pins render as the lane default (Auto fallback) — no selectable host', () => {
    // A saved legacy pin matches no selectable host any more, so
    // parseStudioPin falls back to Auto — and the picker resolves that to
    // the lane's live default while the server gate routes it to Entrim.
    expect(parseStudioPin('parasail-deepseek')).toMatchObject({
      model: { id: 'auto' },
      host: { id: 'auto' },
    })
    expect(canonicalizePin('GROK-4.6')).toBe('grok')
    // The retired families expose no hosts in any lane.
    expect(hostsForModel('grok-4.6' as never)).toEqual([])
    expect(hostsForModel('claude-opus-5' as never)).toEqual([])
    expect(hostsForModel('minimax-m3' as never, 'draft')).toEqual([])
  })

  it('defaults: draft = brief = review = Entrim Qwen3.6 27B', () => {
    expect(DEFAULT_DRAFT_PIN).toBe('entrim-qwen-27b')
    expect(DEFAULT_BRIEF_PIN).toBe('entrim-qwen-27b')
    expect(DEFAULT_REVIEW_PIN).toBe('entrim-qwen-27b')
    expect(parseStudioPin(DEFAULT_DRAFT_PIN)).toMatchObject({
      model: { id: 'qwen3.6-27b' },
      host: { id: 'entrim' },
    })
    expect(parseStudioPin(DEFAULT_BRIEF_PIN)).toMatchObject({
      model: { id: 'qwen3.6-27b' },
      host: { id: 'entrim' },
    })
    expect(parseStudioPin(DEFAULT_REVIEW_PIN)).toMatchObject({
      model: { id: 'qwen3.6-27b' },
      host: { id: 'entrim' },
    })
  })
})
