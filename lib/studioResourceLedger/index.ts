/**
 * Read-only presentation contract for the Studio resource ledger.
 * Versioned independently; this is not a runtime ledger or admission API.
 */
export const STUDIO_RESOURCE_LEDGER_INTERFACE_VERSION = 'studio.resource-ledger/1' as const

export type LedgerEvidence = {
  source: string
  observedAt: string
  window: string
}

export type KnownAmount = {
  state: 'known'
  value: number
  unit: string
  evidence: LedgerEvidence
}

export type EstimatedAmount = {
  state: 'estimated'
  value: number
  unit: string
  method: string
  methodVersion: string
  evidence?: LedgerEvidence
}

export type NonNumericAmount = {
  state: 'unknown' | 'unavailable' | 'not_applicable'
  reason: string
}

export type LedgerAmount = KnownAmount | EstimatedAmount | NonNumericAmount

export type ChargedAmount =
  | (KnownAmount & { currency: string })
  | NonNumericAmount

export type StudioResourceLedgerSnapshot = {
  interfaceVersion: typeof STUDIO_RESOURCE_LEDGER_INTERFACE_VERSION
  activation: 'disabled'
  projected: LedgerAmount
  observed: LedgerAmount
  charged: ChargedAmount
}

/** Runtime guard for evidence that can be displayed as a verified measurement. */
export function hasValidLedgerEvidence(evidence: LedgerEvidence): boolean {
  if (!evidence || typeof evidence.source !== 'string' || typeof evidence.observedAt !== 'string' || typeof evidence.window !== 'string') return false
  const observedAt = new Date(evidence.observedAt)
  return Boolean(
    evidence.source.trim()
    && evidence.window.trim()
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(evidence.observedAt)
    && Number.isFinite(observedAt.getTime())
    && observedAt.toISOString() === evidence.observedAt.replace(/(?:\.(\d+))?Z$/, (_, fraction: string | undefined) => `.${(fraction || '').padEnd(3, '0').slice(0, 3)}Z`)
  )
}

export function isValidKnownAmount(amount: KnownAmount): boolean {
  if (!amount || typeof amount.unit !== 'string' || typeof amount.value !== 'number') return false
  return Number.isFinite(amount.value)
    && Boolean(amount.unit.trim())
    && hasValidLedgerEvidence(amount.evidence)
}

export function ledgerAmountLabel(amount: LedgerAmount | ChargedAmount): string {
  switch (amount.state) {
    case 'known':
      if (!isValidKnownAmount(amount)) return 'UNKNOWN'
      return `${amount.value} ${'currency' in amount ? amount.currency : amount.unit}`
    case 'estimated':
      return `Estimated ${amount.value} ${amount.unit}`
    case 'unknown':
      return 'UNKNOWN'
    case 'unavailable':
      return 'Unavailable'
    case 'not_applicable':
      return 'Not applicable'
  }
}
