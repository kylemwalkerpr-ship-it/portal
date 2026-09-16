/**
 * Task 6 (P2-D) — vault panel default-model truthfulness regression.
 *
 * A persisted `default_model` must be validated on load against the effective
 * saved provider's actual editable options. The prior defect let a stale pair
 * (saved provider `deepseek-v41-flash` + saved model `grok-4.6`) pass a global
 * option-list check and then be silently reset to Auto by the provider-switch
 * effect, hiding the invalid persisted state from the operator.
 */
import fs from 'node:fs'
import {
  effectiveModelProviderFor,
  loadedDefaultModelState,
} from '@/components/design/ai-key-vault-panel'

const ROWS = [
  { id: 'grok', modelOptions: ['grok-4.6'] },
  // Hard-pinned provider: no model override surface at all.
  { id: 'deepseek-v41-flash' },
]

describe('loadedDefaultModelState — persisted stale models are never silently reset', () => {
  it('keeps a saved model that belongs to the effective saved provider', () => {
    expect(loadedDefaultModelState({
      savedModel: 'grok-4.6',
      savedDefaultProvider: 'grok',
      rows: ROWS,
      providerOrder: ['grok', 'deepseek-v41-flash'],
    })).toEqual({ defaultModel: 'grok-4.6', staleDefaultModel: null })
  })

  it('flags the cross-provider pair as stale instead of falling through to Auto', () => {
    const state = loadedDefaultModelState({
      savedModel: 'grok-4.6',
      savedDefaultProvider: 'deepseek-v41-flash',
      rows: ROWS,
      providerOrder: ['grok', 'deepseek-v41-flash'],
    })
    expect(state).toEqual({ defaultModel: 'reselect-model', staleDefaultModel: 'grok-4.6' })
    expect(state.defaultModel).not.toBe('auto')
  })

  it('flags ANY non-empty model persisted against hard-pinned DeepSeek', () => {
    for (const savedModel of ['deepseek-flash', 'grok-4.6', 'gpt-5.6-terra']) {
      expect(loadedDefaultModelState({
        savedModel,
        savedDefaultProvider: 'deepseek-v41-flash',
        rows: ROWS,
        providerOrder: ['grok', 'deepseek-v41-flash'],
      })).toEqual({ defaultModel: 'reselect-model', staleDefaultModel: savedModel })
    }
  })

  it('binds an auto/unsaved provider to the saved order lane and validates against it', () => {
    expect(loadedDefaultModelState({
      savedModel: 'grok-4.6',
      savedDefaultProvider: '',
      rows: ROWS,
      providerOrder: ['grok', 'deepseek-v41-flash'],
    })).toEqual({ defaultModel: 'grok-4.6', staleDefaultModel: null })

    expect(loadedDefaultModelState({
      savedModel: 'grok-4.6',
      savedDefaultProvider: 'auto',
      rows: ROWS,
      providerOrder: ['deepseek-v41-flash', 'grok'],
    })).toEqual({ defaultModel: 'reselect-model', staleDefaultModel: 'grok-4.6' })
  })

  it('does not let a non-exact/legacy saved provider launder a stale model', () => {
    // Runtime ignores a legacy/non-exact provider value and binds the model to
    // the saved order/lane default, so the effective provider decides.
    for (const savedDefaultProvider of ['entrim-deepseek', 'DeepSeek-V41-Flash', 'GROK']) {
      expect(loadedDefaultModelState({
        savedModel: 'grok-4.6',
        savedDefaultProvider,
        rows: ROWS,
        providerOrder: ['grok', 'deepseek-v41-flash'],
      })).toEqual({ defaultModel: 'grok-4.6', staleDefaultModel: null })

      expect(loadedDefaultModelState({
        savedModel: 'grok-4.6',
        savedDefaultProvider,
        rows: ROWS,
        providerOrder: ['deepseek-v41-flash', 'grok'],
      })).toEqual({ defaultModel: 'reselect-model', staleDefaultModel: 'grok-4.6' })
    }
  })

  it('keeps empty/auto persisted models on Auto with no stale marker', () => {
    for (const savedModel of ['', '  ', null, undefined]) {
      expect(loadedDefaultModelState({
        savedModel,
        savedDefaultProvider: 'deepseek-v41-flash',
        rows: ROWS,
        providerOrder: ['grok', 'deepseek-v41-flash'],
      })).toEqual({ defaultModel: 'auto', staleDefaultModel: null })
    }
  })
})

describe('effectiveModelProviderFor — mirrors the settings-route binding', () => {
  it('prefers the exact saved pin, then the saved order, then the lane default row', () => {
    expect(effectiveModelProviderFor(ROWS, 'deepseek-v41-flash', ['grok'])).toBe(ROWS[1])
    expect(effectiveModelProviderFor(ROWS, 'auto', ['deepseek-v41-flash', 'grok'])).toBe(ROWS[1])
    expect(effectiveModelProviderFor(ROWS, 'reselect', [])).toBe(ROWS[0])
    // Uppercase is NOT a pin: it falls through to the saved order/lane default.
    expect(effectiveModelProviderFor(ROWS, 'GROK', ['deepseek-v41-flash'])).toBe(ROWS[1])
  })
})

describe('panel initial load routes the persisted model through the effective-provider helper', () => {
  it('does not validate the saved model against the global option list', () => {
    const source = fs.readFileSync('components/design/ai-key-vault-panel.tsx', 'utf8')
    expect(source).toContain('loadedDefaultModelState(')
    expect(source).not.toContain('modelOptions.includes(savedModel)')
  })
})
