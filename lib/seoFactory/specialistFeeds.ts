/**
 * Content Studio — Specialist Intel feeds.
 *
 * SSOT: docs/CONTENT_STUDIO_SPECIALIST_INTEL.md
 *
 * YouSafe specialist roles (Policy Desk, Competitor Radar, Overnight Ops,
 * Authority Multiplexer, Support Triage, Marketplace Scout, Lead Desk) POST one
 * lean JSON signal when they have something worth surfacing. This module owns
 * the durable queue (insert / list / status), the per-role payload validators,
 * and the renderers that fold open signals into Master Engine prompt blocks
 * and Discover / war-room opportunity hints.
 *
 * DB failures are fail-open: the engine and the UI must continue without the
 * feeds (table not migrated yet, service-role key missing, etc.).
 */
import { createClient } from '@supabase/supabase-js'

export const SPECIALIST_ROLES = [
  'policy_desk',
  'competitor_radar',
  'overnight_ops',
  'authority_multiplexer',
  'support_triage',
  'marketplace_scout',
  'lead_desk',
] as const

export type SpecialistRole = (typeof SPECIALIST_ROLES)[number]

export type SpecialistRegion = 'US' | 'UK' | 'CA' | 'AU' | null

export const SPECIALIST_SIGNAL_STATUSES = ['new', 'queued', 'consumed', 'dismissed'] as const
export type SpecialistSignalStatus = (typeof SPECIALIST_SIGNAL_STATUSES)[number]

export const SPECIALIST_ROLE_LABEL: Record<SpecialistRole, string> = {
  policy_desk: 'Policy Desk',
  competitor_radar: 'Competitor Radar',
  overnight_ops: 'Overnight Ops',
  authority_multiplexer: 'Authority Multiplexer',
  support_triage: 'Support Triage',
  marketplace_scout: 'Marketplace Scout',
  lead_desk: 'Lead Desk',
}

export interface SpecialistSignalIn {
  /** validated specialist role — one of SPECIALIST_ROLES */
  role: SpecialistRole
  /** US | UK | CA | AU | null (null = applies to every region) */
  region: SpecialistRegion
  /** 1 (highest) – 5 (lowest); default 3 */
  priority: number
  /** validated per-role payload */
  payload: Record<string, unknown>
  /** content_jobs row this signal relates to, when any */
  relatedJobId: string | null
}

export interface SpecialistSignal extends SpecialistSignalIn {
  id: string
  status: SpecialistSignalStatus
  created_at: string
  consumed_at: string | null
}

export class SpecialistSignalError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SpecialistSignalError'
  }
}

/** One structured role/payload contract. */
interface RoleContract {
  required: string[]
  optional: string[]
  scalar: Record<string, 'string' | 'number' | 'string[]' | 'url' | 'int' | 'urgency'>
}

const AUTHORITY_REGION_RE = /^(US|UK|CA|AU)$/i

export function isSpecialistRole(value: unknown): value is SpecialistRole {
  return typeof value === 'string' && (SPECIALIST_ROLES as readonly string[]).includes(value)
}

/** Strict region check; empty/undefined normalize to null. */
export function normalizeRegion(value: unknown): SpecialistRegion {
  if (value == null || value === '') return null
  const v = String(value).toUpperCase()
  return AUTHORITY_REGION_RE.test(v) ? (v as SpecialistRegion) : null
}

export function isSpecialistSignalStatus(value: unknown): value is SpecialistSignalStatus {
  return typeof value === 'string' && (SPECIALIST_SIGNAL_STATUSES as readonly string[]).includes(value)
}

/** Clamp priority to 1..5, default 3. */
export function normalizePriority(value: unknown): number {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n)) return 3
  return Math.max(1, Math.min(5, n))
}

const splice = (v: unknown, max = 40): string => String(v ?? '').trim().slice(0, max)

function str(v: unknown): string {
  const s = String(v ?? '').trim()
  if (!s) throw new SpecialistSignalError('expected a non-empty string')
  return s
}

function optStr(v: unknown): string {
  return String(v ?? '').trim()
}

