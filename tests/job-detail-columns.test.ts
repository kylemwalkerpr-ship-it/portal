import {
  JOB_BODY_COLUMNS,
  JOB_HEAVY_COLUMN_RE,
  JOB_LINEAGE_COLUMNS,
  JOB_LIST_COLUMNS,
  JOB_MUTATE_COLUMNS,
  JOB_OPEN_COLUMNS,
  jobDetailShouldAutoLoadBody,
  slimJobForClient,
} from '@/lib/seoFactory/jobColumns'

describe('content_jobs select lists stay slim', () => {
  it('never selects event_log, lineage, or gsc_json; slim audit_json only on body/mutate', () => {
    // List/open/lineage must stay free of every heavy blob — including full audit_json.
    expect(JOB_HEAVY_COLUMN_RE.test(JOB_LIST_COLUMNS)).toBe(false)
    expect(JOB_HEAVY_COLUMN_RE.test(JOB_OPEN_COLUMNS)).toBe(false)
    expect(JOB_HEAVY_COLUMN_RE.test(JOB_LINEAGE_COLUMNS)).toBe(false)
    // Body GET needs slim audit_json so shipReady survives hydration (P0-SHIP-4).
    // Still exclude truly heavy columns (event_log / lineage / gsc_json).
    const trulyHeavy = /(?:^|,)(?:event_log|lineage|gsc_json)(?:$|,)/
    expect(trulyHeavy.test(JOB_BODY_COLUMNS)).toBe(false)
    expect(JOB_BODY_COLUMNS.split(',')).toContain('audit_json')
    expect(JOB_MUTATE_COLUMNS).not.toMatch(/(?:^|,)(?:event_log|lineage|gsc_json)(?:$|,)/)
    expect(JOB_MUTATE_COLUMNS.split(',')).toContain('audit_json')
    expect(JOB_LIST_COLUMNS.split(',')).not.toContain('content')
    expect(JOB_OPEN_COLUMNS.split(',')).toContain('content')
    expect(JOB_BODY_COLUMNS.split(',')).toContain('content')
  })

  it('auto-loads a stored body even when the job failed the gate', () => {
    expect(jobDetailShouldAutoLoadBody({
      status: 'drafting',
      error_message: 'All content AI providers failed',
      word_count: 2386,
    })).toBe(true)
    expect(jobDetailShouldAutoLoadBody({
      status: 'failed',
      error_message: 'quality gate',
      content: '# draft',
    })).toBe(true)
    expect(jobDetailShouldAutoLoadBody({
      status: 'drafting',
      error_message: null,
      word_count: 1800,
    })).toBe(true)
    expect(jobDetailShouldAutoLoadBody({
      status: 'failed',
      error_message: 'quality gate',
    })).toBe(false)
  })

  it('strips heavy blobs before a job row is sent to the modal', () => {
    const slim = slimJobForClient({
      id: '1',
      content: 'ok',
      event_log: [{ message: 'huge' }],
      lineage: { n: 1 },
      gsc_json: { clicks: 1 },
    })
    expect(slim.content).toBe('ok')
    expect(slim.event_log).toBeUndefined()
    expect(slim.lineage).toBeUndefined()
    expect(slim.gsc_json).toBeUndefined()
  })
})
