/**
 * Shared formatting + status rules for SEO Master Engine run telemetry.
 *
 * The live Command Center history used to stringify objects with `${v}`,
 * which rendered ranking `topScores` as `[object Object]`. Status used to
 * flip the whole daily run to `partial` on a single flaky RSS source even
 * when plan / rank / LLM phases completed as designed.
 */

export function formatEngineSummaryValue(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => formatEngineSummaryValue(item))
      .filter(Boolean)
      .join(', ')
  }
  if (typeof value === 'object') {
    const rec = value as Record<string, unknown>
    if (typeof rec.pairTape === 'string' && rec.pairTape) return rec.pairTape
    if (rec.topic != null && rec.total != null) {
      const total = Number(rec.total)
      return `${String(rec.topic)}:${Number.isFinite(total) ? total.toFixed(1) : rec.total}`
    }
    return Object.entries(rec)
      .map(([k, v]) => {
        const inner = formatEngineSummaryValue(v)
        return inner ? `${k}:${inner}` : ''
      })
      .filter(Boolean)
      .join(',')
  }
  return String(value)
}

export function formatEngineRunSummary(summary: Record<string, unknown>): string {
  return Object.entries(summary)
    .map(([k, v]) => {
      const formatted = formatEngineSummaryValue(v)
      return formatted ? `${k}=${formatted}` : ''
    })
    .filter(Boolean)
    .join(' · ')
}

export function formatTopScores(
  scores: Array<{ topic: string; total: number }>,
): string[] {
  return scores.map((s) => `${s.topic}:${Number(s.total).toFixed(1)}`)
}

export function classifyEngineRunStatus(input: {
  phase: string
  itemsStored: number
  sourcesRun: number
  sourceErrors: number
  plans?: number
  rankComputed?: number
}): 'success' | 'partial' {
  const majoritySourcesFailed =
    input.sourceErrors > 0 &&
    input.sourcesRun > 0 &&
    input.sourceErrors >= Math.ceil(input.sourcesRun / 2)

  if (input.phase === 'all') {
    const coreOk = input.itemsStored > 0 && (input.plans || 0) > 0 && (input.rankComputed || 0) > 0
    if (!coreOk || majoritySourcesFailed) return 'partial'
    return 'success'
  }

  if (input.phase === 'knowledge') {
    if (input.itemsStored <= 0 || majoritySourcesFailed) return 'partial'
    return 'success'
  }

  if (input.phase === 'plan') {
    return (input.plans || 0) > 0 ? 'success' : 'partial'
  }

  if (input.phase === 'rank') {
    return (input.rankComputed || 0) > 0 ? 'success' : 'partial'
  }

  return input.sourceErrors ? 'partial' : 'success'
}
