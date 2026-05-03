import { createSupabaseAdminClient } from '@/lib/supabase'

export async function GET() {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from('services')
    .select('*')
    .eq('is_active', true)
    .order('category', { ascending: true })
    .order('title', { ascending: true })

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ services: data ?? [] })
}
