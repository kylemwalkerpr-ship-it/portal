export type YqaaGoldCase = {
  id: string
  stratum: string
  predictedSafe: boolean
  humanSafe: boolean
  labelSource: 'licensed_expert'
  expertQualification: string
  /** Critical YMYL cases require two independently identified expert labels. */
  critical?: boolean
  reviewerIds?: string[]
  reviewerQualifications?: string[]
  rubricVersion: string
  provenance: string
  providerHash?: string | null
  categoryHash?: string | null
}

export const REQUIRED_YQAA_STRATA = [
  'channel:dm', 'channel:public', 'channel:support',
  'risk:high-stakes', 'evidence:thin-or-conflicting', 'commerce:pricing-and-scope',
] as const

export type YqaaEvaluation = {
  caseCount: number
  validLabelCount: number
  invalidLabelCount: number
  falseSafeCount: number
  falseUnsafeCount: number
  strata: Record<string, { count: number; falseSafeCount: number; falseUnsafeCount: number }>
  promotion: 'HOLD_FALSE_SAFE' | 'HOLD_INSUFFICIENT_LABELS' | 'HOLD_MIXED_RUBRIC_VERSIONS' | 'HUMAN_REVIEW_REQUIRED'
  proposal: { kind: 'shadow_calibration'; rubricVersion: string | null; eligible: boolean }
}

function nonEmpty(value: unknown, maxLength = 240): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maxLength
}

/** Gold labels are data, so enforce the qualification contract at runtime too. */
export function isQualifiedYqaaGoldCase(value: unknown): value is YqaaGoldCase {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const item = value as Record<string, unknown>
  const basic = nonEmpty(item.id, 120) && nonEmpty(item.stratum, 120) &&
    typeof item.predictedSafe === 'boolean' && typeof item.humanSafe === 'boolean' &&
    item.labelSource === 'licensed_expert' && nonEmpty(item.expertQualification, 240) &&
    nonEmpty(item.rubricVersion, 80) && nonEmpty(item.provenance, 500) &&
    (item.providerHash == null || nonEmpty(item.providerHash, 128)) &&
    (item.categoryHash == null || nonEmpty(item.categoryHash, 128))
  if (!basic) return false
  const critical = item.critical === true || (typeof item.stratum === 'string' && /high.?stakes|critical/i.test(item.stratum))
  if (!critical) return item.critical == null || typeof item.critical === 'boolean'
  if (item.critical != null && typeof item.critical !== 'boolean') return false
  const ids = item.reviewerIds
  const qualifications = item.reviewerQualifications
  return Array.isArray(ids) && ids.length >= 2 && ids.every((id) => nonEmpty(id, 120)) &&
    new Set(ids.map((id) => String(id).trim())).size >= 2 &&
    Array.isArray(qualifications) && qualifications.length >= 2 && qualifications.every((qualification) => nonEmpty(qualification, 240))
}

/** Reproducible metrics only. This never writes policy or authorizes promotion. */
export function evaluateYqaaGoldSet(
  inputCases: unknown,
  minimumPerStratum = 5,
  requiredStrata: readonly string[] = REQUIRED_YQAA_STRATA,
): YqaaEvaluation {
  const cases = Array.isArray(inputCases) ? inputCases : []
  const required = Array.isArray(requiredStrata) ? requiredStrata.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : []
  const minimum = Number.isFinite(minimumPerStratum) && minimumPerStratum > 0 ? Math.floor(minimumPerStratum) : 5
  const strata: YqaaEvaluation['strata'] = {}
  let falseSafeCount = 0
  let falseUnsafeCount = 0
  const validCases = cases.filter(isQualifiedYqaaGoldCase)
  const rubricVersions = new Set(validCases.map((item) => item.rubricVersion.trim()))
  for (const item of validCases) {
    const isFalseSafe = item.predictedSafe && !item.humanSafe
    const isFalseUnsafe = !item.predictedSafe && item.humanSafe
    if (isFalseSafe) falseSafeCount += 1
    if (isFalseUnsafe) falseUnsafeCount += 1
    const groups = [item.stratum.trim(),
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
  for (const stratum of required) {
    if (!strata[stratum]) strata[stratum] = { count: 0, falseSafeCount: 0, falseUnsafeCount: 0 }
  }
  const enough = validCases.length > 0 && required.length > 0 && required.every((stratum) => strata[stratum]?.count >= minimum)
  const promotion = falseSafeCount > 0 ? 'HOLD_FALSE_SAFE'
    : !enough ? 'HOLD_INSUFFICIENT_LABELS'
      : rubricVersions.size !== 1 ? 'HOLD_MIXED_RUBRIC_VERSIONS' : 'HUMAN_REVIEW_REQUIRED'
  return {
    caseCount: cases.length, validLabelCount: validCases.length, invalidLabelCount: cases.length - validCases.length,
    falseSafeCount, falseUnsafeCount, strata, promotion,
    proposal: {
      kind: 'shadow_calibration',
      rubricVersion: rubricVersions.size === 1 ? [...rubricVersions][0] : null,
      eligible: promotion === 'HUMAN_REVIEW_REQUIRED',
    },
  }
}
