import { ok, fail } from '@/lib/apiEnvelope'
import { requirePortalUser } from '@/lib/portalAuth'

const MAX_BYTES = 20 * 1024 * 1024
const ALLOWED = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
  'video/mp4',
])

function cleanName(name: string) {
  return name.replace(/[^a-zA-Z0-9._ -]+/g, '').trim().slice(0, 120) || 'attachment'
}

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
    if (file.size > MAX_BYTES) return fail(`${file.name} exceeds 20 MB.`, 422, { fields: { files: 'Each file must be 20 MB or less.' } })
    if (file.type && !ALLOWED.has(file.type)) {
      return fail(`${file.name} is not an accepted file type.`, 422, { fields: { files: 'Accepted: PDF, DOCX, JPG, PNG, MP4.' } })
    }

    const fileName = cleanName(file.name || 'attachment')
    const path = `${auth.profileId}/${crypto.randomUUID()}-${fileName}`
    const { error } = await auth.db.storage.from('offer-attachments').upload(path, await file.arrayBuffer(), {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    })
    if (error) return fail(error.message, 500)
    uploaded.push({
      file_url: path,
      file_name: fileName,
      file_size: file.size,
      mime_type: file.type || 'application/octet-stream',
      scan_status: 'pending',
    })
  }

  return ok({ files: uploaded }, { status: 201 })
}
