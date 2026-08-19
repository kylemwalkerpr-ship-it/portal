/**
 * Convert a Google Ads Keyword Planner CSV (caseworks export) into the
 * runtime market-demand asset the Master Engine ingests.
 *
 *   npx tsx scripts/import-keyword-demand-csv.mts ~/Downloads/keywords-….csv
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'

const outPath = resolve(process.cwd(), 'public/seo-data/keyword-demand.json')

function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"'
        i += 1
      } else inQ = !inQ
      continue
    }
    if (c === ',' && !inQ) {
      out.push(cur)
      cur = ''
      continue
    }
    cur += c
  }
  out.push(cur)
  return out
}

function num(v: string): number | null {
  const t = v.trim()
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

function main() {
  const src = process.argv[2]
  if (!src) {
    console.error('usage: npx tsx scripts/import-keyword-demand-csv.mts <ads-export.csv>')
    process.exit(1)
  }
  const abs = resolve(src)
  const lines = readFileSync(abs, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean)
  const headers = splitCsvLine(lines[0]).map((h) => h.trim())
  const idx = Object.fromEntries(headers.map((h, i) => [h, i]))
  const rows = []
  for (const line of lines.slice(1)) {
    const cols = splitCsvLine(line)
    const term = (cols[idx['Keyword Text'] ?? 0] || '').trim()
    if (!term) continue
    const volume = num(cols[idx['Search Volume'] ?? 3] || '') || 0
    const competitionIndex = num(cols[idx['Competition Index'] ?? 2] || '') || 0
    rows.push({
      term,
      volume: Math.round(volume),
      competition: (cols[idx.Competition ?? 1] || 'UNSPECIFIED').trim() || 'UNSPECIFIED',
      competitionIndex: Math.round(competitionIndex),
      bidLow: num(cols[idx['Low Top Page Bid'] ?? 4] || ''),
      bidHigh: num(cols[idx['High Top Page Bid'] ?? 5] || ''),
    })
  }
  const payload = {
    version: 'v1',
    updatedAt: new Date().toISOString(),
    source: 'caseworks-google-ads-keyword-planner',
    sourceFile: basename(abs),
    rowCount: rows.length,
    rows,
  }
  writeFileSync(outPath, `${JSON.stringify(payload)}\n`, 'utf8')
  console.log(`wrote ${rows.length} keywords → ${outPath}`)
}

main()
