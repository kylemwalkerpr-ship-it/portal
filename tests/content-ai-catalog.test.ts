/**
 * Studio catalog — COMMISSIONED POLICY (P2, 2026-09-15): the pickers offer
 * EXACTLY two commissioned models — Grok 4.6 (`grok-4.6`, pin `grok`) and
 * DeepSeek V4.1 Flash (`deepseek-v41-flash`, upstream model id
 * `deepseek-flash`) — on exactly two hosts (`xai`, `deepseek`). Retired
 * families/hosts (Entrim, Claude, GLM, MiniMax, Nemotron, GPT-5.6, Run BiOS,
 * NVIDIA, Baseten, Parasail, OpenAI, …) are not selectable: a saved legacy pin
 * parses to `{kind:'needs_selection'}` and requires explicit reselection —
 * never a silent Grok coercion. No `auto` model exists in the catalog.
 */
import {
  resolveJobPickerPin,
  resolveOwnerProviderPin,
  DEFAULT_BRIEF_PIN,
  DEFAULT_DRAFT_PIN,
  DEFAULT_REVIEW_PIN,
  LANE_HOSTS,
  hostsForModel,
  modelsForLane,
  parseStudioPin,
  pinFor,
} from '@/lib/contentAiCatalog'
import type { StudioHostId, StudioModelId } from '@/lib/contentAiCatalog'

const P2_FLASH_MODEL_ID = 'deepseek-v41-flash' as unknown as StudioModelId
const P2_DEEPSEEK_HOST_ID = 'deepseek' as unknown as StudioHostId

describe('content AI catalog — commissioned Grok + DeepSeek V4.1 Flash', () => {
  it('lane host allowlists carry xAI + DeepSeek in every lane', () => {
    expect(LANE_HOSTS.draft).toEqual(['xai', 'deepseek'])
    expect(LANE_HOSTS.brief).toEqual(['xai', 'deepseek'])
    expect(LANE_HOSTS.review).toEqual(['xai', 'deepseek'])
    expect(LANE_HOSTS.command).toEqual(['xai', 'deepseek'])
  })

  it('DeepSeek V4.1 Flash runs on the first-party deepseek host with the literal upstream model id', () => {
    expect(hostsForModel(P2_FLASH_MODEL_ID).map((host) => host.id)).toEqual(['deepseek'])
    const model = modelsForLane('brief').find((candidate) => candidate.id === P2_FLASH_MODEL_ID)
    expect(model?.apiModel).toBe('deepseek-flash')
    expect(model?.label).toBe('DeepSeek V4.1 Flash')
    expect(model?.hosts.map((host) => host.pin)).toEqual(['deepseek-v41-flash'])
  })

  it('every lane offers exactly the two commissioned models (no retired families)', () => {
    for (const lane of ['draft', 'brief', 'review', 'command'] as const) {
      const ids: string[] = modelsForLane(lane).map((model) => model.id).sort()
      expect({ lane, ids }).toEqual({ lane, ids: ['deepseek-v41-flash', 'grok-4.6'] })
      for (const retired of ['auto', 'qwen3.6-27b', 'deepseek-v4-flash', 'gpt-5.6-sol', 'claude-opus-5', 'claude-sonnet-5', 'cloudflare-llama', 'gemini', 'openrouter', 'glm-5.2-fast', 'minimax-m3', 'nemotron-3-ultra', 'glm-5.3-flash', 'kimi-k2.7-code', 'qwen3.5', 'bios-adaptive'] as const) {
        expect({ lane, retired, present: ids.includes(retired) }).toEqual({ lane, retired, present: false })
      }
    }
  })

  it('all commissioned models execute in all four lanes through their host', () => {
    for (const lane of ['draft', 'brief', 'review', 'command'] as const) {
      expect(hostsForModel('grok-4.6', lane).map((host) => host.id)).toEqual(['xai'])
      expect(hostsForModel(P2_FLASH_MODEL_ID, lane).map((host) => host.id)).toEqual(['deepseek'])
    }
  })

  it('composes commissioned pins from model + host', () => {
    expect(pinFor(P2_FLASH_MODEL_ID, P2_DEEPSEEK_HOST_ID)).toBe('deepseek-v41-flash')
    expect(pinFor('grok-4.6', 'xai')).toBe('grok')
    expect(parseStudioPin('grok')).toMatchObject({
      kind: 'commissioned',
      model: { id: 'grok-4.6' },
      host: { id: 'xai' },
    })
    expect(parseStudioPin('deepseek-v41-flash')).toMatchObject({
      kind: 'commissioned',
      model: { id: 'deepseek-v41-flash' },
      host: { id: 'deepseek' },
    })
  })

  it('legacy/retired pins require reselection — never a silent Grok default', () => {
    for (const legacy of ['entrim-deepseek', 'entrim-qwen-27b', 'parasail-deepseek', 'nvidia-deepseek', 'openai', 'deepseek-flash', 'totally-unknown'] as const) {
      expect(parseStudioPin(legacy)).toMatchObject({ kind: 'needs_selection', legacyValue: legacy })
    }
    expect(parseStudioPin('GROK-4.6')).toMatchObject({ kind: 'commissioned', model: { id: 'grok-4.6' } })
  })

  it('owner pin survives when resolving persist + picker for commissioned values', () => {
    expect(resolveOwnerProviderPin('grok', 'deepseek-v41-flash')).toBe('grok')
    expect(resolveOwnerProviderPin('deepseek-v41-flash', 'grok')).toBe('deepseek-v41-flash')
    expect(resolveOwnerProviderPin(null, null)).toBe(DEFAULT_DRAFT_PIN)
    expect(resolveJobPickerPin({ ai_provider: 'grok' })).toBe('grok')
    expect(resolveJobPickerPin({ ai_provider: 'deepseek-v41-flash' })).toBe('deepseek-v41-flash')
    expect(resolveJobPickerPin({
      ai_provider: 'deepseek-v41-flash',
      lineage: { ownerProvider: 'grok' },
    })).toBe('grok')
  })

  it('defaults: draft = brief = review = Grok 4.6', () => {
    expect(DEFAULT_DRAFT_PIN).toBe('grok')
    expect(DEFAULT_BRIEF_PIN).toBe('grok')
    expect(DEFAULT_REVIEW_PIN).toBe('grok')
  })
})
