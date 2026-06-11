/**
 * POST   /api/profile/avatar — upload a profile photo for the signed-in user
 *                              (any role: student, admin, support, provider).
 * DELETE /api/profile/avatar — remove it.
 *
 * Mirrors the consultant avatar endpoint but writes profiles.avatar_url, so
 * every surface that already renders profiles.avatar_url (conversations,
 * admin Users, settings) picks the photo up with no further wiring.
 * Bucket: supabase/profile_avatars_bucket.sql.
 */
import { requirePortalUser } from '@/lib/portalAuth'

const BUCKET = 'profile-avatars'
const MAX_BYTES = 15 * 1024 * 1024
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

async function writeAvatar(db: any, profileId: string, url: string | null, path: string | null) {
  // Degrade gracefully if avatar_path hasn't been migrated yet.
  let { error } = await db.from('profiles').update({ avatar_url: url, avatar_path: path }).eq('id', profileId)
  if (error && /column .*avatar_path/i.test(error.message || '')) {
    ;({ error } = await db.from('profiles').update({ avatar_url: url }).eq('id', profileId))
  }
  return error
}

export async function POST(req: Request) {
  const auth = await requirePortalUser()
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
  if (file.size > MAX_BYTES) return Response.json({ error: 'File exceeds the 15 MB limit' }, { status: 413 })
  if (!ALLOWED.has(file.type)) return Response.json({ error: 'Only JPG, PNG, WebP, or GIF images are allowed.' }, { status: 415 })

  const ext = (file.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg')
  const path = `${auth.profileId}/${crypto.randomUUID()}.${ext}`
  const buf = await file.arrayBuffer()

  const { error: uploadErr } = await auth.db.storage.from(BUCKET).upload(path, buf, {
    contentType: file.type,
    upsert: false,
  })
  if (uploadErr) return Response.json({ error: `Upload failed: ${uploadErr.message}` }, { status: 500 })

  const { data: pub } = auth.db.storage.from(BUCKET).getPublicUrl(path)
  const avatarUrl = pub?.publicUrl ?? null
  if (!avatarUrl) return Response.json({ error: 'Could not create public avatar URL.' }, { status: 500 })

  const updateErr = await writeAvatar(auth.db, auth.profileId, avatarUrl, path)
  if (updateErr) {
    await auth.db.storage.from(BUCKET).remove([path])
    return Response.json({ error: updateErr.message }, { status: 500 })
  }

  return Response.json({ avatar_url: avatarUrl, avatar_path: path })
}

export async function DELETE() {
  const auth = await requirePortalUser()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  // Best effort: clear the column; leave old storage objects (cheap, and
  // public URLs in old messages keep working).
  const updateErr = await writeAvatar(auth.db, auth.profileId, null, null)
  if (updateErr) return Response.json({ error: updateErr.message }, { status: 500 })
  return Response.json({ removed: true })
}