function strArr(v: unknown, allowEmpty = false): string[] {
  if (v == null) return allowEmpty ? [] : []
  const arr = Array.isArray(v) ? v : []
  const out = arr.map((x) => String(x ?? '').trim()).filter(Boolean).slice(0, 20)
  if (!allowEmpty && out.length === 0) throw new SpecialistSignalError('expected a non-empty string array')
  return out
}

function url(v: unknown): string {
  const s = String(v ?? '').trim()
  if (!s) throw new SpecialistSignalError('expected a non-empty URL')
  if (!/^https?:\/\//i.test(s)) throw new SpecialistSignalError(`invalid URL: ${s.slice(0, 80)}`)
  return s
}

function intInRange(v: unknown, min: number, max: number, label: string): number {
  const n = Math.round(Number(v))
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new SpecialistSignalError(`expected ${label} in ${min}..${max}`)
  }
  return n
}

function urgency(v: unknown): 'low' | 'med' | 'high' {
  const s = String(v ?? '').toLowerCase()
  if (s === 'low' || s === 'med' || s === 'medium') return s === 'medium' ? 'med' : (s as 'low' | 'med')
  if (s === 'high') return 'high'
  throw new SpecialistSignalError('expected urgency low | med | high')
}

/**
 * Per-role payload contract — every shape in the SSOT doc is validated here so
 * a malformed bot POST can never poison the Master Engine prompt.
 */
const ROLE_CONTRACTS: Record<SpecialistRole, RoleContract> = {
  policy_desk: {
    required: ['title', 'sourceUrl', 'summary'],
    optional: ['cashCowIntents', 'urgency'],
    scalar: {
      title: 'string', sourceUrl: 'url', summary: 'string',
      cashCowIntents: 'string[]', urgency: 'urgency',
    },
  },
  competitor_radar: {
    required: ['competitor', 'changeType', 'url'],
    optional: ['cashCowImplication', 'whatItMeansForYouSafe'],
    scalar: {
      competitor: 'string', changeType: 'string', url: 'url',
      cashCowImplication: 'string', whatItMeansForYouSafe: 'string',
    },
  },
  overnight_ops: {
    required: [],
    optional: ['hostHealth', 'gscGaAnomalies', 'rankingPriorities', 'worktreeWarnings'],
    scalar: {
      hostHealth: 'string[]', gscGaAnomalies: 'string[]',
      rankingPriorities: 'string[]', worktreeWarnings: 'string[]',
    },
  },
  authority_multiplexer: {
    required: ['sourceUrl'],
    optional: ['xPosts', 'threadOutline', 'videoHooks', 'newsletterIntro', 'leadHook'],
    scalar: {
      sourceUrl: 'url', xPosts: 'string[]', threadOutline: 'string[]',
      videoHooks: 'string[]', newsletterIntro: 'string', leadHook: 'string',
    },
  },
  support_triage: {
    required: ['pattern'],
    optional: ['category', 'suggestedOwnerTopic', 'evidence'],
    scalar: {
      category: 'string', pattern: 'string', suggestedOwnerTopic: 'string', evidence: 'string',
    },
  },
  marketplace_scout: {
    required: ['category', 'priorityReason'],
    optional: ['supplyCountSignal'],
    scalar: {
      category: 'string', supplyCountSignal: 'string', priorityReason: 'string',
    },
  },
  lead_desk: {
    required: ['intent'],
    optional: ['leadScoreHint', 'reason'],
    scalar: {
      intent: 'string', leadScoreHint: 'int', reason: 'string',
    },
  },
}

function coerceScalar(key: string, value: unknown, kind: RoleContract['scalar'][string]): unknown {
  switch (kind) {
    case 'string': return str(value)
    case 'url': return url(value)
    case 'string[]': return strArr(value)
    case 'urgency': return urgency(value)
    case 'int': return intInRange(value, 1, 5, 'leadScoreHint')
    default: return value
  }
}

/**
 * Validate a raw payload against the role's SSOT contract and return a
 * normalized payload (unknown fields dropped; extra keys ignored, never thrown).
 */
