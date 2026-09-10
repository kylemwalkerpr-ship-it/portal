import { spawnSync } from 'node:child_process'

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

console.log(`GitHub-only deploy gate passed for ${process.env.GITHUB_SHA || 'current main commit'}.`)

const command = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const result = spawnSync(command, ['opennextjs-cloudflare', 'deploy'], {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit',
})

if (result.error) {
  console.error(result.error)
  process.exit(1)
}

process.exit(result.status ?? 1)
