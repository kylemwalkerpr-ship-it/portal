/**
 * marketplace-image-optimization.test.ts
 *
 * Tests for lib/marketplaceImageOptimization.ts — the client-safe pre-upload
 * optimizer used by Marketplace GalleryManager.
 *
 * Goals locked in here:
 *  - 1280px max edge ceiling (consistent with 1200–1280px marketplace presets)
 *  - WebP encoding at ~0.85 quality
 *  - ~480 KiB byte target with a bounded quality/dimension reduction loop
 *  - aspect ratio preserved, never upscale
 *  - already-small WebP passes through without generational recompression
 *  - any decode/encode/Canvas failure fails OPEN to the original File
 *
 * Browser primitives (image decode + canvas) are injected so the pure
 * orchestration can be tested deterministically under jest's node env.
 */

import fs from 'node:fs'
import path from 'node:path'

import {
  MARKETPLACE_IMAGE_BASE_QUALITY,
  MARKETPLACE_IMAGE_MAX_EDGE,
  MARKETPLACE_IMAGE_MAX_ENCODE_ATTEMPTS,
  MARKETPLACE_IMAGE_TARGET_BYTES,
  computeMarketplaceTargetDimensions,
  optimizeMarketplaceImage,
  type DecodedMarketplaceImage,
  type MarketplaceImageCanvas,
  type MarketplaceImageOptimizationDeps,
} from '@/lib/marketplaceImageOptimization'

const KIB = 1024

function makeFile(bytes: number, name = 'photo.jpg', type = 'image/jpeg'): File {
  return new File([new Uint8Array(bytes)], name, { type })
}

function webpBlob(bytes: number): Blob {
  return new Blob([new Uint8Array(bytes)], { type: 'image/webp' })
}

function decodedImage(width: number, height: number): DecodedMarketplaceImage {
  return { width, height, draw: jest.fn(), close: jest.fn() }
}

function canvasWith(encode: jest.Mock): MarketplaceImageCanvas {
  return { context: { drawImage: jest.fn() }, encode }
}

function sequencedEncoder(bytesByCall: number[]): jest.Mock {
  let call = 0
  return jest.fn(async () => {
    const bytes = bytesByCall[Math.min(call, bytesByCall.length - 1)]
    call += 1
    return webpBlob(bytes)
  })
}

// ────────────────────────────────────────────────────────────
// Constants + pure dimension math
// ────────────────────────────────────────────────────────────

describe('marketplace image optimization constants', () => {
  it('caps the long edge at 1280px, consistent with marketplace presets', () => {
    expect(MARKETPLACE_IMAGE_MAX_EDGE).toBe(1280)
  })

  it('targets roughly 450–500 KiB per optimized file', () => {
    expect(MARKETPLACE_IMAGE_TARGET_BYTES).toBe(480 * KIB)
    expect(MARKETPLACE_IMAGE_TARGET_BYTES).toBeGreaterThanOrEqual(450 * KIB)
    expect(MARKETPLACE_IMAGE_TARGET_BYTES).toBeLessThanOrEqual(500 * KIB)
  })

  it('encodes WebP at a material-reduction quality (0.82–0.88)', () => {
    expect(MARKETPLACE_IMAGE_BASE_QUALITY).toBeGreaterThanOrEqual(0.82)
    expect(MARKETPLACE_IMAGE_BASE_QUALITY).toBeLessThanOrEqual(0.88)
  })

  it('bounds the reduction loop to a small, finite number of attempts', () => {
    expect(MARKETPLACE_IMAGE_MAX_ENCODE_ATTEMPTS).toBeGreaterThanOrEqual(2)
    expect(MARKETPLACE_IMAGE_MAX_ENCODE_ATTEMPTS).toBeLessThanOrEqual(6)
  })
})

