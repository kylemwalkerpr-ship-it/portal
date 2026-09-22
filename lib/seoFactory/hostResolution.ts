/**
 * lib/seoFactory/hostResolution.ts
 *
 * P9 outbound-fetch safety — resolve a hostname and refuse to touch anything
 * that is not a public internet address.
 *
 * The external-backlink verifier fetches a THIRD-PARTY page chosen by an
 * operator-owned prospect record. A URL string that looks fine is not proof
 * that the connection goes where the string says: `links.example` can resolve
 * to `10.0.0.5`, `169.254.169.254` (cloud metadata) or `::1`, and the runtime
 * would happily connect. Literal-address checks alone therefore cannot close
 * the hole — every hostname must be resolved and every returned address must
 * be public before a single byte is requested.
 *
 * Contract:
 *   · a hostname that resolves to ANY loopback/private/link-local/reserved/
 *     multicast/unspecified address is refused (fail closed, not fail open);
 *   · a lookup that fails, or that returns nothing usable, is refused (an
 *     unverifiable destination is not a safe destination);
 *   · an address we cannot parse is refused — unknown is not public.
 *
 * `isPrivateOrReservedAddress` is exportable on its own so every claim about
 * address classes is directly testable without network access.
 */

import { resolve4 as nodeResolve4, resolve6 as nodeResolve6 } from 'node:dns/promises'

export interface HostResolution {
  ok: boolean
  /** Every address the hostname resolved to (empty when the lookup failed). */
  addresses: string[]
  reason?: string
}

/** Async hostname → addresses resolver. Injectable for deterministic tests. */
export type HostAddressResolver = (host: string) => Promise<HostResolution>

function normalizeAddress(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    // IPv6 zone index (`fe80::1%eth0`) is not part of the address.
    .split('%')[0]
}

/** Strict dotted-quad IPv4 parse (no octal/hex legacy forms). */
export function parseIpv4(value: string): number[] | null {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(normalizeAddress(value))
  if (!match) return null
  const octets = match.slice(1, 5).map((part) => Number(part))
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return null
  return octets
}

/**
 * IPv6 parse to 16 bytes. Handles `::` compression, upper/lower case and the
 * trailing dotted-quad forms (`::ffff:10.0.0.1`). Returns null when the value
 * is not a valid IPv6 address.
 */
export function parseIpv6(value: string): number[] | null {
  let input = normalizeAddress(value)
  if (!input || !input.includes(':') || input.includes(':::')) return null

  // Fold a trailing dotted quad into the two hex groups it represents.
  const lastColon = input.lastIndexOf(':')
  const tail = input.slice(lastColon + 1)
  if (tail.includes('.')) {
    const v4 = parseIpv4(tail)
    if (!v4) return null
    input = `${input.slice(0, lastColon + 1)}${((v4[0] << 8) | v4[1]).toString(16)}:${((v4[2] << 8) | v4[3]).toString(16)}`
  }

  const halves = input.split('::')
  if (halves.length > 2) return null
  const left = halves[0] ? halves[0].split(':') : []
  const right = halves.length === 2 ? (halves[1] ? halves[1].split(':') : []) : []
  let expanded: string[]
  if (halves.length === 2) {
    const missing = 8 - left.length - right.length
    if (missing < 0) return null
    expanded = [...left, ...Array<string>(missing).fill('0'), ...right]
  } else {
    expanded = left
  }
  if (expanded.length !== 8) return null

  const bytes: number[] = []
  for (const group of expanded) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) return null
    const parsed = parseInt(group, 16)
    bytes.push((parsed >> 8) & 0xff, parsed & 0xff)
  }
  return bytes
}

/** True when the host is an IPv4 or IPv6 literal (not a DNS name). */
export function isIpLiteral(host: string): boolean {
  return Boolean(parseIpv4(host) || parseIpv6(host))
}

function isPrivateIpv4(octets: number[]): boolean {
  const [a, b, c] = octets
  if (a === 0) return true                              // 0.0.0.0/8 "this network"
  if (a === 10) return true                             // RFC1918
  if (a === 127) return true                            // loopback
  if (a === 100 && b >= 64 && b <= 127) return true     // CGNAT 100.64/10
  if (a === 169 && b === 254) return true               // link-local
  if (a === 172 && b >= 16 && b <= 31) return true      // RFC1918
  if (a === 192 && b === 0) return true                 // 192.0.0.0/16 IETF assignments + TEST-NET-1
  if (a === 192 && b === 88 && c === 99) return true    // 6to4 relay anycast
  if (a === 192 && b === 168) return true               // RFC1918
  if (a === 198 && (b === 18 || b === 19)) return true  // benchmarking 198.18/15
  if (a === 198 && b === 51 && c === 100) return true   // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true    // TEST-NET-3
  if (a >= 224) return true                             // multicast + reserved + broadcast
  return false
}

