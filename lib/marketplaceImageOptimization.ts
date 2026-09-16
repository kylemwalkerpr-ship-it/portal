/**
 * Client-safe pre-upload image optimizer for marketplace gallery uploads.
 *
 * The project's Supabase Storage image transformations are not enabled (the
 * render endpoint returns 403 FeatureNotEnabled), so images must be made
 * delivery-friendly before they are stored. This module runs in the browser
 * only, using Canvas/ImageBitmap/WebP primitives, and is wired into
 * components/marketplace/GalleryManager.tsx before an upload starts.
 *
 * Behavior:
 *  - long edge capped at 1280px (consistent with the existing marketplace
 *    presets of 1200–1280px), aspect ratio preserved, never upscales
 *  - WebP output at ~0.85 quality with a bounded quality/dimension reduction
 *    loop targeting ~480 KiB
 *  - already-small WebP inside the dimension ceiling passes through as the
 *    same File object (no generational recompression)
 *  - any decode/encode/Canvas failure fails OPEN to the original File so an
 *    upload is never blocked by a client-side codec limitation
 */

export const MARKETPLACE_IMAGE_MAX_EDGE = 1280
export const MARKETPLACE_IMAGE_TARGET_BYTES = 480 * 1024
export const MARKETPLACE_IMAGE_BASE_QUALITY = 0.85
export const MARKETPLACE_IMAGE_MAX_ENCODE_ATTEMPTS = 4

const OUTPUT_TYPE = 'image/webp'
const ACCEPTED_INPUT_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const DIMENSION_SCALE_PER_ATTEMPT = 0.85
const QUALITY_STEP_PER_ATTEMPT = 0.12
const MIN_QUALITY = 0.5

export interface MarketplaceImageDrawContext {
  drawImage(image: unknown, dx: number, dy: number, dw: number, dh: number): void
}

export interface DecodedMarketplaceImage {
  width: number
  height: number
  draw: (context: MarketplaceImageDrawContext, width: number, height: number) => void
  close: () => void
}

export interface MarketplaceImageCanvas {
  context: MarketplaceImageDrawContext | null
  encode: (type: string, quality?: number) => Promise<Blob>
}

export interface MarketplaceImageOptimizationDeps {
  decode?: (file: File) => Promise<DecodedMarketplaceImage>
  createCanvas?: (width: number, height: number) => MarketplaceImageCanvas
}

export interface MarketplaceTargetDimensions {
  width: number
  height: number
  scaled: boolean
}

/**
 * Computes aspect-correct output dimensions capped at MARKETPLACE_IMAGE_MAX_EDGE.
 * Never upscales; invalid input returns zeroed dimensions.
 */
export function computeMarketplaceTargetDimensions(
  width: number,
  height: number,
): MarketplaceTargetDimensions {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { width: 0, height: 0, scaled: false }
  }

  const longestEdge = Math.max(width, height)
  if (longestEdge <= MARKETPLACE_IMAGE_MAX_EDGE) {
    return { width: Math.round(width), height: Math.round(height), scaled: false }
  }

  const scale = MARKETPLACE_IMAGE_MAX_EDGE / longestEdge
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scaled: true,
  }
}

async function decodeWithBrowser(file: File): Promise<DecodedMarketplaceImage> {
  const bitmap = await createImageBitmap(file)
  return {
    width: bitmap.width,
    height: bitmap.height,
    draw(context, width, height) {
      context.drawImage(bitmap, 0, 0, width, height)
    },
    close() {
      if (typeof bitmap.close === 'function') bitmap.close()
    },
  }
}

function createBrowserCanvas(width: number, height: number): MarketplaceImageCanvas {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height)
    return {
      context: canvas.getContext('2d'),
      encode: (type, quality) => canvas.convertToBlob({ type, quality }),
    }
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return {
    context: canvas.getContext('2d'),
    encode: (type, quality) =>
      new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error('WebP encoding unavailable'))),
          type,
          quality,
        )
      }),
  }
}

function toWebpFileName(name: string): string {
  const base = (name || '').replace(/\.[^.]+$/, '') || 'image'
  return `${base}.webp`
}

/**
 * Optimizes a marketplace upload file to WebP when that produces a smaller,
 * still-valid result. Always resolves: on any failure or non-improvement the
 * original File is returned unchanged.
 */
export async function optimizeMarketplaceImage(
  file: File,
  deps: MarketplaceImageOptimizationDeps = {},
): Promise<File> {
  if (!file || !ACCEPTED_INPUT_TYPES.includes(file.type) || file.size === 0) return file

  const decode = deps.decode ?? decodeWithBrowser
  const createCanvas = deps.createCanvas ?? createBrowserCanvas

  let decoded: DecodedMarketplaceImage | null = null
  try {
    decoded = await decode(file)

    const target = computeMarketplaceTargetDimensions(decoded.width, decoded.height)
    if (target.width <= 0 || target.height <= 0) return file

    // Already-small WebP within the dimension ceiling: pass the same File
    // object through so it is not recompressed generationally.
    if (
      file.type === OUTPUT_TYPE &&
      file.size <= MARKETPLACE_IMAGE_TARGET_BYTES &&
      !target.scaled
    ) {
      return file
    }

    let bestBlob: Blob | null = null
    let attemptWidth = target.width
    let attemptHeight = target.height

    for (let attempt = 0; attempt < MARKETPLACE_IMAGE_MAX_ENCODE_ATTEMPTS; attempt += 1) {
      const canvas = createCanvas(attemptWidth, attemptHeight)
      if (!canvas || !canvas.context) return file

      decoded.draw(canvas.context, attemptWidth, attemptHeight)

      const quality = Math.max(
        MIN_QUALITY,
        MARKETPLACE_IMAGE_BASE_QUALITY - attempt * QUALITY_STEP_PER_ATTEMPT,
      )
      const blob = await canvas.encode(OUTPUT_TYPE, quality)
      const usableWebp = !!blob && blob.size > 0 && blob.type === OUTPUT_TYPE

      if (usableWebp && (!bestBlob || blob.size < bestBlob.size)) {
        bestBlob = blob
      }
      if (usableWebp && blob.size <= MARKETPLACE_IMAGE_TARGET_BYTES) break

      attemptWidth = Math.max(1, Math.round(attemptWidth * DIMENSION_SCALE_PER_ATTEMPT))
      attemptHeight = Math.max(1, Math.round(attemptHeight * DIMENSION_SCALE_PER_ATTEMPT))
    }

    if (!bestBlob || bestBlob.size >= file.size) return file

    return new File([bestBlob], toWebpFileName(file.name), {
      type: OUTPUT_TYPE,
      lastModified: file.lastModified,
    })
  } catch {
    return file
  } finally {
    if (decoded) {
      try {
        decoded.close()
      } catch {
        // Fail open: a decode resource that refuses to close must not block upload.
      }
    }
  }
}
