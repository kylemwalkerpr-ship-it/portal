import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import { AI_PROVIDERS } from '@/lib/aiKeyVault'
import { withVaultEnv, generateContentText } from '@/lib/contentAiProvider'

/**
 * POST /api/seo-factory/ai-keys/test
 * Live-probe a provider credential: inline creds win, else the saved vault key.
 * Body: { provider, apiKey?, baseUrl?, model? }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }
    const body = await request.json().catch(() => ({}))
    const provider = String(body.provider || '').trim()
    const def = AI_PROVIDERS.find((p) => p.id === provider)
    if (!def) {
      return NextResponse.json({ error: 'Unknown provider' }, { status: 400 })
    }
    // Build an env overlay for the probe: inline creds win, else vault keys.
    const overrides: Record<string, string> = {}
    if (body.apiKey != null && String(body.apiKey).trim()) overrides[def.keyEnv] = String(body.apiKey).trim()
    if (body.baseUrl != null && String(body.baseUrl).trim() && def.baseUrlEnv) {
      overrides[def.baseUrlEnv] = String(body.baseUrl).trim()
    }
    if (body.model != null && String(body.model).trim() && def.modelEnv) {
      overrides[def.modelEnv] = String(body.model).trim()
    }

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
