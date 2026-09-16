import { spawnSync } from 'node:child_process'
import fs from 'node:fs'

const required = {
  GITHUB_ACTIONS: 'true',
  GITHUB_REF: 'refs/heads/main',
  GITHUB_WORKFLOW: 'Deploy YouSafe Portal',
}

const mismatches = Object.entries(required).filter(([key, value]) => process.env[key] !== value)

if (mismatches.length > 0) {
  console.error('\nProduction deploy blocked.\n')
  console.error('YouSafe production is GitHub-main-only. Do not deploy from a local shell, ChatGPT Work, Codex, Cloudflare dashboard, or direct Wrangler/OpenNext command.')
  console.error('Commit the work to a branch, pass CI, merge it to main, and let the Deploy YouSafe Portal GitHub Action publish that exact commit.')
  console.error('\nMissing official workflow context:')
  for (const [key, expected] of mismatches) {
    console.error(`  ${key} must equal ${JSON.stringify(expected)}`)
  }
  process.exit(78)
}

const secretsFile = process.env.WORKER_SECRETS_FILE || ''

if (!secretsFile) {
  console.error('\nProduction deploy blocked.\n')
  console.error('WORKER_SECRETS_FILE is not set. The Deploy YouSafe Portal workflow must prepare the ephemeral Worker secrets file before deploying.')
  process.exit(78)
}

if (!fs.existsSync(secretsFile) || !fs.statSync(secretsFile).isFile()) {
  console.error('\nProduction deploy blocked.\n')
  console.error(`WORKER_SECRETS_FILE does not exist or is not a file: ${secretsFile}`)
  process.exit(78)
}

console.log(`GitHub-only deploy gate passed for ${process.env.GITHUB_SHA || 'current main commit'}.`)

const command = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const result = spawnSync(command, ['wrangler', 'deploy', '--secrets-file', secretsFile], {
  cwd: process.cwd(),
  env: { ...process.env, OPEN_NEXT_DEPLOY: 'true' },
  stdio: 'inherit',
})

if (result.error) {
  console.error(result.error)
  process.exit(1)
}

process.exit(result.status ?? 1)
