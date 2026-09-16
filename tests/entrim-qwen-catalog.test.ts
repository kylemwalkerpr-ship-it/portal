/**
 * Entrim Qwen3.6 27B — CATALOG RETIREMENT (P2, 2026-09-15).
 *
 * Entrim (`entrim-qwen-27b` / `qwen3.6-27b` / `qwen`) is a retired provider
 * family: it is absent from every lane picker, parses as
 * `{kind:'needs_selection'}` (never a selectable row or a silent Grok
 * coercion), and the Discover engine resolver fails closed with a typed
 * `ProviderSelectionRequiredError`.
 */
import { ProviderSelectionRequiredError } from '@/lib/contentAiRegistry'
import { modelsForLane, parseStudioPin } from '@/lib/contentAiCatalog'
import { resolveEngineAiProvider } from '@/lib/seoEngine/engineAi'

describe('Entrim Qwen3.6 27B catalog retirement', () => {
  it('is absent from every lane picker — only the two commissioned models remain', () => {
    for (const lane of ['draft', 'brief', 'review', 'command'] as const) {
      const ids = modelsForLane(lane).map((m) => m.id)
      expect(ids).not.toContain('qwen3.6-27b')
      expect(ids).toEqual(['grok-4.6', 'deepseek-v41-flash'])
    }
  })

  it('parses as needs_selection, never a selectable catalog row', () => {
    for (const legacy of ['entrim-qwen-27b', 'qwen3.6-27b', 'qwen'] as const) {
      expect(parseStudioPin(legacy)).toMatchObject({ kind: 'needs_selection', legacyValue: legacy })
    }
  })

  it('Discover engine resolution fails closed for the retired pin', () => {
    for (const legacy of ['entrim-qwen-27b', 'qwen'] as const) {
      expect(() => resolveEngineAiProvider(legacy)).toThrow(ProviderSelectionRequiredError)
    }
  })
})
