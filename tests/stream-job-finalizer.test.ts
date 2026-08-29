import { interruptedJobPatch, ingestStreamDraft } from '@/lib/seoFactory/streamJobFinalizer'

const LONG = 'Draft paragraph with substantial checkpoint content that survived the stream interruption. '.repeat(6)

describe('interruptedJobPatch', () => {
  it('fails empty content', () => {
    const patch = interruptedJobPatch('')
    expect(patch.status).toBe('failed')
    expect(patch.error_message).toBe('No draft produced before stream ended')
    expect(patch.content).toBeUndefined()
  })

  it('fails null content', () => {
    const patch = interruptedJobPatch(null as unknown as string)
    expect(patch.status).toBe('failed')
    expect(patch.error_message).toBe('No draft produced before stream ended')
  })

  it('fails whitespace-only content', () => {
    const patch = interruptedJobPatch('   ')
    expect(patch.status).toBe('failed')
  })

  it('keeps substantial content resumable as drafting', () => {
    const patch = interruptedJobPatch(LONG)
    expect(patch.status).toBe('drafting')
    const msg = String(patch.error_message || '')
    expect(/Interrupted|Resume/i.test(msg)).toBe(true)
    expect(patch.content).toBe(LONG)
    expect(Number(patch.word_count)).toBeGreaterThan(0)
  })

  it('keeps exactly-at-threshold fragments resumable (must be > 200 chars)', () => {
    const at200 = 'x'.repeat(200)
    expect(interruptedJobPatch(at200).status).toBe('failed')
    const at201 = 'x'.repeat(201)
    expect(interruptedJobPatch(at201).status).toBe('drafting')
  })

  it('failedMessage override wins on empty content', () => {
    const patch = interruptedJobPatch('', { failedMessage: 'custom failure reason' })
    expect(patch.status).toBe('failed')
    expect(patch.error_message).toBe('custom failure reason')
  })

  it('interruptedMessage override wins on resumable content', () => {
    const patch = interruptedJobPatch(LONG, { interruptedMessage: 'custom resume message' })
    expect(patch.status).toBe('drafting')
    expect(patch.error_message).toBe('custom resume message')
  })

  it('ingestStreamDraft appends token deltas and prefers full snapshots', () => {
    expect(ingestStreamDraft('', { type: 'delta', text: 'Hello ' })).toBe('Hello ')
    expect(ingestStreamDraft('Hello ', { type: 'delta', text: 'world' })).toBe('Hello world')
    expect(ingestStreamDraft('Hello world', { type: 'attempt', draft: '# Full article\n\nBody.' })).toBe('# Full article\n\nBody.')
  })
})
