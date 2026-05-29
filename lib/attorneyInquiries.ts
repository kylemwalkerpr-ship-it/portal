import type { createSupabaseAdminClient } from '@/lib/supabase'

// Shared "open queue" filter for the attorney inquiry queue.
//
// The notification banner ("N open briefs in the queue"), the queue page, the
// stats endpoint, and the search endpoint all need to agree on what counts as
// an OPEN brief. Drift between them produces phantom notifications — the
// attorney sees "5 in the queue" but clicks through to 0, because each
// surface filtered differently.
//
// The canonical filter excludes:
//   1. Inquiries the client archived (`archived_at` is set)
//   2. Inquiries already converted to an order or marked archived (status in)
//   3. Inquiries that already produced an accepted offer
//   4. The `portal_attorney_chat` internal-messaging rows — these are NOT
//      real client briefs; they are direct attorney↔client chat threads that
//      live on the inquiries table but should never count as queue work.
//
// `.in('status', ['open','engaged','claimed'])` is NOT used here on purpose —
// the canonical view lets any status through as long as it isn't converted /
// archived, and several status variants exist in the table that the legacy
// IN-filter silently dropped.

type Db = ReturnType<typeof createSupabaseAdminClient>

export async function getAcceptedInquiryIds(db: Db): Promise<string[]> {
  const { data } = await db.from('attorney_offers').select('inquiry_id').eq('status', 'accepted')
  return ((data ?? []).map((r: { inquiry_id: string | null }) => r.inquiry_id).filter(Boolean) as string[])
}

// Apply the canonical filter to any `inquiries` query (count, select, search).
// Generic over the builder so the caller's resulting type chain stays intact.
export function applyOpenQueueFilter<T>(query: T, acceptedInquiryIds: string[]): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = query
  q = q
    .is('archived_at', null)
    .not('status', 'in', '("converted","archived")')
    .neq('source', 'portal_attorney_chat')
  if (acceptedInquiryIds.length > 0) {
    q = q.not('id', 'in', acceptedInquiryIds)
  }
  return q as T
}
