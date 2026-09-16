/**
 * Provider registry boundary — STATIC HALF of the post-P2 non-registrability
 * guarantee (Plan Task 1; design §3.2, §3.8, §7, §11).
 *
 * After the P2 commission flip (Tasks 3-7) no file on a provider execution
 * path may contain:
 *   - a retired provider hostname (`api.entrim.ai`, `api.nvidia.com`,
 *     `parasail.io`, `runbios.ai`, `openrouter.ai`, novita/requesty/tokenharbor,
 *     AIHubmix, Zai, Groq, Gemini, OpenAI hosts, Vercel AI gateway), or
 *   - a retired provider pin/selector literal (entrim-*, nvidia-*, baseten-*,
 *     parasail-*, runbios-*, aihubmix-*, zai-glm, openai, cloudflare-ai, groq,
 *     gemini, openrouter, gpt-5.6-*, claude-*, the stale DeepSeek model ids,
 *     and the bare historical `deepseek`/`deepseek-pro` pins), or
 *   - a registered executor/stream candidate outside `adapterFor`.
 *
 * The retired dead-code modules retained until the P3 purge
 * (`lib/contentAiProviderCore.ts`, `lib/runbiosCatalog.ts`) are explicitly
 * allowlisted below: post-P2 they must be UNREFERENCED by these execution
 * surfaces and UNREACHABLE at runtime (proven by
 * `tests/provider-registration-proof.test.ts`), but the modules themselves may
 * still contain inert retired code until P3.
 *
 * `lib/chatProvider.ts` is the separate gig-draft/support-chat chain, outside
 * the Content Studio provider commission (design §7). It is allowlisted for
 * its own host list but must never import the Content Studio execution door.
 *
 * This test is the enforcement of the property BEFORE and AFTER the P3 purge:
 * deletion is cleanup, never a safety dependency.
 */
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8')

/** Strip block + line comments so a doc comment can never trip (or hide) a rule. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:\\])\/\/[^\n]*/g, '$1')
}

/** Complete provider-execution inventory for the P2 boundary scan (design §3.8). */
const EXECUTION_SURFACES = [
  // P2-A — adapter + registration + catalog/UI release (Task 3)
  'lib/contentAiProvider.ts',
  'lib/contentAiCatalog.ts',
  // P2-B — server boundaries (Task 4)
  'lib/seoFactory/briefModel.ts',
  'lib/seoEngine/engineAi.ts',
  'lib/seoEngine/llmVisibility.ts',
  'lib/seoEngine/knowledge.ts',
  'lib/seoEngine/planner.ts',
  'lib/seoFactory/contentStudioExecutionContext.ts',
  'lib/seoFactory/pipelineContract.ts',
  'app/api/content-studio/editorial-review/route.ts',
  'app/api/content-studio/style-review/route.ts',
  'app/api/content-studio/author-revise/route.ts',
  'app/api/content-studio/author-revise/routeCore.ts',
  'app/api/content-studio/reaudit/route.ts',
  'app/api/content-studio/jobs/route.ts',
  'app/api/content-studio/jobs/legacy.ts',
  'app/api/content-studio/suggest-brief/route.ts',
  'app/api/content-studio/generate/route.ts',
  'app/api/seo-factory/generate/route.ts',
  'app/api/seo-factory/generate-stream/route.ts',
  'app/api/seo-engine/action-stream/route.ts',
  // P2-D — vault/settings/test/health surfaces (Task 6)
  'lib/aiKeyVault.ts',
  'app/api/seo-factory/ai-keys/route.ts',
  'app/api/seo-factory/ai-keys/settings/route.ts',
  'app/api/seo-factory/ai-keys/test/route.ts',
  'app/api/seo-factory/health/route.ts',
  'app/api/content-studio/system-health/route.ts',
  // P2-E — deploy/config declarations (Task 7)
  'scripts/sync-ai-vault.mjs',
] as const

/** Files that may still carry inert retired transports until the P3 purge. */
const P3_DEAD_CODE_ALLOWLIST = new Set([
  'lib/contentAiProviderCore.ts',
  'lib/runbiosCatalog.ts',
  'scripts/probe-runbios-pipeline.ts',
])

