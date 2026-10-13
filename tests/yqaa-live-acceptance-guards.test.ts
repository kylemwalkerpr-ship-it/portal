import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(__dirname, '..')
const workflow = fs.readFileSync(path.join(root, '.github/workflows/yqaa-live-acceptance.yml'), 'utf8')
const harness = fs.readFileSync(path.join(root, 'scripts/yqaa-live-acceptance.mjs'), 'utf8')

describe('manual YQAA live acceptance safety guards', () => {
  test('workflow is manual only, exact-main scoped, and contents-read only', () => {
    expect(workflow).toContain('workflow_dispatch:')
    expect(workflow).not.toMatch(/^\s+(push|pull_request):/m)
    expect(workflow).toContain("github.ref == 'refs/heads/main'")
    expect(workflow).toContain('permissions:\n  contents: read')
    expect(workflow).not.toContain('deployments: write')
  })

  test('workflow requires the exact deployed SHA and build identity before the live harness', () => {
    expect(workflow).toContain('inputs.expected_sha')
    expect(workflow).toContain('inputs.expected_build_id')
    expect(workflow).toContain('git rev-parse HEAD')
    expect(harness).toContain('/actions/workflows/deploy.yml/runs?branch=main&status=success&per_page=1')
    expect(harness).toContain('latest?.head_sha === expectedSha')
    expect(harness).toContain('ids.includes(expectedBuild)')
  })

  test('fixtures fail closed on test ownership, use real authenticated APIs, and remain bounded', () => {
    expect(harness).toContain("student?.is_test_account === true")
    expect(harness).toContain("provider.is_test_account !== true")
    expect(harness).toContain("status: 'paused'")
    expect(harness).toContain("strategy: 'sign_in_token'")
    expect(harness).toContain('/api/messages/conversations/')
    expect(harness).toContain('MAX_TURNS = 9')
    expect(harness).toContain('MAX_WAIT_MS = 60_000')
    for (const category of ['orientation', 'budget', 'scope_narrowing', 'counter', 'lowball', 'frustration', 'disclosure', 'no_stale_floors', 'provider_attention']) {
      expect(harness).toContain(`name: '${category}'`)
    }
  })

  test('acceptance requires a real generated reply and cleans up through soft actions only', () => {
    expect(harness).toContain('message.metadata?.ai_generated')
    expect(harness).toContain('message.metadata?.yqaa_trigger_message_id === triggerId')
    expect(harness).toContain('diagnostic.ai_last_error || diagnostic.ai_last_skip')
    expect(harness).toContain('function safeFailure')
    expect(harness).toContain("replace(/(__clerk_ticket=)")
    expect(harness).toContain("{ archived: true }")
    expect(harness).toContain("status: 'cancelled'")
    expect(harness).toContain("status: 'paused'")
    expect(harness).not.toMatch(/\.delete\(/)
    expect(harness).not.toMatch(/console\.(log|error)\([^\n]*(token|secret|reply\.body)/i)
  })

  test('workflow passes secrets only in its live CI step and retains a short sanitized receipt', () => {
    expect(workflow).toContain('CLERK_SECRET_KEY: ${{ secrets.CLERK_SECRET_KEY }}')
    expect(workflow).toContain('SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}')
    expect(workflow).toContain('retention-days: 7')
    expect(harness).toContain('reply_length_bucket')
    expect(harness).not.toContain('JSON.stringify(scenario')
    expect(harness).not.toContain('reply.body,')
  })
})
