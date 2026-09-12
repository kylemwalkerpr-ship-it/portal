type DbLike = {
  from: (table: string) => any
}

/**
 * Best-effort durable audit for order workflow mutations.
 *
 * `order_events` is the human-facing activity stream. `order_status_history`
 * remains the compact transition ledger used by operational/admin tooling.
 * A progress-only update records an order_event but intentionally does not add
 * a duplicate status-history row when fromStatus === toStatus.
 *
 * Audit failure must never roll back an order mutation that already committed;
 * callers receive warnings for logging/diagnostics instead.
 */
export async function recordOrderActivity(
  db: DbLike,
  input: {
    orderId: string
    actorId?: string | null
    actorRole?: string | null
    fromStatus?: string | null
    toStatus?: string | null
    note?: string | null
  },
): Promise<string[]> {
  const warnings: string[] = []
  const fromStatus = input.fromStatus || null
  const toStatus = input.toStatus || fromStatus || null

  try {
    const { error } = await db.from('order_events').insert({
      order_id: input.orderId,
      actor_id: input.actorId || null,
      actor_role: input.actorRole || null,
      from_status: fromStatus,
      to_status: toStatus,
      note: input.note || null,
    })
    if (error) warnings.push(`order_event:${error.message || 'write failed'}`)
  } catch (error: any) {
    warnings.push(`order_event:${error?.message || 'write failed'}`)
  }

  if (toStatus && fromStatus !== toStatus) {
    try {
      const { error } = await db.from('order_status_history').insert({
        order_id: input.orderId,
        from_status: fromStatus,
        to_status: toStatus,
        changed_by_id: input.actorId || null,
        note: input.note || null,
      })
      if (error) warnings.push(`status_history:${error.message || 'write failed'}`)
    } catch (error: any) {
      warnings.push(`status_history:${error?.message || 'write failed'}`)
    }
  }

  return warnings
}
