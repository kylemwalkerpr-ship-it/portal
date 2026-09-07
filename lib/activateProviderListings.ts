/**
 * When an attorney/consultant profile is activated (admin "Activate user"
 * or application approve), also make their marketplace listings visible.
 *
 * Staged providers ship with gigs status=draft + is_hidden=true and
 * sellers available=false / profiles.is_hidden=true. Marketplace
 * /api/marketplace/gigs only returns status='active', so activating the
 * profile alone left gigs invisible. This helper is the single cascade.
 *
 * Idempotent: safe to re-run. Only touches rows owned by profileId.
 * Does not revive deleted/archived/suspended gigs.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export type ActivateProviderListingsResult = {
  profileUnhidden: boolean
  sellerAvailableUpdated: boolean
  gigsActivated: number
  gigIds: string[]
}

export async function activateProviderListings(
  db: SupabaseClient,
  profileId: string,
): Promise<ActivateProviderListingsResult> {
  const now = new Date().toISOString()

  const { error: profileErr } = await db
    .from('profiles')
    .update({ is_hidden: false, hidden_at: null })
    .eq('id', profileId)
  if (profileErr) {
    console.warn('[activateProviderListings] profile unhide failed:', profileErr.message)
  }

  // Both tables are no-ops when the row does not exist for this profile.
  const [attRes, consRes] = await Promise.all([
    db.from('attorneys').update({ available: true }).eq('profile_id', profileId),
    db.from('consultants').update({ available: true }).eq('profile_id', profileId),
  ])
  if (attRes.error) console.warn('[activateProviderListings] attorneys.available:', attRes.error.message)
  if (consRes.error) console.warn('[activateProviderListings] consultants.available:', consRes.error.message)

  // Only draft/paused become marketplace-visible. Never revive deleted/archived/suspended.
  const { data: candidates, error: listErr } = await db
    .from('gigs')
    .select('id, status, is_hidden, published_at')
    .eq('provider_id', profileId)
    .in('status', ['draft', 'paused'])

  if (listErr) {
    console.warn('[activateProviderListings] list gigs failed:', listErr.message)
    return {
      profileUnhidden: !profileErr,
      sellerAvailableUpdated: !attRes.error || !consRes.error,
      gigsActivated: 0,
      gigIds: [],
    }
  }

  const gigIds: string[] = []
  for (const gig of candidates ?? []) {
    const patch: Record<string, unknown> = {
      status: 'active',
      is_hidden: false,
      hidden_at: null,
      last_status_changed_at: now,
    }
    if (!gig.published_at) patch.published_at = now

    const { error: upErr } = await db
      .from('gigs')
      .update(patch)
      .eq('id', gig.id)
      .eq('provider_id', profileId)
    if (upErr) {
      console.warn('[activateProviderListings] gig update failed', gig.id, upErr.message)
      continue
    }
    gigIds.push(gig.id as string)
  }

  // Unhide any active-but-still-hidden leftovers for this provider.
  const { data: hiddenActive } = await db
    .from('gigs')
    .select('id')
    .eq('provider_id', profileId)
    .eq('status', 'active')
    .eq('is_hidden', true)

  for (const gig of hiddenActive ?? []) {
    const id = gig.id as string
    if (gigIds.includes(id)) continue
    const { error: upErr } = await db
      .from('gigs')
      .update({ is_hidden: false, hidden_at: null })
      .eq('id', id)
      .eq('provider_id', profileId)
    if (!upErr) gigIds.push(id)
  }

  return {
    profileUnhidden: !profileErr,
    sellerAvailableUpdated: !(attRes.error && consRes.error),
    gigsActivated: gigIds.length,
    gigIds,
  }
}

/** Pause live gigs + mark seller unavailable when an account is suspended. */
export async function suspendProviderListings(
  db: SupabaseClient,
  profileId: string,
): Promise<{ gigsPaused: number }> {
  const { data: pausedRows, error } = await db
    .from('gigs')
    .update({ status: 'paused' })
    .eq('provider_id', profileId)
    .eq('status', 'active')
    .select('id')
  if (error) console.warn('[suspendProviderListings] pause gigs:', error.message)

  const [attRes, consRes] = await Promise.all([
    db.from('attorneys').update({ available: false }).eq('profile_id', profileId),
    db.from('consultants').update({ available: false }).eq('profile_id', profileId),
  ])
  if (attRes.error) console.warn('[suspendProviderListings] attorneys:', attRes.error.message)
  if (consRes.error) console.warn('[suspendProviderListings] consultants:', consRes.error.message)

  return { gigsPaused: pausedRows?.length ?? 0 }
}
