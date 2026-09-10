import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

const pkg = JSON.parse(read('package.json'))
const guard = read('scripts/deploy-production.mjs')
const workflow = read('.github/workflows/deploy.yml')
const agentRules = read('AGENTS.md')

describe('GitHub-only production deployment contract', () => {
  test('routes npm deploy through an environment guard rather than exposing OpenNext directly', () => {
    expect(pkg.scripts.deploy).toBe('node scripts/deploy-production.mjs')
    expect(pkg.scripts.deploy).not.toContain('opennextjs-cloudflare deploy')
    expect(pkg.scripts.deploy).not.toContain('wrangler deploy')
  })

  test('allows the production command only in the official main GitHub workflow', () => {
    expect(guard).toContain("GITHUB_ACTIONS: 'true'")
    expect(guard).toContain("GITHUB_REF: 'refs/heads/main'")
    expect(guard).toContain("GITHUB_WORKFLOW: 'Deploy YouSafe Portal'")
    expect(guard).toContain("['opennextjs-cloudflare', 'deploy']")
    expect(guard).toContain('Production deploy blocked.')
  })

  test('the official workflow remains the code deployment path', () => {
    expect(workflow).toContain('branches: [main]')
    expect(workflow).toContain('run: npm run deploy')
    expect(workflow).toContain("if: github.event_name != 'pull_request'")
  })

  test('future coding agents are explicitly prohibited from direct Cloudflare publishing', () => {
    expect(agentRules).toContain('`main` on `kylemwalkerpr-ship-it/portal` is the only production source of truth.')
    expect(agentRules).toContain('Never run `wrangler deploy`')
    expect(agentRules).toContain('branch -> PR -> required repository checks -> merge to `main`')
    expect(agentRules).toContain('Do not bypass a red workflow with a direct provider deployment.')
  })
})
