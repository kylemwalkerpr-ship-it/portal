/**
 * Apply seo_ahrefs_snapshots + insert the 2026-08-17 legal crawl.
 *
 *   SUPABASE_ACCESS_TOKEN=sbp_... npx tsx scripts/ingest-ahrefs-snapshot.mts
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fallbackLegalAhrefsSnapshot } from '../lib/seoEngine/ahrefsAudit'

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'krggzrxxnqfsbbklatxl'
const token = process.env.SUPABASE_ACCESS_TOKEN || ''

if (!token) {
  console.error('Set SUPABASE_ACCESS_TOKEN (sbp_…) and re-run.')
  process.exit(1)
}

async function query(sql: string): Promise<string> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Management API ${res.status}: ${text.slice(0, 800)}`)
  return text
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const ddl = readFileSync(join(root, 'supabase/migrations/20260817_ahrefs_snapshots.sql'), 'utf8')
const snap = fallbackLegalAhrefsSnapshot()
const issuesJson = JSON.stringify(snap.issues).replace(/'/g, "''")

async function main() {
  console.log('Applying seo_ahrefs_snapshots…')
  console.log((await query(ddl)).slice(0, 400))
  await query(`ALTER TABLE public.seo_ahrefs_snapshots ADD COLUMN IF NOT EXISTS source TEXT;`)
  const insert = `
INSERT INTO public.seo_ahrefs_snapshots (
  project_id, fetched_at, crawl_date, date_compared,
  health_score, health_score_compared, cs_open, total_open, issues, source
) VALUES (
  '${snap.projectId}',
  now(),
  '${snap.date}',
  ${snap.dateCompared ? `'${snap.dateCompared}'` : 'NULL'},
  ${snap.healthScore == null ? 'NULL' : snap.healthScore},
  ${snap.healthScoreCompared == null ? 'NULL' : snap.healthScoreCompared},
  ${snap.csOpen},
  ${snap.totalOpen},
  '${issuesJson}'::jsonb,
  'manual'
);
`
  console.log('Inserting 2026-08-17 crawl…')
  console.log((await query(insert)).slice(0, 400))
  const check = await query(`
    SELECT project_id, crawl_date, cs_open, total_open, source,
           jsonb_array_length(issues) AS issue_types
    FROM public.seo_ahrefs_snapshots
    ORDER BY fetched_at DESC
    LIMIT 3;
  `)
  console.log(check)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
