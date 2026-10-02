import { admitRun, type AdmissionDependencies } from '@/lib/studioRuntime/commandAdmission'
import { decodeRunCommand, type AdmissionResult, type VerifiedIdentity } from '@/lib/studioRuntime/contracts'

export interface RunAdmissionDependencies extends AdmissionDependencies {
  verifyIdentity(request: Request): Promise<VerifiedIdentity>
}
const json = (body: unknown, status: number) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
})
function statusFor(result: AdmissionResult): number {
  if (result.kind !== 'rejected') return 202
  switch (result.reason) {
    case 'INVALID_COMMAND': case 'REQUEST_HASH_MISMATCH': return 400
    case 'AUTHORIZATION_REQUIRED': return 401
    case 'COMMAND_FORBIDDEN': case 'INPUT_SCOPE_MISMATCH': return 403
    case 'EXPECTED_VERSION_CONFLICT': case 'IDEMPOTENCY_CONFLICT': return 409
    default: return 503
  }
}
export async function handleRunAdmission(request: Request, deps: RunAdmissionDependencies): Promise<Response> {
  const declaredLength = Number(request.headers.get('content-length') || 0)
  if (declaredLength > 16384) return json({ error: 'INVALID_COMMAND' }, 400)
  let bytes: Uint8Array
  try { bytes = new Uint8Array(await request.arrayBuffer()) } catch { return json({ error: 'INVALID_COMMAND' }, 400) }
  if (bytes.byteLength > 16384) return json({ error: 'INVALID_COMMAND' }, 400)
  let input: ReturnType<typeof decodeRunCommand>
  try { input = decodeRunCommand(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))) }
  catch { return json({ error: 'INVALID_COMMAND' }, 400) }
  let identity: VerifiedIdentity
  try { identity = await deps.verifyIdentity(request) }
  catch { return json({ error: 'AUTHORIZATION_REQUIRED' }, 401) }
  if (!identity?.issuer || !identity.subject) return json({ error: 'AUTHORIZATION_REQUIRED' }, 401)
  const result = await admitRun(input, identity, deps)
  if (result.kind === 'rejected') return json({ error: result.reason }, statusFor(result))
  return json({ runId: result.runId, status: result.status, lastEventSequence: result.lastEventSequence }, statusFor(result))
}
