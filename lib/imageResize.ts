/**
 * Client-side image resize + recompress for avatar/headshot uploads.
 *
 * Why: phone photos are 8–12 MB raw. Even the bumped 15 MB server limit
 * still costs the buyer slow uploads on a cell connection and leaves a
 * 12 MB blob in our Supabase storage that we resize on render anyway.
 * Resizing client-side before POST keeps the wire payload under 1 MB and
 * matches what we render in the UI (typically 512×512 max).
 *
 * Returns a File object so the caller can drop it straight into FormData
 * without changing the upload code. Falls back to the original file if
 * resize fails (e.g. corrupt file, OffscreenCanvas unavailable).
 */
export async function resizeAvatarFile(
  file: File,
  opts: { maxEdge?: number; mimeType?: string; quality?: number } = {},
): Promise<File> {
  const { maxEdge = 1024, mimeType = 'image/jpeg', quality = 0.85 } = opts

  // GIFs would lose their animation — pass through untouched.
  if (file.type === 'image/gif') return file
  // Already small enough — skip the resize round-trip.
  if (file.size < 600 * 1024) return file

  try {
    const bitmap = await createImageBitmap(file)
    const { width, height } = bitmap
    const scale = Math.min(1, maxEdge / Math.max(width, height))
    const targetW = Math.round(width * scale)
    const targetH = Math.round(height * scale)

    const canvas =
      typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(targetW, targetH)
        : Object.assign(document.createElement('canvas'), { width: targetW, height: targetH })
    const ctx = (canvas as OffscreenCanvas | HTMLCanvasElement).getContext('2d') as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, targetW, targetH)

    const blob: Blob =
      canvas instanceof OffscreenCanvas
        ? await canvas.convertToBlob({ type: mimeType, quality })
        : await new Promise<Blob>((resolve, reject) => {
            ;(canvas as HTMLCanvasElement).toBlob(
              (b) => (b ? resolve(b) : reject(new Error('toBlob returned null'))),
              mimeType,
              quality,
            )
          })

    // Some platforms don't free the underlying bitmap GPU resource until GC;
    // explicit close keeps memory pressure down for users uploading multiple
    // photos in a row (e.g. wizard step that takes intake + headshot).
    bitmap.close?.()

    const name = file.name.replace(/\.[^./]+$/, '') + '.jpg'
    return new File([blob], name, { type: mimeType, lastModified: Date.now() })
  } catch {
    return file
  }
}
