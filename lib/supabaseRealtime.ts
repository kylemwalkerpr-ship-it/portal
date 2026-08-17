'use client'

/**
 * Thin wrapper around Supabase Realtime postgres_changes subscriptions.
 *
 *   const off = subscribeToTable('inquiry_statuses', 'public', (payload) => { ... })
 *   // ...later
 *   off()
 *
 * Each call opens its own channel keyed by `${schema}:${table}:${random}` so
 * multiple components can subscribe to the same table without colliding.
 */
import { createSupabaseBrowserClient } from './supabaseBrowser'

export type RealtimePayload = {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE'
  schema: string
  table: string
  new: Record<string, any> | null
  old: Record<string, any> | null
}

export function subscribeToTable(
  table: string,
  schema: string,
  onEvent: (payload: RealtimePayload) => void,
  onStatus?: (status: string) => void,
): () => void {
  const supabase = createSupabaseBrowserClient()
  const channelName = `realtime:${schema}:${table}:${Math.random().toString(36).slice(2, 8)}`

  const channel = supabase
    .channel(channelName)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .on('postgres_changes' as any, { event: '*', schema, table }, (payload: any) => {
      onEvent({
        eventType: payload.eventType,
        schema: payload.schema,
        table: payload.table,
        new: payload.new ?? null,
        old: payload.old ?? null,
      })
    })
    .subscribe((status) => {
      onStatus?.(String(status))
    })

  return () => {
    try {
      supabase.removeChannel(channel)
    } catch {
      /* no-op: channel may already be torn down */
    }
  }
}
