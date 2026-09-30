#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'

const args = process.argv.slice(2)
const dirArg = args.indexOf('--dir')
const ROOT = dirArg >= 0 && args[dirArg + 1] ? path.resolve(args[dirArg + 1]) : path.resolve('.yqaa-kb-crawl')
const SUPABASE_URL = String(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/$/, '')
const SERVICE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_JWT || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()

if (!SUPABASE_URL || !SERVICE_KEY) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL and a service-role Supabase key are required')
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(path.join(ROOT, file), 'utf8'))
}

async function readJsonl(file) {
  const raw = await fs.readFile(path.join(ROOT, file), 'utf8')
  return raw.split(/\n+/).filter(Boolean).map((line) => JSON.parse(line))
}

function headers(prefer) {
  const out = {
    apikey: SERVICE_KEY,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
  if (SERVICE_KEY.startsWith('eyJ')) out.Authorization = `Bearer ${SERVICE_KEY}`
  if (prefer) out.Prefer = prefer
  return out
}

async function rest(resource, { method = 'GET', body, prefer } = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${resource}`, {
    method,
    headers: headers(prefer),
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 1600)
    throw new Error(`${method} ${resource} failed (${response.status}): ${detail}`)
  }
  const text = await response.text()
  return text ? JSON.parse(text) : null
}

function batches(items, size) {
  const out = []
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size))
  return out
}

function validateCoverage(manifest) {
  const thresholds = {
    main: 90,
    usa: 420,
    canada: 300,
    uk: 125,
    australia: 18,
    caseworks: 425,
    market: 330,
    support: 1,
    core: 6,
  }
  const problems = []
  for (const [site, min] of Object.entries(thresholds)) {
    const actual = Number(manifest?.coverage?.[site]?.sources || 0)
    if (actual < min) problems.push(`${site}: expected >= ${min} sources, got ${actual}`)
  }
  if (Number(manifest?.chunk_count || 0) < 20000) {
    problems.push(`chunk_count: expected >= 20000, got ${manifest?.chunk_count || 0}`)
  }
  if (problems.length) throw new Error(`YQAA KB coverage rejected:\n- ${problems.join('\n- ')}`)
}

const manifest = await readJson('manifest.json')
const sources = (await readJsonl('sources.jsonl')).map((row) => ({ ...row, ingestion_run_id: manifest.run_id }))
const chunks = (await readJsonl('chunks.jsonl')).map((row) => ({ ...row, ingestion_run_id: manifest.run_id }))
validateCoverage(manifest)

if (sources.length !== manifest.source_count || chunks.length !== manifest.chunk_count) {
  throw new Error('Manifest counts do not match crawl artifacts')
}

const runStart = sources.map((row) => row.fetched_at).filter(Boolean).sort()[0] || manifest.generated_at
const runRow = {
  run_id: manifest.run_id,
  started_at: runStart,
  status: 'running',
  source_count: sources.length,
  chunk_count: chunks.length,
  site_counts: Object.fromEntries(
    Object.entries(manifest.coverage || {}).map(([site, row]) => [site, { sources: row.sources, chunks: row.chunks }]),
  ),
  problems: [],
  metadata: { generated_at: manifest.generated_at, ingestion_version: 2, source: 'live-public-estate-plus-curated-core' },
}

await rest('yqaa_knowledge_ingestion_runs?on_conflict=run_id', {
  method: 'POST',
  body: [runRow],
  prefer: 'resolution=merge-duplicates,return=minimal',
})

try {
  for (const batch of batches(sources, 100)) {
    await rest('yqaa_knowledge_sources?on_conflict=source_key', {
      method: 'POST',
      body: batch,
      prefer: 'resolution=merge-duplicates,return=minimal',
    })
  }

  for (const sourceBatch of batches(sources, 80)) {
    const keys = sourceBatch.map((row) => `"${row.source_key.replaceAll('"', '')}"`).join(',')
    await rest(`yqaa_knowledge_chunks?source_key=in.(${encodeURIComponent(keys)})`, {
      method: 'DELETE',
      prefer: 'return=minimal',
    })
  }

  for (const batch of batches(chunks, 80)) {
    await rest('yqaa_knowledge_chunks?on_conflict=chunk_key', {
      method: 'POST',
      body: batch,
      prefer: 'resolution=merge-duplicates,return=minimal',
    })
  }

  const finalized = await rest('rpc/finalize_yqaa_knowledge_ingestion', {
    method: 'POST',
    body: { p_run_id: manifest.run_id },
    prefer: 'return=representation',
  })

  console.log(JSON.stringify({
    ok: true,
    run_id: manifest.run_id,
    sources: sources.length,
    chunks: chunks.length,
    coverage: runRow.site_counts,
    finalized,
  }, null, 2))
} catch (error) {
  await rest(`yqaa_knowledge_ingestion_runs?run_id=eq.${encodeURIComponent(manifest.run_id)}`, {
    method: 'PATCH',
    body: {
      status: 'failed',
      completed_at: new Date().toISOString(),
      problems: [{ message: error instanceof Error ? error.message.slice(0, 1500) : String(error).slice(0, 1500) }],
    },
    prefer: 'return=minimal',
  }).catch(() => null)
  throw error
}
