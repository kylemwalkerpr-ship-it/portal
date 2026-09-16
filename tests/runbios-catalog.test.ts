import { canonicalizeRunbiosPin, isRunbiosPin, RUNBIOS_SLOTS } from '@/lib/runbiosCatalog'
import { parseStudioPin } from '@/lib/contentAiCatalog'
import { providerDef, AI_PROVIDERS, DEFAULT_PROVIDER_ORDER } from '@/lib/aiKeyVault'

describe('Run BiOS configurator catalog (retired)', () => {
  it('RUNBIOS_SLOTS still documents the library, but Run BiOS is absent from the live vault', () => {
    const ids = RUNBIOS_SLOTS.map((s) => s.id)
    expect(ids).toEqual(expect.arrayContaining([
      'runbios-glm-53-flash',
      'runbios-glm-52',
      'runbios-deepseek-flash',
      'runbios-deepseek-pro',
      'runbios-minimax',
      'runbios-kimi',
      'runbios-qwen',
      'runbios-adaptive',
      'runbios-claude-sonnet',
      'runbios-claude-opus',
    ]))
    // Live vault holds only the two commissioned pins — Run BiOS is fully removed.
    const idsSet = new Set(AI_PROVIDERS.map((p) => p.id))
    expect(idsSet).toEqual(new Set(['grok', 'deepseek-v41-flash']))
    expect(AI_PROVIDERS.some((p) => p.vaultGroup === 'runbios')).toBe(false)
    expect(providerDef('runbios-kimi')).toBeUndefined()
    expect(DEFAULT_PROVIDER_ORDER).toEqual(['grok', 'deepseek-v41-flash'])
  })

  it('retired Run BiOS studio hosts expose no selectable pin (live policy)', () => {
    // Run BiOS slots are gone from both the vault and the studio pickers.
    expect(providerDef('runbios-deepseek-pro')).toBeUndefined()
    expect(parseStudioPin('runbios-adaptive')).toMatchObject({
      kind: 'needs_selection',
      legacyValue: 'runbios-adaptive',
    })
    expect(canonicalizeRunbiosPin('runbios')).toBe('runbios-glm-53-flash')
    expect(isRunbiosPin('runbios-qwen')).toBe(true)
    expect(isRunbiosPin('nvidia-glm')).toBe(false)
  })
})
