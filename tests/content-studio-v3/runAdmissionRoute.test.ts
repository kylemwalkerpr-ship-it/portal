import { handleRunAdmission } from '@/app/api/content-studio/v3/runs/routeCore'
import { POST } from '@/app/api/content-studio/v3/runs/route'
import { type RunCommandInput, type VerifiedCommandContext } from '@/lib/studioRuntime/contracts'

const command: RunCommandInput = { actionKind: 'PLAN', subjectId: 's', inputRef: 'sealed:1', idempotencyKey: 'k', expectedOwnerVersion: 'o', expectedPolicyVersion: 'p', expectedAuthorityEpoch: 1 }
const context: VerifiedCommandContext = { projectId: 'prj', actor: { issuer: 'iss', subject: 'sub', authorizationEvidenceId: 'ev' }, decisionId: 'd', policyVersion: 'p', ownerVersion: 'o', authorityEpoch: 1, snapshotRef: 'snap' }

describe('v3 run admission route boundary', () => {
  test('forged body actor is invalid before identity or repository access', async () => {
    const verifyIdentity = jest.fn()
    const response = await handleRunAdmission(new Request('https://local/api/content-studio/v3/runs', {
      method: 'POST', body: JSON.stringify({ ...command, actor: { issuer: 'forged', subject: 'forged' } }),
    }), { verifyIdentity, authorizeCommand: async () => context, repository: { admit: jest.fn() } })
    expect(response.status).toBe(400)
    expect(verifyIdentity).not.toHaveBeenCalled()
  })
  test('identity is verified then authorization is performed before a successful durable receipt', async () => {
    const order: string[] = []
    const response = await handleRunAdmission(new Request('https://local/api/content-studio/v3/runs', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(command),
    }), {
      verifyIdentity: async () => { order.push('identity'); return { issuer: 'iss', subject: 'sub' } },
      authorizeCommand: async () => { order.push('authorize'); return context },
      repository: { admit: async () => { order.push('rpc'); return { kind: 'accepted', runId: 'run', status: 'QUEUED', lastEventSequence: 1 } } },
      ids: () => ({ runId: 'run', stageId: 'stage', eventId: 'event' }),
    })
    expect(response.status).toBe(202)
    expect(order).toEqual(['identity', 'authorize', 'rpc'])
    expect(await response.json()).toEqual({ runId: 'run', status: 'QUEUED', lastEventSequence: 1 })
  })
  test('outage and revoked replay cannot return 202', async () => {
    const outage = await handleRunAdmission(new Request('https://local', { method: 'POST', body: JSON.stringify(command) }), {
      verifyIdentity: async () => ({ issuer: 'iss', subject: 'sub' }), authorizeCommand: async () => context,
      repository: { admit: async () => { throw new Error('db offline') } },
    })
    expect(outage.status).toBe(503)
    const revoked = await handleRunAdmission(new Request('https://local', { method: 'POST', body: JSON.stringify(command) }), {
      verifyIdentity: async () => ({ issuer: 'iss', subject: 'sub' }), authorizeCommand: async () => { throw new Error('COMMAND_FORBIDDEN') },
      repository: { admit: jest.fn() },
    })
    expect(revoked.status).toBe(403)
  })
  test('authorized replay acknowledges only after repository receipt and preserves current status', async () => {
    const response = await handleRunAdmission(new Request('https://local', { method: 'POST', body: JSON.stringify(command) }), {
      verifyIdentity: async () => ({ issuer: 'iss', subject: 'sub' }), authorizeCommand: async () => context,
      repository: { admit: async () => ({ kind: 'replayed', runId: 'existing-run', status: 'RUNNING', lastEventSequence: 4 }) },
    })
    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({ runId: 'existing-run', status: 'RUNNING', lastEventSequence: 4 })
  })
  test('production route is inactive without constructing runtime clients', async () => {
    const response = await POST()
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'RUNTIME_NOT_ACTIVE' })
  })
})
