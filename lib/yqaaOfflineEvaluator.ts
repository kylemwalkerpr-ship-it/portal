export type YqaaGoldCase = {
  id: string
  stratum: string
  predictedSafe: boolean
  humanSafe: boolean
  labelSource: 'licensed_expert' | 'trained_reviewer'
  rubricVersion: string
  providerHash?: string | null
  categoryHash?: string | null
}

export const REQUIRED_YQAA_STRATA = [
  'channel:dm', 'channel:public', 'channel:support',
  'risk:high-stakes', 'evidence:thin-or-conflicting', 'commerce:pricing-and-scope',
] as const

export type YqaaEvaluation = {
  caseCount: number
  falseSafeCount: number
  falseUnsafeCount: number
  strata: Record<string, { count: number; falseSafeCount: number; falseUnsafeCount: number }>
  promotion: 'HOLD_FALSE_SAFE' | 'HOLD_INSUFFICIENT_LABELS' | 'HUMAN_REVIEW_REQUIRED'
  proposal: { kind: 'shadow_calibration'; rubricVersion: string | null; eligible: boolean }
}

/** Reproducible metrics only. This never writes policy or authorizes promotion. */
export function evaluateYqaaGoldSet(
  cases: YqaaGoldCase[],
  minimumPerStratum = 5,
  requiredStrata: readonly string[] = REQUIRED_YQAA_STRATA,
): YqaaEvaluation {
  const strata: YqaaEvaluation['strata'] = {}
  let falseSafeCount = 0
  let falseUnsafeCount = 0
  const rubricVersions = new Set(cases.map((item) => item.rubricVersion))
  for (const item of cases) {
    const isFalseSafe = item.predictedSafe && !item.humanSafe
    const isFalseUnsafe = !item.predictedSafe && item.humanSafe
    if (isFalseSafe) falseSafeCount += 1
    if (isFalseUnsafe) falseUnsafeCount += 1
    const groups = [item.stratum,
      item.providerHash ? `provider:${item.providerHash}` : null,
      item.categoryHash ? `category:${item.categoryHash}` : null,
    ].filter((group): group is string => Boolean(group))
    for (const key of groups) {
      const group = strata[key] || (strata[key] = { count: 0, falseSafeCount: 0, falseUnsafeCount: 0 })
      group.count += 1
      if (isFalseSafe) group.falseSafeCount += 1
      if (isFalseUnsafe) group.falseUnsafeCount += 1
    }
  }
  for (const stratum of requiredStrata) {
    if (!strata[stratum]) strata[stratum] = { count: 0, falseSafeCount: 0, falseUnsafeCount: 0 }
  }
  const enough = cases.length > 0 && requiredStrata.length > 0 && requiredStrata.every((stratum) => strata[stratum]?.count >= minimumPerStratum)
  const promotion = falseSafeCount > 0 ? 'HOLD_FALSE_SAFE'
    : !enough ? 'HOLD_INSUFFICIENT_LABELS' : 'HUMAN_REVIEW_REQUIRED'
  return {
    caseCount: cases.length, falseSafeCount, falseUnsafeCount, strata, promotion,
    proposal: {
      kind: 'shadow_calibration',
      rubricVersion: rubricVersions.size === 1 ? [...rubricVersions][0] : null,
      eligible: promotion === 'HUMAN_REVIEW_REQUIRED',
    },
  }
}
