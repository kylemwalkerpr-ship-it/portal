import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import { providerDef, vaultBaseUrlOrNull, vaultModelOrNull, vaultProviderInputError } from '@/lib/aiKeyVault'
import { withVaultEnv, generateContentText } from '@/lib/contentAiProvider'

/**
 * POST /api/seo-factory/ai-keys/test
 * Live-probe a provider credential: inline creds win, else the saved vault key.
 * Body: { provider, apiKey?, baseUrl?, model? }
 *
 * The provider must be an exact commissioned stable pin. The DeepSeek probe is
 * hard-pinned to the first-party adapter and literal `deepseek-flash`, so any
 * base URL / model override is rejected with 400 before a probe can run.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }
    const body = await request.json().catch(() => ({}))
    const provider = String(body.provider || '').trim()
    const def = providerDef(provider)
    if (!def) {
      return NextResponse.json({ error: 'Unknown provider' }, { status: 400 })
    }
    const baseUrl = body.baseUrl != null ? String(body.baseUrl) : null
    const model = body.model != null ? String(body.model) : null
    const inputError = vaultProviderInputError(def, { baseUrl, model })
    if (inputError) {
      return NextResponse.json({ error: inputError }, { status: 400 })
    }
    // Build an env overlay for the probe: inline creds win, else vault keys.
    // Base URL / model values are the already-validated commissioned ones.
    const overrides: Record<string, string> = {}
    if (body.apiKey != null && String(body.apiKey).trim()) overrides[def.keyEnv] = String(body.apiKey).trim()
    const safeBaseUrl = def.baseUrlEnv ? vaultBaseUrlOrNull(def, baseUrl) : null
    if (safeBaseUrl && def.baseUrlEnv) overrides[def.baseUrlEnv] = safeBaseUrl
    const safeModel = def.modelEnv ? vaultModelOrNull(def, model) : null
    if (safeModel && def.modelEnv) overrides[def.modelEnv] = safeModel

    const result = await withVaultEnv(overrides, () =>
      generateContentText({
        system: 'Reply with exactly: ok',
        prompt: 'ok',
        maxTokens: 8,
        temperature: 0,
        aiProvider: provider,
      }),
    )
    return NextResponse.json({
      ok: true,
      provider: result.provider,
      model: result.model,
      reply: result.text.slice(0, 60),
    })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message.slice(0, 400) : 'test failed' },
      { status: 200 },
    )
  }
}
