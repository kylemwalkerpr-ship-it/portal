/**
 * EditorPatch tests (implementation brief §5.3 + §7.5/§7.6, Milestone B).
 * Patch safety: wholesale rejection with the document untouched. Patch
 * success: one precise finding clears, everything else is preserved.
 *
 * Registry mapping note: `duplicate_h2` is a `deterministic` repair (handled
 * by code, tested in the loop suite). Patchable findings here use registered
 * `targeted_ai` codes — exactly what the applier enforces.
 */
import { applyEditorPatch, anchorHash, parseEditorPatch } from '@/lib/seoFactory/editorPatch'
import { textHash } from '@/lib/seoFactory/documentFingerprint'

const DOC = `---
title: UK Skilled Worker Visa Requirements 2026 Guide
description: Eligibility, salary thresholds, documents, and the application procedure for the UK Skilled Worker visa.
robots: index,follow
---

# UK Skilled Worker Visa Requirements

## In 60 seconds

- You need a sponsoring employer
- Apply online with your documents

## Eligibility

You must have a licensed sponsor. See [Home Office rules](https://www.gov.uk/skilled-worker-visa).

## FAQ

### Do I need IELTS?

Yes, most applicants prove English ability.

## FAQ

Yes, most applicants prove English ability.

## Sources

- https://www.gov.uk/skilled-worker-visa
`

const TARGET = [{ code: 'untrusted_external_link' }, { code: 'outcome_promise' }, { code: 'ai_slop' }]

describe('parseEditorPatch', () => {
  it('parses a valid v1 patch', () => {
    const raw = JSON.stringify({
      version: 1,
      operations: [
        { kind: 'replace', findingCode: 'ai_slop', anchor: '- Apply online with your documents', expectedHash: textHash('- Apply online with your documents'), replacement: '- Apply online with your documents (clear)' },
      ],
    })
    expect(parseEditorPatch(raw)).toMatchObject({ ok: true })
  })

  it('rejects invalid JSON and wrong shapes', () => {
    expect(parseEditorPatch('not json').ok).toBe(false)
    expect(parseEditorPatch('{"version":2,"operations":[]}').ok).toBe(false)
    expect(parseEditorPatch('{"version":1,"operations":[{"kind":"rewrite"}]}').ok).toBe(false)
  })
})

describe('applyEditorPatch — success', () => {
  it('replaces one bad link on its own line without touching other sections', () => {
    const badAnchor = 'See [Home Office rules](https://www.gov.gov.uk/skilled-worker-visa).'
    const doc = DOC.replace(
      'See [Home Office rules](https://www.gov.uk/skilled-worker-visa).',
      badAnchor,
    )
    const patch = parseEditorPatch(
      JSON.stringify({
        version: 1,
        operations: [
          {
            kind: 'replace',
            findingCode: 'untrusted_external_link',
            anchor: badAnchor,
            expectedHash: anchorHash(doc, badAnchor),
            replacement: 'See [Home Office rules](https://www.gov.uk/skilled-worker-visa).',
          },
        ],
      }),
    )
    if (!patch.ok) throw new Error(`fixture patch must parse: ${(patch as { reason?: string }).reason}`)
    const result = applyEditorPatch(doc, patch.patch, { outstanding: TARGET })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.applied).toEqual(['replace:untrusted_external_link'])
    expect(result.content).toContain('https://www.gov.uk/skilled-worker-visa')
    expect(result.content).not.toContain('gov.gov.uk')
    expect(result.content).toContain('## FAQ')
    expect(result.content).toContain('## In 60 seconds')
  })

  it('rewrites one sloppy sentence without touching anything else', () => {
    const anchor = 'You must have a licensed sponsor.'
    const doc = DOC.replace('You must have a licensed sponsor. See', `${anchor} We guarantee your visa. See`)
    const patch = parseEditorPatch(
      JSON.stringify({
        version: 1,
        operations: [
          {
            kind: 'replace',
            findingCode: 'outcome_promise',
            anchor: `${anchor} We guarantee your visa.`,
            expectedHash: anchorHash(doc, `${anchor} We guarantee your visa.`),
            replacement: anchor,
          },
        ],
      }),
    )
    if (!patch.ok) throw new Error('fixture patch must parse')
    const result = applyEditorPatch(doc, patch.patch, { outstanding: TARGET })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.content).not.toContain('guarantee')
    expect(result.content).toContain('## FAQ')
  })

  it('inserts a bullet at a targeted anchor', () => {
    const patch = parseEditorPatch(
      JSON.stringify({
        version: 1,
        operations: [
          {
            kind: 'insert_after',
            findingCode: 'ai_slop',
            anchor: '- You need a sponsoring employer',
            expectedHash: anchorHash(DOC, '- You need a sponsoring employer'),
            insertion: '- Your employer must hold a licence',
          },
        ],
      }),
    )
    if (!patch.ok) throw new Error('fixture patch must parse')
    const result = applyEditorPatch(DOC, patch.patch, { outstanding: TARGET })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.content).toContain('- Your employer must hold a licence')
  })

  it('removes a flagged malformed link line', () => {
    const doc = DOC.replace('## FAQ', 'See [dead board](https://example-dead.gov/x).\n\n## FAQ')
    const patch = parseEditorPatch(
      JSON.stringify({
        version: 1,
        operations: [
          { kind: 'remove', findingCode: 'untrusted_external_link', anchor: 'See [dead board](https://example-dead.gov/x).', expectedHash: anchorHash(doc, 'See [dead board](https://example-dead.gov/x).') },
        ],
      }),
    )
    if (!patch.ok) throw new Error('fixture patch must parse')
    const result = applyEditorPatch(doc, patch.patch, { outstanding: TARGET })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.content).not.toContain('example-dead.gov')
    expect(result.content).toContain('## In 60 seconds')
  })
})

