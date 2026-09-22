/**
 * P9 external-authority truth — DB contract, engine truth and UI wording.
 *
 * Locks the additive migration (append-only evidence table, durable won proof
 * pointers + DB truth constraint, future-only outreach constraints), the
 * engine rules (sent-like records carry sent_at; `won` is refused on the
 * generic outreach route; wins are counted from proof, not labels), the
 * relabelled internal priority score, and the P0–P8 controls this change must
 * leave untouched.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

jest.mock('@/lib/supabase', () => ({ createSupabaseAdminClient: jest.fn() }))
jest.mock('@/lib/portalAuth', () => ({ requireAdminUser: jest.fn() }))

import { NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { requireAdminUser } from '@/lib/portalAuth'
import {
  SENDABLE_TARGET_STATES,
  TARGET_STATUS_AFTER_SENT,
  isSentLikeOutreachStatus,
  isVerifiedWin,
  recordOutreach,
  runBacklinkReport,
  SENT_LIKE_OUTREACH_STATUSES,
} from '@/lib/seoEngine/backlinkEngine'
import {
  exactAnchorHrefMatch,
  stripNonRenderedPayloads,
} from '@/lib/seoFactory/interlinkVerification'
import {
  BROAD_CREATE_UNLOCK_ENV,
  isBroadCreateUnlocked,
  isBroadNetNewCreate,
} from '@/lib/seoFactory/broadCreateFreeze'
import { createP9FakeDb } from './helpers/p9BacklinkFakeDb'
import { POST as outreachPOST } from '@/app/api/seo-engine/backlink/outreach/route'

const ROOT = join(__dirname, '..')
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations')
const MIGRATION_NAME = '20260921120000_p9_external_authority_truth.sql'
const MIGRATION_PATH = join(MIGRATIONS_DIR, MIGRATION_NAME)
const PREVIOUS_HEAD = '20260920130000_seo_interlinks_verification_truth.sql'
const COMMAND_CENTER = join(ROOT, 'components', 'design', 'admin-command-center.tsx')
const CONTENT_STUDIO = join(ROOT, 'components', 'design', 'admin-content-studio.tsx')

const read = (path: string) => readFileSync(path, 'utf8')
const sql = () => read(MIGRATION_PATH)

/** Comments stripped, dollar-quoted DO bodies kept (existence guards visible). */
function withoutComments(source = sql()): string {
  return source.replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ')
}

/** Comments, string literals and dollar-quoted bodies stripped. */
function ddlOnly(source = sql()): string {
  return source
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/\$[A-Za-z_][A-Za-z0-9_]*\$[\s\S]*?\$[A-Za-z_][A-Za-z0-9_]*\$/g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/'(?:[^']|'')*'/g, "''")
}

/** Comments stripped, whitespace collapsed, case preserved. */
const squish = () => withoutComments().replace(/\s+/g, ' ')
const flat = () => squish().toLowerCase()

const orderMeta = JSON.parse(
  execFileSync('node', [join(ROOT, 'scripts', 'migration-order.mjs'), '--json'], { encoding: 'utf8' }),
) as { order: string[]; timestamped: string[]; indexes: string[] }

