import {
  JOB_BODY_COLUMNS,
  JOB_HEAVY_COLUMN_RE,
  JOB_LINEAGE_COLUMNS,
  JOB_LIST_COLUMNS,
  JOB_OPEN_COLUMNS,
} from '@/lib/seoFactory/jobColumns'

describe('content_jobs select lists stay slim', () => {
  it('never selects event_log, lineage, audit_json, or gsc_json on list or open', () => {
    expect(JOB_HEAVY_COLUMN_RE.test(JOB_LIST_COLUMNS)).toBe(false)
    expect(JOB_HEAVY_COLUMN_RE.test(JOB_OPEN_COLUMNS)).toBe(false)
    expect(JOB_HEAVY_COLUMN_RE.test(JOB_BODY_COLUMNS)).toBe(false)
    expect(JOB_HEAVY_COLUMN_RE.test(JOB_LINEAGE_COLUMNS)).toBe(false)
    expect(JOB_LIST_COLUMNS.split(',')).not.toContain('content')
    expect(JOB_OPEN_COLUMNS.split(',')).toContain('content')
    expect(JOB_BODY_COLUMNS.split(',')).toContain('content')
  })
})
