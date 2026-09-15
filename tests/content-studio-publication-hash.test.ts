import {
  artifactContentHash,
  buildExpectedRevisionMarker,
  buildPublicationApprovalManifest,
  publicationBodyHash,
  publicationMarkerForContent,
  recordPublicationRenderedArtifact,
  runWithPublicationIdentity,
} from '@/lib/seoFactory/publicationProof'

const identity = {
  contractId: 'wc_12345678901234567890',
  contractHash: 'a'.repeat(64),
  opportunityId: 'opp-1',
}

const base = {
  jobId: 'job-1',
  ...identity,
  repoOwner: 'kylemwalkerpr-ship-it',
  repoName: 'portal',
  path: 'app/x/page.tsx',
  canonical: 'https://market.yousafeconsultancy.com/x/',
  approvalActor: 'admin-1',
}

function manifestDigests(content: string, marker: string) {
  const artifact = `export const metadata = { other: { "content-studio-revision": "${marker}" } };\n${content}`
  return {
    approvedArtifactHash: artifactContentHash(artifact),
    approvedBodyHash: publicationBodyHash(content),
  }
}

describe('publication manifest exact-body hashing', () => {
  it('rejects a manifest when the exact renderer-body hash is missing', () => {
    const content = 'post-repair body that actually entered the renderer'
    const marker = buildExpectedRevisionMarker({ ...identity, content })
    expect(() => buildPublicationApprovalManifest({
      ...base,
      content,
      expectedMarker: marker,
      ...manifestDigests(content, marker),
    })).toThrow(/approved content hash.*required/i)
  })

  it('rejects a manifest when an earlier draft hash is supplied for the rendered body', () => {
    const content = 'post-repair body that actually entered the renderer'
    const marker = buildExpectedRevisionMarker({ ...identity, content })
    expect(() => buildPublicationApprovalManifest({
      ...base,
      content,
      expectedMarker: marker,
      approvedContentHash: artifactContentHash('earlier accepted draft'),
      ...manifestDigests(content, marker),
    })).toThrow(/approved content hash.*does not match/i)
  })

  it('rejects a marker that was derived from a different body than the approved content hash', () => {
    const content = 'post-repair body that actually entered the renderer'
    const wrongMarker = buildExpectedRevisionMarker({ ...identity, content: 'other body' })
    expect(() => buildPublicationApprovalManifest({
      ...base,
      content,
      expectedMarker: wrongMarker,
      approvedContentHash: artifactContentHash(content),
      ...manifestDigests(content, wrongMarker),
    })).toThrow(/revision marker.*does not match/i)
  })

  it('publication-only context returns marker, exact rendered body and artifact/body digests from one renderer call', async () => {
    const content = 'post-repair body that actually entered the renderer'
    const marker = buildExpectedRevisionMarker({ ...identity, content })
    const artifact = `export const metadata = { other: { "content-studio-revision": "${marker}" } };\n${content}`
    const out = await runWithPublicationIdentity(identity, async () => {
      expect(publicationMarkerForContent(content)).toBe(marker)
      recordPublicationRenderedArtifact(artifact, content)
      return 'ok'
    })
    expect(out.result).toBe('ok')
    expect(out.marker).toBe(marker)
    expect(out.contentHash).toBe(artifactContentHash(content))
    expect(out.content).toBe(content)
    expect(out.artifactHash).toBe(artifactContentHash(artifact))
    expect(out.bodyHash).toBe(publicationBodyHash(content))
  })

  it('hashes equivalent Markdown and HTML ordered lists identically without discarding meaningful numbers', () => {
    const markdown = `## Filing steps\n\n1. Gather 2 identity documents.\n2. Pay the $410 fee on September 15, 2026.`
    const html = `<article><h2>Filing steps</h2><ol><li>Gather 2 identity documents.</li><li>Pay the $410 fee on September 15, 2026.</li></ol></article>`
    const changedFee = `<article><h2>Filing steps</h2><ol><li>Gather 2 identity documents.</li><li>Pay the $420 fee on September 15, 2026.</li></ol></article>`
    expect(publicationBodyHash(markdown)).toBe(publicationBodyHash(html))
    expect(publicationBodyHash(markdown)).not.toBe(publicationBodyHash(changedFee))
  })
})
