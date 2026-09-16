/**
 * Task 3B correction — the style strip must never silently become Grok.
 *
 * `resolveStyleReviewPin` maps the saved reviewModel to the value POSTed to
 * /api/content-studio/style-review. A commissioned pin is sent canonically;
 * missing/empty/`auto` use the lane default (Grok); a legacy/unknown explicit
 * pin is forwarded VERBATIM so the hardened route returns its typed
 * 409 selection_required instead of silently reviewing on Grok.
 */
jest.mock('@/lib/harperBrowser', () => ({
  runHarperGrammar: jest.fn(),
  fixHarperIssues: jest.fn(),
  applyHarperProblem: jest.fn(),
  harperKindAutofixable: jest.fn(),
}))

import { resolveStyleReviewPin } from '@/components/design/editor-metrics-strip'

describe('resolveStyleReviewPin — style-review client pin', () => {
  it('sends the canonical commissioned pin', () => {
    expect(resolveStyleReviewPin('grok')).toBe('grok')
    expect(resolveStyleReviewPin('grok-4.6')).toBe('grok')
    expect(resolveStyleReviewPin('deepseek-v41-flash')).toBe('deepseek-v41-flash')
  })

  it('uses the Grok lane default for missing/empty/auto', () => {
    expect(resolveStyleReviewPin()).toBe('grok')
    expect(resolveStyleReviewPin('')).toBe('grok')
    expect(resolveStyleReviewPin('auto')).toBe('grok')
  })

  it('preserves a legacy/unknown explicit value verbatim — never coerces to Grok', () => {
    for (const legacy of [
      'entrim-deepseek',
      'entrim-qwen-27b',
      'nvidia-deepseek',
      'runbios-glm-53-flash',
      'deepseek-flash',
      'totally-unknown',
    ] as const) {
      expect(resolveStyleReviewPin(legacy)).toBe(legacy)
    }
  })
})
