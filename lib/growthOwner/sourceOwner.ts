import { GROWTH_OWNER_MANIFEST, offerForMapping } from './offers'

export const SOURCE_OWNER_BODY_LIMIT = 8 * 1024
export const SOURCE_OWNER_RESPONSE_LIMIT = 32 * 1024
export const SOURCE_OWNER_PAGE_SIZE = 50
export const SOURCE_OWNER_MAX_ROWS = 100
export const SOURCE_OWNER_MAX_DEADLINE_SECONDS = 30 * 24 * 60 * 60
export const SOURCE_OWNER_FRESHNESS_SECONDS = 5 * 60

export const SOURCE_OWNER_HASH_TEST_VECTOR = {
  canonical_json: '{"a":1,"b":"\\u00e9"}',
  sha256: '6071e7aa781e8adc235db31b17e6d0ee414a17031b1744a38fbf2cd17effcbce',
} as const

const REQUEST_FIELDS = [
  'contract_version', 'operation_id', 'mission_id', 'tenant_id', 'policy_ref',
  'operation', 'campaign_id', 'gig_id', 'deadline_epoch', 'request_hash',
].sort()
const SAFE_REF = /^[A-Za-z0-9:._/-]{1,160}$/
const SAFE_ID = /^[A-Za-z0-9:_.-]{1,160}$/
const CURRENCY = /^[A-Za-z]{3,8}$/

export type SourceOwnerRequest = {
  contract_version: 'yousafe.source-owner.v1'
  operation_id: string
  mission_id: string
  tenant_id: string
  policy_ref: string
  operation: 'commerce'
  campaign_id: string
  gig_id: string
  deadline_epoch: number
  request_hash: string
}

type BoundRequest = {
  request: SourceOwnerRequest
  offer: (typeof GROWTH_OWNER_MANIFEST.offers)[number]
}

type QueryResult<T> = { data: T[] | null; error: unknown | null }
type SourceOwnerDatabase = { from(table: string): any }
type HandlerDependencies = {
  secret?: string
  database?: SourceOwnerDatabase | unknown
  serviceRoleAvailable?: boolean
  isServiceRoleAvailable?: () => boolean
  createDatabase?: () => SourceOwnerDatabase | unknown
  now?: number
}

type PaymentRow = {
  receipt_ref: string
  campaign_id: string
  cohort: string
  payment_status: 'paid'
  amount_minor: number | string
  currency: string
}

