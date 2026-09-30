import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(__dirname, '..')
const sync = readFileSync(join(root, 'scripts/sync-yqaa-knowledge.mjs'), 'utf8')
const migration = readFileSync(
  join(root, 'supabase/migrations/20260930074207_yqaa_knowledge_ingestion_finalize.sql'),
  'utf8',
)

describe('YQAA atomic ingestion contract', () => {
  test('uploads run-tagged rows only to staging before finalization', () => {
    expect(sync).toMatch(/sources\.jsonl'\)\)\.map\(\(row\) => \(\{ \.\.\.row, ingestion_run_id: manifest\.run_id \}\)\)/)
    expect(sync).toMatch(/chunks\.jsonl'\)\)\.map\(\(row\) => \(\{ \.\.\.row, ingestion_run_id: manifest\.run_id \}\)\)/)
    expect(sync).toContain('yqaa_knowledge_sources_staging?on_conflict=ingestion_run_id,source_key')
    expect(sync).toContain('yqaa_knowledge_chunks_staging?on_conflict=ingestion_run_id,chunk_key')
    expect(sync).toContain("rest('rpc/finalize_yqaa_knowledge_ingestion'")
    expect(sync).not.toMatch(/rest\('yqaa_knowledge_(?:sources|chunks)\?/)
    expect(sync).not.toMatch(/method: 'DELETE'/)
  })

  test('finalizer counts, replaces, and cleans up the same run in one transaction', () => {
    expect(migration).not.toContain('yqaa_knowledge_single_running_ingestion_idx')
    expect(migration).not.toMatch(/create\s+unique\s+index[^;]*on\s+public\.yqaa_knowledge_ingestion_runs[^;]*where\s+status\s*=\s*'running'/i)
    expect(migration).toContain("perform pg_advisory_xact_lock(hashtextextended('yqaa_knowledge_ingestion', 0));")
    expect(migration).toMatch(/create table if not exists public\.yqaa_knowledge_sources_staging \(\s*ingestion_run_id text not null/)
    expect(migration).toMatch(/create table if not exists public\.yqaa_knowledge_chunks_staging \(\s*ingestion_run_id text not null/)
    expect(migration).toContain('foreign key (ingestion_run_id, source_key)')
    expect(migration).toContain('references public.yqaa_knowledge_sources_staging(ingestion_run_id, source_key)')
    for (const table of ['sources', 'chunks']) {
      expect(migration).toMatch(new RegExp(`from public\\.yqaa_knowledge_${table}_staging\\s+where ingestion_run_id = p_run_id`))
      expect(migration).toMatch(new RegExp(`delete from public\\.yqaa_knowledge_${table}_staging\\s+where ingestion_run_id = p_run_id`))
    }
    expect(migration).toMatch(/delete from public\.yqaa_knowledge_chunks;\s*delete from public\.yqaa_knowledge_sources;/)
    expect(migration).toContain('where ingestion_run_id = p_run_id')
    expect(migration).toContain("status = 'completed'")
    expect(migration).toContain('grant execute on function public.finalize_yqaa_knowledge_ingestion(text)\n  to service_role;')
  })

  test('newer eligible runs supersede older finalizers before any live replacement', () => {
    const lock = migration.indexOf("perform pg_advisory_xact_lock(hashtextextended('yqaa_knowledge_ingestion', 0));")
    const newerLookup = migration.indexOf('select newer.run_id')
    const liveDelete = migration.indexOf('delete from public.yqaa_knowledge_chunks;')
    const liveSourcesDelete = migration.indexOf('delete from public.yqaa_knowledge_sources;')
    const newerPredicate = migration.slice(newerLookup, liveDelete)

    expect(lock).toBeGreaterThanOrEqual(0)
    expect(newerLookup).toBeGreaterThan(lock)
    expect(liveDelete).toBeGreaterThan(newerLookup)
    expect(liveSourcesDelete).toBeGreaterThan(liveDelete)
    expect(newerPredicate).toMatch(/\(newer\.started_at, newer\.run_id\) > \(v_started_at, p_run_id\)/)
    expect(newerPredicate).toMatch(/newer\.status = 'completed'\s+or\s+\(\s*newer\.status = 'running'/)
    expect(newerPredicate).toMatch(/coalesce\(newer\.source_count, 0\) > 0/)
    expect(newerPredicate).toMatch(/coalesce\(newer\.chunk_count, 0\) > 0/)
    expect(newerPredicate).toMatch(/from public\.yqaa_knowledge_sources_staging as staged_sources\s+where staged_sources\.ingestion_run_id = newer\.run_id\s*\) = newer\.source_count/)
    expect(newerPredicate).toMatch(/from public\.yqaa_knowledge_chunks_staging as staged_chunks\s+where staged_chunks\.ingestion_run_id = newer\.run_id\s*\) = newer\.chunk_count/)
    expect(migration).toContain("'superseded_by_newer_run'")
  })

  test('the rejected run receives a bounded problem and only its staging is cleaned', () => {
    const rejection = migration.match(/if found then([\s\S]*?)\n  end if;/)?.[1] ?? ''

    expect(rejection).toContain("status = 'rejected'")
    expect(rejection).toContain("problems = jsonb_build_array(jsonb_build_object(")
    expect(rejection).toContain("'run_id', left(v_newer_run_id, 200)")
    expect(rejection).toMatch(/delete from public\.yqaa_knowledge_chunks_staging\s+where ingestion_run_id = p_run_id/)
    expect(rejection).toMatch(/delete from public\.yqaa_knowledge_sources_staging\s+where ingestion_run_id = p_run_id/)
    expect(rejection).not.toMatch(/delete from public\.yqaa_knowledge_(?:chunks|sources);/)
  })

  test('finalizer serialization is acquired before run reads and the newer-run decision', () => {
    const lock = migration.indexOf("perform pg_advisory_xact_lock(hashtextextended('yqaa_knowledge_ingestion', 0));")
    const currentRunRead = migration.indexOf('from public.yqaa_knowledge_ingestion_runs\n   where run_id = p_run_id')
    const newerRunRead = migration.indexOf('select newer.run_id')

    expect(lock).toBeGreaterThanOrEqual(0)
    expect(currentRunRead).toBeGreaterThan(lock)
    expect(newerRunRead).toBeGreaterThan(lock)
  })
})
