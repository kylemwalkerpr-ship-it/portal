import fs from 'node:fs'
import path from 'node:path'

const migrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20261013210000_yqaa_retrieval_performance.sql',
)

describe('YQAA retrieval performance migration', () => {
  const migration = fs.readFileSync(migrationPath, 'utf8')

  test('keeps the indexed FTS and trigram candidate branches equivalent to the legacy predicate', () => {
    expect(migration).toMatch(/c\.search_vector @@ q0\.strict_tsq/)
    expect(migration).toMatch(/c\.search_vector @@ q0\.broad_tsq/)
    expect(migration).toMatch(/c\.title % q0\.query_text[\s\S]*similarity\(coalesce\(c\.title,''\), q0\.query_text\) > 0\.08/)
    expect(migration).toMatch(/c\.section_title % q0\.query_text[\s\S]*similarity\(coalesce\(c\.section_title,''\), q0\.query_text\) > 0\.08/)
    expect(migration).toMatch(/set pg_trgm\.similarity_threshold = '0\.08'/)
    expect(migration).toMatch(/candidate_keys as materialized/)
  })

  test('preserves ranking, jurisdiction, active-source filtering, and per-source diversity', () => {
    for (const snippet of [
      'ts_rank_cd(c.search_vector, q0.strict_tsq, 32) * 18.0',
      'ts_rank_cd(c.search_vector, q0.broad_tsq, 32) * 7.0',
      'similarity(coalesce(c.title,\'\'), coalesce(q0.query_text,\'\')) * 4.0',
      'similarity(coalesce(c.section_title,\'\'), coalesce(q0.query_text,\'\')) * 2.5',
      "lower(coalesce(c.jurisdiction,'')) = lower(q0.jurisdiction_filter)",
      'where s.active',
      'partition by source_url',
      'where source_rank <= 2',
      'authority_tier desc, fetched_at desc',
    ]) expect(migration).toContain(snippet)
  })

  test('retains the RPC shape and service-role-only security boundary', () => {
    expect(migration).toMatch(/returns table \([\s\S]*chunk_key text,[\s\S]*score double precision\s*\)/)
    expect(migration).toMatch(/security definer[\s\S]*set search_path = public/)
    expect(migration).toMatch(/revoke all on function public\.search_yqaa_knowledge\(text,text,text,integer\)[\s\S]*from public, anon, authenticated/)
    expect(migration).toMatch(/grant execute on function public\.search_yqaa_knowledge\(text,text,text,integer\)[\s\S]*to service_role/)
  })
})
