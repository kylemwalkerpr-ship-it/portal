/// <reference types="jest" />

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

describe('Marketplace Fiverr-grade copy rewrite contract', () => {
  const root = process.cwd()
  const scriptPath = path.join(root, 'scripts/rewrite-marketplace-copy.mjs')
  const runnerPath = path.join(root, 'scripts/run-marketplace-copy-rewrite.mjs')
  const xaiPreloadPath = path.join(root, 'scripts/marketplace-xai-low-preload.mjs')
  const imageGuardPath = path.join(root, 'scripts/verify-marketplace-image-preservation.mjs')
  const workflowPath = path.join(root, '.github/workflows/marketplace-copy-rewrite.yml')

  it('is valid JavaScript and keeps published slugs immutable', () => {
    execFileSync(process.execPath, ['--check', scriptPath], { stdio: 'pipe' })
    execFileSync(process.execPath, ['--check', runnerPath], { stdio: 'pipe' })
    execFileSync(process.execPath, ['--check', xaiPreloadPath], { stdio: 'pipe' })
    const source = fs.readFileSync(scriptPath, 'utf8')
    expect(source).toContain(".eq('slug', gig.slug)")
    expect(source).toContain('if (updated.slug !== gig.slug)')
    const gigUpdate = source.slice(source.indexOf("db.from('gigs').update({"), source.indexOf("}).eq('id', gig.id)"))
    expect(gigUpdate).not.toMatch(/\bslug\s*:/)
  })

  it('cannot rewrite, replace or detach gig images', () => {
    execFileSync(process.execPath, ['--check', imageGuardPath], { stdio: 'pipe' })
    const source = fs.readFileSync(scriptPath, 'utf8')
    const imageGuard = fs.readFileSync(imageGuardPath, 'utf8')
    const gigUpdate = source.slice(source.indexOf("db.from('gigs').update({"), source.indexOf("}).eq('id', gig.id)"))

    expect(gigUpdate).not.toMatch(/gallery_images\s*:/)
    expect(gigUpdate).not.toMatch(/cover_image_url\s*:/)
    expect(gigUpdate).not.toMatch(/image_url\s*:/)
    expect(imageGuard).toContain("select('id,slug,gallery_images')")
    expect(imageGuard).toContain("before.gallery_images")
    expect(imageGuard).toContain('Marketplace image preservation failed')
    expect(imageGuard).toContain('IMAGE PRESERVATION PASS')
  })

  it('requires recovery snapshots before any content rewrite', () => {
    const source = fs.readFileSync(scriptPath, 'utf8')
    expect(source).toContain('await verifyRecoveryPoints()')
    expect(source).toContain('Pre-Fiverr-grade marketplace copy rewrite snapshot 2026-09-09')
    expect(source).toContain('Pre-Fiverr-grade marketplace profile rewrite snapshot 2026-09-09')
  })

  it('rejects the legacy boilerplate and checks estate-wide uniqueness', () => {
    const source = fs.readFileSync(scriptPath, 'utf8')
    expect(source).toContain('faceless form shop')
    expect(source).toContain('you are in the right listing')
    expect(source).toContain("errors.push('duplicate title')")
    expect(source).toContain("errors.push('duplicate description opening')")
    expect(source).toContain("errors.push('duplicate profile opening')")
    expect(source).toContain('FINAL AUDIT PASS')
  })

  it('uses authorized SuperGrok OAuth first and keeps provider fallbacks resumable', () => {
    const runner = fs.readFileSync(runnerPath, 'utf8')
    const preload = fs.readFileSync(xaiPreloadPath, 'utf8')
    expect(runner).toContain(".from('ai_settings')")
    expect(runner).toContain('xai_oauth_access_token')
    expect(runner).toContain('xai_oauth_refresh_token')
    expect(runner).toContain("id: 'supergrok-oauth'")
    expect(runner).toContain("kind: 'xai'")
    expect(runner).toContain("model: 'grok-4.6'")
    expect(runner).toContain("MARKETPLACE_XAI_REASONING: 'low'")
    expect(runner).toContain('marketplace-xai-low-preload.mjs')
    expect(preload).toContain("body.reasoning_effort")
    expect(preload).toContain("MARKETPLACE_XAI_REASONING || 'low'")
    expect(runner).toContain(".from('ai_provider_keys')")
    expect(runner).toContain("id: 'entrim-deepseek'")
    expect(runner).toContain("id: 'entrim-qwen-27b'")
    expect(runner).toContain("id: 'runbios-glm-53'")
    expect(runner).toContain('switching providers and resuming completed rows')
  })

  it('runs only after a successful production deploy with the durable one-time marker enabled', () => {
    const workflow = fs.readFileSync(workflowPath, 'utf8')
    expect(workflow).toContain('workflow_run:')
    expect(workflow).toContain('Deploy YouSafe Portal')
    expect(workflow).toContain("github.event.workflow_run.conclusion == 'success'")
    expect(workflow).toContain("github.event.workflow_run.event == 'push'")
    expect(workflow).toContain('.github/marketplace-copy-rewrite.enabled')
    expect(workflow).toContain("steps.marker.outputs.enabled == 'true'")
    expect(workflow).toContain('MARKETPLACE_COPY_REWRITE')
    expect(workflow).toContain('node scripts/run-marketplace-copy-rewrite.mjs')
    const imageChecks = workflow.match(/node scripts\/verify-marketplace-image-preservation\.mjs/g) || []
    expect(imageChecks).toHaveLength(2)
    expect(workflow).toContain('Verify gig images before copy rewrite')
    expect(workflow).toContain('Verify gig images after copy rewrite')
  })

  it('does not write nonexistent role-table updated_at columns', () => {
    const source = fs.readFileSync(scriptPath, 'utf8')
    const roleUpdate = source.slice(source.indexOf('db.from(table).update({'), source.indexOf("}).eq('id', roleRow.id)"))
    expect(roleUpdate).not.toMatch(/updated_at\s*:/)
  })
})