describe('computeMarketplaceTargetDimensions', () => {
  it('scales a 4:3 landscape photo to fit the 1280px ceiling, preserving aspect ratio', () => {
    expect(computeMarketplaceTargetDimensions(4000, 3000)).toEqual({
      width: 1280,
      height: 960,
      scaled: true,
    })
  })

  it('scales a portrait photo on its long edge, preserving aspect ratio', () => {
    expect(computeMarketplaceTargetDimensions(3000, 4000)).toEqual({
      width: 960,
      height: 1280,
      scaled: true,
    })
  })

  it('scales 16:9 landscape to 1280×720', () => {
    expect(computeMarketplaceTargetDimensions(1600, 900)).toEqual({
      width: 1280,
      height: 720,
      scaled: true,
    })
  })

  it('handles extreme panoramas without distorting the ratio', () => {
    expect(computeMarketplaceTargetDimensions(4000, 1000)).toEqual({
      width: 1280,
      height: 320,
      scaled: true,
    })
  })

  it('leaves an image exactly at the ceiling unchanged', () => {
    expect(computeMarketplaceTargetDimensions(1280, 720)).toEqual({
      width: 1280,
      height: 720,
      scaled: false,
    })
  })

  it('never upscales smaller images', () => {
    expect(computeMarketplaceTargetDimensions(640, 480)).toEqual({
      width: 640,
      height: 480,
      scaled: false,
    })
  })

  it('never upscales tiny images', () => {
    expect(computeMarketplaceTargetDimensions(100, 75)).toEqual({
      width: 100,
      height: 75,
      scaled: false,
    })
  })

  it('returns zeroed dimensions for invalid input', () => {
    expect(computeMarketplaceTargetDimensions(0, 0)).toEqual({
      width: 0,
      height: 0,
      scaled: false,
    })
    expect(computeMarketplaceTargetDimensions(-10, 20)).toEqual({
      width: 0,
      height: 0,
      scaled: false,
    })
  })
})

// ────────────────────────────────────────────────────────────
// optimizeMarketplaceImage — pass-through and fail-open
// ────────────────────────────────────────────────────────────

describe('optimizeMarketplaceImage pass-through behavior', () => {
  it('leaves an already-small WebP within the ceiling untouched (no recompression)', async () => {
    const file = makeFile(300 * KIB, 'already-small.webp', 'image/webp')
    const decode = jest.fn(async () => decodedImage(1200, 800))
    const createCanvas = jest.fn()

    const result = await optimizeMarketplaceImage(file, { decode, createCanvas })

    expect(result).toBe(file)
    expect(decode).toHaveBeenCalledTimes(1)
    expect(createCanvas).not.toHaveBeenCalled()
  })

  it('ignores unsupported file types without decoding them', async () => {
    const file = makeFile(200 * KIB, 'animation.gif', 'image/gif')
    const decode = jest.fn(async () => decodedImage(800, 600))

    const result = await optimizeMarketplaceImage(file, { decode })

    expect(result).toBe(file)
    expect(decode).not.toHaveBeenCalled()
  })

  it('fails open to the original File when decoding throws', async () => {
    const file = makeFile(2 * 1024 * KIB, 'broken.jpg', 'image/jpeg')

    const result = await optimizeMarketplaceImage(file, {
      decode: async () => {
        throw new Error('decode failed')
      },
    })

    expect(result).toBe(file)
  })

  it('fails open to the original File when the canvas context is unavailable', async () => {
    const file = makeFile(2 * 1024 * KIB, 'listing.jpg', 'image/jpeg')

    const result = await optimizeMarketplaceImage(file, {
      decode: async () => decodedImage(4000, 3000),
      createCanvas: () => ({ context: null, encode: jest.fn() }),
    })

    expect(result).toBe(file)
  })

  it('fails open to the original File when WebP encoding throws', async () => {
    const file = makeFile(2 * 1024 * KIB, 'listing.jpg', 'image/jpeg')

    const result = await optimizeMarketplaceImage(file, {
      decode: async () => decodedImage(4000, 3000),
      createCanvas: () => canvasWith(jest.fn(async () => {
        throw new Error('encode failed')
      })),
    })

    expect(result).toBe(file)
  })

  it('keeps the original when the optimized output is not smaller', async () => {
    const file = makeFile(500 * KIB, 'listing.jpg', 'image/jpeg')

    const result = await optimizeMarketplaceImage(file, {
      decode: async () => decodedImage(1200, 800),
      createCanvas: () => canvasWith(jest.fn(async () => webpBlob(600 * KIB))),
    })

    expect(result).toBe(file)
  })

  it('returns the original for an empty file', async () => {
    const file = makeFile(0, 'empty.jpg', 'image/jpeg')
    const decode = jest.fn(async () => decodedImage(100, 100))

    const result = await optimizeMarketplaceImage(file, { decode })

    expect(result).toBe(file)
    expect(decode).not.toHaveBeenCalled()
  })
})

