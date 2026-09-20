/**
 * P3 registry hygiene — read-only, offline guards over the shipped ownership
 * registry. No registry row is mutated; the exported predicate
 * `isAuthoritativeOwnershipRow` is the only policy oracle.
 *
 * Covers:
 *   1. data/ and public/ registry copies are byte-identical
 *   2. every row status is inside the closed P3 vocabulary
 *   3. every synthetic unresolved status fails authority after final ratification
 *   4. every supply_first row fails authority even when status is confirmed
 *   5. confirmed generic section/index roots fail; confirmed specific rows pass
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  AUTHORITATIVE_OWNERSHIP_ACTIONS,
  AUTHORITATIVE_OWNERSHIP_STATUS,
  isAuthoritativeOwnershipRow,
  isSectionRootCanonical,
  type OwnershipRow,
} from '@/lib/seoFactory/ownership'

const DATA_PATH = join(process.cwd(), 'data/seo/ownership-registry.json')
const PUBLIC_PATH = join(process.cwd(), 'public/seo-data/ownership-registry.json')

/** Closed P3 status vocabulary — the only values the registry may use. */
const CLOSED_STATUSES: ReadonlySet<string> = new Set([
  'confirmed',
  'proposed',
  'needs_decision',
  'blocked_on_supply',
])

function registryRows(path = DATA_PATH): OwnershipRow[] {
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as { rows?: OwnershipRow[] }
  return parsed.rows ?? []
}

/** Ids of rows that unexpectedly passed the authority predicate. */
function unauthorized(rows: OwnershipRow[]): number[] {
  return rows.filter(isAuthoritativeOwnershipRow).map((row) => row.id)
}

describe('P3 ownership registry hygiene', () => {
  it('1. ships the data/ and public/ registry copies byte-identical', () => {
    const data = readFileSync(DATA_PATH)
    const published = readFileSync(PUBLIC_PATH)
    expect(Buffer.compare(data, published)).toBe(0)
    expect(registryRows().length).toBeGreaterThan(0)
    expect(registryRows(PUBLIC_PATH).length).toBe(registryRows().length)
  })

  it('2. keeps every row status inside the closed P3 vocabulary', () => {
    const rows = registryRows()
    expect(rows.length).toBeGreaterThan(0)
    const outside = rows
      .filter((row) => !CLOSED_STATUSES.has(String(row.status)))
      .map((row) => ({ id: row.id, status: row.status }))
    expect(outside).toEqual([])
    // P3 final ratification: every strategic row is mapped/confirmed.
    expect(rows.every((row) => String(row.status) === AUTHORITATIVE_OWNERSHIP_STATUS)).toBe(true)
  })

  it('3. fails every unresolved status closed even after all real rows are ratified', () => {
    const base = registryRows().find(
      (row) =>
        String(row.status) === AUTHORITATIVE_OWNERSHIP_STATUS &&
        AUTHORITATIVE_OWNERSHIP_ACTIONS.has(String(row.action)) &&
        !isSectionRootCanonical(row.owner_url),
    )
    expect(base).toBeDefined()
    const unresolvedStatuses = ['proposed', 'needs_decision', 'blocked_on_supply', '', 'unknown']
    expect(
      unauthorized(unresolvedStatuses.map((status) => ({ ...base!, status }))),
    ).toEqual([])
  })

  it('4. fails every supply_first row even when status is confirmed', () => {
    const rows = registryRows()
    const supplyFirst = rows.filter((row) => String(row.action) === 'supply_first')
    expect(supplyFirst.length).toBeGreaterThan(0)
    expect(unauthorized(supplyFirst)).toEqual([])
    expect(
      unauthorized(
        supplyFirst.map((row) => ({ ...row, status: AUTHORITATIVE_OWNERSHIP_STATUS })),
      ),
    ).toEqual([])
    // The action gate is independent of status for every non-authoritative action.
    const gatedActions = rows.filter(
      (row) => !AUTHORITATIVE_OWNERSHIP_ACTIONS.has(String(row.action)),
    )
    expect(gatedActions.length).toBeGreaterThan(0)
    expect(
      unauthorized(gatedActions.map((row) => ({ ...row, status: AUTHORITATIVE_OWNERSHIP_STATUS }))),
    ).toEqual([])
  })

  it('5. fails confirmed generic section/index roots and passes confirmed specific owners', () => {
    const confirmed = registryRows().filter(
      (row) => String(row.status) === AUTHORITATIVE_OWNERSHIP_STATUS,
    )
    const roots = confirmed.filter((row) => isSectionRootCanonical(row.owner_url))
    expect(roots.length).toBeGreaterThan(0)
    expect(unauthorized(roots)).toEqual([])
    expect(isSectionRootCanonical('https://usa.yousafeconsultancy.com/universities/')).toBe(true)
    expect(isSectionRootCanonical('https://uk.yousafeconsultancy.com/from/')).toBe(true)
    expect(isSectionRootCanonical('https://usa.yousafeconsultancy.com/universities/mit/')).toBe(false)
    expect(isSectionRootCanonical('https://uk.yousafeconsultancy.com/from/sri-lanka/')).toBe(false)

    const specific = confirmed.filter(
      (row) =>
        !isSectionRootCanonical(row.owner_url) &&
        AUTHORITATIVE_OWNERSHIP_ACTIONS.has(String(row.action)),
    )
    expect(specific.length).toBeGreaterThan(0)
    const authorityChecks = specific.map((row) => ({
      id: row.id,
      authoritative: isAuthoritativeOwnershipRow(row),
    }))
    expect(authorityChecks.filter((check) => !check.authoritative).map((check) => check.id)).toEqual([])
  })
})
