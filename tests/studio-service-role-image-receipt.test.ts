import { buildImageReceipt } from '../scripts/studio-service-role-image-receipt.cjs'

const context = {
  commit: 'b38d9a3c549729ce2b7188c9f2313a00cd5524e9',
  cliVersion: '2.98.2',
  runId: '36602275466',
  runAttempt: '1',
}
const idA = `sha256:${'a'.repeat(64)}`
const idB = `sha256:${'b'.repeat(64)}`
const digestA = `public.ecr.aws/supabase/postgres@sha256:${'c'.repeat(64)}`

describe('studio service-role image receipt', () => {
  it('joins different sanitized container shapes to immutable image inspect results', () => {
    const projection = {
      containers: [
        { name: '/supabase_db_project', image: 'public.ecr.aws/supabase/postgres:15.8.1.085', imageId: idA },
        { name: 'supabase_auth_project', image: 'public.ecr.aws/supabase/gotrue:v2.177.0', imageId: idB },
      ],
      images: [
        { id: idB, repoDigests: [] },
        { id: idA, repoDigests: [digestA] },
      ],
    }
    const receipt = buildImageReceipt(projection, context)

    expect(receipt).toMatchObject({ schemaVersion: 1, ...context })
    expect(receipt.containers).toEqual([
      { name: 'supabase_auth_project', image: 'public.ecr.aws/supabase/gotrue:v2.177.0', imageId: idB, repoDigests: [], repoDigestStatus: 'unavailable', repoDigestNote: 'Docker reported no repository digest for this image; the immutable image ID is retained.' },
      { name: 'supabase_db_project', image: 'public.ecr.aws/supabase/postgres:15.8.1.085', imageId: idA, repoDigests: [digestA], repoDigestStatus: 'available' },
    ])
  })

  it('fails closed for empty inventory and a container without matching image inspection', () => {
    expect(() => buildImageReceipt({ containers: [], images: [] }, context)).toThrow(/no Supabase stack containers/)
    expect(() => buildImageReceipt({ containers: [{ name: 'supabase_db', image: 'postgres:15', imageId: idA }], images: [] }, context)).toThrow(/no matching image inspect result/)
  })

  it('rejects duplicate container identities and duplicate image identities', () => {
    const container = { name: 'supabase_db', image: 'postgres:15', imageId: idA }
    expect(() => buildImageReceipt({ containers: [container, container], images: [{ id: idA, repoDigests: [] }] }, context)).toThrow(/duplicate container identity/)
    expect(() => buildImageReceipt({ containers: [container], images: [{ id: idA, repoDigests: [] }, { id: idA, repoDigests: [] }] }, context)).toThrow(/duplicate image identity/)
  })

  it('validates immutable IDs and repository digest formats', () => {
    expect(() => buildImageReceipt({ containers: [{ name: 'supabase_db', image: 'postgres:15', imageId: 'latest' }], images: [{ id: 'latest', repoDigests: [] }] }, context)).toThrow(/valid immutable image ID/)
    expect(() => buildImageReceipt({ containers: [{ name: 'supabase_db', image: 'postgres:15', imageId: idA }], images: [{ id: idA, repoDigests: ['postgres:15'] }] }, context)).toThrow(/invalid repository digest/)
  })

  it('accepts only explicitly allowlisted projected fields and rejects secret-bearing fields', () => {
    for (const forbidden of ['Config.Env', 'environment', 'JWT', 'access_token', 'api_key', 'secret', 'RepoTags', 'Config']) {
      expect(() => buildImageReceipt({ containers: [{ name: 'supabase_db', image: 'postgres:15', imageId: idA, [forbidden]: ['must-not-leak'] }], images: [{ id: idA, repoDigests: [] }] }, context)).toThrow()
    }
    expect(() => buildImageReceipt({ containers: [{ name: 'supabase_db', image: 'postgres:15', imageId: idA }], images: [{ id: idA, repoDigests: [], Config: { Env: ['hidden'] } }] }, context)).toThrow()
  })

  it('rejects unsafe image references without echoing canaries', () => {
    for (const image of ['postgres:15\nSECRET_CANARY', 'https://user:pass@example.com/postgres:15', 'registry.example.com:badport/postgres:15', 'postgres:bad tag']) {
      let message = ''
      try {
        buildImageReceipt({ containers: [{ name: 'supabase_db', image, imageId: idA }], images: [{ id: idA, repoDigests: [] }] }, context)
      } catch (error) { message = String(error) }
      expect(message).toMatch(/image reference/)
      expect(message).not.toContain('SECRET_CANARY')
    }
  })

  it('rejects malformed repository digest prefixes without echoing their contents', () => {
    const canary = `SECRET_CANARY @sha256:${'d'.repeat(64)}`
    let message = ''
    try {
      buildImageReceipt({ containers: [{ name: 'supabase_db', image: 'postgres:15', imageId: idA }], images: [{ id: idA, repoDigests: [canary] }] }, context)
    } catch (error) { message = String(error) }
    expect(message).toMatch(/repository digest/)
    expect(message).not.toContain('SECRET_CANARY')
  })

  it('allows only typed context and root projection fields and constructs an explicit receipt', () => {
    const projection = { containers: [{ name: 'supabase_db', image: 'registry.example.com:5443/team/postgres:15.8', imageId: idA }], images: [{ id: idA, repoDigests: ['registry.example.com:5443/team/postgres@sha256:' + 'e'.repeat(64)] }] }
    const contaminatedContext = { ...context, secret: 'SECRET_CANARY' }
    expect(() => buildImageReceipt(projection, contaminatedContext)).toThrow(/context/)
    expect(() => buildImageReceipt({ ...projection, secret: 'SECRET_CANARY' }, context)).toThrow(/projection/)
    expect(() => buildImageReceipt(projection, { ...context, runId: 123 })).toThrow(/context/)
    expect(buildImageReceipt(projection, context)).toMatchObject({ schemaVersion: 1, ...context })
  })

  it('accepts standard tagged, digest, registry-port, and immutable-ID image forms', () => {
    const imageRefs = [
      'postgres:15',
      'registry.example.com:5443/team/postgres:15.8',
      `registry.example.com/team/postgres@sha256:${'f'.repeat(64)}`,
      idA,
    ]
    for (const image of imageRefs) {
      expect(() => buildImageReceipt({ containers: [{ name: 'supabase_db', image, imageId: idA }], images: [{ id: idA, repoDigests: [] }] }, context)).not.toThrow()
    }
  })
})
