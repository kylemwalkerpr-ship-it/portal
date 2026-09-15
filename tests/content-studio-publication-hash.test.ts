import {
  artifactContentHash,
  buildExpectedRevisionMarker,
  buildPublicationApprovalManifest,
  publicationBodyHash,
  publicationMarkerForContent,
  recordPublicationRenderedArtifact,
  runWithPublicationIdentity,
} from '@/lib/seoFactory/publicationProof'
import { renderTargetFile } from '@/lib/seoFactory/renderTarget'
import { evaluateLiveArtifact } from '@/lib/seoFactory/publicationStates'

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

  it('verifies the substantive body from the real consultancy blog renderer while excluding renderer-owned apparatus', async () => {
    const title = 'F-1 OPT Filing Guide for Students'
    const canonical = 'https://yousafeconsultancy.com/blog/f1-opt-filing-guide/'
    const content = `---\ntitle: ${JSON.stringify(title)}\ndescription: "A practical filing guide."\n---\n\n# ${title}\n\nStudents & families should confirm the filing window before submitting.\n\n## Filing steps\n\n1. Gather 2 identity documents.\n2. Pay the $410 fee on September 15, 2026.\n\n## Fee table\n\n| Item | Amount |\n|---|---:|\n| Filing fee | $410 |\n\n## After filing\n\nKeep 3 copies of the receipt and confirm the filing date.`
    const plan = {
      host: 'www',
      repo: 'yousafe-consultancy',
      filePath: 'app/blog/f1-opt-filing-guide/page.tsx',
      canonicalUrl: canonical,
      indexable: true,
      blockers: [],
    } as any

    const rendered = await runWithPublicationIdentity(identity, async () => renderTargetFile({
      plan,
      content,
      title,
      region: 'US',
      contentType: 'blog',
      primaryKeyword: 'F-1 OPT filing guide',
      indexable: true,
      canonicalUrl: canonical,
    }))

    expect(rendered.result.fileContent).toContain('MyCaseworks Editorial')
    expect(rendered.result.fileContent).toContain('Need the full legal guide?')
    expect(rendered.result.fileContent).toContain('BlogDepthSection')
    expect(rendered.result.fileContent).toContain('data-content-studio-body="true"')
    expect(rendered.marker).toBeTruthy()
    expect(rendered.bodyHash).toBeTruthy()

    const manifest = buildPublicationApprovalManifest({
      ...base,
      content: rendered.content || '',
      expectedMarker: rendered.marker,
      approvedContentHash: rendered.contentHash,
      approvedArtifactHash: rendered.artifactHash,
      approvedBodyHash: rendered.bodyHash,
      ...{ renderedArtifact: rendered.result.fileContent },
    })
    expect(manifest.approvedBodyHash).toBe(rendered.bodyHash)
    expect(() => buildPublicationApprovalManifest({
      ...base,
      content: rendered.content || '',
      expectedMarker: rendered.marker,
      approvedContentHash: rendered.contentHash,
      approvedArtifactHash: rendered.artifactHash,
      approvedBodyHash: rendered.bodyHash,
      ...{ renderedArtifact: rendered.result.fileContent.replace('$410', '$420') },
    })).toThrow(/artifact/i)

    const substantiveHtml = `<div data-content-studio-body="true">
      <p>Students &amp; families should confirm the filing window before submitting.</p>
      <section><h2>Filing steps</h2><ol><li>Gather 2 identity documents.</li><li>Pay the $410 fee on September 15, 2026.</li></ol></section>
      <section><h2>Fee table</h2><table><thead><tr><th>Item</th><th>Amount</th></tr></thead><tbody><tr><td>Filing fee</td><td>$410</td></tr></tbody></table></section>
      <section><h2>After filing</h2><p>Keep 3 copies of the receipt and confirm the filing date.</p></section>
    </div>`
    const liveHtml = `<!doctype html><html><body><main><article>
      <header><p>September 15, 2026 · MyCaseworks Editorial</p><h1>${title}</h1></header>
      ${substantiveHtml}
      <section><h3>Need the full legal guide?</h3><p>This post is a practical walkthrough.</p><a href="/legal">Browse legal guides →</a></section>
      <div>BlogDepthSection related reading and site navigation</div>
    </article></main></body></html>`

    const valid = evaluateLiveArtifact({
      httpStatus: 200,
      html: liveHtml,
      canonicalMatches: true,
      hasNoIndex: false,
      responseUrlMatches: true,
      expectedMarker: rendered.marker || undefined,
      liveMarker: rendered.marker,
      title,
      approvedBodyHash: rendered.bodyHash,
      approvedHeadSha: 'approved-head',
      mergeSha: 'merge-sha',
      deploymentCommitSha: 'deploy-sha',
      lineageVerified: true,
    })
    expect(valid.ok).toBe(true)

    for (const changed of [
      liveHtml.replace('$410 fee on September 15, 2026', '$420 fee on September 15, 2026'),
      liveHtml.replace('September 15, 2026.</li>', 'September 16, 2026.</li>'),
      liveHtml.replace('Gather 2 identity documents.', 'Gather 3 identity documents.'),
      liveHtml.replace('Keep 3 copies', 'Keep 4 copies'),
    ]) {
      const rejected = evaluateLiveArtifact({
        httpStatus: 200,
        html: changed,
        canonicalMatches: true,
        hasNoIndex: false,
        responseUrlMatches: true,
        expectedMarker: rendered.marker || undefined,
        liveMarker: rendered.marker,
        title,
        approvedBodyHash: rendered.bodyHash,
        approvedHeadSha: 'approved-head',
        mergeSha: 'merge-sha',
        deploymentCommitSha: 'deploy-sha',
        lineageVerified: true,
      })
      expect(rejected.ok).toBe(false)
      expect(rejected.reason).toMatch(/body.*differs|digest/i)
    }
  })
})
