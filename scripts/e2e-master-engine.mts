/**
 * Live Master Engine e2e — loads .env.local, runs the planner on real GSC
 * (or snapshot fallback) without drafting AI briefs, prints unique cluster
 * opportunities. Never prints secrets.
 *
 *   npx tsx scripts/e2e-master-engine.mts
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { isJunkQuery } from '../lib/seoFactory/queryNoise'

function findClosingQuote(s: string, q: string): number {
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\') {
      i += 1
      continue
    }
    if (s[i] === q) return i
  }
  return -1
}

function loadEnvLocal() {
  const p = resolve(process.cwd(), '.env.local')
  if (!existsSync(p)) return
  const lines = readFileSync(p, 'utf8').split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i]
    if (!rawLine.trim() || rawLine.trim().startsWith('#')) continue
    const eq = rawLine.indexOf('=')
    if (eq < 0) continue
    const k = rawLine.slice(0, eq).trim()
    if (!k) continue
    let v = rawLine.slice(eq + 1)
    const trimmed = v.trimStart()
    const q = trimmed[0]
    if (q === '"' || q === "'") {
      v = trimmed.slice(1)
      while (findClosingQuote(v, q) < 0 && i + 1 < lines.length) {
        i += 1
        v += '\n' + lines[i]
      }
      const end = findClosingQuote(v, q)
      if (end >= 0) v = v.slice(0, end)
    } else {
      v = v.trim()
    }
    if (!process.env[k]) process.env[k] = v
  }
}

loadEnvLocal()

async function main() {
  const { runPlanner } = await import('../lib/seoEngine/planner')
  const { scoreMaster } = await import('../lib/seoFactory/masterEngine')

  const a = scoreMaster({
    topic: 'uk graduate visa requirements',
    primaryKeyword: 'uk graduate visa',
    contentType: 'legal_guide',
    region: 'UK',
    content: '# UK Graduate Visa\n\n## In 60 seconds\nStay 2 years.\n\nThis is educational and not legal advice.\n',
    indexable: true,
  })
  const b = scoreMaster({
    topic: 'f-1 visa',
    primaryKeyword: 'f-1 visa',
    contentType: 'legal_guide',
    region: 'US',
    content: '# F-1\nGuaranteed approval. Delve into complexities.',
    indexable: true,
  })
  const codesA = a.recommendations.filter((r) => r.open).map((r) => r.code)
  const codesB = b.recommendations.filter((r) => r.open).map((r) => r.code)
  if (!codesA.length || !codesB.length) throw new Error('scoreMaster produced no opportunities')
  if (codesA.join('|') === codesB.join('|')) throw new Error('scoreMaster produced identical opportunity sets')

  const { plans } = await runPlanner({ draftBriefs: false, limit: 8 })
  if (!plans.length) {
    throw new Error('planner returned 0 plans — engine produced no demand-mapped missions')
  }
  const ids = plans.map((p) => p.clusterId)
  if (new Set(ids).size !== ids.length) throw new Error(`duplicate cluster ids: ${ids.join(', ')}`)
  const junk = plans.filter((p) => isJunkQuery(p.primaryTerm))
  if (junk.length) throw new Error(`planner leaked junk terms: ${junk.map((p) => p.primaryTerm).join(', ')}`)
  for (const p of plans) {
    const t = p.primaryTerm.toLowerCase()
    if (/\b(uk|ukvi|appendix fm|ilr)\b/.test(t) && p.country !== 'UK') {
      throw new Error(`country inversion: "${p.primaryTerm}" mapped to ${p.country} ${p.stage}`)
    }
    if (/\b(canada|canadian|ircc|express entry)\b/.test(t) && p.country !== 'CA') {
      throw new Error(`country inversion: "${p.primaryTerm}" mapped to ${p.country} ${p.stage}`)
    }
    if (/\b(australia|australian|ministerial direction|subclass)\b/.test(t) && p.country !== 'AU') {
      throw new Error(`country inversion: "${p.primaryTerm}" mapped to ${p.country} ${p.stage}`)
    }
    if (/\b(f-?1|h-?1b|green card|uscis|asu|arizona state)\b/.test(t) && p.country !== 'US') {
      throw new Error(`country inversion: "${p.primaryTerm}" mapped to ${p.country} ${p.stage}`)
    }
    if (/\b485\b/.test(t) && !/\bi-?485\b/.test(t) && p.country !== 'AU') {
      throw new Error(`country inversion: "${p.primaryTerm}" mapped to ${p.country} ${p.stage}`)
    }
  }

  // Same demand must produce the same cluster identities (order may shift
  // slightly when knowledge bias is re-pulled). A different mix must not.
  const { plans: replay } = await runPlanner({
    signals: plans.map((p) => ({
      term: p.primaryTerm,
      impressions: p.estMonthlyImpressions,
      position: p.position ?? 50,
      clicks: p.estMonthlyClicks,
    })),
    draftBriefs: false,
    limit: 8,
  })
  const replayIds = replay.map((p) => p.clusterId)
  if (new Set(replayIds).size !== replayIds.length) {
    throw new Error(`replay produced duplicate cluster ids: ${replayIds.join(', ')}`)
  }
  const missing = ids.filter((id) => !replayIds.includes(id))
  if (missing.length) {
    throw new Error(`replay dropped cluster ids: ${missing.join(', ')}`)
  }

  const altMix = [
    { term: 'canada spousal sponsorship 2026', impressions: 4100, position: 11, clicks: 55 },
    { term: 'australia student visa subclass 500', impressions: 3600, position: 9, clicks: 70 },
    { term: 'skilled worker visa requirements', impressions: 2800, position: 15, clicks: 22 },
  ]
  const { plans: alt } = await runPlanner({ signals: altMix, knowledge: [], draftBriefs: false, limit: 5 })
  if (!alt.length) throw new Error('alternate demand mix produced no plans')
  if (alt.some((p) => ids.includes(p.clusterId))) {
    throw new Error('alternate demand mix reused the first run\'s cluster ids — canned list, not engine output')
  }

  console.log(JSON.stringify({
    scoreMaster: { a: codesA.slice(0, 6), b: codesB.slice(0, 6) },
    runA: plans.map((p) => ({
      clusterId: p.clusterId,
      term: p.primaryTerm,
      country: p.country,
      stage: p.stage,
      opportunityScore: p.opportunityScore,
      impressions: p.estMonthlyImpressions,
      position: p.position,
    })),
    runB_altDemand: alt.map((p) => ({
      clusterId: p.clusterId,
      term: p.primaryTerm,
      country: p.country,
      stage: p.stage,
      opportunityScore: p.opportunityScore,
    })),
  }, null, 2))
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