// ────────────────────────────────────────────────────────────
// optimizeMarketplaceImage — real optimization behavior
// ────────────────────────────────────────────────────────────

describe('optimizeMarketplaceImage optimization behavior', () => {
  it('converts an oversized JPEG to WebP within the dimension ceiling and byte target', async () => {
    const file = makeFile(3 * 1024 * KIB, 'listing-photo.jpg', 'image/jpeg')
    const encode = jest.fn(async () => webpBlob(300 * KIB))
    const createCanvas = jest.fn(() => canvasWith(encode))

    const result = await optimizeMarketplaceImage(file, {
      decode: async () => decodedImage(4000, 3000),
      createCanvas,
    })

    expect(createCanvas).toHaveBeenCalledWith(1280, 960)
    expect(encode).toHaveBeenCalledWith('image/webp', MARKETPLACE_IMAGE_BASE_QUALITY)
    expect(result).not.toBe(file)
    expect(result.type).toBe('image/webp')
    expect(result.name).toBe('listing-photo.webp')
    expect(result.size).toBe(300 * KIB)
    expect(result.size).toBeLessThanOrEqual(MARKETPLACE_IMAGE_TARGET_BYTES)
    expect(result.size).toBeLessThan(file.size)
  })

  it('draws the decoded image at the aspect-correct target dimensions', async () => {
    const file = makeFile(3 * 1024 * KIB, 'portrait.png', 'image/png')
    const draw = jest.fn()
    const close = jest.fn()
    const decode = jest.fn(async () => ({ width: 3000, height: 4000, draw, close }))

    await optimizeMarketplaceImage(file, {
      decode,
      createCanvas: () => canvasWith(jest.fn(async () => webpBlob(200 * KIB))),
    })

    expect(draw).toHaveBeenCalledTimes(1)
    expect(draw.mock.calls[0][1]).toBe(960)
    expect(draw.mock.calls[0][2]).toBe(1280)
    expect(close).toHaveBeenCalled()
  })

  it('only downsizes small non-WebP images — never upscales', async () => {
    const file = makeFile(400 * KIB, 'small.jpg', 'image/jpeg')
    const createCanvas = jest.fn(() => canvasWith(jest.fn(async () => webpBlob(150 * KIB))))

    const result = await optimizeMarketplaceImage(file, {
      decode: async () => decodedImage(640, 480),
      createCanvas,
    })

    expect(createCanvas).toHaveBeenCalledWith(640, 480)
    expect(result.type).toBe('image/webp')
    expect(result.size).toBe(150 * KIB)
  })

  it('runs a bounded quality/dimension reduction loop until under the byte target', async () => {
    const file = makeFile(4 * 1024 * KIB, 'huge.jpg', 'image/jpeg')
    const encode = sequencedEncoder([
      900 * KIB,
      700 * KIB,
      520 * KIB,
      380 * KIB,
    ])
    const createCanvas = jest.fn((_width: number, _height: number) => canvasWith(encode))

    const result = await optimizeMarketplaceImage(file, {
      decode: async () => decodedImage(4000, 3000),
      createCanvas,
    })

    expect(encode).toHaveBeenCalledTimes(4)
    expect(result.type).toBe('image/webp')
    expect(result.size).toBe(380 * KIB)
    expect(result.size).toBeLessThanOrEqual(MARKETPLACE_IMAGE_TARGET_BYTES)
    for (const [callIndex] of createCanvas.mock.calls.entries()) {
      const [width, height] = createCanvas.mock.calls[callIndex]
      expect(Math.max(width, height)).toBeLessThanOrEqual(MARKETPLACE_IMAGE_MAX_EDGE)
    }
  })

  it('stops after the bounded number of attempts and keeps the smallest result', async () => {
    const file = makeFile(3 * 1024 * KIB, 'stubborn.jpg', 'image/jpeg')
    const encode = sequencedEncoder([900 * KIB, 880 * KIB, 870 * KIB])
    const createCanvas = jest.fn(() => canvasWith(encode))

    const result = await optimizeMarketplaceImage(file, {
      decode: async () => decodedImage(4000, 3000),
      createCanvas,
    })

    expect(encode).toHaveBeenCalledTimes(MARKETPLACE_IMAGE_MAX_ENCODE_ATTEMPTS)
    expect(createCanvas).toHaveBeenCalledTimes(MARKETPLACE_IMAGE_MAX_ENCODE_ATTEMPTS)
    expect(result.type).toBe('image/webp')
    expect(result.size).toBe(870 * KIB)
    expect(result.size).toBeLessThan(file.size)
  })

  it('re-encodes an oversized WebP that exceeds the byte target', async () => {
    const file = makeFile(900 * KIB, 'big.webp', 'image/webp')
    const createCanvas = jest.fn(() => canvasWith(jest.fn(async () => webpBlob(300 * KIB))))

    const result = await optimizeMarketplaceImage(file, {
      decode: async () => decodedImage(1200, 800),
      createCanvas,
    })

    expect(createCanvas).toHaveBeenCalledWith(1200, 800)
    expect(result).not.toBe(file)
    expect(result.type).toBe('image/webp')
    expect(result.size).toBe(300 * KIB)
  })

  it('uses the injected deps instead of browser globals by default in tests', async () => {
    const file = makeFile(3 * 1024 * KIB, 'photo.jpg', 'image/jpeg')
    const deps: MarketplaceImageOptimizationDeps = {
      decode: async () => decodedImage(2000, 1500),
      createCanvas: () => canvasWith(jest.fn(async () => webpBlob(250 * KIB))),
    }

    const result = await optimizeMarketplaceImage(file, deps)

    expect(result).not.toBe(file)
    expect(result.type).toBe('image/webp')
  })
})

