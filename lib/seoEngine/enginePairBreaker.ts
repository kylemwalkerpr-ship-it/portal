/**
 * 15-minute circuit breaker for the Master Engine pair legs.
 *
 * Knowledge ingest calls the pair once per feed item. A dead Grok or Run BiOS
 * host must not be retried on every remaining item in the same run.
 */

export type EnginePairLeg = 'grok' | 'runbios-opus' | 'parasail-glm' | 'runbios-glm'

export const ENGINE_PAIR_BREAKER_MS = 15 * 60 * 1000
export const ENGINE_PAIR_BREAKER_THRESHOLD = 2

type Slot = { fails: number; openedAt: number }

const slots = new Map<EnginePairLeg, Slot>()

export function recordEngineLegFailure(leg: EnginePairLeg): void {
  const cur = slots.get(leg)
  if (!cur) {
    slots.set(leg, { fails: 1, openedAt: 0 })
    return
  }
  const fails = cur.fails + 1
  slots.set(leg, {
    fails,
    openedAt: fails >= ENGINE_PAIR_BREAKER_THRESHOLD ? (cur.openedAt || Date.now()) : 0,
  })
}

export function recordEngineLegSuccess(leg: EnginePairLeg): void {
  slots.delete(leg)
}

export function isEngineLegOpen(leg: EnginePairLeg): boolean {
  const cur = slots.get(leg)
  if (!cur || cur.fails < ENGINE_PAIR_BREAKER_THRESHOLD || !cur.openedAt) return false
  if (Date.now() - cur.openedAt > ENGINE_PAIR_BREAKER_MS) {
    slots.delete(leg)
    return false
  }
  return true
}

export function engineLegBreakerLabel(leg: EnginePairLeg): string | null {
  if (!isEngineLegOpen(leg)) return null
  const cur = slots.get(leg)!
  const left = Math.max(0, Math.ceil((ENGINE_PAIR_BREAKER_MS - (Date.now() - cur.openedAt)) / 1000))
  return `${leg} circuit-open (${cur.fails} fails, retry in ${left}s)`
}

export function resetEnginePairBreaker(): void {
  slots.clear()
}

export function enginePairBreakerStatus(): Array<{
  leg: EnginePairLeg
  fails: number
  open: boolean
  retryInSec: number
}> {
  return (['runbios-opus', 'grok'] as const).map((leg) => {
    const cur = slots.get(leg)
    const open = isEngineLegOpen(leg)
    return {
      leg,
      fails: cur?.fails ?? 0,
      open,
      retryInSec: open && cur?.openedAt
        ? Math.max(0, Math.ceil((ENGINE_PAIR_BREAKER_MS - (Date.now() - cur.openedAt)) / 1000))
        : 0,
    }
  })
}
