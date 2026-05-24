import { requirePortalUser } from '@/lib/portalAuth'
import { PortalThemeId, THEME_IDS, DEFAULT_THEME } from '@/lib/portalThemes'

export async function GET() {
  const ctx = await requirePortalUser()
  if ('error' in ctx) {
    return Response.json({ error: ctx.error }, { status: ctx.status })
  }

  // Direct fetch — requirePortalUser doesn't select theme_preference
  // (kept narrow on purpose). Graceful degrade if the column doesn't
  // exist yet on this environment.
  const { data, error } = await ctx.db
    .from('profiles')
    .select('theme_preference')
    .eq('id', ctx.profileId)
    .single()

  if (error && /column .*theme_preference/i.test(error.message)) {
    return Response.json({ theme: DEFAULT_THEME })
  }

  const raw = (data?.theme_preference as PortalThemeId | null) || DEFAULT_THEME
  const theme = (THEME_IDS as string[]).includes(raw) ? raw : DEFAULT_THEME
  return Response.json({ theme })
}

export async function PATCH(req: Request) {
  const ctx = await requirePortalUser()
  if ('error' in ctx) {
    return Response.json({ error: ctx.error }, { status: ctx.status })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON.' }, { status: 400 })
  }

  const theme = typeof body.theme === 'string' ? body.theme : ''
  if (!THEME_IDS.includes(theme as PortalThemeId)) {
    return Response.json({ error: 'Invalid theme.' }, { status: 400 })
  }

  const { error } = await ctx.db
    .from('profiles')
    .update({ theme_preference: theme })
    .eq('id', ctx.profileId)

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ ok: true, theme })
}
