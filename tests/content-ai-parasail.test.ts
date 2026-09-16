import { looksLikeParasailKey } from '@/lib/contentAiProvider'

describe('content AI · legacy psk- key detection (commissioned safeguard)', () => {
  // The `psk-` prefix is Parasail's. The commissioned first-party DeepSeek
  // adapter (registry `resolveDeepseekFirstPartyApiKey`) refuses a psk-
  // credential pasted into the DeepSeek slot, so this classifier survives the
  // P3 purge of the Parasail transport itself.
  it('recognizes the psk- key prefix', () => {
    expect(looksLikeParasailKey('psk-example')).toBe(true)
    expect(looksLikeParasailKey('PSK-EXAMPLE')).toBe(true)
    expect(looksLikeParasailKey('sk-openai')).toBe(false)
    expect(looksLikeParasailKey('')).toBe(false)
  })
})
