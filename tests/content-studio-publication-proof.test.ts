import {
  artifactContentHash,
  buildExpectedRevisionMarker,
  buildPublicationApprovalManifest,
  publicationBodyHash,
} from '@/lib/seoFactory/publicationProof'
import { evaluateLiveArtifact, extractArticleBody } from '@/lib/seoFactory/publicationStates'

describe('Content Studio publication proof digests', () => {
  const contract = { contractId: 'contract-1', contractHash: 'hash-1' }
  const markdown = [
    '# F-1 OPT Timing Guide',
    '',
    'Students should **check the filing window** before submitting Form I-765.',
    '',
    '## Timing',
    '',
    'Use the [USCIS guidance](https://www.uscis.gov/) and keep dated evidence.',
    '',
    '## Important qualification',
    '',
    'Eligibility depends on the student’s facts and current rules.',
  ].join('\n')
  const html = [
    '<html><head>',
    '<link rel="canonical" href="https://example.com/f1-opt-timing/">',
    '</head><body>',
    '<article>',
    '<h1>F-1 OPT Timing Guide</h1>',
    '<p>Students should <strong>check the filing window</strong> before submitting Form I-765.</p>',
    '<h2>Timing</h2>',
    '<p>Use the <a href="https://www.uscis.gov/">USCIS guidance</a> and keep dated evidence.</p>',
    '<h2>Important qualification</h2>',
    '<p>Eligibility depends on the student’s facts and current rules.</p>',
    '</article>',
    '</body></html>',
  ].join('')

  test('legitimate Markdown-to-HTML rendering preserves the substantive body digest', () => {
    const liveBody = extractArticleBody(html)
    expect(publicationBodyHash(markdown)).toBe(publicationBodyHash(liveBody))
  })

  test('same marker cannot conceal changed substantive article text', () => {
    const marker = buildExpectedRevisionMarker({ ...contract, content: markdown })
    const approvedBodyHash = publicationBodyHash(markdown)
    const changedHtml = html.replace(
      'Eligibility depends on the student’s facts and current rules.',
      'Every student is automatically eligible and approval is guaranteed.',
    ).replace('<article>', `<article><span hidden data-content-studio-revision="${marker}"></span>`)

    const result = evaluateLiveArtifact({
      httpStatus: 200,
      html: changedHtml,
      canonicalMatches: true,
      responseUrlMatches: true,
      hasNoIndex: false,
      expectedMarker: marker,
      liveMarker: marker,
      approvedBodyHash,
      title: 'F-1 OPT Timing Guide',
      approvedHeadSha: 'a'.repeat(40),
      mergeSha: 'b'.repeat(40),
      deploymentCommitSha: 'c'.repeat(40),
      lineageVerified: true,
    })

    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/body.*differs|digest/i)
  })

  test('unchanged legitimate rendered body can pass exact live proof', () => {
    const marker = buildExpectedRevisionMarker({ ...contract, content: markdown })
    const markedHtml = html.replace('<article>', `<article><span hidden data-content-studio-revision="${marker}"></span>`)
    const result = evaluateLiveArtifact({
      httpStatus: 200,
      html: markedHtml,
      canonicalMatches: true,
      responseUrlMatches: true,
      hasNoIndex: false,
      expectedMarker: marker,
      liveMarker: marker,
      approvedBodyHash: publicationBodyHash(markdown),
      title: 'F-1 OPT Timing Guide',
      approvedHeadSha: 'a'.repeat(40),
      mergeSha: 'b'.repeat(40),
      deploymentCommitSha: 'c'.repeat(40),
      lineageVerified: true,
    })

    expect(result.ok).toBe(true)
  })

  test('manifest binds accepted body, marked artifact, and semantic body', () => {
    const marker = buildExpectedRevisionMarker({ ...contract, content: markdown })
    const markedArtifact = `export const metadata = {\n  other: { \"content-studio-revision\": \"${marker}\" },\n}\n${markdown}`
    const manifest = buildPublicationApprovalManifest({
      jobId: 'job-1',
      ...contract,
      repoOwner: 'owner',
      repoName: 'repo',
      path: 'app/page.tsx',
      canonical: 'https://example.com/f1-opt-timing/',
      expectedMarker: marker,
      content: markdown,
      approvedContentHash: artifactContentHash(markdown),
      approvedArtifactHash: artifactContentHash(markedArtifact),
      approvedBodyHash: publicationBodyHash(markdown),
      approvedHeadSha: 'a'.repeat(40),
    })

    expect(manifest.schemaVersion).toBe(2)
    expect(manifest.approvedArtifactHash).toBe(artifactContentHash(markedArtifact))
    expect(manifest.approvedBodyHash).toBe(publicationBodyHash(markdown))
  })
})
