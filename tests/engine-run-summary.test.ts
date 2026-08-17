import {
  classifyEngineRunStatus,
  formatEngineRunSummary,
  formatEngineSummaryValue,
  formatTopScores,
} from '@/lib/seoEngine/engineRunSummary'

describe('engine run telemetry', () => {
  it('renders ranking topScores as topic:score instead of [object Object]', () => {
    const summary = formatEngineRunSummary({
      phase: 'all',
      plans: 11,
      topScores: [
        { topic: 'uk skilled worker visa', total: 72.4 },
        { topic: 'canada express entry', total: 61 },
      ],
      tracked: 0,
      onTrackRate: 0,
    })
    expect(summary).toContain('topScores=uk skilled worker visa:72.4, canada express entry:61.0')
    expect(summary).not.toContain('[object Object]')
    expect(summary).toContain('phase=all')
    expect(summary).toContain('plans=11')
  })

  it('formats a single score object the same way', () => {
    expect(formatEngineSummaryValue({ topic: 'h-1b', total: 40 })).toBe('h-1b:40.0')
  })

  it('serializes topScores for persistence so even old UIs stay readable', () => {
    expect(formatTopScores([{ topic: 'ilr', total: 55.51 }])).toEqual(['ilr:55.5'])
  })

  it('treats a daily run as success when core phases completed despite a flaky RSS source', () => {
    expect(classifyEngineRunStatus({
      phase: 'all',
      itemsStored: 6,
      sourcesRun: 12,
      sourceErrors: 2,
      plans: 11,
      rankComputed: 12,
    })).toBe('success')
  })

  it('marks daily partial when ingest stored nothing or planner produced no plans', () => {
    expect(classifyEngineRunStatus({
      phase: 'all',
      itemsStored: 0,
      sourcesRun: 12,
      sourceErrors: 0,
      plans: 11,
      rankComputed: 12,
    })).toBe('partial')
    expect(classifyEngineRunStatus({
      phase: 'all',
      itemsStored: 6,
      sourcesRun: 12,
      sourceErrors: 0,
      plans: 0,
      rankComputed: 0,
    })).toBe('partial')
  })

  it('marks knowledge partial only when a majority of sources fail or nothing stored', () => {
    expect(classifyEngineRunStatus({
      phase: 'knowledge',
      itemsStored: 13,
      sourcesRun: 12,
      sourceErrors: 1,
    })).toBe('success')
    expect(classifyEngineRunStatus({
      phase: 'knowledge',
      itemsStored: 13,
      sourcesRun: 12,
      sourceErrors: 7,
    })).toBe('partial')
  })
})