describe('applyEditorPatch — wholesale rejection', () => {
  const outstanding = TARGET.concat([{ code: 'duplicate_h2' }, { code: 'unverified_internal_link' }])

  it('rejects a finding code that is not outstanding', () => {
    const patch = parseEditorPatch(
      JSON.stringify({
        version: 1,
        operations: [{ kind: 'remove', findingCode: 'duplicate_h2', anchor: '## FAQ', expectedHash: 'x' }],
      }),
    )
    if (!patch.ok) throw new Error('fixture patch must parse')
    const result = applyEditorPatch(DOC, patch.patch, { outstanding: [{ code: 'outcome_promise' }] })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect('reason' in result ? result.reason : '').toContain('not outstanding')
  })

  it('rejects human_only / non-targeted_ai repair classes', () => {
    const patch = parseEditorPatch(
      JSON.stringify({
        version: 1,
        operations: [{ kind: 'remove', findingCode: 'unverified_internal_link', anchor: '## FAQ', expectedHash: 'x' }],
      }),
    )
    if (!patch.ok) throw new Error('fixture patch must parse')
    const result = applyEditorPatch(DOC, patch.patch, { outstanding })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect('reason' in result ? result.reason : '').toContain('human_only')
  })

  it('rejects unregistered finding codes', () => {
    const patch = parseEditorPatch(
      JSON.stringify({
        version: 1,
        operations: [{ kind: 'remove', findingCode: 'totally_made_up_code', anchor: '## FAQ', expectedHash: 'x' }],
      }),
    )
    if (!patch.ok) throw new Error('fixture patch must parse')
    const result = applyEditorPatch(DOC, patch.patch, { outstanding: [{ code: 'totally_made_up_code' }] })
    expect(result.ok).toBe(false)
  })

  it('rejects a missing or ambiguous anchor', () => {
    const missing = parseEditorPatch(
      JSON.stringify({
        version: 1,
        operations: [{ kind: 'remove', findingCode: 'ai_slop', anchor: '## Does Not Exist', expectedHash: '00000000' }],
      }),
    )
    if (!missing.ok) throw new Error('fixture patch must parse')
    expect(applyEditorPatch(DOC, missing.patch, { outstanding })).toMatchObject({ ok: false })

    // '## FAQ' and the answer line both occur twice.
    for (const anchor of ['## FAQ', 'Yes, most applicants prove English ability.']) {
      const ambiguous = parseEditorPatch(
        JSON.stringify({
          version: 1,
          operations: [{ kind: 'remove', findingCode: 'ai_slop', anchor, expectedHash: textHash(anchor) }],
        }),
      )
      if (!ambiguous.ok) throw new Error('fixture patch must parse')
      const r = applyEditorPatch(DOC, ambiguous.patch, { outstanding })
      expect(r.ok).toBe(false)
      if (r.ok) return
      expect('reason' in r ? r.reason : '').toContain('ambiguous')
    }
  })

  it('rejects an expectedHash mismatch', () => {
    const patch = parseEditorPatch(
      JSON.stringify({
        version: 1,
        operations: [{ kind: 'remove', findingCode: 'ai_slop', anchor: '## In 60 seconds', expectedHash: 'deadbeef' }],
      }),
    )
    if (!patch.ok) throw new Error('fixture patch must parse')
    const r = applyEditorPatch(DOC, patch.patch, { outstanding })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect('reason' in r ? r.reason : '').toContain('expectedHash')
  })

  it('rejects edits to frontmatter, code fences, and new headings outside the anchor', () => {
    const fmAnchor = 'robots: index,follow'
    const fmPatch = parseEditorPatch(
      JSON.stringify({
        version: 1,
        operations: [{ kind: 'replace', findingCode: 'ai_slop', anchor: fmAnchor, expectedHash: anchorHash(DOC, fmAnchor), replacement: 'robots: noindex,follow' }],
      }),
    )
    if (!fmPatch.ok) throw new Error('fixture patch must parse')
    expect(applyEditorPatch(DOC, fmPatch.patch, { outstanding })).toMatchObject({ ok: false })

    const fencePatch = parseEditorPatch(
      JSON.stringify({
        version: 1,
        operations: [{ kind: 'replace', findingCode: 'ai_slop', anchor: '## In 60 seconds', expectedHash: anchorHash(DOC, '## In 60 seconds'), replacement: '```\ncode\n```' }],
      }),
    )
    if (!fencePatch.ok) throw new Error('fixture patch must parse')
    const fenceResult = applyEditorPatch(DOC, fencePatch.patch, { outstanding })
    expect(fenceResult.ok).toBe(false)
    if (fenceResult.ok) return
    expect('reason' in fenceResult ? fenceResult.reason : '').toContain('code fence')

    const newHeadingPatch = parseEditorPatch(
      JSON.stringify({
        version: 1,
        operations: [{ kind: 'insert_after', findingCode: 'ai_slop', anchor: '- You need a sponsoring employer', expectedHash: anchorHash(DOC, '- You need a sponsoring employer'), insertion: '## Sneaky new section' }],
      }),
    )
    if (!newHeadingPatch.ok) throw new Error('fixture patch must parse')
    expect(applyEditorPatch(DOC, newHeadingPatch.patch, { outstanding })).toMatchObject({
      ok: false,
      reason: expect.stringContaining('heading'),
    })
  })

  it('enforces the operation cap', () => {
    const op = { kind: 'remove', findingCode: 'ai_slop', anchor: '## In 60 seconds', expectedHash: anchorHash(DOC, '## In 60 seconds') }
    const patch = parseEditorPatch(JSON.stringify({ version: 1, operations: Array(13).fill(op) }))
    if (!patch.ok) throw new Error('fixture patch must parse')
    const result = applyEditorPatch(DOC, patch.patch, { outstanding })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect('reason' in result ? result.reason : '').toContain('operation cap')
  })

  it('leaves the accepted document untouched on any rejection (pure module)', () => {
    const before = DOC
    const patch = parseEditorPatch(
      JSON.stringify({
        version: 1,
        operations: [{ kind: 'remove', findingCode: 'ai_slop', anchor: '## Missing', expectedHash: 'x' }],
      }),
    )
    if (!patch.ok) throw new Error('fixture patch must parse')
    expect(applyEditorPatch(DOC, patch.patch, { outstanding }).ok).toBe(false)
    expect(DOC).toBe(before)
  })

  it('is deterministic and idempotent over the same input', () => {
    const patch = parseEditorPatch(
      JSON.stringify({
        version: 1,
        operations: [
          { kind: 'insert_after', findingCode: 'ai_slop', anchor: '- You need a sponsoring employer', expectedHash: anchorHash(DOC, '- You need a sponsoring employer'), insertion: '- Your employer must hold a licence' },
        ],
      }),
    )
    if (!patch.ok) throw new Error('fixture patch must parse')
    const a = applyEditorPatch(DOC, patch.patch, { outstanding: TARGET })
    const b = applyEditorPatch(DOC, patch.patch, { outstanding: TARGET })
    expect(a).toEqual(b)
    expect(a.ok).toBe(true)
    if (!a.ok) return
    // The applied fingerprint hash is stable for identical output.
    expect(a.content).toBe('content' in b ? b.content : '')
  })
})
