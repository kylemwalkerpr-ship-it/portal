import { ok, fail } from '@/lib/apiEnvelope'
import { requirePortalUser } from '@/lib/portalAuth'

const BUCKET = 'messenger-wallpapers'
const MAX_BYTES = 4 * 1024 * 1024
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_DIM = 4000

function getImageDimensions(buf: ArrayBuffer): { width: number; height: number } | null {
  const bytes = new Uint8Array(buf)
  const len = bytes.length

  // PNG
  if (
    len > 24 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
  ) {
    const view = new DataView(buf)
    return {
      width: view.getUint32(16, false),
      height: view.getUint32(20, false),
    }
  }

  // JPEG
  if (len > 2 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2
    while (i < len - 9) {
      if (bytes[i] !== 0xff) { i++; continue }
      const marker = bytes[i + 1]
      // Skip padding and table markers
      if (marker === 0xff) { i++; continue }
      if (marker === 0x00 || (marker >= 0xd0 && marker <= 0xd9) || marker === 0x01) {
        i += 2
        continue
      }
      // SOF markers: 0xC0-0xCF except tables (0xC4, 0xC8, 0xCC)
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        const view = new DataView(buf)
        return {
          height: view.getUint16(i + 5, false),
          width: view.getUint16(i + 7, false),
        }
      }
      const segLen = (bytes[i + 2] << 8) | bytes[i + 3]
      i += 2 + segLen
    }
    return null
  }

  // WebP
  if (
    len > 30 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    const view = new DataView(buf)
    // VP8X (extended)
    if (bytes[12] === 0x56 && bytes[13] === 0x50 && bytes[14] === 0x38 && bytes[15] === 0x58) {
      return {
        width: (view.getUint8(24) | (view.getUint8(25) << 8) | (view.getUint8(26) << 16)) + 1,
        height: (view.getUint8(27) | (view.getUint8(28) << 8) | (view.getUint8(29) << 16)) + 1,
      }
    }
    // VP8L (lossless)
    if (bytes[12] === 0x56 && bytes[13] === 0x50 && bytes[14] === 0x38 && bytes[15] === 0x4c) {
      const b0 = view.getUint8(21)
      const b1 = view.getUint8(22)
      const b2 = view.getUint8(23)
      const b3 = view.getUint8(24)
      const bits = b0 | (b1 << 8) | (b2 << 16) | (b3 << 24)
      return {
        width: (bits & 0x3fff) + 1,
        height: ((bits >> 14) & 0x3fff) + 1,
      }
    }
    // VP8 (lossy) — read from VP8 bitstream frame tag
    if (bytes[12] === 0x56 && bytes[13] === 0x50 && bytes[14] === 0x38 && bytes[15] === 0x20) {
      // Frame tag starts at byte 20 (after 4-byte VP8 chunk size)
      const b0 = view.getUint8(20)
      const b1 = view.getUint8(21)
      const b2 = view.getUint8(22)
      const keyFrame = (b0 & 0x01) === 0
      if (!keyFrame) return null
      const w = (b1 | ((b2 & 0x3f) << 8)) & 0x3fff
      const h = ((b2 >> 6) | (view.getUint8(23) << 2) | ((view.getUint8(24) & 0x0f) << 10)) & 0x3fff
      return { width: w, height: h }
    }
    return null
  }

  return null
}

export async function POST(req: Request) {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return fail('Expected multipart/form-data.', 400)
  }

  const file = form.get('file')
  if (!(file instanceof File)) return fail('file field is required.', 400)
  if (file.size === 0) return fail('File is empty.', 400)
  if (file.size > MAX_BYTES) return fail('File exceeds 4 MB limit.', 413)
  if (!ALLOWED.has(file.type)) return fail('Only JPEG, PNG, or WebP images are allowed.', 415)

  const buf = await file.arrayBuffer()
  const dims = getImageDimensions(buf)
  if (!dims) return fail('Could not read image dimensions.', 422)
  if (dims.width > MAX_DIM || dims.height > MAX_DIM) {
    return fail(`Image must be ${MAX_DIM}×${MAX_DIM} pixels or smaller.`, 422)
  }

  const ext = (file.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg')
  const path = `${auth.profileId}/wallpaper.${ext}`

  // Remove any existing wallpaper for this user (upsert semantics)
  await auth.db.storage.from(BUCKET).remove([path]).catch(() => null)

  const { error: uploadErr } = await auth.db.storage.from(BUCKET).upload(path, buf, {
    contentType: file.type,
    upsert: true,
  })
  if (uploadErr) return fail(`Upload failed: ${uploadErr.message}`, 500)

  const { data: pub } = auth.db.storage.from(BUCKET).getPublicUrl(path)
  const url = pub?.publicUrl ?? null
  if (!url) return fail('Could not create public wallpaper URL.', 500)

  return ok({ url })
}

export async function DELETE() {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)

  const { data: list } = await auth.db.storage.from(BUCKET).list(auth.profileId)
  if (list && list.length > 0) {
    const paths = list.map((item: any) => `${auth.profileId}/${item.name}`)
    const { error: removeErr } = await auth.db.storage.from(BUCKET).remove(paths)
    if (removeErr) return fail(`Remove failed: ${removeErr.message}`, 500)
  }

  return ok({ ok: true })
}