export function canonicalJson(value: unknown): string {
  if (typeof value === 'string') return pythonAsciiString(value)
  if (value === null || typeof value === 'boolean') return JSON.stringify(value)
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('non-finite JSON number')
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`
  }
  throw new TypeError('unsupported JSON value')
}

function pythonAsciiString(value: string): string {
  let result = '"'
  for (let i = 0; i < value.length; i++) {
    let code = value.charCodeAt(i)
    if (code === 0x22) result += '\\"'
    else if (code === 0x5c) result += '\\\\'
    else if (code === 0x08) result += '\\b'
    else if (code === 0x09) result += '\\t'
    else if (code === 0x0a) result += '\\n'
    else if (code === 0x0c) result += '\\f'
    else if (code === 0x0d) result += '\\r'
    else if (code < 0x20) result += `\\u${code.toString(16).padStart(4, '0')}`
    else if (code <= 0x7f) result += String.fromCharCode(code)
    else if (code >= 0xd800 && code <= 0xdbff && i + 1 < value.length) {
      const low = value.charCodeAt(i + 1)
      if (low >= 0xdc00 && low <= 0xdfff) {
        result += `\\u${code.toString(16)}\\u${low.toString(16)}`
        i++
      } else result += `\\u${code.toString(16).padStart(4, '0')}`
    } else result += `\\u${code.toString(16).padStart(4, '0')}`
  }
  return result + '"'
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function createSourceOwnerRequestHash(value: Record<string, unknown>): Promise<string> {
  const unsigned = Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'request_hash'))
  return sha256Hex(canonicalJson(unsigned))
}

async function secretMatches(expected: string, provided: string): Promise<boolean> {
  if (!expected || !provided || expected.length > 4096 || provided.length > 4096) return false
  const [left, right] = await Promise.all([sha256Hex(expected), sha256Hex(provided)])
  let diff = 0
  for (let i = 0; i < 64; i++) diff |= left.charCodeAt(i) ^ right.charCodeAt(i)
  return diff === 0
}

function denied(status: number, reason: string): Response {
  return Response.json({ status: 'DENIED', reason }, { status, headers: { 'cache-control': 'no-store' } })
}

async function readBoundedJson(request: Request): Promise<
  | { ok: true; value: unknown }
  | { ok: false; status: 400 | 413; reason: string }
> {
  const length = request.headers.get('content-length')
  if (length && (!/^\d+$/.test(length) || Number(length) > SOURCE_OWNER_BODY_LIMIT)) {
    return { ok: false, status: Number(length) > SOURCE_OWNER_BODY_LIMIT ? 413 : 400, reason: 'REQUEST_BODY_INVALID' }
  }
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    return { ok: false, status: 400, reason: 'REQUEST_CONTENT_TYPE_INVALID' }
  }
  if (!request.body) return { ok: false, status: 400, reason: 'REQUEST_BODY_INVALID' }
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > SOURCE_OWNER_BODY_LIMIT) {
        await reader.cancel()
        return { ok: false, status: 413, reason: 'REQUEST_BODY_TOO_LARGE' }
      }
      chunks.push(value)
    }
    const bytes = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return { ok: true, value: JSON.parse(text) as unknown }
  } catch {
    return { ok: false, status: 400, reason: 'REQUEST_BODY_INVALID' }
  } finally {
    reader.releaseLock()
  }
}

async function validateRequest(request: Request, value: unknown, nowEpoch: number): Promise<
  | { ok: true; bound: BoundRequest }
  | { ok: false; status: 400 | 403 | 409 | 422; reason: string }
> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, status: 400, reason: 'REQUEST_SCHEMA_INVALID' }
  }
  const body = value as Record<string, unknown>
  if (Object.keys(body).sort().join('\n') !== REQUEST_FIELDS.join('\n')) {
    return { ok: false, status: 400, reason: 'REQUEST_FIELDS_INVALID' }
  }
  if (body.contract_version !== 'yousafe.source-owner.v1' || body.operation !== 'commerce') {
    return { ok: false, status: 422, reason: 'REQUEST_OPERATION_UNSUPPORTED' }
  }
  for (const key of ['operation_id', 'mission_id', 'tenant_id', 'policy_ref', 'campaign_id', 'gig_id']) {
    if (typeof body[key] !== 'string' || !SAFE_ID.test(body[key] as string)) {
      return { ok: false, status: 422, reason: 'REQUEST_SCOPE_INVALID' }
    }
  }
  if (typeof body.deadline_epoch !== 'number' || !Number.isSafeInteger(body.deadline_epoch) ||
      body.deadline_epoch < 1 || body.deadline_epoch > 4_000_000_000) {
    return { ok: false, status: 422, reason: 'REQUEST_DEADLINE_INVALID' }
  }
  if (body.deadline_epoch <= nowEpoch) return { ok: false, status: 409, reason: 'REQUEST_EXPIRED' }
  if (body.deadline_epoch > nowEpoch + SOURCE_OWNER_MAX_DEADLINE_SECONDS) {
    return { ok: false, status: 422, reason: 'REQUEST_DEADLINE_INVALID' }
  }
  if (typeof body.request_hash !== 'string' || !/^[0-9a-f]{64}$/.test(body.request_hash)) {
    return { ok: false, status: 422, reason: 'REQUEST_HASH_INVALID' }
  }
  if (request.headers.get('x-request-hash') !== body.request_hash) {
    return { ok: false, status: 409, reason: 'REQUEST_HASH_MISMATCH' }
  }
  if (request.headers.get('idempotency-key') !== body.operation_id) {
    return { ok: false, status: 409, reason: 'REQUEST_IDEMPOTENCY_MISMATCH' }
  }
  const calculated = await createSourceOwnerRequestHash(body)
  if (calculated !== body.request_hash) return { ok: false, status: 409, reason: 'REQUEST_HASH_MISMATCH' }
  const offer = offerForMapping(body.policy_ref as string, body.campaign_id as string, body.gig_id as string)
  if (body.tenant_id !== GROWTH_OWNER_MANIFEST.tenant_id || !offer) {
    return { ok: false, status: 403, reason: 'REQUEST_SCOPE_DENIED' }
  }
  return { ok: true, bound: { request: body as unknown as SourceOwnerRequest, offer } }
}

function readFailure(reason: string, request: SourceOwnerRequest): Record<string, unknown> {
  return {
    operation_id: request.operation_id,
    request_hash: request.request_hash,
    mission_id: request.mission_id,
    tenant_id: request.tenant_id,
    status: 'UNKNOWN',
    reason,
    cost_minor: 0,
    receipt_ref: `portal:commerce-unknown:${request.request_hash}`,
    evidence_refs: [],
    source_owner_ref: GROWTH_OWNER_MANIFEST.commerce_owner_ref,
    authenticated: true,
    campaign_id: request.campaign_id,
    snapshot_complete: false,
    paid_order_receipts: [],
  }
}

function integerAmount(value: unknown): bigint | null {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value >= 0 ? BigInt(value) : null
  if (typeof value === 'string' && /^(0|[1-9]\d{0,24})$/.test(value)) return BigInt(value)
  return null
}

function validCurrency(value: unknown): value is string {
  return typeof value === 'string' && CURRENCY.test(value)
}

async function readPagedRows<T>(
  buildQuery: () => { range(from: number, to: number): PromiseLike<QueryResult<T>>; abortSignal?: (signal: AbortSignal) => unknown },
  request: SourceOwnerRequest,
  now: () => number,
): Promise<T[]> {
  const rows: T[] = []
  const readPage = async (from: number, to: number) => {
    const remainingMs = (request.deadline_epoch - now()) * 1000
    if (remainingMs <= 0) throw new Error('SOURCE_DEADLINE')
    const query = buildQuery()
    if (typeof query.abortSignal === 'function' && typeof AbortSignal.timeout === 'function') {
      query.abortSignal(AbortSignal.timeout(Math.max(1, Math.min(10_000, remainingMs))))
    }
    const result = await query.range(from, to)
    if (now() >= request.deadline_epoch) throw new Error('SOURCE_DEADLINE')
    if (result.error || !Array.isArray(result.data)) throw new Error('SOURCE_READ')
    return result.data
  }
  for (let offset = 0; offset < SOURCE_OWNER_MAX_ROWS; offset += SOURCE_OWNER_PAGE_SIZE) {
    const data = await readPage(offset, offset + SOURCE_OWNER_PAGE_SIZE - 1)
    rows.push(...data)
    if (rows.length > SOURCE_OWNER_MAX_ROWS) throw new Error('SOURCE_LIMIT')
    if (data.length < SOURCE_OWNER_PAGE_SIZE) return rows
  }
  const data = await readPage(SOURCE_OWNER_MAX_ROWS, SOURCE_OWNER_MAX_ROWS)
  if (data.length) throw new Error('SOURCE_LIMIT')
  return rows
}

function eventQuery(db: SourceOwnerDatabase, offer: BoundRequest['offer']) {
  return db.from('conversion_events')
    .select([
      'id', 'event_key', 'event_type', 'observation', 'consent_state', 'session_id',
      'attribution_state', 'source_class', 'source_utm_source:source_detail->>source',
      'source_utm_medium:source_detail->>medium', 'source_campaign:source_detail->>campaign',
      'source_cohort:source_detail->>content', 'product_ref', 'subject_type', 'subject_id',
      'amount_cents', 'currency', 'occurred_at',
    ].join(','))
    .eq('event_type', 'order_paid')
    .eq('observation', 'server_observed')
    .eq('consent_state', 'granted')
    .eq('attribution_state', 'attributed')
    .neq('source_class', 'unknown')
    .eq('source_detail->>source', GROWTH_OWNER_MANIFEST.utm.source)
    .eq('source_detail->>medium', GROWTH_OWNER_MANIFEST.utm.medium)
    .eq('source_detail->>campaign', offer.campaign_id)
    .eq('product_ref', `gig:${offer.gig_id}`)
    .eq('subject_type', 'order')
    .order('id', { ascending: true })
}

function sessionQuery(db: SourceOwnerDatabase, ids: string[]) {
  return db.from('conversion_attribution_sessions')
    .select([
      'id', 'consent_state', 'first_source_class',
      'source_utm_source:first_source_detail->>source',
      'source_utm_medium:first_source_detail->>medium',
      'source_campaign:first_source_detail->>campaign',
      'source_cohort:first_source_detail->>content',
      'first_seen_at', 'expires_at', 'revoked_at',
    ].join(','))
    .in('id', ids)
    .order('id', { ascending: true })
}

function refundQuery(db: SourceOwnerDatabase, ids: string[]) {
  return db.from('conversion_events')
    .select('id,event_key,event_type,observation,subject_type,subject_id,product_ref,amount_cents,currency')
    .eq('event_type', 'order_refunded')
    .eq('observation', 'server_observed')
    .eq('subject_type', 'order')
    .in('subject_id', ids)
    .order('id', { ascending: true })
}

function orderQuery(db: SourceOwnerDatabase, ids: string[]) {
  return db.from('orders')
    .select('id,gig_id,status,amount_paid,currency')
    .in('id', ids)
    .order('id', { ascending: true })
}

function eligiblePaidEvent(event: Record<string, any>, offer: BoundRequest['offer']): boolean {
  return event.event_type === 'order_paid' && event.observation === 'server_observed' &&
    event.consent_state === 'granted' && event.attribution_state === 'attributed' &&
    event.source_class !== 'unknown' && event.source_utm_source === GROWTH_OWNER_MANIFEST.utm.source &&
    event.source_utm_medium === GROWTH_OWNER_MANIFEST.utm.medium &&
    event.source_campaign === offer.campaign_id &&
    event.product_ref === `gig:${offer.gig_id}` && event.subject_type === 'order' &&
    typeof event.subject_id === 'string' && Boolean(event.subject_id) &&
    typeof event.session_id === 'string' && Boolean(event.session_id)
}

function validSessionForEvent(
  session: Record<string, any> | undefined,
  event: Record<string, any>,
  offer: BoundRequest['offer'],
): boolean {
  if (!session || session.consent_state !== 'granted' || session.revoked_at !== null ||
      session.source_utm_source !== GROWTH_OWNER_MANIFEST.utm.source ||
      session.source_utm_medium !== GROWTH_OWNER_MANIFEST.utm.medium ||
      session.source_campaign !== offer.campaign_id || session.source_cohort !== event.source_cohort ||
      session.first_source_class === 'unknown' || session.first_source_class !== event.source_class) return false
  const occurred = Date.parse(String(event.occurred_at ?? ''))
  const firstSeen = Date.parse(String(session.first_seen_at ?? ''))
  const expires = Date.parse(String(session.expires_at ?? ''))
  return Number.isFinite(occurred) && Number.isFinite(firstSeen) && Number.isFinite(expires) &&
    firstSeen <= occurred && occurred < expires
}

function unknownSnapshot(reason: string, request: SourceOwnerRequest): Record<string, unknown> {
  return readFailure(reason, request)
}

export async function collectCommerceSnapshot(
  db: SourceOwnerDatabase,
  request: SourceOwnerRequest,
  offer: BoundRequest['offer'],
  now: () => number = () => Math.floor(Date.now() / 1000),
): Promise<Record<string, unknown>> {
  try {
    const events = await readPagedRows(() => eventQuery(db, offer), request, now) as Array<Record<string, any>>
    const sessionIds = [...new Set(events.map((event) => event.session_id).filter((id): id is string => typeof id === 'string'))]
    const sessions = sessionIds.length
      ? await readPagedRows(() => sessionQuery(db, sessionIds), request, now) as Array<Record<string, any>>
      : []
    const sessionsById = new Map(sessions.map((row) => [row.id, row]))
    const perOrder = new Map<string, { cohort: string; amount: bigint; currency: string; eventKeys: Set<string> }>()

    for (const event of events) {
      if (!eligiblePaidEvent(event, offer) || !validSessionForEvent(sessionsById.get(event.session_id), event, offer)) continue
      if (!GROWTH_OWNER_MANIFEST.cohorts.includes(event.source_cohort)) {
        return unknownSnapshot('SOURCE_COHORT_UNAVAILABLE', request)
      }
      const amount = integerAmount(event.amount_cents)
      if (amount === null || amount <= BigInt(0) || !validCurrency(event.currency) || typeof event.event_key !== 'string') {
        return unknownSnapshot('SOURCE_EVENT_INVALID', request)
      }
      const current = perOrder.get(event.subject_id)
      if (!current) {
        perOrder.set(event.subject_id, {
          cohort: event.source_cohort,
          amount,
          currency: event.currency.toLowerCase(),
          eventKeys: new Set([event.event_key]),
        })
      } else {
        if (current.cohort !== event.source_cohort || current.amount !== amount ||
            current.currency !== event.currency.toLowerCase()) return unknownSnapshot('SOURCE_EVENT_CONFLICT', request)
        current.eventKeys.add(event.event_key)
      }
    }

    const orderIds = [...perOrder.keys()]
    const orders = orderIds.length
      ? await readPagedRows(() => orderQuery(db, orderIds), request, now) as Array<Record<string, any>>
      : []
    const ordersById = new Map(orders.map((row) => [row.id, row]))
    const refunds = orderIds.length
      ? await readPagedRows(() => refundQuery(db, orderIds), request, now) as Array<Record<string, any>>
      : []
    const refundsByOrder = new Map<string, Map<string, { amount: bigint; currency: string }>>()
    for (const refund of refunds) {
      if (refund.observation !== 'server_observed' || refund.event_type !== 'order_refunded' ||
          refund.subject_type !== 'order' || !perOrder.has(refund.subject_id)) continue
      if ((refund.product_ref != null && refund.product_ref !== `gig:${offer.gig_id}`) ||
          typeof refund.event_key !== 'string' || !validCurrency(refund.currency)) {
        return unknownSnapshot('SOURCE_REFUND_INVALID', request)
      }
      const amount = integerAmount(refund.amount_cents)
      if (amount === null || amount <= BigInt(0)) return unknownSnapshot('SOURCE_REFUND_INVALID', request)
      const byKey = refundsByOrder.get(refund.subject_id) ?? new Map()
      const current = byKey.get(refund.event_key)
      if (current && (current.amount !== amount || current.currency !== refund.currency.toLowerCase())) {
        return unknownSnapshot('SOURCE_REFUND_CONFLICT', request)
      }
      byKey.set(refund.event_key, { amount, currency: refund.currency.toLowerCase() })
      refundsByOrder.set(refund.subject_id, byKey)
    }

    const receipts: PaymentRow[] = []
    for (const [subjectId, paid] of perOrder) {
      const order = ordersById.get(subjectId)
      if (!order || order.gig_id !== offer.gig_id ||
          integerAmount(order.amount_paid) !== paid.amount || !validCurrency(order.currency) ||
          order.currency.toLowerCase() !== paid.currency) {
        return unknownSnapshot('SOURCE_ORDER_UNRECONCILED', request)
      }
      const status = String(order.status).toLowerCase()
      if (['cancelled', 'canceled', 'voided', 'failed'].includes(status)) continue
      if (!['created', 'paid', 'in_progress', 'completed', 'delivered', 'accepted', 'refunded'].includes(status)) {
        return unknownSnapshot('SOURCE_ORDER_STATE_UNKNOWN', request)
      }
      let refunded = BigInt(0)
      for (const refund of (refundsByOrder.get(subjectId) ?? new Map()).values()) {
        if (refund.currency !== paid.currency) return unknownSnapshot('SOURCE_REFUND_CURRENCY_MISMATCH', request)
        refunded += refund.amount
      }
      if (refunded > paid.amount) return unknownSnapshot('SOURCE_REFUND_CONFLICT', request)
      if (status === 'refunded' && refunded === BigInt(0)) {
        return unknownSnapshot('SOURCE_REFUND_EVIDENCE_MISSING', request)
      }
      const net = paid.amount - refunded
      if (net === BigInt(0)) continue
      const orderDigest = await sha256Hex(
        `${GROWTH_OWNER_MANIFEST.tenant_id}:${offer.campaign_id}:${offer.gig_id}:order:${subjectId}`,
      )
      receipts.push({
        receipt_ref: `portal:commerce-order:${orderDigest}`,
        campaign_id: offer.campaign_id,
        cohort: paid.cohort,
        payment_status: 'paid',
        amount_minor: net <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(net) : net.toString(),
        currency: paid.currency,
      })
    }
    receipts.sort((a, b) => a.receipt_ref.localeCompare(b.receipt_ref))
    const snapshotHash = await sha256Hex(canonicalJson({
      contract_version: GROWTH_OWNER_MANIFEST.contract_version,
      campaign_id: offer.campaign_id,
      gig_id: offer.gig_id,
      paid_order_receipts: receipts,
    }))
    const result = {
      operation_id: request.operation_id,
      request_hash: request.request_hash,
      mission_id: request.mission_id,
      tenant_id: request.tenant_id,
      status: 'PASS',
      cost_minor: 0,
      receipt_ref: `portal:commerce-snapshot:${snapshotHash}`,
      evidence_refs: [`portal:conversion-events:${snapshotHash}`],
      source_owner_ref: GROWTH_OWNER_MANIFEST.commerce_owner_ref,
      authenticated: true,
      campaign_id: offer.campaign_id,
      snapshot_complete: true,
      paid_order_receipts: receipts,
    }
    if (new TextEncoder().encode(JSON.stringify(result)).byteLength > SOURCE_OWNER_RESPONSE_LIMIT) {
      return unknownSnapshot('SOURCE_RESPONSE_LIMIT', request)
    }
    return result
  } catch (error) {
    const reason = error instanceof Error && error.message === 'SOURCE_LIMIT'
      ? 'SOURCE_SNAPSHOT_LIMIT'
      : error instanceof Error && error.message === 'SOURCE_DEADLINE'
        ? 'SOURCE_SNAPSHOT_DEADLINE'
        : 'OWNER_SOURCE_READ_FAILED'
    return unknownSnapshot(reason, request)
  }
}

export async function handleSourceOwnerRequest(
  request: Request,
  dependencies: HandlerDependencies,
): Promise<Response> {
  const secret = dependencies.secret
  if (typeof secret !== 'string' || !secret) return denied(503, 'SOURCE_OWNER_AUTH_UNAVAILABLE')
  const authorization = request.headers.get('authorization') ?? ''
  const match = /^Bearer ([^\s]{1,4096})$/.exec(authorization)
  if (!match || !(await secretMatches(secret, match[1]))) return denied(401, 'SOURCE_OWNER_UNAUTHORIZED')
  const parsed = await readBoundedJson(request)
  if (parsed.ok === false) return denied(parsed.status, parsed.reason)
  const nowEpoch = Math.floor((dependencies.now ?? Date.now()) / 1000)
  const checked = await validateRequest(request, parsed.value, nowEpoch)
  if (checked.ok === false) return denied(checked.status, checked.reason)
  let serviceRoleAvailable = dependencies.serviceRoleAvailable === true
  let database = dependencies.database
  try {
    if (dependencies.isServiceRoleAvailable) {
      serviceRoleAvailable = dependencies.isServiceRoleAvailable()
    }
    if (serviceRoleAvailable && dependencies.createDatabase) {
      database = dependencies.createDatabase()
    }
  } catch {
    serviceRoleAvailable = false
    database = undefined
  }
  if (!serviceRoleAvailable || !database) return Response.json(
    readFailure('OWNER_DATABASE_AUTH_UNAVAILABLE', checked.bound.request),
    { status: 200, headers: { 'cache-control': 'no-store' } },
  )
  const snapshot = await collectCommerceSnapshot(
    database as SourceOwnerDatabase,
    checked.bound.request,
    checked.bound.offer,
    () => Math.floor((dependencies.now ?? Date.now()) / 1000),
  )
  return Response.json(snapshot, { status: 200, headers: { 'cache-control': 'no-store' } })
}
