import { canonicalizeRunbiosPin, isRunbiosPin, RUNBIOS_SLOTS } from '@/lib/runbiosCatalog'
import { pinFor, parseStudioPin } from '@/lib/contentAiCatalog'
import { providerDef, AI_PROVIDERS } from '@/lib/aiKeyVault'

describe('Run BiOS configurator catalog', () => {
  it('exposes one vault group covering the public Run BiOS library plus GLM 5.3 Flash', () => {
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
    const vault = AI_PROVIDERS.filter((p) => p.vaultGroup === 'runbios')
    expect(vault).toHaveLength(RUNBIOS_SLOTS.length)
    expect(vault.every((p) => p.keyEnv === 'RUNBIOS_API_KEY')).toBe(true)
    expect(providerDef('runbios-kimi')?.defaultModel).toBe('kimi-k2.7-code')
  })

  it('retired Run BiOS studio hosts expose no selectable pin (live policy)', () => {
    // Run BiOS slots remain in the vault catalog for credential storage, but
    // the studio pickers no longer offer Run BiOS model × host mappings.
    expect(pinFor('glm-5.3-flash', 'runbios')).toBe('auto')
    expect(pinFor('deepseek-v4-pro', 'runbios')).toBe('auto')
    expect(parseStudioPin('runbios-adaptive')).toMatchObject({
      model: { id: 'auto' },
      host: { id: 'auto' },
    })
    expect(canonicalizeRunbiosPin('runbios')).toBe('runbios-glm-53-flash')
    expect(isRunbiosPin('runbios-qwen')).toBe(true)
    expect(isRunbiosPin('nvidia-glm')).toBe(false)
  })
})
