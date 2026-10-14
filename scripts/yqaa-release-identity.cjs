/** Validate a receipt for the temporary human-authorized local release path. */
function validateLocalReleaseReceipt(receipt, sha, build) {
  if (!receipt || typeof receipt !== 'object' || !/^[0-9a-f]{40}$/.test(sha) || !/^[A-Za-z0-9_-]{10,}$/.test(build)) return false
  return receipt.source_sha === sha && receipt.build_id === build && receipt.worker === 'yousafe-portal' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(receipt.worker_version || '') &&
    receipt.method === 'temporarily_user_authorized_local_wrangler' &&
    ['source_clean','remote_main_matches','secret_name_manifest_preserved'].every(key=>receipt[key]===true) &&
    ['build','typecheck','dry_run','cache_and_payload_gates'].every(key=>receipt[key]==='passed') &&
    receipt.live_smoke === '4/4 passed' && Number.isInteger(receipt.tests_passed) && receipt.tests_passed > 0 &&
    Number.isInteger(receipt.test_suites_passed) && receipt.test_suites_passed > 0
}
function requiredAcceptanceSettings(mode) {
  const common = ['CLERK_SECRET_KEY','YQAA_EXPECTED_SHA','YQAA_EXPECTED_BUILD_ID']
  return common.concat(mode === 'authorized-local' ? ['YQAA_LOCAL_RELEASE_RECEIPT'] : ['GITHUB_SHA','GITHUB_REF','GITHUB_REPOSITORY'])
}
function activeReleaseMatches(deployments, version, receipt) {
  if (!Array.isArray(deployments) || !deployments.length || deployments.some(x=>!Number.isFinite(Date.parse(x?.created_on)))) return false
  const active = [...deployments].sort((a,b)=>Date.parse(b.created_on)-Date.parse(a.created_on))[0]
  return active.versions?.length === 1 && active.versions[0].percentage === 100 &&
    active.versions[0].version_id === receipt.worker_version && version?.id === receipt.worker_version &&
    version.annotations?.['workers/message'] === `YQAA main=${receipt.source_sha} build=${receipt.build_id} authorized-local`
}
function boundedIdentityCommand(command, args, execute = require('node:child_process').execFileSync) {
  return execute(command,args,{encoding:'utf8',timeout:15_000,maxBuffer:2_000_000}).trim()
}
async function runWithDeadline(run, timeoutMs, controller, cancel) {
  let timer, cancellation
  const cancelOnce = () => cancellation ||= Promise.resolve().then(()=>{controller.abort();return cancel()})
  const work = Promise.resolve().then(run)
  const deadline = new Promise((_,reject)=>{
    timer=setTimeout(()=>{void cancelOnce().then(()=>reject(new Error('Acceptance phase deadline exceeded')),reject)},timeoutMs)
  })
  try { return await Promise.race([work,deadline]) }
  finally {
    clearTimeout(timer)
    await cancelOnce()
    // Browser cancellation and abortable HTTP/waits terminate the work before
    // callers begin the independent cleanup phase.
    await work.catch(()=>{})
  }
}
function abortableDelay(ms, signal) {
  return new Promise((resolve,reject)=>{
    if (signal.aborted) return reject(signal.reason || new Error('Aborted'))
    const abort=()=>{clearTimeout(timer);reject(signal.reason || new Error('Aborted'))}
    const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve()},ms)
    signal.addEventListener('abort',abort,{once:true})
  })
}
module.exports = { validateLocalReleaseReceipt, requiredAcceptanceSettings, activeReleaseMatches, boundedIdentityCommand, runWithDeadline, abortableDelay }
