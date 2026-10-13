import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(__dirname, '..')
const migrationPath = join(
  root,
  'supabase/migrations/20261014100000_yqaa_incremental_knowledge_finalize.sql',
)
const integrationPath = join(root, 'scripts/test-yqaa-incremental-knowledge-finalizer.mjs')

describe('incremental YQAA knowledge finalizer contract', () => {
  test('uses a successor function without broad corpus replacement', () => {
    const migration = readFileSync(migrationPath, 'utf8')

    expect(migration).toContain('create or replace function public.finalize_yqaa_knowledge_ingestion(p_run_id text)')
    expect(migration).toContain("pg_advisory_xact_lock(hashtextextended('yqaa_knowledge_ingestion', 0))")
    expect(migration).toContain('select newer.run_id')
    expect(migration).toContain("'superseded_by_newer_run'")
    expect(migration).toContain('on conflict (source_key) do update')
    expect(migration).toContain('on conflict (chunk_key) do update')
    expect(migration).toMatch(/and not exists\s*\(\s*select 1[\s\S]*?from public\.yqaa_knowledge_chunks as live[\s\S]*?is not distinct from\s*\([\s\S]*?public\.yqaa_knowledge_chunks_staging\.metadata[\s\S]*?\)\s*\)/i)
    expect(migration).toMatch(/where\s*\(\s*public\.yqaa_knowledge_chunks\.source_key[\s\S]*?\)\s+is distinct from\s+\(/i)
    expect(migration).toContain('public.yqaa_knowledge_chunks_staging.body')
    expect(migration).toContain('public.yqaa_knowledge_chunks_staging.metadata')
    expect(migration).not.toMatch(/md5\([^)]*body|hash.*only/i)
    expect(migration).not.toMatch(/delete from public\.yqaa_knowledge_chunks where true/i)
    expect(migration).not.toMatch(/delete from public\.yqaa_knowledge_sources where true/i)
    expect(migration).toContain('revoke all on function public.finalize_yqaa_knowledge_ingestion(text)')
    expect(migration).toMatch(/grant execute on function public\.finalize_yqaa_knowledge_ingestion\(text\)[\s\S]*?to service_role/i)
  })

  test('keeps unchanged chunk provenance and computes run coverage from the verified snapshot', () => {
    const migration = readFileSync(migrationPath, 'utf8')

    expect(migration).toContain('fetched_at = excluded.fetched_at')
    expect(migration).toContain('ingestion_run_id = excluded.ingestion_run_id')
    expect(migration).toMatch(/v_source_count[\s\S]*?from public\.yqaa_knowledge_sources[\s\S]*?where ingestion_run_id = p_run_id/i)
    expect(migration).toMatch(/v_chunk_count[\s\S]*?join public\.yqaa_knowledge_chunks[\s\S]*?where sources\.ingestion_run_id = p_run_id/i)
    expect(migration).toMatch(/jsonb_object_agg\(\s*site_chunks\.site,\s*site_chunks\.sources/i)
  })

  test('returns the latest verified source timestamp to freshness consumers', () => {
    const migration = readFileSync(migrationPath, 'utf8')
    const search = migration.slice(migration.indexOf('create or replace function public.search_yqaa_knowledge'))

    expect(search).toContain('create or replace function public.search_yqaa_knowledge')
    expect(search).toMatch(/select\s+c\.chunk_key[\s\S]*?s\.fetched_at[\s\S]*?join public\.yqaa_knowledge_sources s on s\.source_key = c\.source_key/i)
    expect(search).toContain('c.fetched_at')
    expect(search).toContain('where s.active')
  })

  test('provides an isolated loopback PostgreSQL regression script for indexed no-op updates and atomicity', () => {
    const script = readFileSync(integrationPath, 'utf8')

    expect(script).toContain('127.0.0.1:55432/yqaa_retrieval_test')
    expect(script).toMatch(/localhost.*127\.0\.0\.1.*::1/)
    expect(script).toMatch(/ctid/i)
    expect(script).toMatch(/trigger/i)
    expect(script).toMatch(/25000/)
    expect(script).toMatch(/rollback/i)
    expect(script).toMatch(/superseded_by_newer_run/)
    expect(script).toMatch(/service_role/)
    expect(script).toMatch(/search_yqaa_knowledge/)
    expect(script).toMatch(/freshness probe/)
  })
})
