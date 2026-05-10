import { getCurrentConsultant } from '@/lib/consultant'

const BUCKET = 'consultant-avatars'
const MAX_BYTES = 5 * 1024 * 1024
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

async function updateAvatar(db: any, consultantId: string, url: string, path: string) {
  const attempts = [
    { avatar_url: url, avatar_path: path },
    { headshot_url: url, headshot_path: path },
    { photo_url: url, photo_path: path },
  ]
  let lastError: any = null
  for (const payload of attempts) {
    const { error } = await db.from('consultants').update(payload).eq('id', consultantId)
    if (!error) return null
    lastError = error
    if (!/column .* does not exist|schema cache/i.test(error.message)) break
  }
  return lastError
}

export async function POST(req: Request) {
  const auth = await getCurrentConsultant()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return Response.json({ error: 'Expected multipart/form-data' }, { status: 400 })
  }

  const file = form.get('file')
  if (!(file instanceof File)) return Response.json({ error: 'file field is required' }, { status: 400 })
  if (file.size === 0) return Response.json({ error: 'File is empty' }, { status: 400 })
  if (file.size > MAX_BYTES) return Response.json({ error: 'File exceeds 5 MB limit' }, { status: 413 })
  if (!ALLOWED.has(file.type)) return Response.json({ error: 'Only JPG, PNG, WebP, or GIF images are allowed.' }, { status: 415 })

  const ext = (file.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg')
  const path = `${auth.consultant.id}/${crypto.randomUUID()}.${ext}`
  const buf = await file.arrayBuffer()

  const { error: uploadErr } = await auth.db.storage.from(BUCKET).upload(path, buf, {
    contentType: file.type,
    upsert: false,
  })
  if (uploadErr) return Response.json({ error: `Upload failed: ${uploadErr.message}` }, { status: 500 })

  const { data: pub } = auth.db.storage.from(BUCKET).getPublicUrl(path)
  const avatarUrl = pub?.publicUrl ?? null
  if (!avatarUrl) return Response.json({ error: 'Could not create public avatar URL.' }, { status: 500 })

  const updateErr = await updateAvatar(auth.db, auth.consultant.id, avatarUrl, path)
  if (updateErr) {
    await auth.db.storage.from(BUCKET).remove([path])
    return Response.json({ error: updateErr.message }, { status: 500 })
  }

  return Response.json({ avatar_url: avatarUrl, avatar_path: path })
}
