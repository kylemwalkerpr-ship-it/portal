import fs from 'node:fs'
import path from 'node:path'

const migrationName = '20260922130000_p11_geo_visibility_truth.sql'
const migrationPath = path.join(process.cwd(), 'supabase', 'migrations', migrationName)
const sql = fs.existsSync(migrationPath) ? fs.readFileSync(migrationPath, 'utf8') : ''
const normalized = sql.toLowerCase().replace(/\s+/g, ' ')

const requiredNullableColumns = [
  'audit_contract_version',
  'run_id',
  'ownership_row_id',
  'query_family',
  'strategic_intent',
  'reader_intent',
  'jurisdiction',
  'authoritative_owner_url',
  'owner_host',
  'prompt_id',
  'prompt_version',
  'audit_status',
  'failure_reason',
  'citation_extraction_status',
  'raw_cited_urls',
  'normalized_cited_urls',
  'citation_classifications',
  'competitor_cited_urls',
  'coverage',
  'started_at',
  'completed_at',
]

describe('P11 GEO visibility database contract', () => {
  it('adds one future timestamped migration without mutating historical rows', () => {
    expect(fs.existsSync(migrationPath)).toBe(true)
    expect(sql).toMatch(/alter\s+table\s+public\.seo_llm_visibility/i)
    expect(sql).not.toMatch(/\bupdate\s+public\.seo_llm_visibility\b/i)
    expect(sql).not.toMatch(/\bdelete\s+from\s+public\.seo_llm_visibility\b/i)
    expect(sql).not.toMatch(/\btruncate\s+(?:table\s+)?public\.seo_llm_visibility\b/i)
  })

  it.each(requiredNullableColumns)('adds nullable historical-compatible column %s', (column) => {
    expect(normalized).toMatch(new RegExp(`add column if not exists ${column}\\s+`))
    expect(normalized).not.toMatch(new RegExp(`add column if not exists ${column}[^,;]*\\bnot null\\b`))
  })

  it('pins the closed P11 audit status vocabulary without coercing legacy NULL rows', () => {
    for (const status of ['success', 'provider_unavailable', 'provider_failure', 'parse_failure', 'blocked', 'unknown']) {
      expect(sql).toContain(`'${status}'`)
    }
    expect(normalized).toMatch(/check\s*\(\s*audit_status\s+is\s+null\s+or\s+audit_status\s+in\s*\(/)
    expect(normalized).not.toMatch(/audit_status[^;]*default\s+'success'/)
  })

  it('keeps the evidence table under RLS and removes the permissive public policy', () => {
    expect(normalized).toContain('alter table public.seo_llm_visibility enable row level security')
    expect(sql).toContain('drop policy if exists "Engine v2 full access" on public.seo_llm_visibility')
    expect(normalized).toMatch(/create policy "service role full access" on public\.seo_llm_visibility for all to service_role using \(true\) with check \(true\)/)
  })

  it('revokes every client-role table privilege and leaves the server writer explicit', () => {
    expect(normalized).toContain('revoke all privileges on table public.seo_llm_visibility from public, anon, authenticated')
    expect(normalized).toContain('grant all privileges on table public.seo_llm_visibility to service_role')
    expect(normalized).not.toMatch(/grant\s+(?:all|insert|update|delete|truncate)[^;]*\bto\s+(?:public|anon|authenticated)\b/)
  })

  it('does not introduce a security-definer bypass', () => {
    expect(normalized).not.toContain('security definer')
  })

  it('indexes the versioned evidence plane without replacing the legacy table', () => {
    expect(normalized).toContain('create index if not exists idx_seo_llm_visibility_contract_created')
    expect(normalized).toContain('on public.seo_llm_visibility (audit_contract_version, created_at desc)')
    expect(normalized).not.toMatch(/drop\s+table[^;]*seo_llm_visibility/)
  })
})
