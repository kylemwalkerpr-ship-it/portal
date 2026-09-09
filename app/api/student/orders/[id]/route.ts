/**
 * GET /api/student/orders/[id]
 * Unified order detail payload for the student-facing order page.
 * Returns: order + service + consultant + files + recent messages + offers + events.
 * Self-heals if any optional column is missing.
 */
import { getCurrentStudent } from '@/lib/student'
import { mintSignedDocumentUrl } from '@/lib/documentStorage'
import { getClientCancellationEligibility, serializeCancelEligibility, UNSTARTED_STATUSES } from '@/lib/orderCancellation'

function dollarsFromCents(cents: unknown) { return Number(cents || 0) / 100 }

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await getCurrentStudent()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  const { db, profile } = auth

  const { id } = await context.params
  if (!id) return Response.json({ error: 'Order id required' }, { status: 400 })

  // Load order with ownership check.
  let { data: order, error } = await db
    .from('orders')
    .select('id, order_number, client_id, consultant_id, attorney_id, status, requirements, created_at, deadline:delivery_deadline, progress, total_amount, amount_paid, currency, payout_status, escrow_status, escrow_amount, escrow_released_amount, escrow_refunded_amount, auto_release_eligible_at, terms_accepted_at, refund_policy_accepted_at, refunded_amount, refund_status, refund_method, cancelled_at')
    .eq('id', id)
    .single()
  if (error && /column .* does not exist/i.test(error.message || '')) {
    const r = await db.from('orders').select('*').eq('id', id).single()
    order = r.data as any
    error = r.error as any
  }
  if (error || !order) return Response.json({ error: 'Order not found' }, { status: 404 })
  if (order.client_id !== profile.id) return Response.json({ error: 'Forbidden' }, { status: 403 })

  // Parallel fetch the related rows for one page render.
  const [
    itemsRes,
    consultantRes,
    filesRes,
    messagesRes,
    eventsRes,
    milestonesRes,
    scopeRes,
  ] = await Promise.allSettled([
    db.from('order_items').select('order_id, service_id, quantity, unit_price').eq('order_id', id),
    order.consultant_id
      ? db.from('profiles').select('id, full_name, avatar_url, role').eq('id', order.consultant_id).single()
      : Promise.resolve({ data: null }),
    db.from('order_files').select('id, name, size_bytes, uploader_role, uploader_id, mime_type, created_at, storage_path, is_sensitive, is_deleted').eq('order_id', id).order('created_at', { ascending: false }),
    db.from('order_messages').select('id, sender_id, sender_role, body, created_at, attachment_url, attachment_name').eq('order_id', id).order('created_at', { ascending: false }).limit(50),
    db.from('order_events').select('id, event_type, from_status, to_status, notes, metadata, actor_id, created_at').eq('order_id', id).order('created_at', { ascending: false }).limit(50),
    db.from('order_milestones').select('*').eq('order_id', id).order('sequence', { ascending: true }),
    db.from('order_scope_changes').select('*').eq('order_id', id).order('created_at', { ascending: false }),
  ])

  const items = itemsRes.status === 'fulfilled' ? (itemsRes.value.data ?? []) : []
  const serviceIds = items.map((i: any) => i.service_id).filter(Boolean)
  const servicesRes = serviceIds.length
    ? await db.from('services').select('id, title, product_type, category, icon, description').in('id', serviceIds)
    : { data: [] }

  const services = servicesRes.data ?? []
  const primaryService = services[0] || null
  const isTemplate = primaryService?.product_type === 'template'

  const consultant = consultantRes.status === 'fulfilled' ? (consultantRes.value as any)?.data || null : null

  // Order files: every file exchanged on this order (student uploads + provider
  // deliverables), newest first, with a short-lived signed URL so the Files tab
  // can view/download. Soft-deleted files are excluded.
  const fileRowsRaw = filesRes.status === 'fulfilled' ? ((filesRes.value as any).data ?? []) : []
  const fileRows = (fileRowsRaw as any[]).filter((r) => !r.is_deleted)
  const files = await Promise.all(
    fileRows.map(async (r: any) => {
      let url: string | null = null
      try {
        if (r.storage_path) {
          const signed = await mintSignedDocumentUrl(db, {
            bucket: 'order-files',
            path: r.storage_path,
            accessorProfileId: profile.id,
            filename: r.name,
            documentId: r.id,
            sensitive: !!r.is_sensitive,
            download: false,
          })
          url = 'signedUrl' in signed ? signed.signedUrl : null
        }
      } catch { /* leave url null */ }
      return {
        id: r.id,
        name: r.name,
        size_bytes: r.size_bytes,
        mime_type: r.mime_type,
        uploader_role: r.uploader_role,
        uploader_id: r.uploader_id,
        created_at: r.created_at,
        url,
      }
    }),
  )
  const messages  = messagesRes.status === 'fulfilled' ? (messagesRes.value.data ?? []) : []
  const events    = eventsRes.status === 'fulfilled' ? (eventsRes.value.data ?? []) : []
  const milestones = milestonesRes.status === 'fulfilled' ? (milestonesRes.value.data ?? []) : []
  const scopeChanges = scopeRes.status === 'fulfilled' ? (scopeRes.value.data ?? []) : []

  // Client-cancellation eligibility (server-authoritative check is the SQL RPC;
  // this is the shared fast-path so the UI only shows the action when legal).
  let cancelEligibility: Record<string, unknown> | null = null
  if ((UNSTARTED_STATUSES as readonly string[]).includes(String(order.status || ''))) {
    let earningReleased = false
    try {
      const { data: earnings } = await db.from('provider_earnings').select('status').eq('order_id', id)
      earningReleased = ((earnings ?? []) as Array<{ status: string }>).some((e) =>
        ['releasable', 'paid'].includes(e.status),
      )
    } catch { /* optional evidence — the RPC re-checks authoritatively */ }
    const verdict = getClientCancellationEligibility(
      {
        id: order.id,
        client_id: order.client_id,
        status: order.status,
        progress: order.progress,
        currency: order.currency,
        amount_paid: order.amount_paid,
        total_amount: order.total_amount,
        escrow_status: order.escrow_status,
        escrow_amount: order.escrow_amount,
        escrow_released_amount: order.escrow_released_amount,
        escrow_refunded_amount: order.escrow_refunded_amount,
        auto_release_eligible_at: order.auto_release_eligible_at,
        cancelled_at: order.cancelled_at,
        refunded_amount: order.refunded_amount,
        refund_status: order.refund_status,
        payout_status: order.payout_status,
      },
      {
        callerId: profile.id,
        milestoneWork: milestones.some((m: any) => m.status !== 'pending' && m.status !== 'cancelled'),
        earningReleased,
      },
    )
    cancelEligibility = serializeCancelEligibility(verdict)
  }

  const totalCents = Math.round(Number(order.total_amount || 0) * 100)
  const storedProgress = Number.isFinite(Number(order.progress)) ? Number(order.progress) : null
  const friendlyStatus = order.status === 'queued' ? 'pending'
    : order.status === 'created' ? 'created'
    : order.status === 'in_progress' ? 'active'
    : order.status === 'under_review' ? 'review'
    : order.status || 'pending'
  const fallbackProgress = friendlyStatus === 'completed' ? 100 : friendlyStatus === 'review' ? 90 : friendlyStatus === 'active' ? 50 : 0

  return Response.json({
    order: {
      id: order.id,
      orderNumber: order.order_number || null,
      service: primaryService?.title || order.requirements || 'Custom engagement',
      serviceId: primaryService?.id ?? null,
      category: primaryService?.category || null,
      icon: primaryService?.icon || null,
      description: primaryService?.description || null,
      productType: isTemplate ? 'template' : 'service',
      requirements: order.requirements || '',
      consultant: isTemplate
        ? 'Digital delivery'
        : consultant?.full_name || (order.consultant_id ? 'Assigned consultant' : 'Awaiting assignment'),
      consultantId: order.consultant_id ?? null,
      consultantAvatarUrl: consultant?.avatar_url || null,
      status: friendlyStatus,
      rawStatus: order.status,
      date: order.created_at ? new Date(order.created_at).toLocaleDateString() : '—',
      createdAt: order.created_at || null,
      deadline: order.deadline ? new Date(order.deadline).toLocaleDateString() : '—',
      deadlineAt: order.deadline || null,
      progress: storedProgress ?? fallbackProgress,
      price: `$${dollarsFromCents(totalCents).toFixed(2)}`,
      totalCents,
      escrowStatus: order.escrow_status || 'held',
      escrowAmount: Math.round(Number(order.escrow_amount || 0) * 100),
      escrowReleasedAmount: Math.round(Number(order.escrow_released_amount || 0) * 100),
      escrowRefundedAmount: Math.round(Number(order.escrow_refunded_amount || 0) * 100),
      autoReleaseEligibleAt: order.auto_release_eligible_at || null,
      payoutStatus: order.payout_status || 'pending',
      termsAcceptedAt: order.terms_accepted_at || null,
      refundPolicyAcceptedAt: order.refund_policy_accepted_at || null,
      canCancel: !!cancelEligibility?.cancellable,
      cancelEligibility,
    },
    items,
    services,
    files,
    messages: messages.reverse(), // oldest → newest for chronological render
    events,
    milestones,
    scopeChanges,
  })
}