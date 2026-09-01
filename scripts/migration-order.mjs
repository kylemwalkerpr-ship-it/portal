#!/usr/bin/env node
/**
 * Single source of truth for Supabase migration apply order.
 *
 * The apply workflow used to carry a hardcoded 32-file list. Every new
 * migration had to be added there by hand, and when that was forgotten the
 * file was silently never applied — that is how `20260815_keyword_partition.sql`
 * went missing in production while its columns were assumed to exist.
 *
 * A plain `migrations/*.sql | sort` cannot replace that list: the legacy files
 * are not timestamp-prefixed, so `content_jobs.sql` — which CREATEs the base
 * table — sorts *after* every `2026*` file that ALTERs it. Ordering is derived
 * in three tiers instead:
 *
 *   1. BASE      pinned, explicit. Creates the core tables everything alters.
 *   2. (derived) every `<timestamp>_*.sql`, sorted — filename dates are
 *                already chronological, so new migrations self-register.
 *   3. INDEXES   pinned last. Pure index/analyze passes, safe to run after
 *                all DDL and cheaper once the columns exist.
 *
 * Anything that matches no tier is a hard error, so a file can never be
 * silently skipped again — the failure mode this replaces.
 *
 * Usage:
 *   node scripts/migration-order.mjs            # newline-separated paths
 *   node scripts/migration-order.mjs --check    # verify coverage only
 *   node scripts/migration-order.mjs --json     # { order, base, timestamped, indexes }
 *   import { migrationOrder } from './migration-order.mjs'
 */
import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const MIGRATIONS_DIR = join(__dirname, '..', 'supabase', 'migrations')

/**
 * Tier 1 — base schema, order significant.
 * `content_jobs.sql` must lead: it creates the table that ~20 later
 * migrations ALTER. The rest create tables or add the early columns the
 * timestamped series assumes.
 */
export const BASE_ORDER = [
  'content_jobs.sql',
  'gsc_tokens.sql',
  'seo_factory_columns.sql',
  'content_jobs_event_log.sql',
  'live_verify_columns.sql',
  'mission_log.sql',
  'war_room_daily_runs.sql',
  // Creates ai_provider_keys + ai_settings. 20260811_table_guarantees.sql
  // re-creates both with IF NOT EXISTS, so this must lead, not follow.
  'ai_provider_keys.sql',
]

/** Tier 3 — index-only passes, applied after all DDL. */
export const INDEX_ORDER = [
  'pg_trgm_indexes.sql',
  'additional_fts_indexes.sql',
  'application_fts_indexes.sql',
  'content_jobs_fts_index.sql',
]

/** A timestamped migration self-registers: `20260831_keyword_provenance.sql`. */
export const TIMESTAMPED_RE = /^\d{8}_[A-Za-z0-9_]+\.sql$/

/**
 * Resolve the full ordered list.
 * @throws if a pinned file is missing or a present file matches no tier.
 */
export function migrationOrder({ dir = MIGRATIONS_DIR } = {}) {
  const present = readdirSync(dir).filter((f) => f.endsWith('.sql'))
  const presentSet = new Set(present)

  const missing = [...BASE_ORDER, ...INDEX_ORDER].filter((f) => !presentSet.has(f))
  if (missing.length) {
    throw new Error(
      `migration-order: pinned migration(s) not found in ${dir}: ${missing.join(', ')}\n` +
        'Remove them from BASE_ORDER / INDEX_ORDER, or restore the files.',
    )
  }

  const pinned = new Set([...BASE_ORDER, ...INDEX_ORDER])
  const timestamped = present
    .filter((f) => !pinned.has(f) && TIMESTAMPED_RE.test(f))
    .sort()

  // Guard the exact failure this module exists to prevent: an untracked file
  // that no tier claims would otherwise vanish from every apply.
  const orphans = present
    .filter((f) => !pinned.has(f) && !TIMESTAMPED_RE.test(f))
    .sort()
  if (orphans.length) {
    throw new Error(
      `migration-order: unclaimed migration(s): ${orphans.join(', ')}\n` +
        'Every migration must either be pinned in BASE_ORDER / INDEX_ORDER or be\n' +
        'named <YYYYMMDD>_<name>.sql so it self-registers. Otherwise it is never applied.',
    )
  }

  return [...BASE_ORDER, ...timestamped, ...INDEX_ORDER]
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const order = migrationOrder()
    if (process.argv.includes('--check')) {
      console.error(`migration-order: ${order.length} migrations, all accounted for.`)
    } else if (process.argv.includes('--json')) {
      const pinned = new Set([...BASE_ORDER, ...INDEX_ORDER])
      console.log(
        JSON.stringify({
          dir: MIGRATIONS_DIR,
          order,
          base: BASE_ORDER,
          timestamped: order.filter((f) => !pinned.has(f)),
          indexes: INDEX_ORDER,
          timestampedPattern: TIMESTAMPED_RE.source,
        }),
      )
    } else {
      for (const f of order) console.log(`supabase/migrations/${f}`)
    }
  } catch (err) {
    console.error(String(err instanceof Error ? err.message : err))
    process.exit(1)
  }
}
