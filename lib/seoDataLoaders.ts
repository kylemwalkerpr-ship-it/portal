/**
 * Load SEO factory + strategies corpus from static assets (public/seo-data/*).
 *
 * Never statically import large strategy markdown into the Worker bundle —
 * always fetch via ASSETS / public URL / local filesystem.
 */

export type GscSnapshot = {
  generatedAt?: string
  source?: string
  totals?: Record<string, number>
  topQueries: Array<{
    term: string
    clicks: number
    impressions: number
    ctr: number
    position: number
  }>
  topPages: Array<{
    url: string
    clicks: number
    impressions: number
    ctr: number
    position: number
  }>
  opportunities?: {
    highImpressionLowCtr?: GscSnapshot['topQueries']
    highImpressionDeepRank?: GscSnapshot['topQueries']
  }
}

export type OwnershipRegistryFile = {
  version?: string
  updatedAt?: string
  source?: string
  rows: Array<{
    id: number
    primary_keyword: string
    intent_class: string
    owner_host: string
    owner_url: string
    supporting_urls: string[]
    action: string
    market_destination: string | null
    status: string
    notes: string
  }>
}

export type StrategiesIndex = {
  updatedAt?: string
  sourceDir?: string
  ownershipRows?: number
  universityRows?: number
  documents?: Array<{
    id: string
    title: string
    path: string
    bytes: number
    sectionCount?: number
    category?: string
  }>
  packs?: Array<{ id: string; path: string }>
}

export type KeywordDemandFile = {
  version?: string
  updatedAt?: string
  source?: string
  sourceFile?: string
  rowCount?: number
  rows: Array<{
    term: string
    volume: number
    competition: string
    competitionIndex: number
    bidLow: number | null
    bidHigh: number | null
  }>
}

export type StrategyPromptPack = {
  updatedAt?: string
  standingRules?: string[]
  houseStyle?: {
    voice?: string
    bannedWords?: string[]
    rules?: string[]
    structure?: string[]
  }
  hostRepo?: Record<string, string>
  deepStrategyHighlights?: Array<{ title: string; body: string }>
  gscExpansionHighlights?: Array<{ title: string; body: string }>
  masterPlanHighlights?: Array<{ title: string; body: string }>
}

const EMPTY_SNAPSHOT: GscSnapshot = {
  topQueries: [],
  topPages: [],
  opportunities: { highImpressionLowCtr: [], highImpressionDeepRank: [] },
}

let snapshotCache: GscSnapshot | null = null
let snapshotCachedAt = 0
let registryCache: OwnershipRegistryFile | null = null
let strategiesIndexCache: StrategiesIndex | null = null
let promptPackCache: StrategyPromptPack | null = null
let keywordDemandCache: KeywordDemandFile | null = null
let snapshotInflight: Promise<GscSnapshot> | null = null
let registryInflight: Promise<OwnershipRegistryFile> | null = null
let strategiesInflight: Promise<StrategiesIndex> | null = null
let promptPackInflight: Promise<StrategyPromptPack> | null = null
let keywordDemandInflight: Promise<KeywordDemandFile> | null = null

/** How long a loaded snapshot stays cached before re-reading the file. */
const SNAPSHOT_CACHE_TTL_MS = 6 * 60 * 60 * 1000

/**
 * Age of a GSC snapshot in whole days. `-1` when the snapshot carries no
 * `generatedAt` (ancient/unknown provenance).
 */
export function snapshotAgeDays(snap: Pick<GscSnapshot, 'generatedAt'> | null | undefined): number {
  if (!snap?.generatedAt) return -1
  const t = new Date(snap.generatedAt).getTime()
  if (!Number.isFinite(t)) return -1
  return Math.floor((Date.now() - t) / 86_400_000)
}

/** Is the snapshot too old to be trusted as live demand? */
export function isSnapshotStale(snap: GscSnapshot | null | undefined, maxAgeDays = 14): boolean {
  const age = snapshotAgeDays(snap)
  return age < 0 || age > maxAgeDays
}

function siteOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_PORTAL_URL ||
    process.env.PORTAL_PUBLIC_URL ||
    'https://portal.yousafeconsultancy.com'
  ).replace(/\/$/, '')
}

async function fetchJson<T>(path: string): Promise<T | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = globalThis as any
    const env = g[Symbol.for('__cloudflare-context__')]?.env || g.__env__
    const assets = env?.ASSETS
    if (assets?.fetch) {
      const res = await assets.fetch(new Request(`https://assets.local${path}`))
      if (res.ok) return (await res.json()) as T
    }
  } catch {
    /* fall through */
  }

  // Local filesystem FIRST for non-Worker runtimes (dev + tests): the committed
  // public/seo-data/* assets are the source of truth, and tests must be hermetic
  // (they must not silently hit the production Worker URL and assert against
  // stale deployed data).
  try {
    const { readFile } = await import('node:fs/promises')
    const { join } = await import('node:path')
    const filePath = join(process.cwd(), 'public', path.replace(/^\//, ''))
    const text = await readFile(filePath, 'utf8')
    return JSON.parse(text) as T
  } catch {
    /* fall through */
  }

  try {
    const res = await fetch(`${siteOrigin()}${path}`, {
      headers: { Accept: 'application/json' },
    })
    if (res.ok) return (await res.json()) as T
  } catch {
    return null
  }
  return null
}

async function fetchText(path: string): Promise<string | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = globalThis as any
    const env = g[Symbol.for('__cloudflare-context__')]?.env || g.__env__
    const assets = env?.ASSETS
    if (assets?.fetch) {
      const res = await assets.fetch(new Request(`https://assets.local${path}`))
      if (res.ok) return await res.text()
    }
  } catch {
    /* fall through */
  }
  try {
    const { readFile } = await import('node:fs/promises')
    const { join } = await import('node:path')
    return await readFile(join(process.cwd(), 'public', path.replace(/^\//, '')), 'utf8')
  } catch {
    /* fall through */
  }
  try {
    const res = await fetch(`${siteOrigin()}${path}`)
    if (res.ok) return await res.text()
  } catch {
    return null
  }
  return null
}

/**
 * Load the GSC snapshot. `maxAgeDays` defaults to Infinity (compatibility:
 * existing callers keep serving it), but decision-making callers (planner,
 * auto-run, brief factory) are expected to pass a guard so stale demand is
 * never silently presented as live.
 */
export async function loadGscSnapshot(opts?: {
  maxAgeDays?: number
  allowStale?: boolean
}): Promise<GscSnapshot> {
  const allowStale = opts?.allowStale !== false
  const maxAgeDays = opts?.maxAgeDays ?? Infinity
  const freshEnough = (s: GscSnapshot | null): s is GscSnapshot =>
    !!s && (allowStale || !isSnapshotStale(s, maxAgeDays))
  if (snapshotCache && Date.now() - snapshotCachedAt < SNAPSHOT_CACHE_TTL_MS) {
    return freshEnough(snapshotCache) ? snapshotCache : EMPTY_SNAPSHOT
  }
  if (!snapshotInflight) {
    snapshotInflight = (async () => {
      const data = await fetchJson<GscSnapshot>('/seo-data/snapshot.json')
      if (data) {
        snapshotCache = data
        snapshotCachedAt = Date.now()
      } else {
        // A missing read must not poison the isolate forever: cache empties
        // briefly (bounded by TTL) so a later request can still load the file.
        setTimeout(() => {
          snapshotCache = null
          snapshotCachedAt = 0
          snapshotInflight = null
        }, 60_000).unref?.()
      }
      return snapshotCache ?? EMPTY_SNAPSHOT
    })()
  }
  const snap = await snapshotInflight
  return freshEnough(snap) ? snap : EMPTY_SNAPSHOT
}

const EMPTY_KEYWORD_DEMAND: KeywordDemandFile = { rows: [] }

export async function loadKeywordDemandFile(): Promise<KeywordDemandFile> {
  if (keywordDemandCache) return keywordDemandCache
  if (!keywordDemandInflight) {
    keywordDemandInflight = (async () => {
      const data = await fetchJson<KeywordDemandFile>('/seo-data/keyword-demand.json')
      keywordDemandCache = data && Array.isArray(data.rows) ? data : EMPTY_KEYWORD_DEMAND
      return keywordDemandCache
    })()
  }
  return keywordDemandInflight
}

export async function loadOwnershipRegistry(): Promise<OwnershipRegistryFile> {
  if (registryCache) return registryCache
  if (!registryInflight) {
    registryInflight = (async () => {
      const data = await fetchJson<OwnershipRegistryFile>('/seo-data/ownership-registry.json')
      registryCache = data ?? { rows: [] }
      return registryCache
    })()
  }
  return registryInflight
}

export async function loadStrategiesIndex(): Promise<StrategiesIndex> {
  if (strategiesIndexCache) return strategiesIndexCache
  if (!strategiesInflight) {
    strategiesInflight = (async () => {
      const data = await fetchJson<StrategiesIndex>('/seo-data/strategies/index.json')
      strategiesIndexCache = data ?? { documents: [], packs: [] }
      return strategiesIndexCache
    })()
  }
  return strategiesInflight
}

export async function loadStrategyPromptPack(): Promise<StrategyPromptPack> {
  if (promptPackCache) return promptPackCache
  if (!promptPackInflight) {
    promptPackInflight = (async () => {
      const data = await fetchJson<StrategyPromptPack>('/seo-data/strategies/prompt-pack.json')
      promptPackCache = data ?? {}
      return promptPackCache
    })()
  }
  return promptPackInflight
}

export async function loadStrategyDocument(relPath: string): Promise<string | null> {
  // only allow paths under /seo-data/strategies/
  const path = relPath.startsWith('/') ? relPath : `/${relPath}`
  if (!path.startsWith('/seo-data/strategies/')) return null
  if (path.includes('..')) return null
  return fetchText(path)
}

/**
 * Compact strategy block for LLM system prompts (token-budget aware).
 */
export async function formatStrategyForPrompt(opts?: {
  maxChars?: number
  topic?: string
}): Promise<string> {
  const maxChars = opts?.maxChars ?? 4500
  const pack = await loadStrategyPromptPack()
  const lines: string[] = [
    '## Estate SEO strategy (authoritative — do not violate)',
    '',
    '### Standing rules',
    ...(pack.standingRules || []).map((r) => `- ${r}`),
    '',
    '### House style',
    pack.houseStyle?.voice ? `- Voice: ${pack.houseStyle.voice}` : '',
    ...(pack.houseStyle?.rules || []).map((r) => `- ${r}`),
    pack.houseStyle?.bannedWords?.length
      ? `- Banned words: ${pack.houseStyle.bannedWords.join(', ')}`
      : '',
    '',
    '### Host → repo',
    ...Object.entries(pack.hostRepo || {}).map(([h, r]) => `- ${h} → ${r}`),
  ]

  const topic = (opts?.topic || '').toLowerCase()
  const pickHighlights = (
    label: string,
    sections?: Array<{ title: string; body: string }>,
    limit = 4,
  ) => {
    if (!sections?.length) return
    const ranked = [...sections].sort((a, b) => {
      const score = (s: { title: string; body: string }) => {
        let n = 0
        if (topic && (s.title + s.body).toLowerCase().includes(topic.slice(0, 24))) n += 5
        if (/ownership|ymyl|host|gsc|ctr|from |university|hub/i.test(s.title)) n += 2
        return n
      }
      return score(b) - score(a)
    })
    lines.push('', `### ${label}`)
    for (const s of ranked.slice(0, limit)) {
      lines.push(`#### ${s.title}`, s.body.slice(0, 600), '')
    }
  }

  pickHighlights('Deep strategy highlights', pack.deepStrategyHighlights, 4)
  pickHighlights('GSC expansion highlights', pack.gscExpansionHighlights, 3)
  pickHighlights('Master plan highlights', pack.masterPlanHighlights, 2)

  let text = lines.filter(Boolean).join('\n')
  if (text.length > maxChars) text = text.slice(0, maxChars) + '\n…'
  return text
}
