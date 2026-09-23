import fs from 'node:fs'
import path from 'node:path'
import { normalizeP11Request, profileP11Actor, SEO_ENGINE_DAILY_ACTOR, validP11Actor, validP11IdempotencyKey } from '@/lib/seoEngine/p11AuditCommand'

const migration = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20260923120000_p11_audit_idempotency.sql'), 'utf8')
const sql = migration.toLowerCase().replace(/\s+/g, ' ')
const llm = fs.readFileSync(path.join(process.cwd(), 'lib/seoEngine/llmVisibility.ts'), 'utf8')
const postRoute = fs.readFileSync(path.join(process.cwd(), 'app/api/seo-engine/llm-visibility/route.ts'), 'utf8')
const streamRoute = fs.readFileSync(path.join(process.cwd(), 'app/api/seo-engine/action-stream/route.ts'), 'utf8')
const cronRoute = fs.readFileSync(path.join(process.cwd(), 'app/api/cron/seo-engine-daily/route.ts'), 'utf8')
const auth = fs.readFileSync(path.join(process.cwd(), 'lib/portalAuth.ts'), 'utf8')

describe('P11 durable audit command contract', () => {
  it('bounds and canonicalizes request fields and rejects invalid idempotency keys', () => {
    expect(normalizeP11Request({ queries: [' A  query ', '', 'B'.repeat(700)], maxAudits: 999, planLimit: -3 })).toEqual({
      queries: ['A  query', 'B'.repeat(500)], engineLabel: undefined, maxAudits: 30,
      fanOut: false, planLimit: 1, maxPerPlan: 5,
    })
    expect(validP11IdempotencyKey('audit-123')).toBe(true)
    expect(validP11IdempotencyKey('short')).toBe(false)
    expect(validP11IdempotencyKey('a'.repeat(201))).toBe(false)
    expect(validP11IdempotencyKey('bad\nkey')).toBe(false)
  })

  it('scopes commands by stable actor scope with nullable profile metadata', () => {
    expect(sql).toContain('actor_scope text not null')
    expect(sql).toContain('actor_profile_id uuid references public.profiles(id)')
    expect(sql).toContain('unique (actor_scope, idempotency_key)')
    expect(sql).toContain("actor_scope = 'profile:' || actor_profile_id::text")
    expect(sql).toContain('actor_profile_id is null and actor_scope like \'system:%\'')
    expect(sql).not.toMatch(/actor_profile_id uuid not null/)
    expect(sql).toContain('request_hash text not null')
    expect(auth).toMatch(/return \{ db, profile, profileId: profile\.id, role: normalisedRole \}/)
    expect(profileP11Actor('uuid-a')).toEqual({ scope: 'profile:uuid-a', profileId: 'uuid-a' })
    expect(SEO_ENGINE_DAILY_ACTOR).toEqual({ scope: 'system:seo-engine-daily', profileId: null })
    expect(validP11Actor(SEO_ENGINE_DAILY_ACTOR)).toBe(true)
    expect(validP11Actor({ scope: 'bad\nactor', profileId: null })).toBe(false)
  })

  it('claims each provider before its external call and never reclaims an existing attempt', () => {
    const claim = llm.indexOf('claimProvider(providerAttempt.ordinal, providerAttempt.claimPin || pin)')
    const invocation = llm.indexOf('const ai = await generateContentText({', claim)
    expect(claim).toBeGreaterThan(-1)
    expect(invocation).toBeGreaterThan(claim)
    expect(llm.slice(claim, invocation)).toContain('if (!ownsClaim)')
    expect(llm).toContain('Existing provider claim blocks invocation; command cannot complete as a fresh audit')
    expect(llm).toContain("finishProviderClaim(providerAttempt.ordinal, providerAttempt.claimPin || pin, 'completed', engineAudit)")
  })

  it('links durable observations to a command ordinal and fails closed on write errors', () => {
    expect(sql).toContain('unique index if not exists uq_seo_llm_visibility_command_ordinal')
    expect(sql).toContain('where command_id is not null')
    expect(sql).toContain('command_id is null and query_ordinal is null')
    expect(sql).toContain('command_id is not null and query_ordinal is not null and query_ordinal >= 0')
    expect(llm).toContain('command_id: opts.command?.commandId ?? null')
    expect(llm).toContain('query_ordinal: opts.command ? queryOrdinal : null')
    expect(llm).toContain('if (persisted.error) throw new Error(`Observation persistence failed: ${persisted.error.message}`)')
    expect(llm).toContain('provider claims prevent automatic reinvocation')
  })

  it('defines durable provider-claim and legacy-compatible observation uniqueness', () => {
    expect(sql).toContain('primary key (command_id, query_ordinal, provider_pin)')
    expect(sql).toContain('add column if not exists command_id uuid references public.seo_llm_audit_commands(id)')
    expect(sql).toContain('add column if not exists query_ordinal integer')
    expect(sql).toContain('where command_id is not null')
    expect(sql).not.toMatch(/add column if not exists command_id[^,;]*not null/)
  })

  it('uses a durable logical identity for one unpinned fallback attempt', () => {
    expect(llm).toContain("claimPin: 'lane-default-unpinned'")
    expect(llm).toContain("unpinnedFallback ? { exclusive: false } : undefined")
    expect(llm).toContain("claimProvider(providerAttempt.ordinal, providerAttempt.claimPin || pin)")
  })

  it('routes both authenticated manual entrypoints through the same command authority', () => {
    expect(postRoute).toContain('executeP11AuditCommand')
    expect(streamRoute).toContain('executeP11AuditCommand')
    expect(postRoute).toContain("status: 409")
    expect(streamRoute).toContain("status: 409")
    expect(postRoute).toContain("req.headers.get('Idempotency-Key')")
    expect(streamRoute).toContain("request.headers.get('Idempotency-Key')")
    expect(cronRoute).toContain('executeP11AuditCommand')
    expect(cronRoute).toContain('SEO_ENGINE_DAILY_ACTOR')
    expect(cronRoute).toContain('scheduledP11IdempotencyKey')
    expect(cronRoute).not.toContain("from('profiles')")
  })

  it('keeps caller retry keys while a command is pending and clears them on completed results', () => {
    const seo = fs.readFileSync(path.join(process.cwd(), 'components/design/admin-seo-engine.tsx'), 'utf8')
    expect(seo).toContain('if (!res.ok || !data.ok || data.recoverable)')
    expect(seo).toContain('getOrCreateP11ActionKey')
    expect(seo).toContain('P11_UI_KEY_NAMESPACES.single')
    expect(seo).toContain('P11_UI_KEY_NAMESPACES.fanOut')
    expect(seo).toContain("settleP11ActionKey(sessionStorage, P11_UI_KEY_NAMESPACES.single, 'completed')")
    expect(seo).toContain("settleP11ActionKey(sessionStorage, P11_UI_KEY_NAMESPACES.fanOut, 'completed')")
    expect(seo).toContain("'http_error'")
    expect(seo).toContain("'recoverable'")
    const studio = fs.readFileSync(path.join(process.cwd(), 'components/design/admin-content-studio.tsx'), 'utf8')
    expect(studio).toContain("llmCommandCompleted ? 'completed' : 'recoverable'")
    expect(studio).toContain('getOrCreateP11ActionKey')
    expect(studio).toContain("settleP11ActionKey(sessionStorage, P11_UI_KEY_NAMESPACES.stream, 'pending')")
    expect(studio).toContain("settleP11ActionKey(sessionStorage, P11_UI_KEY_NAMESPACES.stream, 'transport_error')")
  })

  it('restricts new command and provider ledger tables to service role', () => {
    for (const table of ['seo_llm_audit_commands', 'seo_llm_audit_provider_claims']) {
      expect(sql).toContain(`alter table public.${table} enable row level security`)
      expect(sql).toContain(`revoke all privileges on table public.${table} from public, anon, authenticated`)
      expect(sql).toContain(`grant all privileges on table public.${table} to service_role`)
    }
    expect(sql.match(/for all to service_role using \(true\) with check \(true\)/g)).toHaveLength(2)
    expect(sql).not.toContain('security definer')
  })
})
