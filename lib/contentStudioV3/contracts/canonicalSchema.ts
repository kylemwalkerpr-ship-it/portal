export type JsonSchemaType = 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object'

export type Node =
  | { kind: 'string'; min?: number; max: number; format?: 'date-time' | 'sha256'; registry?: string }
  | { kind: 'number'; integer?: boolean; min?: number; max?: number }
  | { kind: 'boolean' }
  | { kind: 'enum'; values: readonly string[]; registry?: string }
  | { kind: 'nullable'; inner: Node }
  | { kind: 'array'; items: Node; min?: number; max: number; unique?: boolean }
  | { kind: 'object'; properties: Readonly<Record<string, Node>> }
  | { kind: 'union'; variants: readonly Node[] }
  | { kind: 'map'; values: Node; max: number; keysRegistry?: string }

function freezeDescriptor<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const key of Reflect.ownKeys(value as object)) {
      const descriptor = Object.getOwnPropertyDescriptor(value as object, key)
      if (descriptor && 'value' in descriptor) freezeDescriptor(descriptor.value)
    }
    Object.freeze(value)
  }
  return value
}
export const str = <const M extends number>(max: M, registry?: string, format?: 'date-time' | 'sha256') =>
  freezeDescriptor({ kind: 'string', min: 1, max, ...(registry ? { registry } : {}), ...(format ? { format } : {}) } as const)
export const number = (options: { integer?: boolean; min?: number; max?: number } = {}) =>
  freezeDescriptor({ kind: 'number', ...options } as const)
export const bool = () => freezeDescriptor({ kind: 'boolean' } as const)
export const enm = <const V extends readonly string[]>(values: V, registry?: string) =>
  freezeDescriptor({ kind: 'enum', values, ...(registry ? { registry } : {}) } as const)
export const nullable = <const S extends Node>(inner: S) => freezeDescriptor({ kind: 'nullable', inner } as const)
export const array = <const S extends Node>(items: S, max: number, min = 0, unique = false) =>
  freezeDescriptor({ kind: 'array', items, max, min, unique } as const)
export const object = <const P extends Record<string, Node>>(properties: P) =>
  freezeDescriptor({ kind: 'object', properties } as const)
export const union = <const V extends readonly Node[]>(...variants: V) =>
  freezeDescriptor({ kind: 'union', variants } as const)
export const map = <const V extends Node>(values: V, max = 100, keysRegistry?: string) =>
  freezeDescriptor({ kind: 'map', values, max, ...(keysRegistry ? { keysRegistry } : {}) } as const)

export type Infer<S> = S extends { kind: 'string' } ? string
  : S extends { kind: 'number' } ? number
  : S extends { kind: 'boolean' } ? boolean
  : S extends { kind: 'enum'; values: readonly (infer V extends string)[] } ? V
  : S extends { kind: 'nullable'; inner: infer I } ? Infer<I> | null
  : S extends { kind: 'array'; items: infer I } ? Infer<I>[]
  : S extends { kind: 'object'; properties: infer P } ? { [K in keyof P]: Infer<P[K]> }
  : S extends { kind: 'union'; variants: readonly (infer V)[] } ? Infer<V>
  : S extends { kind: 'map'; values: infer V } ? Record<string, Infer<V>>
  : never

export interface CodecRegistryContext {
  schemaVersion: 'studio.normative-registry-context/1'
  registries: Readonly<Record<string, { definitionVersion: string; values: readonly string[] }>>
}
export interface CodecIssue { path: string; code: 'invalid_type' | 'invalid_value' | 'missing_field' | 'extra_property' | 'context_unavailable'; message: string }
export type CodecResult = { ok: true; issues: [] } | { ok: false; issues: CodecIssue[] }

function record(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  if (proto !== Object.prototype && proto !== null) return false
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') return false
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return false
  }
  return true
}

