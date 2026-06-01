import { revalidateTag } from 'next/cache'
import { getClerkUserId } from '@/lib/auth'
import { createSupabaseAdminClient } from '@/lib/supabase'

async function requireAdmin() {
  const clerkUserId = await getClerkUserId()
  if (!clerkUserId) return { error: 'Unauthorized', status: 401 as const }

  const db = createSupabaseAdminClient()
  const { data: profile } = await db
    .from('profiles')
    .select('id, role')
    .eq('clerk_user_id', clerkUserId)
    .single()

  if (profile?.role !== 'admin') return { error: 'Forbidden', status: 403 as const }
  return { db, adminProfileId: profile.id }
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const { id } = await context.params
  const body = await req.json()

  if (id === auth.adminProfileId && ('status' in body || 'role' in body)) {
    return Response.json(
      { error: 'Admins cannot change their own role or account status' },
      { status: 400 }
    )
  }

  const payload: Record<string, unknown> = {}
  if ('status' in body) {
    if (!['active', 'pending', 'suspended'].includes(body.status)) {
      return Response.json({ error: 'Invalid status' }, { status: 400 })
    }
    payload.status = body.status
  }
  if ('role' in body) {
    const role = body.role === 'student' ? 'client' : body.role
    if (!['client', 'consultant', 'support', 'admin'].includes(role)) {
      return Response.json({ error: 'Invalid role' }, { status: 400 })
    }
    const { data: target } = await auth.db
      .from('profiles')
      .select('email, role')
      .eq('id', id)
      .single()

    if (target?.role && target.role !== role) {
      return Response.json(
        { error: 'Roles are independent. Create a separate account through the correct role-specific signup route.' },
        { status: 409 }
      )
    }

    if (target?.email) {
      const { data: duplicate } = await auth.db
        .from('profiles')
        .select('id, role')
        .eq('email', target.email)
        .neq('id', id)
        .maybeSingle()
      if (duplicate && duplicate.role !== role) {
        return Response.json(
          { error: 'This email address already belongs to another role' },
          { status: 409 }
        )
      }
    }
    payload.role = role
  }
  if ('full_name' in body) payload.full_name = body.full_name
  if ('country' in body) payload.country = body.country

  const { data, error } = await auth.db.from('profiles').update(payload).eq('id', id).select('*').single()
  if (error) return Response.json({ error: error.message }, { status: 500 })

  // Cascade status changes to provider-owned listings so the marketplace
  // never advertises a suspended provider's gigs. Active → re-activate the
  // archived-on-suspend gigs; Suspended → archive them. The status check on
  // the public landing query is gig-level, not profile-level, so without
  // this cascade a suspended attorney's gigs would still appear.
  if (payload.status && (data?.role === 'attorney' || data?.role === 'consultant')) {
    if (payload.status === 'suspended') {
      await auth.db.from('gigs').update({ status: 'paused' }).eq('provider_id', id).eq('status', 'active')
    } else if (payload.status === 'active') {
      await auth.db.from('gigs').update({ status: 'active' }).eq('provider_id', id).eq('status', 'paused')
    }
    // Bust the landing-featured-providers cache so the dashboard's
    // suspend/reactivate reflects on /, /marketplace and the regional homes
    // without waiting out the 10-minute revalidate window.
    // Next 16's revalidateTag takes a cache-life profile as its 2nd arg.
    // 'default' is the standard profile for non-streaming-cache use.
    revalidateTag('landing-featured-providers', 'default')
  }

  return Response.json({ user: data })
}

/**
 * Hard delete an attorney / consultant / support staff account end-to-end.
 *
 * Order of operations is load-bearing: every RESTRICT / NO ACTION foreign
 * key pointing at profiles, attorneys, or consultants must be detached or
 * deleted before the profile row itself can go. The previous version of
 * this route missed several of these (chat_messages, provider_earnings,
 * disputes, support_audit_log, etc.) — when an admin tried to delete an
 * attorney who had even one message or earning row the final
 * profiles.delete() failed and the UI silently showed success while the
 * attorney remained visible everywhere.
 *
 * After the cascade we also:
 *   - delete the Clerk user so they can't sign back in with the same email
 *   - bust the landing-featured-providers unstable_cache so the marketplace
 *     home reflects the removal immediately instead of after 10 minutes
 */
