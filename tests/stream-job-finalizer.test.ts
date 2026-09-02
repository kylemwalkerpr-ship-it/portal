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

describe('ingestStreamDraft attempt boundaries (NCLEX draft+revision glue regression)', () => {
  const A1 = 'Attempt one body prose. '
  const A2 = 'Attempt two rewritten from zero.'

  it('a delta from a NEW attempt REPLACES the buffer instead of appending', () => {
    const state: { lastAttempt?: number } = {}
    let acc = ''
    // Attempt 1 streams its full text token by token.
    acc = ingestStreamDraft(acc, { type: 'delta', text: A1, attempt: 1 }, state)
    acc = ingestStreamDraft(acc, { type: 'delta', text: 'More of attempt one. ', attempt: 1 }, state)
    expect(acc).toBe(A1 + 'More of attempt one. ')
    // Attempt 2 (refine) restarts from zero — its first delta must REPLACE.
    acc = ingestStreamDraft(acc, { type: 'delta', text: A2, attempt: 2 }, state)
    expect(acc).toBe(A2)
  })

  it('deltas within the SAME attempt keep appending', () => {
    const state: { lastAttempt?: number } = {}
    let acc = ingestStreamDraft('', { type: 'delta', text: 'One ', attempt: 2 }, state)
    acc = ingestStreamDraft(acc, { type: 'delta', text: 'Two', attempt: 2 }, state)
    expect(acc).toBe('One Two')
  })

  it('a full snapshot replaces and re-arms the boundary tracker', () => {
    const state: { lastAttempt?: number } = {}
    let acc = ingestStreamDraft('', { type: 'delta', text: 'partial', attempt: 1 }, state)
    acc = ingestStreamDraft(acc, { type: 'attempt', attempt: 1, draft: '# Full attempt-one article' }, state)
    expect(acc).toBe('# Full attempt-one article')
    // Same attempt continues appending on top of the snapshot.
    acc = ingestStreamDraft(acc, { type: 'delta', text: ' tail', attempt: 1 }, state)
    expect(acc).toBe('# Full attempt-one article tail')
    // A later attempt still replaces.
    acc = ingestStreamDraft(acc, { type: 'delta', text: 'fresh', attempt: 2 }, state)
    expect(acc).toBe('fresh')
  })

  it('legacy two-arg calls keep the append-only behavior (back-compat)', () => {
    let acc = ingestStreamDraft('', { type: 'delta', text: 'A', attempt: 1 })
    acc = ingestStreamDraft(acc, { type: 'delta', text: 'B', attempt: 2 })
    expect(acc).toBe('AB')
  })

  it('NCLEX sequence: accepted attempt 1 + refine deltas never glue into two copies', () => {
    const state: { lastAttempt?: number } = {}
    let acc = ''
    // Attempt 1: the full 2,277-word draft streams through and is accepted.
    acc = ingestStreamDraft(acc, { type: 'delta', text: 'NCLEX copy one body. ', attempt: 1 }, state)
    acc = ingestStreamDraft(acc, { type: 'attempt', attempt: 1, draft: 'NCLEX copy one body.' }, state)
    // Attempt 2: the refine pass rewrites from zero.
    acc = ingestStreamDraft(acc, { type: 'delta', text: 'NCLEX copy two body.', attempt: 2 }, state)
    expect(acc).not.toContain('copy one')
    expect(acc).toBe('NCLEX copy two body.')
  })
})
