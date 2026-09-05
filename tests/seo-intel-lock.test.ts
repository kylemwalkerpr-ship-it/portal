/**
 * P1-E1 — SEO Intel lock must reset when topic/region/keyword changes.
 */
import {
  buildSeoIntelLockSeed,
  isSeoIntelLockStale,
  isSeoIntelLocked,
  normalizeSeoIntelSeedPart,
  type SeoIntelBriefLock,
} from "@/lib/seoFactory/seoIntelLock"

describe("seoIntelLock (P1-E1)", () => {
  it("normalizes whitespace and case in seed parts", () => {
    expect(normalizeSeoIntelSeedPart("  US F-1 Visa  ")).toBe("us f-1 visa")
  })

  it("builds seed from region + primaryKeyword (topic/title fallback)", () => {
    expect(
      buildSeoIntelLockSeed({
        region: "US",
        primaryKeyword: "F-1 visa guide",
        topic: "ignored when keyword present",
        title: "also ignored",
      }),
    ).toBe("us::f-1 visa guide")

    expect(
      buildSeoIntelLockSeed({
        region: "CA",
        topic: "Canada PGWP guide",
      }),
    ).toBe("ca::canada pgwp guide")

    expect(
      buildSeoIntelLockSeed({
        region: "AU",
        title: "Australia student visa fees",
      }),
    ).toBe("au::australia student visa fees")
  })

  it("treats lock as stale when topic/region/keyword seed changes", () => {
    const locked = buildSeoIntelLockSeed({
      region: "US",
      primaryKeyword: "US F-1 visa guide",
    })
    expect(isSeoIntelLockStale(locked, locked)).toBe(false)
    expect(
      isSeoIntelLockStale(
        locked,
        buildSeoIntelLockSeed({ region: "CA", primaryKeyword: "Canada PGWP guide" }),
      ),
    ).toBe(true)
    expect(
      isSeoIntelLockStale(
        locked,
        buildSeoIntelLockSeed({ region: "US", primaryKeyword: "H-1B visa guide" }),
      ),
    ).toBe(true)
    expect(
      isSeoIntelLockStale(
        locked,
        buildSeoIntelLockSeed({ region: "UK", primaryKeyword: "US F-1 visa guide" }),
      ),
    ).toBe(true)
  })

  it("isSeoIntelLocked requires contract + matching seed", () => {
    const seed = buildSeoIntelLockSeed({ region: "US", primaryKeyword: "US F-1 visa guide" })
    const lock: SeoIntelBriefLock = {
      brief: { targetCluster: ["f-1"] },
      writerContract: "WRITE FOR: US F-1 visa guide",
      lockSeed: seed,
    }
    expect(isSeoIntelLocked(lock, seed)).toBe(true)
    expect(
      isSeoIntelLocked(
        lock,
        buildSeoIntelLockSeed({ region: "CA", primaryKeyword: "Canada PGWP guide" }),
      ),
    ).toBe(false)
    expect(isSeoIntelLocked({ ...lock, writerContract: "   " }, seed)).toBe(false)
    expect(isSeoIntelLocked(null, seed)).toBe(false)
  })

  it("empty locked seed is not stale (nothing to invalidate)", () => {
    expect(isSeoIntelLockStale("", "us::x")).toBe(false)
    expect(isSeoIntelLockStale(null, "us::x")).toBe(false)
  })
})
