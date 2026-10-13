import fs from 'node:fs'
import path from 'node:path'

const migrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20261013210000_yqaa_retrieval_performance.sql',
)
const successorMigrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20261013220000_yqaa_retrieval_late_body.sql',
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


describe('YQAA late-body successor migration', () => {
  const activeMigration = fs.readFileSync(migrationPath, 'utf8')
  const successorMigration = fs.readFileSync(successorMigrationPath, 'utf8')

  test('preserves the exact score expression and source diversification order', () => {
    const scoreExpression = (sql: string) => sql.match(/      \(\s*[\s\S]*?\n      \) as score/)?.[0]
    expect(scoreExpression(successorMigration)).toBe(scoreExpression(activeMigration))
    expect(successorMigration).toContain('partition by source_url')
    expect(successorMigration).toContain('order by score desc, authority_tier desc, fetched_at desc, chunk_key')
    expect(successorMigration).toContain('where source_rank <= 2')
  })

  test('materializes bounded keys before fetching the body and other output columns', () => {
    const scored = successorMigration.match(/  scored as \(([\s\S]*?)\n  \),\n  diversified as/)?.[1] || ''
    expect(scored).not.toContain('c.body')
    expect(successorMigration).toMatch(/selected_keys as materialized \([\s\S]*?limit \(select result_limit from q0\)\s*\)\s*select[\s\S]*?c.body/)
  })
})
