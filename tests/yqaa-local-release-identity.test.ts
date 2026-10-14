const { validateLocalReleaseReceipt, requiredAcceptanceSettings, activeReleaseMatches, boundedIdentityCommand } = require('../scripts/yqaa-release-identity.cjs')
const sha='a'.repeat(40)
const receipt={source_sha:sha,worker:'yousafe-portal',worker_version:'b585a8b9-4bd4-489d-8b96-bbc90bd653b0',build_id:'tW9mH86184PmF6xheMPRh',method:'temporarily_user_authorized_local_wrangler',source_clean:true,remote_main_matches:true,build:'passed',typecheck:'passed',dry_run:'passed',cache_and_payload_gates:'passed',live_smoke:'4/4 passed',secret_name_manifest_preserved:true,tests_passed:6560,test_suites_passed:585}
describe('authorized local acceptance deployment identity',()=>{
 it('accepts an exact verified main receipt',()=>expect(validateLocalReleaseReceipt(receipt,sha,receipt.build_id)).toBe(true))
 it.each(['source_sha','worker','build_id','method','build','typecheck','dry_run','cache_and_payload_gates','live_smoke'])('rejects mismatched %s',field=>expect(validateLocalReleaseReceipt({...receipt,[field]:'wrong'},sha,receipt.build_id)).toBe(false))
 it.each(['source_clean','remote_main_matches','secret_name_manifest_preserved'])('rejects false %s',field=>expect(validateLocalReleaseReceipt({...receipt,[field]:false},sha,receipt.build_id)).toBe(false))
 it('rejects missing verification evidence',()=>expect(validateLocalReleaseReceipt({},sha,receipt.build_id)).toBe(false))
 it('rejects missing Worker version',()=>expect(validateLocalReleaseReceipt({...receipt,worker_version:null},sha,receipt.build_id)).toBe(false))
 it('rejects zero tests',()=>expect(validateLocalReleaseReceipt({...receipt,tests_passed:0},sha,receipt.build_id)).toBe(false))
})

const deployment = {created_on:'2026-10-13T00:00:00Z',versions:[{version_id:receipt.worker_version,percentage:100}]}
const version = {id:receipt.worker_version,annotations:{'workers/message':`YQAA main=${sha} build=${receipt.build_id} authorized-local`}}
describe('local startup and active deployment verification',()=>{
 it('requires local receipt instead of fake CI variables',()=>{
  expect(requiredAcceptanceSettings('authorized-local')).toContain('YQAA_LOCAL_RELEASE_RECEIPT')
  expect(requiredAcceptanceSettings('authorized-local')).not.toContain('GITHUB_SHA')
 })
 it('keeps official workflow identity requirements',()=>expect(requiredAcceptanceSettings('official')).toContain('GITHUB_SHA'))
 it('matches the sole active version and its source/build annotation',()=>expect(activeReleaseMatches([deployment],version,receipt)).toBe(true))
 it('rejects a different active version',()=>expect(activeReleaseMatches([{...deployment,versions:[{version_id:'wrong',percentage:100}]}],version,receipt)).toBe(false))
 it('rejects a mixed rollout',()=>expect(activeReleaseMatches([{...deployment,versions:[{version_id:receipt.worker_version,percentage:50},{version_id:'other',percentage:50}]}],version,receipt)).toBe(false))
 it('rejects source annotation mismatch',()=>expect(activeReleaseMatches([deployment],{...version,annotations:{'workers/message':'other'}},receipt)).toBe(false))
 it('rejects a stale recorded deployment when a newer deployment is active',()=>expect(activeReleaseMatches([deployment,{created_on:'2026-10-14T00:00:00Z',versions:[{version_id:'other',percentage:100}]}],version,receipt)).toBe(false))
})

it('bounds identity subprocess duration and output size',()=>{
 const execute=jest.fn(()=> ' ok ')
 expect(boundedIdentityCommand('git',['ls-remote','origin'],execute)).toBe('ok')
 expect(execute).toHaveBeenCalledWith('git',['ls-remote','origin'],expect.objectContaining({timeout:15000,maxBuffer:2000000}))
})