/** Non-Content-Studio chat chain (gig drafts / support chat) — out of commission. */
const OUT_OF_COMMISSION_ALLOWLIST = new Set([
  'lib/chatProvider.ts',
])

/**
 * Retired provider-pin/selector literals (retirement matrix, design §7).
 * The completed upstream model id `deepseek-flash` is intentionally NOT in this
 * list: it is a model id, not a pin, and its transport use is pinned by
 * `tests/deepseek-first-party-transport.test.ts`.
 */
const RETIRED_PIN_LITERALS = [
  'entrim',
  'entrim-deepseek',
  'entrim-deepseek-v4-flash',
  'entrim-deepseek-v4-flash-0731',
  'entrim-qwen-27b',
  'nvidia-minimax',
  'nvidia-nemotron',
  'nvidia-glm',
  'nvidia-deepseek',
  'baseten-deepseek',
  'baseten-deepseek-pro',
  'baseten-glm-fast',
  'baseten-glm-53-flash',
  'parasail',
  'parasail-deepseek',
  'parasail-deepseek-pro',
  'parasail-glm',
  'runbios-glm-53-flash',
  'runbios-glm-52',
  'runbios-claude-opus',
  'runbios-claude-sonnet',
  'runbios-kimi',
  'runbios-qwen',
  'zai-glm',
  'aihubmix-glm-fast',
  'glm-fast-aihubmix',
  'glm-5.2-fast',
  'glm-5.3-flash',
  'openai',
  'gpt-5.6',
  'gpt-5.6-terra',
  'gpt-5.6-sol',
  'gpt-5.6-luna',
  'cloudflare-ai',
  'groq',
  'gemini',
  'openrouter',
  'custom',
  'chatProvider-bridge',
  'bios-adaptive',
  'claude-opus-5',
  'claude-sonnet-5',
  'minimax-m3',
  'nemotron-3-ultra',
  'deepseek',
  'deepseek-pro',
  'deepseek-official',
  'deepseek-official-flash',
  'deepseek-v4-flash',
  'deepseek-v4-pro',
  'deepseek-ai/DeepSeek-V4-Flash',
  'deepseek-ai/DeepSeek-V4-Flash-0731',
  'deepseek-ai/deepseek-v4-flash-0731',
  'deepseek-ai/DeepSeek-V4-Pro-0813',
] as const

/** Retired provider hostnames (retirement matrix + design §1 prohibition). */
const RETIRED_HOST_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: 'api.entrim.ai', pattern: /api\.entrim\.ai/i },
  { label: 'api.nvidia.com / integrate.api.nvidia.com', pattern: /api\.nvidia\.com|integrate\.api\.nvidia\.com/i },
  { label: 'baseten', pattern: /api\.baseten\.co|baseten\.ai/i },
  { label: 'parasail', pattern: /parasail\.io|api\.parasail/i },
  { label: 'runbios', pattern: /runbios\.ai/i },
  { label: 'openrouter', pattern: /openrouter\.ai/i },
  { label: 'novita', pattern: /novita\.ai/i },
  { label: 'requesty', pattern: /requesty\.ai/i },
  { label: 'tokenharbor', pattern: /tokenharbor|token-harbor/i },
  { label: 'aihubmix', pattern: /aihubmix\.com/i },
  { label: 'zai', pattern: /api\.z\.ai/i },
  { label: 'groq', pattern: /api\.groq\.com/i },
  { label: 'gemini', pattern: /generativelanguage\.googleapis\.com/i },
  { label: 'openai', pattern: /api\.openai\.com/i },
  { label: 'vercel-ai-gateway', pattern: /ai-gateway\.vercel\.sh|api\.vercel\.ai/i },
]

function findQuotedLiteral(source: string, literal: string): boolean {
  return source.includes(`'${literal}'`) || source.includes(`"${literal}"`) || source.includes(`\`${literal}\``)
}

