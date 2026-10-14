/** Public descriptive copy for an explicitly fenced synthetic replay; never credential or price authority. */
export function replayProviderPublicProfile(metadata: any, provider: any): Record<string, any> | null {
  const snapshot = metadata?.yqaa_replay_provider_public_profile
  if (metadata?.yqaa_live_acceptance !== true || metadata?.yqaa_foley_taylor_replay !== true ||
      provider?.is_test_account !== true || provider?.is_hidden !== true || !snapshot ||
      snapshot.role !== provider.role || !/^[0-9a-f-]{36}$/i.test(String(snapshot.source_provider_id || ''))) return null
  const profile = snapshot.profile
  if (!profile || typeof profile !== 'object') return null
  const result: Record<string, any> = {}
  for (const key of ['tagline','bio','intro','jurisdictions','practice_areas','specialties','languages','subjects','industries']) {
    const value = profile[key]
    if (typeof value === 'string') result[key] = value.slice(0, key === 'bio' ? 1600 : 800)
    else if (Array.isArray(value)) result[key] = value.slice(0, 16).filter(item => typeof item === 'string').map(item => item.slice(0, 100))
  }
  return result
}
