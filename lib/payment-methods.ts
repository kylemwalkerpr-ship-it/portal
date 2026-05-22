/**
 * Payment-methods service — CRUD for saved cards via NMI Customer Vault.
 * All gateway calls go through getPaymentProvider(). Never call NMI directly.
 */

import { createSupabaseAdminClient } from './supabase'
import { getPaymentProvider } from './payments'

export type SavedCard = {
  id: string
  profile_id: string
  vault_id: string
  brand: string | null
  last4: string
  exp_month: number | null
  exp_year: number | null
  is_default: boolean
  created_at: string
}

const db = () => createSupabaseAdminClient()

export async function listCards(profileId: string): Promise<SavedCard[]> {
  const { data, error } = await db()
    .from('student_payment_methods')
    .select('*')
    .eq('profile_id', profileId)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) throw new Error(`List cards failed: ${error.message}`)
  return (data ?? []) as SavedCard[]
}

export async function addCard(
  profileId: string,
  token: string,
  cardDisplay?: { brand?: string; last4?: string; expMonth?: number; expYear?: number }
): Promise<SavedCard> {
  const provider = getPaymentProvider()
  if (!provider.supportsVault) {
    throw new Error('Current payment provider does not support card vaulting')
  }

  // The payment abstraction's CustomerInfo wants email; fetch it from the
  // owning profile so the gateway receives a real address for receipts.
  const { data: profile, error: profErr } = await db()
    .from('profiles')
    .select('email, full_name')
    .eq('id', profileId)
    .single()
  if (profErr || !profile?.email) throw new Error('Profile email not found')

  // Vault the card with the gateway
  const vaultRes = await provider.vaultCard({
    token,
    customer: { email: profile.email, name: profile.full_name ?? undefined },
    cardDisplay: cardDisplay
      ? {
          brand: cardDisplay.brand ?? 'card',
          last4: cardDisplay.last4 ?? '',
          // CardDisplay typing uses strings (gateway-native form).
          expMonth: cardDisplay.expMonth != null ? String(cardDisplay.expMonth).padStart(2, '0') : '',
          expYear: cardDisplay.expYear != null ? String(cardDisplay.expYear).slice(-2) : '',
        }
      : undefined,
  })

  if (!vaultRes.ok || !vaultRes.vaultId) {
    throw new Error(vaultRes.message || 'Card vaulting failed')
  }

  // Persist in Supabase
  const { data, error } = await db()
    .from('student_payment_methods')
    .insert({
      profile_id: profileId,
      vault_id: vaultRes.vaultId,
      brand: cardDisplay?.brand ?? vaultRes.cardDisplay?.brand ?? null,
      last4: cardDisplay?.last4 ?? vaultRes.cardDisplay?.last4 ?? '****',
      exp_month: cardDisplay?.expMonth ?? (vaultRes.cardDisplay?.expMonth ? Number(vaultRes.cardDisplay.expMonth) : null),
      exp_year: cardDisplay?.expYear ?? (vaultRes.cardDisplay?.expYear ? Number(vaultRes.cardDisplay.expYear) : null),
      is_default: false,
    })
    .select()
    .single()

  if (error) {
    // Try to clean up the orphaned vault record, but don't fail the request
    // if cleanup also fails — the important thing is we tell the user.
    try { await provider.deleteVaultedCard(vaultRes.vaultId) } catch { /* noop */ }
    throw new Error(`Save card failed: ${error.message}`)
  }

  return data as SavedCard
}

export async function removeCard(profileId: string, cardId: string): Promise<void> {
  // Verify ownership and get vault_id
  const { data, error } = await db()
    .from('student_payment_methods')
    .select('vault_id')
    .eq('id', cardId)
    .eq('profile_id', profileId)
    .single()

  if (error || !data) throw new Error('Card not found')

  const provider = getPaymentProvider()
  if (provider.supportsVault) {
    try {
      await provider.deleteVaultedCard(data.vault_id)
    } catch (e) {
      // Log but continue — NMI vault record may already be gone
      console.warn('[payment-methods] deleteVaultedCard failed:', e)
    }
  }

  const { error: delErr } = await db()
    .from('student_payment_methods')
    .delete()
    .eq('id', cardId)
    .eq('profile_id', profileId)

  if (delErr) throw new Error(`Remove card failed: ${delErr.message}`)
}

export async function setDefaultCard(profileId: string, cardId: string): Promise<void> {
  // Unset any existing default
  await db()
    .from('student_payment_methods')
    .update({ is_default: false })
    .eq('profile_id', profileId)
    .eq('is_default', true)

  // Set the new default
  const { error } = await db()
    .from('student_payment_methods')
    .update({ is_default: true })
    .eq('id', cardId)
    .eq('profile_id', profileId)

  if (error) throw new Error(`Set default failed: ${error.message}`)
}