function isPrivateIpv6(bytes: number[]): boolean {
  const [b0, b1, b2, b3] = bytes
  if (bytes.every((byte) => byte === 0)) return true                       // ::
  if (bytes.slice(0, 15).every((byte) => byte === 0) && bytes[15] === 1) return true // ::1
  // IPv4-mapped (::ffff:a.b.c.d) — classify the embedded IPv4.
  if (bytes.slice(0, 10).every((byte) => byte === 0) && bytes[10] === 0xff && bytes[11] === 0xff) {
    return isPrivateIpv4(bytes.slice(12))
  }
  // IPv4-compatible (deprecated ::a.b.c.d) and NAT64 64:ff9b::/96.
  if (bytes.slice(0, 12).every((byte) => byte === 0)) return isPrivateIpv4(bytes.slice(12))
  if (b0 === 0x00 && b1 === 0x64 && b2 === 0xff && b3 === 0x9b) return isPrivateIpv4(bytes.slice(12))
  // 6to4 2002::/16 carries the IPv4 address in bytes 2..5.
  if (b0 === 0x20 && b1 === 0x02) return isPrivateIpv4(bytes.slice(2, 6))
  if (b0 === 0x20 && b1 === 0x01) {
    if (b2 === 0x00 && b3 === 0x00) return true   // Teredo 2001:0::/32
    if (b2 === 0x00 && b3 === 0x02) return true   // 2001:2::/48 benchmarking
    if (b2 === 0x00 && b3 === 0x10) return true   // ORCHID 2001:10::/28
    if (b2 === 0x0d && b3 === 0xb8) return true   // documentation 2001:db8::/32
  }
  if ((b0 & 0xfe) === 0xfc) return true           // unique local fc00::/7
  if (b0 === 0xfe && (b1 & 0xc0) === 0x80) return true // link-local fe80::/10
  if (b0 === 0xfe && (b1 & 0xc0) === 0xc0) return true // deprecated site-local fec0::/10
  if (b0 === 0xff) return true                    // multicast ff00::/8
  if (b0 === 0x01 && b1 === 0x00 && b2 === 0x00 && b3 === 0x00) return true // 100::/64 discard-only
  if (b0 === 0x00) return true                    // 0000::/8 reserved
  return false
}

/**
 * True when the address is loopback, private, link-local, CGNAT, multicast,
 * reserved, unspecified, or simply unparseable. Unknown ⇒ refused.
 */
export function isPrivateOrReservedAddress(address: string): boolean {
  const value = normalizeAddress(address)
  if (!value) return true
  const v4 = parseIpv4(value)
  if (v4) return isPrivateIpv4(v4)
  const v6 = parseIpv6(value)
  if (v6) return isPrivateIpv6(v6)
  return true
}

export type DnsFamilyResolver = (host: string) => Promise<string[]>

export interface HostResolutionDeps {
  resolve4?: DnsFamilyResolver
  resolve6?: DnsFamilyResolver
}

const NO_RECORD_CODES = new Set(['ENODATA', 'ENOTFOUND', 'ENOENT'])

async function resolveFamily(
  family: 'A' | 'AAAA',
  host: string,
  resolver: DnsFamilyResolver,
): Promise<{ addresses: string[]; hardError: string | null }> {
  try {
    const answers = await resolver(host)
    return {
      addresses: [...new Set((answers || []).map((answer) => normalizeAddress(String(answer || ''))).filter(Boolean))],
      hardError: null,
    }
  } catch (error) {
    const code = String((error as { code?: unknown } | null)?.code || '').toUpperCase()
    if (NO_RECORD_CODES.has(code)) return { addresses: [], hardError: null }
    const detail = error instanceof Error ? error.message.slice(0, 200) : 'DNS resolution failed'
    return { addresses: [], hardError: `${family} lookup failed: ${detail}` }
  }
}

/**
 * Resolve a hostname (or accept an IP literal) and refuse anything that is not
 * a public address. Workers supports the family-specific resolve4/resolve6
 * APIs under nodejs_compat; lookup()/generic resolve() are intentionally not
 * used. One missing family is normal, but a hard resolver error, an empty
 * combined answer set, or ANY private/reserved answer fails closed.
 */
export async function resolveHostAddresses(
  host: string,
  deps: HostResolutionDeps = {},
): Promise<HostResolution> {
  const name = String(host || '')
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
  if (!name) return { ok: false, addresses: [], reason: 'the host could not be resolved (empty hostname)' }

  if (isIpLiteral(name)) {
    if (isPrivateOrReservedAddress(name)) {
      return { ok: false, addresses: [name], reason: `${name} is a private/reserved address` }
    }
    return { ok: true, addresses: [name] }
  }

  const resolve4 = deps.resolve4 || nodeResolve4
  const resolve6 = deps.resolve6 || nodeResolve6
  const [a, aaaa] = await Promise.all([
    resolveFamily('A', name, resolve4),
    resolveFamily('AAAA', name, resolve6),
  ])

  const hardErrors = [a.hardError, aaaa.hardError].filter((value): value is string => Boolean(value))
  if (hardErrors.length) {
    return {
      ok: false,
      addresses: [...a.addresses, ...aaaa.addresses],
      reason: `"${name}" could not be safely resolved (${hardErrors.join('; ')})`,
    }
  }

  const addresses = [...new Set([...a.addresses, ...aaaa.addresses])]
  if (!addresses.length) {
    return { ok: false, addresses: [], reason: `"${name}" did not resolve to any public address` }
  }
  const offending = addresses.filter((address) => isPrivateOrReservedAddress(address))
  if (offending.length) {
    return {
      ok: false,
      addresses,
      reason: `"${name}" resolves to a private/reserved address (${offending.join(', ')})`,
    }
  }
  return { ok: true, addresses }
}
