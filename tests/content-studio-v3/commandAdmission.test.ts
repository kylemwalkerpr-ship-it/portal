import { STUDIO_ACTIONS, decodeRunCommand, hashRunCommand, type RunCommandInput, type VerifiedCommandContext } from '@/lib/studioRuntime/contracts'
import { admitRun } from '@/lib/studioRuntime/commandAdmission'
import { createStudioRunRepository, type RpcTransport } from '@/lib/studioRuntime/repository'

const command: RunCommandInput = {
  actionKind: 'INGEST', subjectId: 'subject-1', inputRef: 'sha256:sealed-input', idempotencyKey: 'key-1',
  expectedOwnerVersion: 'owner-2', expectedPolicyVersion: 'policy-3', expectedAuthorityEpoch: 4,
}
const context: VerifiedCommandContext = {
  projectId: 'project-1', actor: { issuer: 'issuer-1', subject: 'actor-1', authorizationEvidenceId: 'evidence-1' },
  decisionId: 'decision-1', policyVersion: 'policy-3', ownerVersion: 'owner-2', authorityEpoch: 4, snapshotRef: 'snapshot-1',
}

describe('canonical run command', () => {
  test('rejects unknown authority fields and unsafe epochs', () => {
    expect(() => decodeRunCommand({ ...command, actor: context.actor })).toThrow('INVALID_COMMAND')
    expect(() => decodeRunCommand({ ...command, projectId: 'attacker-project' })).toThrow('INVALID_COMMAND')
    expect(() => decodeRunCommand({ ...command, requestHash: '0'.repeat(64) })).toThrow('INVALID_COMMAND')
    expect(() => decodeRunCommand({ ...command, expectedAuthorityEpoch: Number.MAX_SAFE_INTEGER + 1 })).toThrow('INVALID_COMMAND')
  })
  test('ignores JSON key order while binding every logical input/version', () => {
    expect(hashRunCommand(command)).toBe(hashRunCommand(Object.fromEntries(Object.entries(command).reverse()) as RunCommandInput))
    for (const patch of [
      { actionKind: 'PLAN' }, { subjectId: 'subject-2' }, { inputRef: 'sha256:other' },
      { expectedOwnerVersion: 'owner-3' }, { expectedPolicyVersion: 'policy-4' }, { expectedAuthorityEpoch: 5 },
    ]) expect(hashRunCommand({ ...command, ...patch } as RunCommandInput)).not.toBe(hashRunCommand(command))
  })
  test('decodes every canonical action without conferring admission authority', () => {
    for (const actionKind of STUDIO_ACTIONS) expect(decodeRunCommand({ ...command, actionKind }).actionKind).toBe(actionKind)
  })
  test('rejects lone surrogates, controls and byte limit overflow', () => {
    expect(() => decodeRunCommand({ ...command, subjectId: '\ud800' })).toThrow('INVALID_COMMAND')
    expect(() => decodeRunCommand({ ...command, subjectId: 'bad\nvalue' })).toThrow('INVALID_COMMAND')
    for (const whitespace of ['\u00a0', '\u1680', '\u2003', '\u2028', '\u202f', '\u205f', '\u3000', '\ufeff']) {
      expect(() => decodeRunCommand({ ...command, subjectId: whitespace })).toThrow('INVALID_COMMAND')
    }
    for (const control of ['\u000b', '\u007f', '\u0085', '\u009f']) {
      expect(() => decodeRunCommand({ ...command, inputRef: `sealed:${control}` })).toThrow('INVALID_COMMAND')
    }
    expect(() => decodeRunCommand({ ...command, subjectId: 'é'.repeat(129) })).toThrow('INVALID_COMMAND')
  })
})

describe('admission orchestration and RPC adapter', () => {
  test('reauthorizes before every repository call and preserves truthful replay state', async () => {
    const calls: string[] = []
    const repository = { admit: jest.fn(async () => {
      calls.push('rpc'); return { kind: 'replayed' as const, runId: 'run-1', status: 'RUNNING' as const, lastEventSequence: 8 }
    }) }
    const result = await admitRun(command, { issuer: 'issuer-1', subject: 'actor-1' }, {
      authorizeCommand: jest.fn(async () => { calls.push('authorize'); return context }), repository,
      ids: () => ({ runId: 'new-run', stageId: 'new-stage', eventId: 'new-event' }),
    })
    expect(calls).toEqual(['authorize', 'rpc'])
    expect(result).toEqual({ kind: 'replayed', runId: 'run-1', status: 'RUNNING', lastEventSequence: 8 })
    expect(repository.admit).toHaveBeenCalledWith(command, context, expect.stringMatching(/^[a-f0-9]{64}$/), {
      runId: 'new-run', stageId: 'new-stage', eventId: 'new-event',
    })
  })
  test('denies changed current authority without an RPC', async () => {
    const repository = { admit: jest.fn() }
    const result = await admitRun(command, { issuer: 'issuer-1', subject: 'actor-1' }, {
      authorizeCommand: async () => ({ ...context, ownerVersion: 'owner-new' }), repository,
    })
    expect(result).toEqual({ kind: 'rejected', reason: 'EXPECTED_VERSION_CONFLICT' })
    expect(repository.admit).not.toHaveBeenCalled()
  })
  test('maps revoked authorization and unknown binding failure closed', async () => {
    expect(await admitRun(command, { issuer: 'issuer-1', subject: 'actor-1' }, {
      authorizeCommand: async () => { throw new Error('COMMAND_FORBIDDEN') }, repository: { admit: jest.fn() },
    })).toEqual({ kind: 'rejected', reason: 'COMMAND_FORBIDDEN' })
    expect(await admitRun(command, { issuer: 'issuer-1', subject: 'actor-1' }, {
      authorizeCommand: async () => { throw new Error('network detail') }, repository: { admit: jest.fn() },
    })).toEqual({ kind: 'rejected', reason: 'AUTHORITY_BINDING_UNAVAILABLE' })
  })
  test('calls only the exact atomic SQL RPC and rejects malformed RPC receipts', async () => {
    const rpc: jest.MockedFunction<RpcTransport['rpc']> = jest.fn(async (..._args: Parameters<RpcTransport['rpc']>) => ({ data: { kind: 'accepted', runId: 'r', status: 'QUEUED', lastEventSequence: 1 }, error: null }))
    const repo = createStudioRunRepository({ rpc })
    await expect(repo.admit(command, context, hashRunCommand(command), { runId: 'r', stageId: 's', eventId: 'e' }))
      .resolves.toMatchObject({ kind: 'accepted' })
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc.mock.calls[0][0]).toBe('studio_core.admit_run')
    const broken = createStudioRunRepository({ rpc: async () => ({ data: { kind: 'accepted', runId: '' }, error: null }) })
    await expect(broken.admit(command, context, hashRunCommand(command), { runId: 'r', stageId: 's', eventId: 'e' })).rejects.toThrow('ADMISSION_UNAVAILABLE')
  })
})