function strictJson(value: unknown, seen: WeakSet<object>): boolean {
  if (value === null || ['string', 'boolean'].includes(typeof value)) return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value !== 'object' || seen.has(value)) return false
  seen.add(value)
  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) return false
      const keys = Reflect.ownKeys(value)
      if (keys.length !== value.length + 1 || !keys.includes('length')) return false
      for (let i = 0; i < value.length; i += 1) {
        const d = Object.getOwnPropertyDescriptor(value, String(i))
        if (!d || !d.enumerable || !('value' in d) || !strictJson(d.value, seen)) return false
      }
      return true
    }
    if (!record(value)) return false
    return Reflect.ownKeys(value).every((key) => {
      const d = Object.getOwnPropertyDescriptor(value, key as string)!
      return strictJson(d.value, seen)
    })
  } finally { seen.delete(value) }
}

function isInstant(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-](\d{2}):(\d{2}))$/.exec(value)
  if (!match) return false
  const year = Number(match[1]); const month = Number(match[2]); const day = Number(match[3])
  const hour = Number(match[4]); const minute = Number(match[5]); const second = Number(match[6])
  const zoneHour = Number(match[8] ?? 0); const zoneMinute = Number(match[9] ?? 0)
  const calendar = new Date(Date.UTC(year, month - 1, day))
  const validDate = calendar.getUTCFullYear() === year && calendar.getUTCMonth() === month - 1 && calendar.getUTCDate() === day
  return validDate && hour <= 23 && minute <= 59 && second <= 59 && zoneHour <= 23 && zoneMinute <= 59 && Number.isFinite(Date.parse(value))
}

function validate(node: Node, value: unknown, path: string, issues: CodecIssue[], context?: CodecRegistryContext): void {
  if (node.kind === 'nullable') { if (value !== null) validate(node.inner, value, path, issues, context); return }
  if (node.kind === 'union') {
    for (const variant of node.variants) { const local: CodecIssue[] = []; validate(variant, value, path, local, context); if (local.length === 0) return }
    issues.push({ path, code: 'invalid_value', message: 'Value does not match any registered union variant.' })
    return
  }
  if (node.kind === 'string') {
    if (typeof value !== 'string') { issues.push({ path, code: 'invalid_type', message: 'Expected string.' }); return }
    if (value.length < (node.min ?? 0) || value.length > node.max ||
      (node.format === 'sha256' && !/^[0-9a-f]{64}$/.test(value)) ||
      (node.format === 'date-time' && !isInstant(value))) {
      issues.push({ path, code: 'invalid_value', message: 'String is outside its canonical bounds or format.' })
    }
    if (node.registry) checkRegistry(node.registry, value, path, issues, context)
    return
  }
  if (node.kind === 'enum') {
    if (typeof value !== 'string' || !node.values.includes(value)) {
      issues.push({ path, code: 'invalid_value', message: 'Value is outside the closed canonical enum.' }); return
    }
    if (node.registry) checkRegistry(node.registry, value, path, issues, context)
    return
  }
  if (node.kind === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value) ||
      (node.integer && !Number.isInteger(value)) || (node.min !== undefined && value < node.min) ||
      (node.max !== undefined && value > node.max)) issues.push({ path, code: 'invalid_value', message: 'Number is outside its canonical bounds.' })
    return
  }
  if (node.kind === 'boolean') {
    if (typeof value !== 'boolean') issues.push({ path, code: 'invalid_type', message: 'Expected boolean.' })
    return
  }
  if (node.kind === 'array') {
    if (!Array.isArray(value)) { issues.push({ path, code: 'invalid_type', message: 'Expected array.' }); return }
    if (value.length < (node.min ?? 0) || value.length > node.max) issues.push({ path, code: 'invalid_value', message: 'Array length is outside its canonical bounds.' })
    for (let index = 0; index < value.length; index += 1) validate(node.items, Object.getOwnPropertyDescriptor(value, String(index))!.value, `${path}[${index}]`, issues, context)
    if (node.unique) for (let i = 0; i < value.length; i += 1) for (let j = i + 1; j < value.length; j += 1) if (value[i] === value[j]) issues.push({ path, code: 'invalid_value', message: 'Array entries must be unique.' })
    return
  }
  if (node.kind === 'map') {
    if (!record(value)) { issues.push({ path, code: 'invalid_type', message: 'Expected a plain JSON object.' }); return }
    const keys = Object.keys(value)
    if (keys.length > node.max) issues.push({ path, code: 'invalid_value', message: 'Map has too many entries.' })
    for (const key of keys) {
      if (node.keysRegistry) checkRegistry(node.keysRegistry, key, `${path}.${key}`, issues, context)
      validate(node.values, Object.getOwnPropertyDescriptor(value, key)!.value, `${path}.${key}`, issues, context)
    }
    return
  }
  if (!record(value)) { issues.push({ path, code: 'invalid_type', message: 'Expected a plain JSON object.' }); return }
  const expected = Object.keys(node.properties)
  for (const key of expected) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) issues.push({ path: `${path}.${key}`, code: 'missing_field', message: 'Required field is missing.' })
    else validate(node.properties[key], Object.getOwnPropertyDescriptor(value, key)!.value, `${path}.${key}`, issues, context)
  }
  for (const key of Object.keys(value)) if (!expected.includes(key)) issues.push({ path: `${path}.${key}`, code: 'extra_property', message: 'Unknown property is forbidden.' })
}