export function validateSignalPayload(role: SpecialistRole, payload: unknown): Record<string, unknown> {
  if (payload == null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new SpecialistSignalError('payload must be an object')
  }
  const raw = payload as Record<string, unknown>
  const contract = ROLE_CONTRACTS[role]
  const out: Record<string, unknown> = {}
  for (const key of contract.required) {
    if (raw[key] == null || (typeof raw[key] === 'string' && !String(raw[key]).trim())) {
      throw new SpecialistSignalError(`payload missing required field "${key}" for ${role}`)
    }
    const kind = contract.scalar[key] ?? 'string'
    out[key] = coerceScalar(key, raw[key], kind)
  }
  for (const key of contract.optional) {
    if (raw[key] == null) continue
    const kind = contract.scalar[key] ?? 'string'
    try {
      out[key] = coerceScalar(key, raw[key], kind)
    } catch {
      // optional field malformed → drop it, do not reject the signal
    }
  }
  return out
}

/**
 * Validate a full ingestion body → normalized SpecialistSignalIn, or throw
 * SpecialistSignalError with a human message the API can return as 400.
 */
export function parseSpecialistSignal(body: unknown): SpecialistSignalIn {
  if (body == null || typeof body !== 'object') {
    throw new SpecialistSignalError('signal body must be an object')
  }
  const b = body as Record<string, unknown>
  const role = String(b.role ?? '')
  if (!isSpecialistRole(role)) {
    throw new SpecialistSignalError(
      `unknown role "${role}" — expected one of ${SPECIALIST_ROLES.join(', ')}`,
    )
  }
  const payload = validateSignalPayload(role, b.payload ?? {})
  return {
    role,
    region: normalizeRegion(b.region),
    priority: normalizePriority(b.priority),
    payload,
    relatedJobId: b.relatedJobId != null ? String(b.relatedJobId).trim() || null : null,
  }
}

function signalRow(row: Record<string, unknown>): SpecialistSignal {
  return {
    id: String(row.id),
    role: isSpecialistRole(row.role) ? row.role : 'policy_desk',
    region: normalizeRegion(row.region),
    priority: normalizePriority(row.priority),
    payload:
      row.payload && typeof row.payload === 'object'
        ? (row.payload as Record<string, unknown>)
        : {},
    relatedJobId: row.related_job_id ? String(row.related_job_id) : null,
    status: isSpecialistSignalStatus(row.status) ? row.status : 'new',
    created_at: String(row.created_at || new Date().toISOString()),
    consumed_at: row.consumed_at ? String(row.consumed_at) : null,
  }
}

const SIGNAL_TABLE = 'studio_specialist_signals'

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

/**
 * Insert one validated signal. Fail-open: returns `{ ok: false, error }`
 * instead of throwing so callers (bots, ship hooks, cron) never crash.
 */
export async function insertSignal(input: SpecialistSignalIn): Promise<{
  ok: boolean
  id?: string
  error?: string
}> {
  try {
    const { data, error } = await adminClient()
      .from(SIGNAL_TABLE)
      .insert({
        role: input.role,
        region: input.region,
        priority: input.priority,
        payload: input.payload ?? {},
        related_job_id: input.relatedJobId,
        status: 'new',
      })
      .select('id')
      .single()
    if (error) return { ok: false, error: error.message }
    return { ok: true, id: String((data as { id?: string } | null)?.id ?? '') }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'insert failed' }
  }
}

export interface SpecialistSignalListOptions {
  status?: SpecialistSignalStatus | SpecialistSignalStatus[]
  role?: SpecialistRole | null
  region?: SpecialistRegion | null
  /** cap returned rows (default 60) */
  limit?: number
  /** only open (new/queued) signals */
  openOnly?: boolean
}

/**
 * List signals newest-first, highest-priority first. Fail-open → empty array
 * when the table is missing or the service-role key is not configured, so the
 * panel and engine never hard-fail pre-migration.
 */
