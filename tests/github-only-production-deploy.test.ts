import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

const pkg = JSON.parse(read('package.json'))

describe('GitHub-only production deployment contract', () => {
  test('routes npm deploy through an environment guard rather than exposing OpenNext directly', () => {
    expect(pkg.scripts.deploy).toBe('node scripts/deploy-production.mjs')
    expect(pkg.scripts.deploy).not.toContain('opennextjs-cloudflare deploy')
    expect(pkg.scripts.deploy).not.toContain('wrangler deploy')
  })

  test('allows the production command only in the official main GitHub workflow', () => {
    const guard = read('scripts/deploy-production.mjs')
    expect(guard).toContain("GITHUB_ACTIONS: 'true'")
    expect(guard).toContain("GITHUB_REF: 'refs/heads/main'")
    expect(guard).toContain("GITHUB_WORKFLOW: 'Deploy YouSafe Portal'")
    expect(guard).toContain('--secrets-file')
    expect(guard).toContain("OPEN_NEXT_DEPLOY: 'true'")
    expect(guard).not.toContain('opennextjs-cloudflare')
    expect(guard).toContain('Production deploy blocked.')
  })

  test('the official workflow remains the code deployment path', () => {
    const workflow = read('.github/workflows/deploy.yml')
    expect(workflow).toContain('branches: [main]')
    expect(workflow).toContain('npm run deploy')
    expect(workflow).toContain("if: github.event_name != 'pull_request'")
  })

  test('the deploy step keeps the exact legacy name publicationMonitor requires', () => {
    const stepName = 'Deploy via OpenNext to Cloudflare (with transient-failure retry)'
    const workflow = read('.github/workflows/deploy.yml')
    const monitor = read('lib/seoFactory/publicationMonitor.ts')
    expect(monitor).toContain(`deploySteps: ['${stepName}']`)
    expect(workflow).toContain(`- name: ${stepName}`)
  })

  test('the workflow never syncs secrets through wrangler secret put', () => {
    const workflow = read('.github/workflows/deploy.yml')
    expect(workflow).not.toMatch(/wrangler\s+(versions\s+)?secret\s+put/)
    expect(workflow).toContain('node scripts/prepare-worker-secrets.mjs')
    expect(workflow).toContain('WORKER_SECRETS_FILE')
    expect(workflow).toContain('$GITHUB_ENV')
  })

  test('a fully failed deploy attempt loop exits red', () => {
    const workflow = read('.github/workflows/deploy.yml')
    expect(workflow).toMatch(/All 3 deploy attempts failed\.[\s\S]{0,80}?exit 1/)
  })

  test('cleanup step is nonexistent-safe and never runs on pull_request jobs', () => {
    const workflow = read('.github/workflows/deploy.yml')
    const start = workflow.indexOf('- name: Remove ephemeral Worker secrets file')
    expect(start).toBeGreaterThan(-1)
    const nextStep = workflow.indexOf('\n      - name:', start + 1)
    const cleanupStep = workflow.slice(start, nextStep === -1 ? undefined : nextStep)
    expect(cleanupStep).toContain('always()')
    expect(cleanupStep).toContain("github.event_name != 'pull_request'")
    expect(cleanupStep).toContain('rm -f "$WORKER_SECRETS_FILE"')
    expect(cleanupStep).toContain('${WORKER_SECRETS_FILE:-}')
  })

  test('future coding agents are explicitly prohibited from direct Cloudflare publishing', () => {
    const agentRules = read('AGENTS.md')
    expect(agentRules).toContain('`main` on `kylemwalkerpr-ship-it/portal` is the only production source of truth.')
    expect(agentRules).toContain('Never run `wrangler deploy`')
    expect(agentRules).toContain('branch -> PR -> required repository checks -> merge to `main`')
    expect(agentRules).toContain('Do not bypass a red workflow with a direct provider deployment.')
  })
})