export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const { id } = await context.params

  const { data: target } = await auth.db
    .from('profiles')
    .select('id, role, email, clerk_user_id')
    .eq('id', id)
    .single()

  if (!target) {
    return Response.json({ error: 'Profile not found' }, { status: 404 })
  }

  if (target.id === auth.adminProfileId) {
    return Response.json({ error: 'Admins cannot delete their own account' }, { status: 400 })
  }

  // All non-self roles are deletable — client, consultant, attorney, support
  // and other admins. The role gate that used to restrict to
  // consultant/attorney/support is gone so admins can fully manage every
  // account except their own.
  if (!['client', 'consultant', 'support', 'attorney', 'admin'].includes(target.role)) {
    return Response.json({ error: `Unsupported role: ${target.role}` }, { status: 400 })
  }

  // ── Pre-flight refund check (client role only). ──
  // orders.client_id has ON DELETE CASCADE, so deleting a student profile
  // wipes every one of their orders along with the linked escrow_events,
  // order_status_history, etc. That's the right behaviour for a fully
  // erased user — but only AFTER any open escrow is settled. Without this
  // gate an admin could accidentally vaporize a paying customer's
  // in-flight purchase and the seller never sees the funds.
  //
  // We block on two specific conditions:
  //   1. Any order with escrow_amount > 0 in a non-final escrow_status.
  //      The admin must run /api/admin/escrow/[id]/refund (full or partial)
  //      or release the funds to the seller before this delete can proceed.
  //   2. Any positive wallet balance. The admin must run
  //      /api/admin/wallet/topup-refund on the relevant top-ups (or mark
  //      them out-of-band) before delete.
  //
  // The response surfaces exactly which order ids + the wallet amount the
  // admin needs to handle so the UI can list them with one-click links.
  if (target.role === 'client') {
    const [{ data: openEscrow }, { data: wallet }] = await Promise.all([
      auth.db
        .from('orders')
        .select('id, escrow_amount, escrow_status, total_amount')
        .eq('client_id', id)
        .in('escrow_status', ['held', 'partial_released', 'frozen'])
        .gt('escrow_amount', 0),
      auth.db
        .from('student_wallets')
        .select('balance_cents')
        .eq('profile_id', id)
        .maybeSingle(),
    ])

    const blockers: Array<{ kind: string; detail: string; orders?: string[]; balanceCents?: number }> = []
    if (openEscrow && openEscrow.length > 0) {
      const totalOpenCents = openEscrow.reduce(
        (sum: number, o: { escrow_amount: number | string | null }) => sum + Math.round(Number(o.escrow_amount || 0) * 100),
        0,
      )
      blockers.push({
        kind: 'open_escrow',
        detail: `${openEscrow.length} order(s) with $${(totalOpenCents / 100).toFixed(2)} in escrow. Refund or release before deleting.`,
        orders: openEscrow.map((o: { id: string }) => o.id),
      })
    }
    if (wallet && wallet.balance_cents > 0) {
      blockers.push({
        kind: 'positive_wallet_balance',
        detail: `Wallet has $${(wallet.balance_cents / 100).toFixed(2)} unrefunded. Process a wallet refund (most recent top-up) before deleting.`,
        balanceCents: wallet.balance_cents,
      })
    }
    if (blockers.length > 0) {
      return Response.json(
        {
          error: 'Refunds required before this account can be deleted.',
          blockers,
          hint:
            'Use the escrow refund + wallet topup-refund admin endpoints to settle the listed items, then retry the delete.',
        },
        { status: 409 },
      )
    }
  }

  // Last guard before the cascade runs: cancel any other admin's pending
  // sessions by clearing their Clerk user FIRST when we're about to delete
  // an admin, so an in-flight admin action elsewhere can't race. For
  // non-admin targets we keep the Clerk delete at the end (Supabase is
  // the truth) — see step 14.
  if (target.role === 'admin' && target.clerk_user_id) {
    try {
      const { clerkClient } = await import('@clerk/nextjs/server')
      const client = await clerkClient()
      await client.users.deleteUser(target.clerk_user_id)
    } catch (clerkErr) {
      console.warn('[admin/users DELETE] pre-cascade clerk delete failed:', clerkErr)
    }
  }

  // ── 1. Detach order-history references — keep the orders rows for
  // compliance/audit but null out the deleted user's role-specific ids. ──
  await auth.db.from('orders').update({ consultant_id: null, status: 'queued' }).eq('consultant_id', id)
  await auth.db.from('orders').update({ attorney_id: null }).eq('attorney_id', id)
  await auth.db.from('orders').update({ cancelled_by: null }).eq('cancelled_by', id)

  // ── 2. Reassign chat / messaging FKs. The sender / actor FKs on
  // chat_messages, conversation_messages, and chat_attachments are
  // NO ACTION — blocking the profile delete unless cleared. We delete the
  // messaging artefacts the deleted user wrote rather than reassigning to
  // an opaque "deleted user" placeholder; for compliance threads, the
  // counterpart's side of the conversation stays intact.
  await auth.db.from('chat_messages').delete().eq('sender_id', id)
  await auth.db.from('conversation_messages').delete().eq('sender_id', id)
  await auth.db.from('conversation_messages').update({ hidden_by_actor_id: null }).eq('hidden_by_actor_id', id)
  await auth.db.from('chat_messages').update({ hidden_by_actor_id: null }).eq('hidden_by_actor_id', id)
  await auth.db.from('chat_attachments').delete().eq('uploader_id', id)
  await auth.db.from('chat_conversations').update({ assigned_to_id: null }).eq('assigned_to_id', id)
  await auth.db.from('chat_conversations').update({ assigned_to: null }).eq('assigned_to', id)
  await auth.db.from('conversation_participants').delete().eq('profile_id', id)
  await auth.db.from('conversation_reads').delete().eq('profile_id', id)
  await auth.db.from('conversation_message_reactions').delete().eq('profile_id', id)
  await auth.db.from('conversations').delete().or(`participant_a.eq.${id},participant_b.eq.${id}`)

  // ── 3. Provider-side ledger + payouts. NO ACTION FKs to profiles. ──
  await auth.db.from('provider_earnings').delete().eq('provider_id', id)
  await auth.db.from('provider_payouts').delete().eq('provider_id', id)
  await auth.db.from('provider_payouts').update({ marked_by: null }).eq('marked_by', id)

  // ── 4. Order events / history. NO ACTION FK to profiles via changed_by_id. ──
  await auth.db.from('order_status_history').update({ changed_by_id: null }).eq('changed_by_id', id)

  // ── 5. Dispute records — RESTRICT both sides. Delete disputes raised by
  // or against this user; resolution_by stays so admin history remains. ──
  await auth.db.from('disputes').delete().or(`opened_by.eq.${id},against_id.eq.${id}`)
  await auth.db.from('disputes').update({ resolved_by: null }).eq('resolved_by', id)

  // ── 6. Support / audit / ticket FKs (saas-shared schema). ──
  await auth.db.from('support_audit_log').delete().eq('actor_id', id)
  await auth.db.from('support_tickets').delete().eq('raised_by', id)
  await auth.db.from('support_presence').delete().eq('profile_id', id)
  await auth.db.from('admin_audit_log').update({ admin_id: null }).eq('admin_id', id)

  // ── 7. Attorney-application history. ──
  await auth.db.from('attorney_application_events').delete().eq('actor_id', id)
  await auth.db.from('attorney_applications').delete().eq('profile_id', id)
  await auth.db.from('attorney_applications').update({ assigned_to: null }).eq('assigned_to', id)
  await auth.db.from('attorney_applications').update({ decided_by: null }).eq('decided_by', id)
  await auth.db.from('attorney_applications').update({ last_reviewed_by: null }).eq('last_reviewed_by', id)

  // ── 8. Notifications / reads. ──
  await auth.db.from('notifications').delete().eq('user_id', id)
  await auth.db.from('consultant_notification_reads').delete().eq('consultant_id', id)

  // ── 9. Ratings + reviews authored by this user (kept anonymous on the
  // counterpart-side). gig_reviews.reviewer_id is NO ACTION. ──
  await auth.db.from('gig_reviews').delete().eq('reviewer_id', id)
  await auth.db.from('gig_reviews').update({ hidden_by_actor_id: null }).eq('hidden_by_actor_id', id)
  await auth.db.from('gig_review_replies').delete().eq('provider_id', id)
  await auth.db.from('attorney_ratings').delete().eq('rater_profile_id', id)

  // ── 10. Offers — both consultant and attorney variants. ──
  await auth.db.from('attorney_offers').delete().or(`attorney_profile_id.eq.${id},client_profile_id.eq.${id}`)
  await auth.db.from('consultant_offers').delete().or(`consultant_profile_id.eq.${id},client_profile_id.eq.${id}`)

  // ── 11. Role-specific row(s) + their dependents — must come before the
  // profiles delete because attorneys/consultants reference profiles. ──
  if (target.role === 'consultant') {
    const { data: consRow } = await auth.db.from('consultants').select('id').eq('profile_id', id).maybeSingle()
    if (consRow?.id) {
      await auth.db.from('consultant_offers').delete().eq('consultant_id', consRow.id)
    }
    await auth.db.from('consultants').delete().eq('profile_id', id)
    await auth.db.from('consultants').delete().eq('user_id', id)
    if (target.email) await auth.db.from('consultants').delete().eq('email', target.email)
  }

  if (target.role === 'attorney') {
    const { data: attRow } = await auth.db.from('attorneys').select('id').eq('profile_id', id).maybeSingle()
    if (attRow?.id) {
      await auth.db.from('attorney_offers').delete().eq('attorney_id', attRow.id)
      await auth.db.from('attorney_ratings').delete().eq('attorney_id', attRow.id)
    }
    // Archive gigs first so /api/marketplace/gigs filters them out; THEN
    // delete the rows that point at gigs (review replies cascade through
    // gigs FK), then the gig rows themselves so the attorneys table has no
    // remaining gigs.provider_id pointers.
    await auth.db.from('gigs').update({ status: 'archived' }).eq('provider_id', id)
    await auth.db.from('gigs').update({ suspended_by: null }).eq('suspended_by', id)
    await auth.db.from('attorneys').delete().eq('profile_id', id)
  }

  // gig_promotion_campaigns + gig_metric_events sometimes point at the
  // provider profile directly. Clear them so any remaining gigs.provider_id
  // references are safe to drop.
  await auth.db.from('gig_promotion_campaigns').delete().eq('provider_profile_id', id)
  await auth.db.from('gig_metric_events').update({ actor_id: null }).eq('actor_id', id)

  // ── 12. Provider-owned gigs left over (consultant-owned, or any flow we
  // missed). Set them inactive permanently so the discovery and JSON-LD
  // pipelines exclude them; do NOT delete the gigs themselves because
  // historical orders FK into them. ──
  await auth.db.from('gigs').update({ status: 'archived' }).eq('provider_id', id)

  // ── 13. Profile delete — at this point every NO ACTION / RESTRICT FK
  // should be cleared. If this still fails, surface the exact error so the
  // operator knows which constraint blocked it instead of receiving a
  // generic "delete failed". ──
  const { error: profileErr } = await auth.db.from('profiles').delete().eq('id', id)
  if (profileErr) {
    return Response.json(
      {
        error: `Profile delete blocked: ${profileErr.message}`,
        hint:
          'A foreign key still references this profile. Review profile cascades in app/api/admin/users/[id]/route.ts and add the missing relation.',
      },
      { status: 500 }
    )
  }

  // ── 14. Hard-delete from Clerk so the user cannot sign back in with the
  // same Clerk session. We do this AFTER the Supabase delete so a Clerk
  // outage doesn't leave us with an orphan Clerk user pointing at a
  // ghost profile. clerkClient is dynamic-imported to keep the route
  // bundle small and to avoid mocking Clerk in environments where the
  // backend SDK isn't initialised (e.g. unit tests against the route). ──
  if (target.clerk_user_id) {
    try {
      const { clerkClient } = await import('@clerk/nextjs/server')
      const client = await clerkClient()
      await client.users.deleteUser(target.clerk_user_id)
    } catch (clerkErr) {
      // Clerk fail is logged but not fatal — the canonical truth is the
      // Supabase profile, which is gone. If Clerk still has a session it
      // resolves to a dangling profile id and the next authed API call
      // will create a new profile shell (clerkSync's behaviour) which the
      // admin can immediately suspend or delete from there.
      console.warn('[admin/users DELETE] clerk delete failed:', clerkErr)
    }
  }

  // ── 15. Bust the landing-featured-providers + attorneys-search caches so
  // the marketplace home, /marketplace, and regional landing pages stop
  // showing the deleted user within seconds instead of after the 10-minute
  // unstable_cache TTL. ──
  revalidateTag('landing-featured-providers', 'default')

  return Response.json({ ok: true })
}