describe('A) migration self-registration and scope', () => {
  it('is the single additive 14-digit P9 migration', () => {
    expect(existsSync(MIGRATION_PATH)).toBe(true)
    const matching = readdirSync(MIGRATIONS_DIR).filter((name) => /^\d{14}_p9_external_authority_truth\.sql$/.test(name))
    expect(matching).toEqual([MIGRATION_NAME])
  })

  it('self-registers after the P6 head and keeps timestamped order chronological', () => {
    expect(orderMeta.order).toContain(MIGRATION_NAME)
    expect(orderMeta.timestamped).toContain(MIGRATION_NAME)
    expect(orderMeta.order.indexOf(MIGRATION_NAME)).toBeGreaterThan(orderMeta.order.indexOf(PREVIOUS_HEAD))
    expect(orderMeta.timestamped).toEqual([...orderMeta.timestamped].sort())
    expect(orderMeta.indexes).toEqual(['pg_trgm_indexes.sql', 'additional_fts_indexes.sql', 'application_fts_indexes.sql', 'content_jobs_fts_index.sql'])
  })

  it('passes the whole-estate ledger policy (naming, transaction safety, trailing semicolon)', () => {
    expect(() =>
      execFileSync('node', [join(ROOT, 'scripts', 'migration-ledger-policy.mjs'), '--check'], { encoding: 'utf8' }),
    ).not.toThrow()
    expect(sql().trimEnd().endsWith(';')).toBe(true)
    expect(flat()).toContain("notify pgrst, 'reload schema'")
  })

  it('rewrites NO historical row: no DML at all in the migration', () => {
    const ddl = ddlOnly().toLowerCase()
    expect(ddl).not.toMatch(/\bupdate\s+public\./)
    expect(ddl).not.toMatch(/\bupdate\s+[a-z_"]+\s+set\b/)
    expect(ddl).not.toMatch(/\bdelete\s+from\b/)
    expect(ddl).not.toMatch(/\binsert\s+into\b/)
    expect(ddl).not.toMatch(/\btruncate\b/)
    // The legacy blog.google outreach row is never named or reconciled by any
    // statement (it is only referenced in prose explaining why history stands).
    expect(ddl).not.toContain('blog.google')
    expect(ddl).not.toContain('backfill')
    expect(sql()).toContain('blog.google')
  })

  it('touches only the external-authority objects (P0–P8 controls stay frozen)', () => {
    const body = sql()
    for (const unrelated of ['seo_interlinks', 'seo_cannibal_decisions', 'content_jobs', 'anchor_ledger', 'support_audit_log']) {
      expect(body).not.toContain(unrelated)
    }
    const named = new Set([...body.matchAll(/public\.([a-z0-9_]+)/gi)].map((match) => match[1].toLowerCase()))
    expect([...named].sort()).toEqual(
      [
        'seo_backlink_dashboard',
        'seo_backlink_outreach',
        'seo_backlink_targets',
        'seo_backlink_verifications',
        'seo_backlink_verifications_append_only',
        'seo_backlink_targets_won_guard',
      ].sort(),
    )
  })
})

describe('B) append-only verification evidence table', () => {
  it('creates the table additively with every required evidence field', () => {
    const body = flat()
    expect(body).toContain('create table if not exists public.seo_backlink_verifications')
    for (const column of [
      'target_id uuid not null references public.seo_backlink_targets(id)',
      'outreach_id uuid references public.seo_backlink_outreach(id)',
      'backlink_url text not null',
      'target_url text not null',
      'source_domain text not null',
      'source_http_status integer',
      'source_final_url text',
      'link_present boolean not null',
      'observed_href text',
      'anchor_text text',
      'anchor_context text',
      'rel_attributes text[]',
      'page_canonical_url text',
      'page_indexable boolean',
      'verdict text not null',
      'verified_at timestamptz not null',
      'method text not null',
      'verifier text not null',
      'evidence jsonb not null',
    ]) {
      expect(body).toContain(column)
    }
  })

  it('closes the verdict and method vocabularies', () => {
    const body = flat()
    expect(body).toContain("verdict in ('verified', 'absent', 'unavailable')")
    expect(body).toContain("method in ('live_http_fetch')")
  })

  it('refuses UPDATE and DELETE outright (append-only history)', () => {
    const body = flat()
    expect(body).toContain('create or replace function public.seo_backlink_verifications_append_only()')
    expect(body).toContain('raise exception')
    expect(body).toContain('before update or delete on public.seo_backlink_verifications')
    expect(body).toContain('drop trigger if exists seo_backlink_verifications_no_update')
    // A pinned empty search_path removes the mutable-search_path advisor finding.
    expect(body).toContain('alter function public.seo_backlink_verifications_append_only() set search_path = \'\'')
  })

  it('cannot store a positive link without the live observation that proved it', () => {
    const body = flat()
    expect(body).toContain('seo_backlink_verifications_positive_proof_check')
    expect(body).toContain("((verdict = 'verified') = link_present)")
    expect(body).toContain("observed_href is not null")
    expect(body).toContain('source_final_url is not null')
    expect(body).toContain("nullif(btrim(source_final_url), '') is not null")
    expect(body).toContain('source_http_status between 200 and 399')
  })

  it('is service-role-only (P1/P6 least privilege)', () => {
    const body = flat()
    expect(body).toContain('alter table public.seo_backlink_verifications enable row level security')
    expect(body).toContain('drop policy if exists "service role full access" on public.seo_backlink_verifications')
    expect(body).toContain(
      'create policy "service role full access" on public.seo_backlink_verifications for all to service_role using (true) with check (true)',
    )
    expect(body).toContain('revoke all privileges on table public.seo_backlink_verifications from public, anon, authenticated')
    expect(body).toContain('grant all privileges on table public.seo_backlink_verifications to service_role')
    // No anon/authenticated policy is created anywhere in this migration.
    expect(withoutComments()).not.toMatch(/create\s+policy[^;]*to\s+(public|anon|authenticated)/i)
    expect(flat()).toContain('from pg_policies')
  })
})

describe('C) durable won proof pointers + DB truth constraint', () => {
  it('adds the pointers additively with provenance for the internal score', () => {
    const body = flat()
    expect(body).toContain('add column if not exists won_verified_at timestamptz null')
    expect(body).toContain('add column if not exists won_verification_id uuid null')
    expect(body).toContain('references public.seo_backlink_verifications(id)')
    expect(body).toContain("add column if not exists authority_score_basis text not null default 'legacy_internal'")
    expect(body).toContain('comment on column public.seo_backlink_targets.authority_score_basis is')
    expect(body).toMatch(/not dr, da, ahrefs, moz or any third-party metric/)
  })

  it('persists the strategic YouSafe destination on the target, additively and nullable', () => {
    const body = flat()
    expect(body).toContain('add column if not exists destination_url text null')
    expect(body).toContain('comment on column public.seo_backlink_targets.destination_url is')
    // Distinct from the third-party placement surface, never fabricated.
    expect(body).toMatch(/distinct from target_url, which is the third-party placement surface/)
    expect(body).toMatch(/null means no destination has been recorded/)
    expect(body).toMatch(/never backfilled/)
    expect(body).toContain('seo_backlink_targets_destination_url_check')
    expect(body).toContain("check (destination_url is null or destination_url ~* '^https://[^[:space:]]+$')")
    // A future-write contract only: no historical row is rewritten, ever.
    const ddl = ddlOnly().toLowerCase()
    expect(ddl).not.toMatch(/\bupdate\b[^;]*\bset\b/)
    expect(ddl).not.toMatch(/\binsert\s+into\b/)
  })

  it('makes status=won impossible without won_at, a real backlink URL and both pointers', () => {
    const body = squish()
    expect(body).toContain('seo_backlink_targets_won_requires_verification')
    expect(body).toMatch(/from pg_constraint where conname = 'seo_backlink_targets_won_requires_verification'/)
    const start = body.indexOf('add constraint seo_backlink_targets_won_requires_verification')
    const block = body.slice(start, body.indexOf('create or replace function public.seo_backlink_targets_won_guard', start))
    expect(block).toContain("status <> 'won'")
    expect(block).toContain('won_at is not null')
    expect(block).toContain("btrim(won_backlink_url) <> ''")
    expect(block).toContain("won_backlink_url ~* '^https?://'")
    expect(block).toContain('won_verified_at is not null')
    expect(block).toContain('won_verification_id is not null')
    // Validated, never NOT VALID: production has zero won rows, so a violating
    // row must fail rather than escape enforcement.
    expect(block.toLowerCase()).not.toContain('not valid')
  })

  it('re-proves the pointer is a POSITIVE verification of THIS target', () => {
    const body = squish()
    expect(body).toContain('create or replace function public.seo_backlink_targets_won_guard()')
    expect(body).toContain("set search_path = ''")
    expect(body).toContain('drop trigger if exists seo_backlink_targets_won_guard on public.seo_backlink_targets')
    expect(body).toContain('before insert or update on public.seo_backlink_targets')
    expect(body).toContain('if new.status is distinct from \'won\' then')
    expect(body).toContain('belongs to a different target')
    expect(body).toContain("verified.verdict is distinct from 'verified' or verified.link_present is not true")
    expect(body).toContain('requires an observed final source URL from live verification')
    expect(body).toContain('won_backlink_url must equal the observed final source URL that carried the verified backlink')
    // The proof must have been taken against THIS row's persisted destination.
    expect(body).toContain('v.backlink_url, v.source_final_url, v.target_url, v.evidence')
    expect(body).toContain('requires a persisted destination_url on the target')
    expect(body).toContain("if verified.target_url is distinct from new.destination_url then")
    // A real anchor to a stale/redirecting owned URL is evidence, not a win.
    expect(body).toContain("verified.evidence #>> '{destinationLive,current}'")
    expect(body).toContain('requires the persisted destination_url to be live and current in verification evidence')
  })

  it('closes the authority_score provenance vocabulary', () => {
    expect(flat()).toContain(
      "check (authority_score_basis in ('legacy_internal', 'internal_priority'))",
    )
  })
})

describe('D) future outreach truth, history preserved', () => {
  it('requires sent_at for a sent-like status but is NOT VALID so history stands', () => {
    const body = flat()
    expect(body).toContain('seo_backlink_outreach_sent_requires_sent_at')
    expect(body).toContain("check (status not in ('sent', 'follow_up_sent') or sent_at is not null) not valid")
    expect(body).toContain('comment on constraint seo_backlink_outreach_sent_requires_sent_at')
    expect(body).toMatch(/legacy rows with null sent_at are preserved/)
  })

  it('refuses a won claim on an outreach row for future writes, NOT VALID for history', () => {
    const body = flat()
    expect(body).toContain('seo_backlink_outreach_won_requires_verified_backlink')
    expect(body).toContain('check (status <> \'won\') not valid')
  })

  it('does not rewrite, delete or backfill a single outreach row', () => {
    expect(squish()).toMatch(/alter table public\.seo_backlink_outreach add constraint/)
    const ddl = ddlOnly().toLowerCase()
    expect(ddl).not.toMatch(/\bupdate\b[^;]*\bset\b/)
    expect(ddl).not.toMatch(/\bdelete\s+from\b/)
    expect(ddl).not.toMatch(/\binsert\s+into\b/)
  })
})

describe('E) dashboard exposes proof, not labels', () => {
  it('counts a win only when the durable live-proof pointers exist', () => {
    const body = flat()
    expect(body).toContain('create or replace view public.seo_backlink_dashboard as')
    const start = body.indexOf('create or replace view public.seo_backlink_dashboard')
    const view = body.slice(start, body.indexOf('comment on view public.seo_backlink_dashboard', start))
    expect(view).toContain('when t.won_verified_at is not null and t.won_verification_id is not null then 1')
    expect(view).not.toContain("o.status = 'won'")
    for (const field of [
      't.authority_score_basis',
      't.won_verified_at',
      't.won_verification_id',
      't.destination_url',
      'as verification_count',
      'as last_verified_at',
      'as last_verdict',
      'as last_link_present',
    ]) {
      expect(view).toContain(field)
    }
  })

  it('keeps the view invoker-safe and service-role-only after the replacement', () => {
    const body = flat()
    expect(body).toContain('alter view public.seo_backlink_dashboard set (security_invoker = true)')
    expect(body).toContain('revoke all privileges on table public.seo_backlink_dashboard from public, anon, authenticated')
    expect(body).toContain('grant select on table public.seo_backlink_dashboard to service_role')
  })
})

describe('F) outreach write truth (engine)', () => {
  const createSupabaseAdminClientMock = jest.mocked(createSupabaseAdminClient)

  function installDb(rows: Array<Record<string, unknown>> = []) {
    const db = createP9FakeDb({ seo_backlink_targets: rows, seo_backlink_outreach: [] })
    createSupabaseAdminClientMock.mockReturnValue(db.client as never)
    return db
  }

  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('stamps a sent-like record with sent_at at the actual record time', async () => {
    const db = installDb([{ id: 'target-1', domain: 'ilw.com', status: 'sent' }])
    const outcome = await recordOutreach({
      target_id: 'target-1',
      message_body: 'Hello',
      status: 'sent',
      operator_id: 'admin@portal',
    })
    expect(outcome.ok).toBe(true)
    const inserted = db.insertsFor('seo_backlink_outreach')[0].rows[0]
    expect(inserted.status).toBe('sent')
    expect(typeof inserted.sent_at).toBe('string')
    expect(inserted.sent_at).toBe(inserted.drafted_at)
    expect(Number.isFinite(Date.parse(String(inserted.sent_at)))).toBe(true)
    expect(outcome.outreach?.sent_at).toBe(inserted.sent_at)
  })

  it('leaves sent_at null for a non-sent record and classifies sent-like states', async () => {
    const db = installDb([{ id: 'target-1', domain: 'ilw.com', status: 'identified' }])
    await recordOutreach({ target_id: 'target-1', message_body: 'Hello', status: 'drafted' })
    expect(db.insertsFor('seo_backlink_outreach')[0].rows[0].sent_at).toBeNull()
    expect(isSentLikeOutreachStatus('sent')).toBe(true)
    expect(isSentLikeOutreachStatus('follow_up_sent')).toBe(true)
    expect(isSentLikeOutreachStatus('responded')).toBe(false)
    expect(isSentLikeOutreachStatus(null)).toBe(false)
    expect([...SENT_LIKE_OUTREACH_STATUSES]).toEqual(['sent', 'follow_up_sent'])
  })

  it('refuses a won outreach state and writes nothing at all', async () => {
    const db = installDb([{ id: 'target-1', domain: 'ilw.com', status: 'sent' }])
    const outcome = await recordOutreach({ target_id: 'target-1', message_body: 'Hello', status: 'won' })
    expect(outcome.ok).toBe(false)
    expect(outcome.code).toBe('won_requires_live_verification')
    expect(outcome.error).toMatch(/live backlink verification/)
    expect(db.insertsFor('seo_backlink_outreach')).toHaveLength(0)
    expect(db.writes).toHaveLength(0)
  })

  it('never rewrites an outreach row (legacy sent-with-null-sent_at stays untouched)', async () => {
    const legacy = {
      id: 'legacy-1',
      target_id: 'target-1',
      status: 'sent',
      sent_at: null,
      drafted_at: '2026-08-13T00:00:00.000Z',
      message_body: 'Historical outreach',
    }
    const db = createP9FakeDb({ seo_backlink_targets: [{ id: 'target-1', domain: 'blog.google' }], seo_backlink_outreach: [legacy] })
    createSupabaseAdminClientMock.mockReturnValue(db.client as never)
    await recordOutreach({ target_id: 'target-1', message_body: 'New draft', status: 'drafted' })
    expect(db.updatesFor('seo_backlink_outreach')).toHaveLength(0)
    expect(db.rows('seo_backlink_outreach')[0]).toMatchObject({ status: 'sent', sent_at: null })
  })

  it('advances the parent target to a non-won awaiting state after a real send', async () => {
    const db = installDb([{ id: 'target-1', domain: 'ilw.com', status: 'qualified' }])
    const outcome = await recordOutreach({ target_id: 'target-1', message_body: 'Hello', status: 'sent' })
    expect(outcome.ok).toBe(true)

    const updates = db.updatesFor('seo_backlink_targets')
    expect(updates).toHaveLength(1)
    expect(updates[0].patch).toMatchObject({ status: TARGET_STATUS_AFTER_SENT })
    expect(updates[0].patch).not.toHaveProperty('won_at')
    expect(updates[0].patch).not.toHaveProperty('won_verified_at')
    expect(updates[0].patch).not.toHaveProperty('won_verification_id')
    // The state move is fenced to pre-reply states, never a blind overwrite.
    expect(updates[0].filters).toEqual([
      { op: 'eq', column: 'id', value: 'target-1' },
      { op: 'in', column: 'status', value: [...SENDABLE_TARGET_STATES] },
    ])
    expect(db.rows('seo_backlink_targets')[0]).toMatchObject({ status: 'awaiting_reply' })
    expect(JSON.stringify(updates[0].patch)).not.toContain('won')
  })

  it('never drags a later or terminal target state backwards on a send', async () => {
    for (const status of ['won', 'lost', 'skipped', 'responded']) {
      jest.clearAllMocks()
      jest.spyOn(console, 'warn').mockImplementation(() => {})
      const db = installDb([{ id: 'target-1', domain: 'ilw.com', status }])
      await recordOutreach({ target_id: 'target-1', message_body: 'Hello', status: 'follow_up_sent' })
      // The fenced update matches no row: the later state stands.
      const updates = db.updatesFor('seo_backlink_targets')
      expect(updates).toHaveLength(1)
      expect(updates[0].rows).toHaveLength(0)
      expect(db.rows('seo_backlink_targets')[0]).toMatchObject({ status })
    }
  })

  it('leaves the target state alone for a non-sent touch and only bumps last_touched_at', async () => {
    const db = installDb([{ id: 'target-1', domain: 'ilw.com', status: 'qualified' }])
    await recordOutreach({ target_id: 'target-1', message_body: 'Draft', status: 'drafted' })
    const updates = db.updatesFor('seo_backlink_targets')
    expect(updates).toHaveLength(1)
    expect(updates[0].patch).not.toHaveProperty('status')
    expect(Object.keys(updates[0].patch)).toEqual(['last_touched_at'])
    expect(db.rows('seo_backlink_targets')[0]).toMatchObject({ status: 'qualified' })
  })
})

describe('G) report counts verified wins, not labels', () => {
  const createSupabaseAdminClientMock = jest.mocked(createSupabaseAdminClient)

  it('separates durable proof from a bare won label', async () => {
    const db = createP9FakeDb({
      anchor_ledger: [],
      seo_interlinks: [],
      seo_backlink_targets: [
        {
          id: 'verified-win',
          domain: 'ilw.com',
          status: 'won',
          authority_score: 78,
          won_at: '2026-09-21T10:00:00.000Z',
          won_verified_at: '2026-09-21T10:00:00.000Z',
          won_verification_id: 'verification-1',
          won_backlink_url: 'https://www.ilw.com/articles/x',
        },
        { id: 'label-only', domain: 'legacy.example', status: 'won', authority_score: 50, won_at: '2026-01-01T00:00:00.000Z' },
        { id: 'open', domain: 'moz.com', status: 'sent', authority_score: 91 },
      ],
    })
    createSupabaseAdminClientMock.mockReturnValue(db.client as never)

    const report = await runBacklinkReport()

    expect(report.summary.target_total).toBe(3)
    expect(report.summary.verified_wins).toBe(1)
    expect(report.summary.status_won_labels).toBe(2)
    expect(Object.keys(report.summary)).not.toContain('target_won')
    expect(isVerifiedWin(report.targets[0])).toBe(true)
    expect(isVerifiedWin(report.targets[1])).toBe(false)
    // The seeded internal priority is labeled legacy/internal, never a third-party metric.
    expect(report.targets[1].authority_score_basis).toBe('legacy_internal')
  })

  it('defaults an unknown provenance to legacy_internal instead of inventing an attribution', async () => {
    const db = createP9FakeDb({
      anchor_ledger: [],
      seo_interlinks: [],
      seo_backlink_targets: [{ id: 't', domain: 'uscis.gov', status: 'identified', authority_score: 95 }],
    })
    createSupabaseAdminClientMock.mockReturnValue(db.client as never)
    const report = await runBacklinkReport()
    expect(report.targets[0].authority_score_basis).toBe('legacy_internal')
    expect(report.targets[0].won_verified_at).toBeNull()
    expect(report.targets[0].won_verification_id).toBeNull()
  })
})

describe('G2) the generic outreach-record route cannot create a win', () => {
  const createSupabaseAdminClientMock = jest.mocked(createSupabaseAdminClient)
  const requireAdminUserMock = jest.mocked(requireAdminUser)

  function outreachRequest(body: Record<string, unknown>) {
    return new NextRequest('http://localhost/api/seo-engine/backlink/outreach', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    requireAdminUserMock.mockResolvedValue({ profileId: 'admin-1' } as never)
    const db = createP9FakeDb({
      seo_backlink_targets: [{ id: 'target-1', domain: 'ilw.com', status: 'sent' }],
      seo_backlink_outreach: [],
    })
    createSupabaseAdminClientMock.mockReturnValue(db.client as never)
  })

  it('refuses status=won with 409 and persists nothing', async () => {
    const response = await outreachPOST(
      outreachRequest({ action: 'record', target_id: 'target-1', message_body: 'Body', status: 'won' }),
    )
    expect(response.status).toBe(409)
    const body = (await response.json()) as Record<string, unknown>
    expect(body.ok).toBe(false)
    expect(body.code).toBe('won_requires_live_verification')
    expect(String(body.error)).toMatch(/backlink\/verify/)
  })

  it('still records a real send, stamped with sent_at', async () => {
    const response = await outreachPOST(
      outreachRequest({ action: 'record', target_id: 'target-1', message_body: 'Body', status: 'sent' }),
    )
    expect(response.status).toBe(200)
    const body = (await response.json()) as { outreach?: { status?: string; sent_at?: string | null } }
    expect(body.outreach?.status).toBe('sent')
    expect(typeof body.outreach?.sent_at).toBe('string')
  })
})

describe('G3) outreach provenance is server-derived', () => {
  const createSupabaseAdminClientMock = jest.mocked(createSupabaseAdminClient)
  const requireAdminUserMock = jest.mocked(requireAdminUser)

  function outreachRequest(body: Record<string, unknown>) {
    return new NextRequest('http://localhost/api/seo-engine/backlink/outreach', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  function installDb() {
    const db = createP9FakeDb({
      seo_backlink_targets: [{ id: 'target-1', domain: 'ilw.com', status: 'qualified' }],
      seo_backlink_outreach: [],
    })
    createSupabaseAdminClientMock.mockReturnValue(db.client as never)
    return db
  }

  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('records the authenticated admin, ignoring a caller-supplied operator_id', async () => {
    requireAdminUserMock.mockResolvedValue({
      profile: { email: 'real.admin@yousafeconsultancy.com' },
      profileId: 'admin-1',
    } as never)
    const db = installDb()

    const response = await outreachPOST(
      outreachRequest({
        action: 'record',
        target_id: 'target-1',
        message_body: 'Body',
        status: 'sent',
        operator_id: 'admin@portal',
      }),
    )

    expect(response.status).toBe(200)
    const inserted = db.insertsFor('seo_backlink_outreach')[0].rows[0]
    expect(inserted.operator_id).toBe('real.admin@yousafeconsultancy.com')
    expect(inserted.operator_id).not.toBe('admin@portal')
  })

  it('falls back to the authenticated profile id when no email is available', async () => {
    requireAdminUserMock.mockResolvedValue({ profileId: 'admin-1' } as never)
    const db = installDb()
    await outreachPOST(
      outreachRequest({ action: 'record', target_id: 'target-1', message_body: 'Body', operator_id: 'someone-else' }),
    )
    expect(db.insertsFor('seo_backlink_outreach')[0].rows[0].operator_id).toBe('admin-1')
  })

  it('never hardcodes an operator identity in the backlink UIs', () => {
    for (const source of [read(COMMAND_CENTER), read(CONTENT_STUDIO)]) {
      expect(source).not.toContain("operator_id: 'admin@portal'")
      expect(source).not.toContain('operator_id')
    }
  })
})

describe('H) internal priority wording (never DR/DA)', () => {
  const commandCenter = () => read(COMMAND_CENTER)
  const contentStudio = () => read(CONTENT_STUDIO)

  it('relabels every backlink authority_score read as internal priority', () => {
    for (const source of [commandCenter(), contentStudio()]) {
      expect(source).toContain('internal priority')
      expect(source).toContain('not DR/DA')
    }
    // The three pre-P9 labels are gone.
    expect(commandCenter()).not.toContain('authority {Math.round(t.authority_score')
    expect(commandCenter()).not.toContain('authority {Math.round(draftModalTarget.authority_score')
    expect(contentStudio()).not.toContain("} authority")
  })

  it('only mentions DR/DA inside the explicit disclaimer', () => {
    for (const source of [commandCenter(), contentStudio()]) {
      const mentions = source.match(/\bDR\b|\bDA\b/g) || []
      const disclaimers = source.match(/not DR\/DA/g) || []
      expect(disclaimers.length).toBeGreaterThan(0)
      expect(mentions.length).toBe(disclaimers.length * 2)
      expect(source).not.toMatch(/\bDomain Rating\b|\bdomain authority\b/i)
    }
  })

  it('counts wins from the durable pointers and shows unproven labels explicitly', () => {
    const source = commandCenter()
    expect(source).toContain('verified wins')
    expect(source).toContain('won label(s) without live proof')
    expect(source).toContain('Boolean(t.won_verified_at && t.won_verification_id)')
    const studio = contentStudio()
    expect(studio).toContain('verified wins')
    expect(studio).not.toContain('target_won')
  })
})

describe('I) P0–P8 controls stay untouched', () => {
  it('keeps broad net-new CREATE frozen by default', () => {
    expect(isBroadCreateUnlocked({})).toBe(false)
    expect(isBroadCreateUnlocked({ [BROAD_CREATE_UNLOCK_ENV]: '0' })).toBe(false)
    expect(isBroadCreateUnlocked({ SOME_OTHER_FLAG: '1' })).toBe(false)
    expect(isBroadCreateUnlocked({ [BROAD_CREATE_UNLOCK_ENV]: '1' })).toBe(true)
    expect(
      isBroadNetNewCreate({
        matched: null,
        action: 'expand',
        routingSource: 'standing_rules',
        canonicalUrl: 'https://legal.yousafeconsultancy.com/guide/net-new-example/',
      }),
    ).toBe(true)
  })

  it('leaves the P6 exact-anchor proof machinery intact for reuse', () => {
    const target = 'https://legal.yousafeconsultancy.com/us/student-visas/'
    expect(exactAnchorHrefMatch(`<a href="${target}">x</a>`, target).present).toBe(true)
    expect(exactAnchorHrefMatch(`<p>${target}</p>`, target).present).toBe(false)
    expect(exactAnchorHrefMatch(`<script>const a = '<a href="${target}">x</a>'</script>`, target).present).toBe(false)
    expect(stripNonRenderedPayloads('<p>keep</p><script>drop</script>')).toBe('<p>keep</p>')
  })

  it('keeps the P1/P6 service-role boundary on the backlink base tables', () => {
    const p1 = read(join(MIGRATIONS_DIR, '20260917173300_base_table_least_privilege.sql'))
    for (const table of ['seo_backlink_targets', 'seo_backlink_outreach']) {
      expect(p1).toContain(`revoke all privileges on table public.${table} from public, anon, authenticated`)
    }
    // The P9 migration never re-opens those tables to a client role.
    expect(withoutComments()).not.toMatch(/grant[^;]*to\s+(public|anon|authenticated)/i)
  })
})