// ────────────────────────────────────────────────────────────
// GalleryManager wiring (source contract)
// ────────────────────────────────────────────────────────────

describe('GalleryManager pre-upload optimization wiring', () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'components/marketplace/GalleryManager.tsx'),
    'utf8',
  )

  it('imports the marketplace optimizer', () => {
    expect(source).toContain("import { optimizeMarketplaceImage } from '@/lib/marketplaceImageOptimization'")
  })

  it('awaits optimization before calling onUploadFile', () => {
    const optimizeIndex = source.indexOf('const optimizedFile = await optimizeMarketplaceImage(file)')
    const uploadIndex = source.indexOf('await onUploadFile(optimizedFile)')

    expect(optimizeIndex).toBeGreaterThan(-1)
    expect(uploadIndex).toBeGreaterThan(-1)
    expect(optimizeIndex).toBeLessThan(uploadIndex)
  })

  it('uploads the optimized File, not the raw original', () => {
    expect(source).toContain('const optimizedFile = await optimizeMarketplaceImage(file)')
    expect(source).toContain('onUploadFile(optimizedFile)')
  })

  it('uses optimized metadata for the optimistic preview', () => {
    expect(source).toContain('URL.createObjectURL(optimizedFile)')
    expect(source).toContain('name: optimizedFile.name')
    expect(source).toContain('size: optimizedFile.size')
  })
})

// ────────────────────────────────────────────────────────────
// Client-safety / approach guardrails
// ────────────────────────────────────────────────────────────

describe('marketplace optimizer approach guardrails', () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'lib/marketplaceImageOptimization.ts'),
    'utf8',
  )

  it('is client-safe — no server-only or storage-backend imports', () => {
    expect(source).not.toContain("from '@/lib/supabase")
    expect(source).not.toContain("from '@opennextjs/cloudflare'")
    expect(source).not.toMatch(/from ['"]node:/)
    expect(source).not.toContain('sharp')
    expect(source).not.toContain('R2')
  })

  it('uses the browser Canvas/ImageBitmap pipeline already proven by ImageCropper', () => {
    expect(source).toContain('createImageBitmap')
    expect(source).toContain('OffscreenCanvas')
    expect(source).toContain('image/webp')
  })
})
