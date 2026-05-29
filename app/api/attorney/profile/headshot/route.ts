import { requireAttorney } from '@/lib/attorneyAuth'

const BUCKET = 'attorney-headshots'
const MAX_BYTES = 5 * 1024 * 1024 // 5 MB
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

export async function POST(req: Request) {
  const { ctx, error, status } = await requireAttorney({ allowInactive: true })
  if (!ctx) return Response.json({ error }, { status })

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return Response.json({ error: 'Expected multipart/form-data' }, { status: 400 })
  }

  const file = form.get('file')
  if (!(file instanceof File)) return Response.json({ error: 'file field is required' }, { status: 400 })
  if (file.size === 0) return Response.json({ error: 'File is empty' }, { status: 400 })
  if (file.size > MAX_BYTES) return Response.json({ error: `File exceeds ${MAX_BYTES / (1024 * 1024)} MB limit` }, { status: 413 })
  if (!ALLOWED.has(file.type)) {
    return Response.json({ error: 'Only JPG, PNG, WebP, or GIF images are allowed.' }, { status: 415 })
  }

  // Look up the previous path so we can clean it up after the new upload
  // succeeds. (Public bucket, so the URL is stable; we just want to avoid
  // accumulating dead files.)
  const { data: existing } = await ctx.db
    .from('attorneys')
    .select('headshot_path')
    .eq('id', ctx.attorneyId)
    .single()

  const ext = (file.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg')
  const path = `${ctx.attorneyId}/${crypto.randomUUID()}.${ext}`
  const buf = await file.arrayBuffer()

  const { error: uploadErr } = await ctx.db.storage.from(BUCKET).upload(path, buf, {
    contentType: file.type,
    upsert: false,
  })
  if (uploadErr) {
    return Response.json({ error: `Upload failed: ${uploadErr.message}` }, { status: 500 })
  }

  const { data: pub } = ctx.db.storage.from(BUCKET).getPublicUrl(path)
  const headshotUrl = pub?.publicUrl ?? null

  const { error: updErr } = await ctx.db
    .from('attorneys')
    .update({ headshot_url: headshotUrl, headshot_path: path })
    .eq('id', ctx.attorneyId)

  if (updErr) {
    await ctx.db.storage.from(BUCKET).remove([path])
    return Response.json({ error: updErr.message }, { status: 500 })
  }

  if (existing?.headshot_path && existing.headshot_path !== path) {
    await ctx.db.storage.from(BUCKET).remove([existing.headshot_path])
  }

  return Response.json({ headshot_url: headshotUrl, headshot_path: path })
}

export async function DELETE() {
  const { ctx, error, status } = await requireAttorney({ allowInactive: true })
  if (!ctx) return Response.json({ error }, { status })

  const { data: existing } = await ctx.db
    .from('attorneys')
    .select('headshot_path')
    .eq('id', ctx.attorneyId)
    .single()

  if (existing?.headshot_path) {
    await ctx.db.storage.from(BUCKET).remove([existing.headshot_path])
  }

  await ctx.db
    .from('attorneys')
    .update({ headshot_url: null, headshot_path: null })
    .eq('id', ctx.attorneyId)

  return Response.json({ ok: true })
}
