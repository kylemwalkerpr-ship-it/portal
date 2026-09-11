/// <reference types="jest" />

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

describe('Marketplace Fiverr legal profile v2 rewrite contract', () => {
  const root = process.cwd()
  const scriptPath = path.join(root, 'scripts/rewrite-marketplace-profiles-fiverr-v2.mjs')
  const runnerPath = path.join(root, 'scripts/run-marketplace-profile-copy-v2.mjs')
  const workflowPath = path.join(root, '.github/workflows/marketplace-profile-copy-v2-execute.yml')

  it('is valid JavaScript and never mutates gigs, slugs, or image fields', () => {
    execFileSync(process.execPath, ['--check', scriptPath], { stdio: 'pipe' })
    execFileSync(process.execPath, ['--check', runnerPath], { stdio: 'pipe' })
    const source = fs.readFileSync(scriptPath, 'utf8')
    expect(source).not.toContain("db.from('gigs').update(")
    expect(source).not.toMatch(/gallery_images\s*:/)
    expect(source).not.toMatch(/\bslug\s*:/)
  })

  it('uses verified facts and protects attorney-versus-consultant identity', () => {
    const source = fs.readFileSync(scriptPath, 'utf8')
    expect(source).toContain('Use ONLY supplied facts')
    expect(source).toContain('A consultant must NEVER be relabelled as an attorney, lawyer or solicitor')
    expect(source).toContain("role: 'attorney'")
    expect(source).toContain("role: 'consultant'")
    expect(source).toContain("consultant relabelled as lawyer")
    expect(source).not.toContain('public_bar_number')
    expect(source).toContain('credential_verified')
    expect(source).toContain('registration_verified')
  })

  it('forces estate-wide originality rather than another profile template', () => {
    const source = fs.readFileSync(scriptPath, 'utf8')
    expect(source).toContain('Credential-led:')
    expect(source).toContain('Client-led:')
    expect(source).toContain('Problem-led:')
    expect(source).toContain('Portfolio-led:')
    expect(source).toContain('Process-led:')
    expect(source).toContain('Conversational:')
    expect(source).toContain('duplicate tagline')
    expect(source).toContain('duplicate intro opening')
    expect(source).toContain('duplicate bio opening')
    expect(source).toContain('Do not start every bio with "I am" or "Hi, I’m"')
  })

  it('bans generic legal-profile filler and outcome claims', () => {
    const source = fs.readFileSync(scriptPath, 'utf8')
    for (const phrase of ['passionate about', 'dedicated professional', 'tailored to your needs', 'comprehensive solutions', 'trusted partner', 'navigate complex', 'results-driven', 'expert guidance']) {
      expect(source).toContain(phrase)
    }
    expect(source).toContain('unsupported outcome language')
  })

  it('creates a v2 rollback snapshot before writing each provider and stamps accepted copy', () => {
    const source = fs.readFileSync(scriptPath, 'utf8')
    expect(source).toContain('bulk_profile_copy_v2_snapshot')
    expect(source).toContain('await ensureSnapshots(estate)')
    expect(source).toContain('bulk_profile_copy_v2_applied')
    expect(source).toContain('Profile v2 final audit failed')
    expect(source).toContain('FINAL AUDIT PASS')
  })

  it('uses authorized SuperGrok OAuth with Grok 4.6 low reasoning', () => {
    const runner = fs.readFileSync(runnerPath, 'utf8')
    expect(runner).toContain('xai_oauth_access_token')
    expect(runner).toContain('xai_oauth_refresh_token')
    expect(runner).toContain("const XAI_MODEL = 'grok-4.6'")
    expect(runner).toContain("reasoning_effort: 'low'")
    expect(runner).toContain('marketplace-xai-low-preload.mjs')
    expect(runner).toContain("MARKETPLACE_PROFILE_COPY_V2: '1'")
  })

  it('runs in an independent non-cancelling workflow with pre/post image verification', () => {
    const workflow = fs.readFileSync(workflowPath, 'utf8')
    expect(workflow).toContain('marketplace-profile-copy-v2-production')
    expect(workflow).toContain('cancel-in-progress: false')
    expect(workflow).toContain('[run-marketplace-profile-v2]')
    expect(workflow).toContain('verify-marketplace-image-preservation.mjs')
    expect(workflow).toContain('run-marketplace-profile-copy-v2.mjs')
    const imageChecks = workflow.match(/verify-marketplace-image-preservation\.mjs/g) || []
    expect(imageChecks).toHaveLength(2)
  })
})
