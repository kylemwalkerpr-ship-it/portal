import { createHash } from 'crypto'
import { hashContractPayload } from '@/lib/seoFactory/writingContract'

export type HashDomain = 'studio.metric-artifact-bytes/1' | 'studio.structured-metadata/1'
export const ARTIFACT_HASH_DOMAIN: HashDomain = 'studio.metric-artifact-bytes/1'
export const STRUCTURED_HASH_DOMAIN: HashDomain = 'studio.structured-metadata/1'
export const STRUCTURED_HASH_SERIALIZER = 'writingContract.hashContractPayload/stableStringify-v1' as const

export type HashResult = { domain: HashDomain; digest: string }

/** SHA-256 over exact UTF-8 string bytes or the supplied byte buffer. */
export function hashArtifactBytes(bytes: string | Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}
export function describeArtifactHash(bytes: string | Uint8Array): HashResult {
  return { domain: ARTIFACT_HASH_DOMAIN, digest: hashArtifactBytes(bytes) }
}

function hasStandardArrayPrototype(value: unknown[]): boolean {
  return Object.getPrototypeOf(value) === Array.prototype
}

function assertJsonData(value: unknown, stack: WeakSet<object>, path: string): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`Non-finite JSON number at ${path}`)
    return
  }
  if (typeof value !== 'object') throw new TypeError(`Non-JSON value at ${path}`)
  if (stack.has(value)) throw new TypeError(`Cycle in structured payload at ${path}`)
  stack.add(value)
  try {
    if (Array.isArray(value)) {
      if (!hasStandardArrayPrototype(value)) throw new TypeError(`Non-plain JSON array at ${path}`)
      const length = value.length
      const ownKeys = Reflect.ownKeys(value)
      if (ownKeys.length !== length + 1 || !ownKeys.includes('length')) throw new TypeError(`Non-JSON array property at ${path}`)
      const entries: Array<[number, unknown]> = []
      for (const key of ownKeys) {
        if (key === 'length') continue
        if (typeof key !== 'string' || !/^(0|[1-9]\d*)$/.test(key)) throw new TypeError(`Non-JSON array property at ${path}`)
        const index = Number(key)
        if (!Number.isInteger(index) || index < 0 || index >= length || String(index) !== key) throw new TypeError(`Non-JSON array property at ${path}`)
        const descriptor = Object.getOwnPropertyDescriptor(value, key)
        if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) throw new TypeError(`Non-data JSON property at ${path}[${key}]`)
        entries.push([index, descriptor.value])
      }
      if (entries.length !== length) throw new TypeError(`Sparse array at ${path}`)
      entries.sort(([left], [right]) => left - right)
      for (const [index, entry] of entries) assertJsonData(entry, stack, `${path}[${index}]`)
      return
    }
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) throw new TypeError(`Non-plain JSON object at ${path}`)
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string') throw new TypeError(`Symbol key at ${path}`)
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) throw new TypeError(`Non-data JSON property at ${path}.${key}`)
      assertJsonData(descriptor.value, stack, `${path}.${key}`)
    }
  } finally {
    stack.delete(value)
  }
}

/** Validates strict JSON data before delegating to the existing V2 serializer. */
export function hashStructuredPayload(payload: unknown): string {
  assertJsonData(payload, new WeakSet(), '$')
  return hashContractPayload(payload)
}
export function describeStructuredHash(payload: unknown): HashResult {
  return { domain: STRUCTURED_HASH_DOMAIN, digest: hashStructuredPayload(payload) }
}