function checkRegistry(name: string, value: string, path: string, issues: CodecIssue[], context?: CodecRegistryContext): void {
  const entry = context?.schemaVersion === 'studio.normative-registry-context/1' ? context.registries[name] : undefined
  if (!entry || typeof entry.definitionVersion !== 'string' || !entry.definitionVersion ||
    !Array.isArray(entry.values) || !entry.values.includes(value)) {
    issues.push({ path, code: entry ? 'invalid_value' : 'context_unavailable', message: entry ? 'Value is not registered.' : 'A versioned registry context is required.' })
  }
}

/** Generated JSON Schema is a projection of the same descriptor used by validators. */
export function toJsonSchema(node: Node): Record<string, unknown> {
  if (node.kind === 'nullable') return { anyOf: [toJsonSchema(node.inner), { type: 'null' }] }
  if (node.kind === 'union') return { oneOf: node.variants.map(toJsonSchema) }
  if (node.kind === 'string') return { type: 'string', minLength: node.min ?? 0, maxLength: node.max,
    ...(node.format === 'date-time' ? { format: 'date-time' } : {}),
    ...(node.format === 'sha256' ? { pattern: '^[0-9a-f]{64}$' } : {}),
    ...(node.registry ? { 'x-registry': node.registry } : {}) }
  if (node.kind === 'enum') return { type: 'string', enum: node.values, ...(node.registry ? { 'x-registry': node.registry } : {}) }
  if (node.kind === 'number') return { type: node.integer ? 'integer' : 'number', ...(node.min !== undefined ? { minimum: node.min } : {}), ...(node.max !== undefined ? { maximum: node.max } : {}) }
  if (node.kind === 'boolean') return { type: 'boolean' }
  if (node.kind === 'array') return { type: 'array', items: toJsonSchema(node.items), minItems: node.min ?? 0, maxItems: node.max, ...(node.unique ? { uniqueItems: true } : {}) }
  if (node.kind === 'map') return { type: 'object', maxProperties: node.max, additionalProperties: toJsonSchema(node.values), ...(node.keysRegistry ? { propertyNames: { 'x-registry': node.keysRegistry } } : {}) }
  const properties = Object.fromEntries(Object.entries(node.properties).map(([key, child]) => [key, toJsonSchema(child)]))
  return { type: 'object', properties, required: Object.keys(node.properties), additionalProperties: false }
}

export function validateNode(node: Node, input: unknown, context?: CodecRegistryContext): CodecResult {
  if (!strictJson(input, new WeakSet())) return { ok: false, issues: [{ path: '$', code: 'invalid_type', message: 'Input must be plain, finite, accessor-free JSON data.' }] }
  if (context !== undefined && !strictJson(context, new WeakSet())) return { ok: false, issues: [{ path: '$context', code: 'invalid_type', message: 'Registry context must be plain JSON data.' }] }
  const issues: CodecIssue[] = []
  validate(node, input, '$', issues, context)
  return issues.length ? { ok: false, issues } : { ok: true, issues: [] }
}

export function schemaType(node: Node): JsonSchemaType {
  switch (node.kind) {
    case 'string': case 'enum': return 'string'
    case 'number': return node.integer ? 'integer' : 'number'
    case 'boolean': return 'boolean'
    case 'array': return 'array'
    case 'object': case 'map': return 'object'
    case 'nullable': return schemaType(node.inner)
    case 'union': return schemaType(node.variants[0])
  }
}
