import { resolveAiProviderPin, ENTRIM_QWEN_LABEL, ENTRIM_QWEN_MODEL } from '../lib/contentAiProvider'
import { ENTRIM_QWEN_PIN, modelsForLane, parseStudioPin, canonicalizePin } from '../lib/contentAiCatalog'
import { resolveEngineAiProvider } from '../lib/seoEngine/engineAi'

describe('Entrim Qwen3.6 27B catalogue wiring', () => {
  it('resolveAiProviderPin maps the pin to the Entrim provider with the exact upstream model', () => {
    const r = resolveAiProviderPin('entrim-qwen-27b')
    expect(r.explicit).toBe('entrim-qwen-27b')
    expect(r.model).toBe('Qwen/Qwen3.6-27B')
  })

  it('catalog parseStudioPin resolves the studio picker selection', () => {
    const parsed = parseStudioPin('entrim-qwen-27b')
    expect(parsed.model.id).toBe('qwen3.6-27b')
    expect(parsed.host.id).toBe('entrim')
    expect(parsed.model.apiModel).toBe('Qwen/Qwen3.6-27B')
  })

  it('appears in the brief and review lane pickers (host allowed now)', () => {
    for (const lane of ['brief', 'review', 'command'] as const) {
      const ids = modelsForLane(lane).map((m) => m.id)
      expect(ids).toContain('qwen3.6-27b')
    }
  })

  it('aliases resolve to the canonical pin', () => {
    expect(canonicalizePin('entrim-qwen-27b')).toBe('entrim-qwen-27b')
    expect(canonicalizePin('qwen3.6-27b')).toBe('entrim-qwen-27b')
    expect(canonicalizePin('qwen')).toBe('entrim-qwen-27b')
  })

  it('engine AI (Discover) resolves the explicit pin without coercion', () => {
    expect(resolveEngineAiProvider('entrim-qwen-27b')).toBe('entrim-qwen-27b')
    expect(resolveEngineAiProvider('qwen')).toBe('entrim-qwen-27b')
  })

  it('consts point at the exact upstream model id', () => {
    expect(ENTRIM_QWEN_LABEL).toBe('entrim-qwen-27b')
    expect(ENTRIM_QWEN_MODEL).toBe('Qwen/Qwen3.6-27B')
    expect(ENTRIM_QWEN_PIN).toBe('entrim-qwen-27b')
  })
})
