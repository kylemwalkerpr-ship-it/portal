import {
  blendDeskWithGsc,
  formatGscEvidenceLine,
  gscActionToPlay,
  gscRowToSuggestionSeed,
  gscTopicKey,
  mergeGscIntoTopics,
  shouldPromoteGscRow,
  titleFromGscQuery,
} from '../lib/seoFactory/workPlanGscMerge'

describe('Discover GSC ↔ Master Engine merge', () => {
  test('junk GSC queries never enter the work plan', () => {
    expect(shouldPromoteGscRow({ query: 'stockton meal plan.pdf', action: 'REFRESH', score: 90, impressions: 400 })).toBe(false)
    expect(shouldPromoteGscRow({ query: 'https://ircc.gc.ca', action: 'CREATE', score: 88 })).toBe(false)
  })

  test('WATCH stays out unless it is high-priority first-party demand', () => {
    expect(shouldPromoteGscRow({ query: 'canada study permit', action: 'WATCH', score: 40 })).toBe(false)
    expect(shouldPromoteGscRow({ query: 'canada study permit', action: 'WATCH', score: 72, impressions: 800 })).toBe(true)
  })

  test('maps first-party actions onto engine plays', () => {
    expect(gscActionToPlay('CREATE')).toBe('content_gap')
    expect(gscActionToPlay('REFRESH')).toBe('refresh')
    expect(gscActionToPlay('CONSOLIDATE')).toBe('cannibalization')
    expect(gscActionToPlay('DEFEND')).toBe('defend')
  })

  test('enriches matching radar topics and promotes unmatched CREATE/REFRESH rows', () => {
    const { matched, unmatched } = mergeGscIntoTopics(
      [{ topic: 'express entry crs calculator' }],
      [
        { query: 'express entry crs calculator', action: 'REFRESH', score: 81, impressions: 1200, position: 9, ctr: 0.03 },
        { query: 'canada visitor visa processing time', action: 'CREATE', score: 64, impressions: 400, position: 42, ctr: 0.01 },
        { query: 'rates final.pdf', action: 'REFRESH', score: 99, impressions: 9000 },
      ],
    )
    expect(matched.get(gscTopicKey('express entry crs calculator'))?.score).toBe(81)
    expect(unmatched.map((r) => r.query)).toEqual(['canada visitor visa processing time'])
  })

  test('blends engine deskScore with first-party GSC without discarding either', () => {
    expect(blendDeskWithGsc(70, 80)).toBe(74)
    expect(blendDeskWithGsc(40, 0)).toBe(40)
    expect(blendDeskWithGsc(90, 30)).toBe(67)
  })

  test('unmatched CREATE rows become brief-ready seeds', () => {
    const seed = gscRowToSuggestionSeed({
      query: 'uk spouse visa processing time',
      action: 'CREATE',
      score: 71,
      impressions: 540,
      clicks: 4,
      position: 38,
      ctr: 0.007,
      actionReasons: ['Demand exists and no sufficiently relevant URL covers the intent'],
    })
    expect(seed).not.toBeNull()
    expect(seed?.play).toBe('content_gap')
    expect(seed?.title).toBe(titleFromGscQuery('uk spouse visa processing time', 'CREATE'))
    expect(seed?.signals[0]).toMatch(/First-party GSC/)
    expect(seed?.signals[0]).toMatch(/CREATE/)
  })

  test('evidence line is operator-readable and junk never seeds a brief', () => {
    expect(gscRowToSuggestionSeed({ query: 'stockton meal plan.pdf', action: 'REFRESH', score: 99 })).toBeNull()
    const line = formatGscEvidenceLine({
      impressions: 1619,
      clicks: 0,
      ctr: 0.012,
      position: 11.4,
      score: 64,
      action: 'REFRESH',
    })
    expect(line).toContain('1,619 impressions')
    expect(line).toContain('pos 11')
    expect(line).toContain('REFRESH')
  })
})