export async function listSignals(options: SpecialistSignalListOptions = {}): Promise<SpecialistSignal[]> {
  try {
    let q = adminClient()
      .from(SIGNAL_TABLE)
      .select('id, role, region, payload, status, priority, related_job_id, created_at, consumed_at')
      .order('priority', { ascending: true })
      .order('created_at', { ascending: false })
      .limit(Math.min(options.limit ?? 60, 200))

    if (options.openOnly) q = q.in('status', ['new', 'queued'])
    else if (options.status) {
      const statuses = Array.isArray(options.status) ? options.status : [options.status]
      q = statuses.length === 1 ? q.eq('status', statuses[0]) : q.in('status', statuses)
    }
    if (options.role) q = q.eq('role', options.role)
    if (options.region) q = q.eq('region', options.region)

    const { data, error } = await q
    if (error) return []
    return ((data ?? []) as unknown as Array<Record<string, unknown>>).map(signalRow)
  } catch {
    return []
  }
}

/**
 * Transition a signal to queued | consumed | dismissed. Sets consumed_at when
 * consumed. Fail-open → `{ ok: false, error }`.
 */
export async function setSignalStatus(
  id: string,
  status: SpecialistSignalStatus,
): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!id.trim()) return { ok: false, error: 'missing signal id' }
    if (!isSpecialistSignalStatus(status)) {
      return { ok: false, error: 'invalid status' }
    }
    const patch: Record<string, unknown> = { status }
    if (status === 'consumed') patch.consumed_at = new Date().toISOString()
    const { error } = await adminClient()
      .from(SIGNAL_TABLE)
      .update(patch)
      .eq('id', id)
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'status update failed' }
  }
}

/**
 * Authority Multiplexer hook — enqueue a repurpose-pack signal on approve/ship
 * success. Never external sends; it only marks the shipped pillar for
 * repurpose work. Fail-open: ship success must never depend on the feed.
 */
