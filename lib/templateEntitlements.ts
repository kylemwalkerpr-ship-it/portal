// Template-pack entitlements helper.
//
// A user is "entitled" to a slug when there's a paid template_orders
// row matching one of:
//   - the email on their Clerk profile
//   - a clerk_user_id stored on the order (future-proof: anonymous
//     checkouts attach by email today, authenticated ones can attach
//     by user id)
//
// This helper is the ONE place that decides whether a download is
// allowed. Every download endpoint MUST go through it — never short-
// circuit to a public URL or signed link without checking here.

import type { SupabaseClient } from '@supabase/supabase-js'

export interface PaidEntitlement {
  slug: string
  orderId: string
  purchasedAt: string
}

export async function listPaidTemplates(
  db: SupabaseClient,
  email: string,
): Promise<PaidEntitlement[]> {
  if (!email) return []
  const { data, error } = await db
    .from('template_orders')
    .select('id, slugs, created_at')
    .eq('email', email.toLowerCase())
    .eq('status', 'paid')
  if (error || !data) return []
  const flat: PaidEntitlement[] = []
  for (const row of data) {
    if (!Array.isArray(row.slugs)) continue
    for (const slug of row.slugs) {
      if (typeof slug !== 'string' || !slug) continue
      flat.push({ slug, orderId: row.id, purchasedAt: row.created_at })
    }
  }
  // De-dupe — a user may have bought the same slug across multiple
  // orders. Keep the earliest purchase date so the dashboard can show
  // "purchased on …" consistently.
  const seen = new Map<string, PaidEntitlement>()
  for (const e of flat) {
    const prev = seen.get(e.slug)
    if (!prev || prev.purchasedAt > e.purchasedAt) seen.set(e.slug, e)
  }
  return Array.from(seen.values())
}

export async function userOwnsSlug(
  db: SupabaseClient,
  email: string,
  slug: string,
): Promise<boolean> {
  if (!email || !slug) return false
  const { data, error } = await db
    .from('template_orders')
    .select('id')
    .eq('email', email.toLowerCase())
    .eq('status', 'paid')
    .contains('slugs', [slug])
    .limit(1)
  if (error) return false
  return Array.isArray(data) && data.length > 0
}
