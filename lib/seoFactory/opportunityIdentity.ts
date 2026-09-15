/**
 * Stable opportunity identity. Exact keyword folding is not enough:
 * US I-485 and AU subclass 485 must remain distinct, and different reader
 * decisions on the same form/visa (renewal vs OPT timing) must not collide.
 */

import { createHash } from 'crypto'

export type OpportunityAction =
  | 'create'
  | 'update'
  | 'consolidate'
  | 'research'
  | 'supply_first'
  | 'reject'

export type OpportunityIdentity = {
  id: string
  intentKey: string
  entityKey: string
  jurisdiction: string
  audienceStage: string
  readerIntent: string
}

const STOP = new Set([
  'a', 'an', 'and', 'for', 'from', 'how', 'in', 'is', 'of', 'on', 'or', 'the',
  'to', 'what', 'with', 'guide', 'visa', 'form', 'application',
])

export function normalizeIntentText(value: string): string {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\u2019']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function extractJurisdiction(text: string, fallback = 'UNSCOPED'): string {
  const t = String(text || '')
  if (/\b(i-?485|adjustment of status|uscis|united states|\busa\b|\bu\.s\.)\b/i.test(t)) return 'US'
  if (/\b(subclass\s*485|temporary graduate|home affairs|australia)\b/i.test(t)) return 'AU'
  if (/\b(express entry|study permit|ircc|canada)\b/i.test(t)) return 'CA'
  if (/\b(ukvi|skilled worker|graduate route|\buk\b|united kingdom)\b/i.test(t)) return 'UK'
  if (/\bf-?1\b/i.test(t)) return 'US'
  return fallback
}

export function extractEntityKey(text: string): string {
  const t = normalizeIntentText(text)
  if (/\bi\s*485\b/.test(t) || /\badjustment of status\b/.test(t)) return 'form-i-485'
  if (/\bsubclass\s*485\b/.test(t) || /\b485 visa\b/.test(t) || /\btemporary graduate\b/.test(t)) return 'au-subclass-485'
  if (/\bf\s*1\b/.test(t)) return 'visa-f-1'
  if (/\bh\s*1b\b/.test(t)) return 'visa-h-1b'
  const tokens = t.split(' ').filter((token) => token.length > 2 && !STOP.has(token))
  return tokens.slice(0, 6).join('-') || 'unspecified'
}

const ENTITY_STRIP = /\b(i-?485|form i-?485|adjustment of status|subclass\s*485|temporary graduate|f-?1|h-?1b|uscis|ircc|ukvi|visa)\b/gi

/**
 * The reader's actual decision, distinct from the legal entity.
 * "F-1 visa renewal" and "F-1 OPT application timing" must not share an id.
 */
export function extractReaderIntent(text: string): string {
  const cleaned = normalizeIntentText(String(text || '').replace(ENTITY_STRIP, ' '))
  const tokens = cleaned.split(' ').filter((token) => token.length > 2 && !STOP.has(token))
  return tokens.slice(0, 8).join('-') || 'unspecified-decision'
}

export function buildOpportunityIdentity(input: {
  topic: string
  jurisdiction?: string
  audienceStage?: string
  action?: OpportunityAction
}): OpportunityIdentity {
  const jurisdiction = extractJurisdiction(input.topic, input.jurisdiction || 'UNSCOPED')
  const entityKey = extractEntityKey(input.topic)
  const readerIntent = extractReaderIntent(input.topic)
  const audienceStage = normalizeIntentText(input.audienceStage || 'undecided') || 'undecided'
  const intentKey = [jurisdiction, entityKey, readerIntent, audienceStage].join(':')
  const id = `opp_${createHash('sha256').update(intentKey).digest('hex').slice(0, 20)}`
  return { id, intentKey, entityKey, jurisdiction, audienceStage, readerIntent }
}

export function opportunitiesCollide(a: OpportunityIdentity, b: OpportunityIdentity): boolean {
  return a.id === b.id
}

/** Server-side reservation key. Two concurrent requests with this key must not create two jobs. */
export function opportunityReservationKey(identity: OpportunityIdentity, action: OpportunityAction = 'create'): string {
  return `reserve:${identity.id}:${action}`
}
