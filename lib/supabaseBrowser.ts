/**
 * Browser-side Supabase client (anon key, public). Use only from `'use client'`
 * components. Server code should keep using `createSupabaseAdminClient` from
 * `./supabase`.
 *
 * A single shared client is exported so realtime channels can be reused.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | null = null

export function createSupabaseBrowserClient(): SupabaseClient {
  if (_client) return _client
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) {
    throw new Error('Supabase browser client is missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY')
  }
  _client = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: {
      params: { eventsPerSecond: 4 },
      heartbeatIntervalMs: 25000,
      reconnectAfterMs: (tries: number) => Math.min(1000 * 2 ** tries, 15000),
    },
  })
  return _client
}

// Convenience re-export — many call sites prefer the simple binding.
export const supabaseBrowser = (): SupabaseClient => createSupabaseBrowserClient()
