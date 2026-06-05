import { ok, fail } from '@/lib/apiEnvelope'
import { requirePortalUser } from '@/lib/portalAuth'
import { validateUpload, safeDisplayName } from '@/lib/uploadAuth'
import { recordDocumentAccess } from '@/lib/documentStorage'

const BUCKET = 'offer-attachments'
const MAX_BYTES = 20 * 1024 * 1024
const ALLOWED = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
  'video/mp4',
])

export async function POST(req: Request) {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)

  const form = await req.formData().catch(() => null)
  if (!form) return fail('Expected multipart/form-data.', 400)

  const files = form.getAll('files[]').filter((f): f is File => f instanceof File && f.size > 0)
  if (files.length === 0) return fail('At least one file is required.', 422, { fields: { files: 'Required.' } })
  if (files.length > 5) return fail('Maximum 5 files.', 422, { fields: { files: 'Maximum 5 files.' } })

  const uploaded = []
  for (const file of files) {
    const validation = await validateUpload(file, {
      maxBytes: MAX_BYTES,
      allowedMime: ALLOWED,
      // mp4 video has no magic-number entry in the allowlist; skip
      // sniffing so we don't reject valid uploads.
      sniffMagicNumbers: !file.type.startsWith('video/'),
    })
    if (!validation.ok) {
      const v = validation as { ok: false; error: string; status: 400 | 413 | 415 | 422 }
      return fail(v.error, v.status, { fields: { files: v.error } })
    }

    const displayName = safeDisplayName(file.name, 'attachment')
    const path = `${auth.profileId}/${validation.safeName}`
    const { error } = await auth.db.storage.from(BUCKET).upload(path, validation.bytes, {
      contentType: validation.mime,
      upsert: false,
    })
    if (error) return fail('Upload failed. Please try again.', 500)

    await recordDocumentAccess(auth.db, {
      bucket: BUCKET,
      path,
      action: 'upload',
      accessorProfileId: auth.profileId,
      request: req,
    })

    uploaded.push({
      file_url: path,
      file_name: displayName,
      file_size: file.size,
      mime_type: validation.mime,
      scan_status: 'pending',
    })
  }

  return ok({ files: uploaded }, { status: 201 })
}