export async function enqueueAuthorityMultiplexerSignal(input: {
  sourceUrl: string
  relatedJobId: string
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const sourceUrl = String(input.sourceUrl || '').trim()
  if (!sourceUrl) return { ok: false, error: 'sourceUrl required' }
  return insertSignal({
    role: 'authority_multiplexer',
    region: null,
    priority: 2,
    payload: { sourceUrl, repurposePackRequested: true, repurposeGenerator: 'stub' },
    relatedJobId: String(input.relatedJobId || '') || null,
  })
}

/**
 * Open high-priority signals matching a topic/region — the Master Engine feed
 * wiring. Matches by token overlap on the role payload text and region equality
 * (null region = applies everywhere). Returns open (new/queued) high-priority
 * signals, newest first. Fail-open → [].
 */
export async function loadOpenSignalsForTopic(
  opts: { topic?: string; region?: string | null; limit?: number } = {},
): Promise<SpecialistSignal[]> {
  const region = normalizeRegion(opts.region)
  try {
    const open = await listSignals({ openOnly: true, limit: 100 })
    const topicLower = String(opts.topic || '').trim().toLowerCase()
    const scored = open
      .map((s) => {
        const regionOk =
          !region || s.region == null || s.region === region
        const blob = `${SPECIALIST_ROLE_LABEL[s.role]} ${
          specialistSignalBlob(s).toLowerCase()
        }`
        const topicHit = !topicLower || blob.includes(topicLower)
        return { s, regionOk, topicHit }
      })
      .filter((x) => x.regionOk && x.topicHit)
      .sort(
        (a, b) =>
          a.s.priority - b.s.priority ||
          new Date(b.s.created_at).getTime() - new Date(a.s.created_at).getTime(),
      )
    return scored.slice(0, Math.min(opts.limit ?? 6, 12)).map((x) => x.s)
  } catch {
    return []
  }
}

/** Flat text blob for a signal — used for topic matching + opportunity hints. */
export function specialistSignalBlob(s: SpecialistSignal): string {
  return Object.values(s.payload)
    .map((v) => (Array.isArray(v) ? v.join(' ') : String(v ?? '')))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** One-line human summary of a signal (role label + head of the payload). */
export function specialistSignalSummary(s: SpecialistSignal, max = 160): string {
  const blob = specialistSignalBlob(s)
  const head = blob ? ` — ${blob.slice(0, max)}` : ''
  return `${SPECIALIST_ROLE_LABEL[s.role]}${s.region ? ` · ${s.region}` : ''}${head}`
}

/**
 * Render open signals into a Master Engine prompt block. Deterministic,
 * truthful — the writer must never invent what a specialist claimed. Empty input
 * renders an empty string so callers can filter it out.
 */
export function buildSpecialistPromptBlock(signals: readonly SpecialistSignal[]): string {
  if (!signals.length) return ''
  const lines = [
    'SPECIALIST INTEL FEEDS — fold these role-sourced notes into the brief/draft only where they are truthful and relevant; never invent policy, competitor, or fee facts:',
  ]
  for (const s of signals.slice(0, 10)) {
    const meta = [
      SPECIALIST_ROLE_LABEL[s.role],
      s.region ? `region ${s.region}` : 'all regions',
      `priority ${s.priority}`,
      s.relatedJobId ? `job ${s.relatedJobId.slice(0, 8)}` : '',
    ].filter(Boolean).join(' · ')
    lines.push(`  · [${meta}] ${specialistSignalBlob(s)}`)
  }
  return lines.join('\n')
}

export interface SpecialistOpportunityHint {
  title: string
  role: SpecialistRole
  priority: number
  region: string | null
  kind: 'policy' | 'competitor' | 'ops' | 'support' | 'market' | 'lead' | 'authority'
  narrative: string
  sourceUrl?: string
  relatedJobId?: string | null
}

const ROLE_KIND: Record<SpecialistRole, SpecialistOpportunityHint['kind']> = {
  policy_desk: 'policy',
  competitor_radar: 'competitor',
  overnight_ops: 'ops',
  authority_multiplexer: 'authority',
  support_triage: 'support',
  marketplace_scout: 'market',
  lead_desk: 'lead',
}

/**
 * Translate open signals into opportunity hints for Discover / war-room queues.
 * Each hint carries a human narrative + the signal id provenance so an operator
 * can trace it back to the specialist feed.
 */
export function signalsToOpportunityHints(
  signals: readonly SpecialistSignal[],
  max = 12,
): SpecialistOpportunityHint[] {
  return signals.slice(0, max).map((s) => {
    const p = s.payload
    let title = specialistSignalSummary(s, 80)
    let narrative = specialistSignalBlob(s)
    switch (s.role) {
      case 'policy_desk':
        title = String(p.title || title)
        narrative = String(p.summary || narrative)
        break
      case 'competitor_radar':
        title = `${String(p.competitor || 'competitor')} — ${String(p.changeType || 'change')}`
        narrative = String(p.cashCowImplication || p.whatItMeansForYouSafe || narrative)
        break
      case 'support_triage':
        title = String(p.pattern || title)
        narrative = String(p.evidence || p.suggestedOwnerTopic || narrative)
        break
      case 'marketplace_scout':
        title = `${String(p.category || 'marketplace')} supply gap`
        narrative = String(p.priorityReason || p.supplyCountSignal || narrative)
        break
      case 'lead_desk':
        title = `${String(p.intent || 'intent')} — lead ${p.leadScoreHint != null ? String(p.leadScoreHint) : '?'}/5`
        narrative = String(p.reason || narrative)
        break
      case 'authority_multiplexer':
        title = 'Repurpose pack available'
        narrative = String(p.sourceUrl || narrative)
        break
      default:
        break
    }
    const sourceUrl =
      typeof p.sourceUrl === 'string' && /^https?:\/\//i.test(p.sourceUrl)
        ? p.sourceUrl
        : typeof p.url === 'string' && /^https?:\/\//i.test(String(p.url))
          ? String(p.url)
          : undefined
    return {
      title,
      role: s.role,
      priority: s.priority,
      region: s.region,
      kind: ROLE_KIND[s.role],
      narrative,
      sourceUrl,
      relatedJobId: s.relatedJobId,
    }
  })
}