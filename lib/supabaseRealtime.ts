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

export function subscribeToTables(
  tables: string[],
  schema: string,
  onEvent: (payload: RealtimePayload) => void,
  onStatus?: (status: string) => void,
): () => void {
  const supabase = createSupabaseBrowserClient()
  const unique = [...new Set(tables.filter(Boolean))]
  const channelName = `realtime:${schema}:${unique.join(',')}:${Math.random().toString(36).slice(2, 8)}`

  // One websocket channel, many postgres_changes listeners. Opening a
  // channel per table (Content Studio used to open 8) reconnect-storms
  // when any table is missing from the publication and shows up in DevTools
  // as `wss://…supabase.co/realtime/v1/websocket failed: network connection was lost`.
  let channel = supabase.channel(channelName)
  for (const table of unique) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    channel = channel.on('postgres_changes' as any, { event: '*', schema, table }, (payload: any) => {
      onEvent({
        eventType: payload.eventType,
        schema: payload.schema,
        table: payload.table,
        new: payload.new ?? null,
        old: payload.old ?? null,
      })
    })
  }
  channel.subscribe((status) => {
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

export function subscribeToTable(
  table: string,
  schema: string,
  onEvent: (payload: RealtimePayload) => void,
  onStatus?: (status: string) => void,
): () => void {
  return subscribeToTables([table], schema, onEvent, onStatus)
}
