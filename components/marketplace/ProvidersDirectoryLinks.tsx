import Link from 'next/link'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { T } from '@/components/marketplace/tokens'

type Row = { provider?: { username?: string | null; full_name?: string | null; status?: string | null } | Array<{ username?: string | null; full_name?: string | null; status?: string | null }> | null }

function joined(row: Row) {
  const p = Array.isArray(row?.provider) ? row.provider[0] : row?.provider
  return p ?? null
}

/**
 * Server-rendered A–Z list of every active provider profile, baked in at
 * build time like the provider pages themselves. The interactive directory
 * below is client-rendered, so without this list crawlers found no internal
 * link to most /providers/<username> pages (they were sitemap-only orphans).
 */
export default async function ProvidersDirectoryLinks() {
  let providers: Array<{ username: string; name: string }> = []
  try {
    const db = createSupabaseAdminClient()
    const [a, c] = await Promise.all([
      db.from('attorneys').select('provider:profiles!attorneys_profile_id_fkey(username, full_name, status)').limit(5000),
      db.from('consultants').select('provider:profiles!consultants_profile_id_fkey(username, full_name, status)').limit(5000),
    ])
    const seen = new Map<string, string>()
    for (const row of [...((a.data as Row[]) ?? []), ...((c.data as Row[]) ?? [])]) {
      const p = joined(row)
      if (!p?.username || p.status !== 'active') continue
      if (!seen.has(p.username)) seen.set(p.username, (p.full_name || p.username).trim())
    }
    providers = [...seen.entries()]
      .map(([username, name]) => ({ username, name }))
      .sort((x, y) => x.name.localeCompare(y.name))
  } catch {
    return null
  }
  if (providers.length === 0) return null
  return (
    <nav aria-labelledby="all-provider-profiles" style={{ maxWidth: 1100, margin: '0 auto', padding: '8px 24px 56px' }}>
      <h2 id="all-provider-profiles" style={{ fontSize: 18, fontWeight: 700, margin: '0 0 10px', color: T.ink }}>
        All provider profiles A to Z
      </h2>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6, gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', fontSize: 14 }}>
        {providers.map((p) => (
          <li key={p.username}>
            <Link href={`/providers/${p.username}`} style={{ color: T.ink, textDecoration: 'underline', textUnderlineOffset: 3 }}>
              {p.name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
