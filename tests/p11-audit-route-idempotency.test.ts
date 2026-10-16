import { NextRequest } from 'next/server'

const mockRequireAdminUser = jest.fn()
const mockExecuteP11AuditCommand = jest.fn()
const mockAdmitP11AuditCommand = jest.fn()
const mockRunVisibilityAudits = jest.fn()
const mockRunFanOutVisibilityAudits = jest.fn()
const mockIngestKnowledge = jest.fn()
const mockRecordEngineRun = jest.fn()
const mockFormatEnginePairTape = jest.fn()
const mockRunPlanner = jest.fn()

jest.mock('@/lib/portalAuth', () => ({ requireAdminUser: (...args: unknown[]) => mockRequireAdminUser(...args) }))
jest.mock('@/lib/seoEngine/p11AuditCommand', () => ({
  executeP11AuditCommand: (...args: unknown[]) => mockExecuteP11AuditCommand(...args),
  admitP11AuditCommand: (...args: unknown[]) => mockAdmitP11AuditCommand(...args),
  profileP11Actor: (profileId: string) => ({ scope: `profile:${profileId}`, profileId }),
  validP11IdempotencyKey: (key: unknown) => typeof key === 'string' && key.length >= 8 && key.length <= 200 && /^[\x21-\x7e]+$/.test(key),
}))
jest.mock('@/lib/seoEngine/llmVisibility', () => ({
  runVisibilityAudits: (...args: unknown[]) => mockRunVisibilityAudits(...args),
  runFanOutVisibilityAudits: (...args: unknown[]) => mockRunFanOutVisibilityAudits(...args),
  loadVisibilityFeed: jest.fn(),
  loadVisibilityByCluster: jest.fn(),
}))
jest.mock('@/lib/seoEngine/knowledge', () => ({
  ingestKnowledge: (...args: unknown[]) => mockIngestKnowledge(...args),
  recordEngineRun: (...args: unknown[]) => mockRecordEngineRun(...args),
}))
jest.mock('@/lib/seoEngine/engineAi', () => ({ formatEnginePairTape: (...args: unknown[]) => mockFormatEnginePairTape(...args) }))
jest.mock('@/lib/seoEngine/planner', () => ({ runPlanner: (...args: unknown[]) => mockRunPlanner(...args) }))

import { POST as visibilityPost } from '@/app/api/seo-engine/llm-visibility/route'
import { POST as actionStreamPost } from '@/app/api/seo-engine/action-stream/route'

function visibilityRequest(key?: string) {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  if (key !== undefined) headers.set('Idempotency-Key', key)
  return new NextRequest('http://localhost/api/seo-engine/llm-visibility', {
    method: 'POST', headers, body: JSON.stringify({ maxAudits: 1 }),
  })
}

function actionStreamRequest(body: Record<string, unknown>, key?: string) {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  if (key !== undefined) headers.set('Idempotency-Key', key)
  return new Request('http://localhost/api/seo-engine/action-stream', {
    method: 'POST', headers, body: JSON.stringify(body),
  })
}

describe('P11 route idempotency boundaries', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockRequireAdminUser.mockResolvedValue({ profileId: 'profile-test' })
    mockRecordEngineRun.mockResolvedValue(undefined)
    mockFormatEnginePairTape.mockReturnValue('mock engine pair')
  })

  it.each([
    ['missing', undefined],
    ['invalid', 'short'],
  ])('llm-visibility POST returns 400 for a %s key before command or audit work', async (_label, key) => {
    const response = await visibilityPost(visibilityRequest(key))
    expect(response.status).toBe(400)
    expect(response.headers.get('content-type')).not.toContain('text/event-stream')
    expect(mockExecuteP11AuditCommand).not.toHaveBeenCalled()
    expect(mockRunVisibilityAudits).not.toHaveBeenCalled()
    expect(mockRunFanOutVisibilityAudits).not.toHaveBeenCalled()
  })

  it('llm-visibility POST returns 409 for a command conflict without running an audit', async () => {
    mockExecuteP11AuditCommand.mockResolvedValue({ kind: 'conflict', command: { id: 'existing-command' } })
    const response = await visibilityPost(visibilityRequest('route-key-001'))
    expect(response.status).toBe(409)
    expect(mockExecuteP11AuditCommand).toHaveBeenCalledTimes(1)
    expect(mockRunVisibilityAudits).not.toHaveBeenCalled()
    expect(mockRunFanOutVisibilityAudits).not.toHaveBeenCalled()
  })

  it.each([
    ['missing', undefined],
    ['invalid', 'short'],
  ])('action-stream llm POST returns 400 for a %s key before admission or stream work', async (_label, key) => {
    const response = await actionStreamPost(actionStreamRequest({ kind: 'llm' }, key))
    expect(response.status).toBe(400)
    expect(response.headers.get('content-type')).not.toContain('text/event-stream')
    expect(mockAdmitP11AuditCommand).not.toHaveBeenCalled()
    expect(mockExecuteP11AuditCommand).not.toHaveBeenCalled()
    expect(mockRunVisibilityAudits).not.toHaveBeenCalled()
  })

  it('action-stream llm POST returns 409 on admission conflict before starting SSE or audit work', async () => {
    mockAdmitP11AuditCommand.mockResolvedValue({ kind: 'conflict', command: { id: 'existing-command' } })
    const response = await actionStreamPost(actionStreamRequest({ kind: 'llm' }, 'stream-key-001'))
    expect(response.status).toBe(409)
    expect(response.headers.get('content-type')).not.toContain('text/event-stream')
    expect(mockAdmitP11AuditCommand).toHaveBeenCalledTimes(1)
    expect(mockExecuteP11AuditCommand).not.toHaveBeenCalled()
    expect(mockRunVisibilityAudits).not.toHaveBeenCalled()
  })

  it('allows non-LLM ingest without an Idempotency-Key', async () => {
    mockIngestKnowledge.mockResolvedValue({
      itemsStored: 2, sourcesRun: 1, itemsFetched: 2, aiSummarized: 0, skipped: 0,
      errors: [], aiErrors: [], pair: [],
    })
    const response = await actionStreamPost(actionStreamRequest({ kind: 'ingest' }))
    const body = await response.text()
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/event-stream')
    expect(body).toContain('Ingested 2 items from 1 sources')
    expect(mockIngestKnowledge).toHaveBeenCalledTimes(1)
    expect(mockAdmitP11AuditCommand).not.toHaveBeenCalled()
    expect(mockExecuteP11AuditCommand).not.toHaveBeenCalled()
    expect(mockRunVisibilityAudits).not.toHaveBeenCalled()
  })
})