describe('provider registry boundary — static execution-path scan', () => {
  it('ships the canonical registry as the single provider identity source', () => {
    const registryPath = path.join(root, 'lib/contentAiRegistry.ts')
    const contractPath = path.join(root, 'lib/contentAiRegistryContract.ts')
    expect(fs.existsSync(registryPath)).toBe(true)
    expect(fs.existsSync(contractPath)).toBe(true)
    // The client-safe contract owns the ONLY identity/metadata literals.
    const contract = read('lib/contentAiRegistryContract.ts')
    expect(contract).toContain('COMMISSIONED_PROVIDER_DEFINITIONS')
    expect(contract).toContain('COMMISSIONED_PINS')
    expect(contract).toContain('deepseek-v41-flash')
    expect(contract).toContain('deepseek-flash')
    expect(contract).toContain('https://api.deepseek.com/v1')
    expect(contract).toContain('https://api.x.ai/v1')
    // The runtime registry derives from that same table and re-exports it.
    const registry = read('lib/contentAiRegistry.ts')
    expect(registry).toContain("from './contentAiRegistryContract'")
    expect(registry).toMatch(/COMMISSIONED_PROVIDER_DEFINITIONS\s*\.map/)
    expect(registry).toContain('COMMISSIONED_PROVIDERS')
  })

  it('every execution surface in the inventory exists', () => {
    const missing = EXECUTION_SURFACES.filter((relative) => !fs.existsSync(path.join(root, relative)))
    expect(missing).toEqual([])
  })

  it('no execution surface contains a retired provider hostname', () => {
    const offenders: string[] = []
    for (const relative of EXECUTION_SURFACES) {
      const source = stripComments(read(relative))
      for (const { label, pattern } of RETIRED_HOST_PATTERNS) {
        if (pattern.test(source)) offenders.push(`${relative}: ${label}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('no execution surface contains a retired provider pin literal', () => {
    const offenders: string[] = []
    for (const relative of EXECUTION_SURFACES) {
      const source = stripComments(read(relative))
      for (const literal of RETIRED_PIN_LITERALS) {
        if (findQuotedLiteral(source, literal)) offenders.push(`${relative}: ${literal}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('the retired Grok subscription proxy literal lives only in the retained Grok transport', () => {
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          if (['node_modules', '.next', '.open-next', '.git'].includes(entry.name)) continue
          walk(full)
          continue
        }
        if (!/\.(?:ts|tsx|mjs|js)$/.test(entry.name)) continue
        const relative = path.relative(root, full)
        if (relative === 'lib/xaiGrokTransport.ts') continue
        const source = stripComments(fs.readFileSync(full, 'utf8'))
        if (/cli-chat-proxy\.grok\.com/i.test(source)) offenders.push(relative)
      }
    }
    for (const dir of ['app', 'lib', 'scripts']) {
      const full = path.join(root, dir)
      if (fs.existsSync(full)) walk(full)
    }
    // contentAiProviderCore uses the exported XAI_CLI_CHAT_PROXY_BASE_URL
    // constant (allowlisted P3 dead code); no literal may be reintroduced.
    expect(offenders.filter((relative) => !P3_DEAD_CODE_ALLOWLIST.has(relative))).toEqual([])
  })

  it('no execution path outside the registry/retained transports imports retired transport modules', () => {
    const offenders: string[] = []
    for (const relative of EXECUTION_SURFACES) {
      const source = stripComments(read(relative))
      if (/from\s+['"](?:@\/lib\/)?runbiosCatalog['"]/.test(source)) offenders.push(`${relative}: runbiosCatalog`)
      if (/from\s+['"](?:@\/lib\/)?contentAiProviderCore['"]/.test(source)) offenders.push(`${relative}: contentAiProviderCore`)
    }
    expect(offenders).toEqual([])
  })

  it('the out-of-commission chat chain never imports the Content Studio execution door', () => {
    const chatProvider = stripComments(read('lib/chatProvider.ts'))
    expect(chatProvider).not.toMatch(/generateContentText|generateContentTextStream/)
    expect(chatProvider).not.toMatch(/from\s+['"]@\/lib\/contentAiProviderCore['"]/)
  })

  it('retains the retired dead-code modules only as inert, unreferenced code (P3 cleanup targets)', () => {
    // The allowlist must not silently grow into new execution code: each entry
    // is a known file with a documented P3 disposition.
    for (const relative of P3_DEAD_CODE_ALLOWLIST) {
      expect(fs.existsSync(path.join(root, relative))).toBe(true)
    }
    expect(P3_DEAD_CODE_ALLOWLIST.size).toBe(3)
  })
})
