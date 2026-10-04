// Bundle-only check of the production Worker entry (edge-worker.mjs wrapping
// the freshly built .open-next/worker.js) and its bindings. Uses wrangler's
// --dry-run, which compiles locally and exits before any upload: it never
// contacts Cloudflare, needs no credentials and cannot publish. Runs on PRs so
// an entry or [[ratelimits]] mistake fails CI instead of the main deploy.
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

if (!fs.existsSync('.open-next/worker.js')) {
  console.error('verify-worker-bundle: .open-next/worker.js is missing; run the build first.')
  process.exit(1)
}

const outdir = fs.mkdtempSync(path.join(process.env.RUNNER_TEMP || os.tmpdir(), 'worker-dry-run-'))
const command = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const result = spawnSync(command, ['wrangler', 'deploy', '--dry-run', '--outdir', outdir], {
  env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CLOUDFLARE_API_TOKEN: '' },
  encoding: 'utf8',
})
process.stdout.write(result.stdout || '')
process.stderr.write(result.stderr || '')
if (result.status !== 0) process.exit(result.status ?? 1)

const out = result.stdout || ''
for (const binding of ['RL_FORMS', 'RL_MESSAGES', 'RL_AI', 'RL_TRANSLATE']) {
  if (!out.includes(`env.${binding}`)) {
    console.error(`verify-worker-bundle: binding ${binding} missing from the dry-run binding table.`)
    process.exit(1)
  }
}
const bundle = fs.readdirSync(outdir).find((f) => f.endsWith('.js'))
if (!bundle) {
  console.error('verify-worker-bundle: no bundled .js emitted.')
  process.exit(1)
}
console.log(`verify-worker-bundle: OK (${bundle}, ${fs.statSync(path.join(outdir, bundle)).size} bytes)`)
