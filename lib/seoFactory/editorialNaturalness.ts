/*
 * Editorial naturalness intelligence.
 *
 * This is deliberately NOT an AI-detector and does not try to guess authorship.
 * It measures editorial defects that make useful prose feel templated: semantic
 * repetition, low information gain, broken entity continuity, actor/discourse
 * monotony, uniform paragraph geometry, weak specificity, distant evidence,
 * under-compression and boilerplate.  The same measurements provide a compact
 * style fingerprint that can be learned from accepted/rejected estate output.
 *
 * Pure + deterministic: no network, provider or database dependencies here.
 */

export type EditorialNaturalnessCode =
  | 'semantic_repetition'
  | 'low_information_gain'
  | 'entity_grid_break'
  | 'actor_monotony'
  | 'uniform_paragraph_shape'
  | 'discourse_monotony'
  | 'section_semantic_overlap'
  | 'low_specificity'
  | 'claim_evidence_distance'
  | 'under_compressed_prose'
  | 'missing_qualification'
  | 'predictable_boilerplate'
  | 'corpus_style_drift'
  | 'rejected_style_proximity'
  | 'corpus_template_repetition'

export type EditorialNaturalnessSeverity = 'warning' | 'blocker'

export interface EditorialNaturalnessFinding {
  code: EditorialNaturalnessCode
  severity: EditorialNaturalnessSeverity
  message: string
  evidence?: string
  start?: number
  end?: number
  instruction?: string
}

export interface EditorialRepairSpan {
  code: EditorialNaturalnessCode
  start: number
  end: number
  strength: 'high' | 'mid'
  instruction: string
}

export interface EditorialFingerprintMetrics {
  sentenceBurstiness: number
  paragraphBurstiness: number
  trigramVariety: number
  entityCarryover: number
  specificity: number
  informationNovelty: number
  actorConcentration: number
  discourseDiversity: number
  qualificationRate: number
  boilerplateRate: number
  compressionPressure: number
}

export interface EditorialFingerprint {
  metrics: EditorialFingerprintMetrics
  actorDistribution: Record<string, number>
  discourseDistribution: Record<string, number>
  skeleton: string
  paragraphCount: number
  sentenceCount: number
}

export type EditorialMetricName = keyof EditorialFingerprintMetrics

export interface MetricDistribution {
  mean: number
  sd: number
}

export interface EditorialCorpusProfile {
  acceptedCount: number
  rejectedCount: number
  accepted: Record<EditorialMetricName, MetricDistribution> | null
  rejected: Record<EditorialMetricName, MetricDistribution> | null
  skeletonCounts: Record<string, number>
}

export interface EditorialNaturalnessReport {
  score: number
  findings: EditorialNaturalnessFinding[]
  repairSpans: EditorialRepairSpan[]
  fingerprint: EditorialFingerprint
}

type ParagraphRecord = {
  start: number
  end: number
  text: string
  words: number
  sentenceCount: number
  sectionHeading: string
}

type SentenceRecord = {
  start: number
  end: number
  text: string
  paragraphIndex: number
  sectionHeading: string
}

type SectionRecord = {
  heading: string
  bodyStart: number
  end: number
  body: string
}

const STRUCTURAL_H2 = /^(?:in 60 seconds|tldr|tl;?dr|key takeaways|faq|frequently asked questions|sources|official sources|disclaimer|table of contents|related guides?|references)$/i
const URL_RE = /https?:\/\/[^\s)\]>'"`]+/gi
const CITATION_RE = /\[[^\]]+\]\(https?:\/\/[^)]+\)|https?:\/\/[^\s)\]>'"`]+/i
const LEGAL_OR_FACT_RE = /\b(?:must|must not|may|may not|cannot|unless|required|eligible|eligibility|refus\w*|deadline|score|points?|days?|weeks?|months?|years?)\b|\b\d+(?:[.,]\d+)*(?:%|\b)/i
const QUALIFIER_RE = /\b(?:but|however|although|while|whereas|unless|except|exception|depends?|depending|may|might|can vary|subject to|by contrast|on the other hand|yet|instead)\b/gi
const ACTION_RE = /\b(?:apply|submit|file|upload|check|confirm|verify|request|provide|pay|book|complete|sign|attach|keep|download|contact|update|review|calculate|compare|choose|prepare|gather|send|receive|wait|track)\w*\b/gi
const GENERIC_NOUN_RE = /\b(?:process|journey|landscape|aspect|factor|consideration|situation|information|requirement|requirements|thing|things|step|steps|option|options|matter|matters|area|areas)\b/gi
const CONCRETE_NOUN_RE = /\b(?:form|permit|visa|passport|account|portal|letter|statement|certificate|score|deadline|application|petition|receipt|employer|school|college|university|agency|department|office|document|evidence|record|fee|appointment|interview|biometric|licen[cs]e)\b/gi
const BOILERPLATE_RE = /^(?:navigating\b|understanding\b|when it comes to\b|it is important to\b|it's important to\b|this guide (?:will|covers|explains)\b|whether you(?:'re| are)\b|in today'?s\b|the process of\b|one of the (?:most|key|main)\b|there are several\b|to ensure (?:a|the|that)\b)/i
const ENTITY_TOKEN_RE = /\b(?:IRCC|USCIS|CBP|DHS|DOS|SEVP|EOIR|UKVI|HMRC|NHS|GOV\.UK|Home Office|Department of Home Affairs|Immigration New Zealand|Express Entry|Comprehensive Ranking System|CRS|LMIA|PGWP|IELTS|TOEFL|PTE|Form\s+[A-Z0-9][A-Z0-9-]*(?:\s+[A-Z0-9-]+)?|[A-Z][A-Za-z&.-]+(?:\s+[A-Z][A-Za-z&.-]+){1,3})\b/g

const STOP = new Set([
  'about','after','again','against','also','among','and','any','are','because','been','before','being','between','both','but','can','could','did','does','doing','each','for','from','had','has','have','having','here','how','into','its','itself','just','more','most','not','now','of','off','on','once','only','other','our','out','over','same','should','some','such','than','that','the','their','them','then','there','these','they','this','those','through','to','too','under','until','very','was','were','what','when','where','which','while','who','why','will','with','would','you','your','yours',
])

const SYNONYM_GROUP: Record<string, string> = {
  applicant: 'applicant', applicants: 'applicant', candidate: 'applicant', candidates: 'applicant', reader: 'applicant',
  application: 'filing', applications: 'filing', petition: 'filing', petitions: 'filing', filing: 'filing',
  submit: 'submit', submits: 'submit', submitted: 'submit', submitting: 'submit', file: 'submit', files: 'submit', filed: 'submit', lodge: 'submit', lodged: 'submit',
  document: 'evidence', documents: 'evidence', evidence: 'evidence', record: 'evidence', records: 'evidence', paperwork: 'evidence',
  requirement: 'rule', requirements: 'rule', rule: 'rule', rules: 'rule', condition: 'rule', conditions: 'rule',
  check: 'verify', checks: 'verify', checked: 'verify', confirm: 'verify', confirms: 'verify', verify: 'verify', verifies: 'verify',
  agency: 'authority', agencies: 'authority', authority: 'authority', authorities: 'authority', department: 'authority', office: 'authority',
  timeline: 'time', timelines: 'time', timing: 'time', times: 'time', duration: 'time',
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0))
}

function cv(values: number[]): number {
  if (values.length < 2) return 1
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  if (!mean) return 0
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length
  return Math.sqrt(variance) / mean
}

function entropyDiversity(counts: Record<string, number>): number {
  const vals = Object.values(counts).filter((n) => n > 0)
  const total = vals.reduce((a, b) => a + b, 0)
  if (total <= 1 || vals.length <= 1) return 0
  let h = 0
  for (const n of vals) {
    const p = n / total
    h -= p * Math.log(p)
  }
  return clamp01(h / Math.log(vals.length))
}

function bodyStart(content: string): number {
  const m = String(content || '').match(/^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n?/)
  return m ? m[0].length : 0
}

function visibleText(text: string): string {
  return String(text || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(URL_RE, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[*_`>#|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function stemToken(raw: string): string {
  const lower = raw.toLowerCase().replace(/^'+|'+$/g, '')
  if (SYNONYM_GROUP[lower]) return SYNONYM_GROUP[lower]
  if (lower.length > 6 && /(?:ing|ers|ies|ied|ed|es)$/.test(lower)) {
    return lower.replace(/(?:ing|ers|ies|ied|ed|es)$/, '')
  }
  if (lower.length > 5 && lower.endsWith('s')) return lower.slice(0, -1)
  return lower
}

function contentTokens(text: string): string[] {
  const clean = visibleText(text).toLowerCase()
  return (clean.match(/[a-z][a-z'-]{2,}/g) || [])
    .map(stemToken)
    .filter((w) => w.length >= 3 && !STOP.has(w))
}

function tokenSet(text: string): Set<string> {
  return new Set(contentTokens(text))
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0
  let inter = 0
  for (const t of a) if (b.has(t)) inter++
  return inter / (a.size + b.size - inter)
}

function sections(content: string): SectionRecord[] {
  const text = String(content || '')
  const startAt = bodyStart(text)
  const re = /^##\s+(.+)$/gm
  const marks: Array<{ index: number; end: number; heading: string }> = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index < startAt) continue
    marks.push({ index: m.index, end: re.lastIndex, heading: m[1].trim() })
  }
  const out: SectionRecord[] = []
  for (let i = 0; i < marks.length; i++) {
    const mark = marks[i]
    const nl = text.indexOf('\n', mark.index)
    const body = nl < 0 ? text.length : nl + 1
    const end = i + 1 < marks.length ? marks[i + 1].index : text.length
    out.push({ heading: mark.heading, bodyStart: body, end, body: text.slice(body, end).trim() })
  }
  return out
}

function sectionHeadingAt(offset: number, secs: SectionRecord[]): string {
  const s = secs.find((x) => offset >= x.bodyStart && offset < x.end)
  return s?.heading || ''
}

function paragraphRecords(content: string): ParagraphRecord[] {
  const text = String(content || '')
  const min = bodyStart(text)
  const secs = sections(text)
  const chunks = text.split(/(\n{2,})/)
  const out: ParagraphRecord[] = []
  let offset = 0
  for (const chunk of chunks) {
    const lead = chunk.length - chunk.trimStart().length
    const raw = chunk.trim()
    const start = offset + lead
    const end = start + raw.length
    offset += chunk.length
    if (start < min || !raw || raw.length < 35) continue
    if (/^#{1,6}\s/.test(raw)) continue
    if (/^(?:```|<script|---)/i.test(raw)) continue
    if (/^(?:[-*+]\s+|\d+[.)]\s+)/.test(raw) && raw.split('\n').length > 1) continue
    if (/^\|.*\|/m.test(raw)) continue
    const prose = visibleText(raw)
    const words = prose.split(/\s+/).filter(Boolean).length
    if (words < 8) continue
    const sentenceCount = splitSentenceText(prose).length
    out.push({ start, end, text: raw, words, sentenceCount, sectionHeading: sectionHeadingAt(start, secs) })
  }
  return out
}

function splitSentenceText(text: string): string[] {
  return String(text || '')
    .split(/(?<=[.!?])\s+(?=[A-Z0-9“"'([]|$)/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 18)
}

function sentenceRecords(content: string, paras = paragraphRecords(content)): SentenceRecord[] {
  const out: SentenceRecord[] = []
  paras.forEach((p, paragraphIndex) => {
    const source = p.text
    const re = /[^.!?\n]+(?:[.!?]+[”"')\]]*|$)/g
    let m: RegExpExecArray | null
    while ((m = re.exec(source)) !== null) {
      const raw = m[0]
      const lead = raw.length - raw.trimStart().length
      const text = raw.trim()
      if (text.length < 18) continue
      const start = p.start + m.index + lead
      out.push({ start, end: start + text.length, text, paragraphIndex, sectionHeading: p.sectionHeading })
    }
  })
  return out
}

function sentenceWords(s: string): number {
  return visibleText(s).split(/\s+/).filter(Boolean).length
}

function trigrams(text: string): { total: number; unique: number } {
  const words = contentTokens(text)
  const grams: string[] = []
  for (let i = 0; i + 2 < words.length; i++) grams.push(`${words[i]} ${words[i + 1]} ${words[i + 2]}`)
  return { total: grams.length, unique: new Set(grams).size }
}

function entities(text: string): Set<string> {
  const out = new Set<string>()
  for (const m of String(text || '').match(ENTITY_TOKEN_RE) || []) out.add(m.toLowerCase().replace(/\s+/g, ' ').trim())
  return out
}

function entityCarryover(sentences: SentenceRecord[]): number {
  let eligible = 0
  let carry = 0
  for (let i = 1; i < sentences.length; i++) {
    if (sentences[i - 1].sectionHeading !== sentences[i].sectionHeading) continue
    const a = entities(sentences[i - 1].text)
    if (!a.size) continue
    const b = entities(sentences[i].text)
    eligible++
    if ([...a].some((e) => b.has(e))) carry++
  }
  return eligible ? carry / eligible : 0.5
}

function actor(text: string): string {
  const s = visibleText(text).replace(/^[“"'([]+/, '').toLowerCase()
  if (/^(?:you|your)\b/.test(s)) return 'reader'
  if (/^(?:applicants?|candidates?|students?|workers?|sponsors?)\b/.test(s)) return 'applicant'
  if (/^(?:ircc|uscis|cbp|dhs|ukvi|home office|the department|the agency|officers?)\b/.test(s)) return 'authority'
  if (/^(?:form\b|the form\b|documents?\b|evidence\b|the application\b|your application\b|the permit\b|your permit\b)/.test(s)) return 'artefact'
  if (/^(?:employers?|schools?|universit(?:y|ies)|colleges?)\b/.test(s)) return 'institution'
  if (/^(?:the rule\b|the requirement\b|eligibility\b|the deadline\b|the score\b|processing\b)/.test(s)) return 'rule'
  return 'other'
}

function actorDistribution(sentences: SentenceRecord[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const s of sentences) counts[actor(s.text)] = (counts[actor(s.text)] || 0) + 1
  return counts
}

function discourse(text: string): string {
  const s = visibleText(text).toLowerCase()
  if (/\b(?:for example|for instance|e\.g\.)\b/.test(s)) return 'example'
  if (QUALIFIER_RE.test(s)) { QUALIFIER_RE.lastIndex = 0; return 'qualification' }
  QUALIFIER_RE.lastIndex = 0
  if (CITATION_RE.test(text) || /\b(?:according to|official guidance|the source|the department says)\b/.test(s)) return 'evidence'
  if (/^(?:first|second|next|then|finally|start by|you (?:should|must|can|need to)|check|submit|file|upload|prepare|keep)\b/.test(s)) return 'action'
  if (/\b(?:must|cannot|required|eligible|qualif(?:y|ies)|rule|requirement)\b/.test(s)) return 'rule'
  if (/\b(?:therefore|as a result|which means|so you|this means)\b/.test(s)) return 'consequence'
  if (/^(?:yes|no)\b/.test(s)) return 'answer'
  return 'explanation'
}

function discourseDistribution(paras: ParagraphRecord[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const p of paras) {
    const first = splitSentenceText(visibleText(p.text))[0] || p.text
    const d = discourse(first)
    counts[d] = (counts[d] || 0) + 1
  }
  return counts
}

function concreteDensity(text: string): number {
  const words = Math.max(1, visibleText(text).split(/\s+/).filter(Boolean).length)
  const named = entities(text).size
  const numbers = (text.match(/\b\d+(?:[.,]\d+)*\b/g) || []).length
  const nouns = (text.match(CONCRETE_NOUN_RE) || []).length
  CONCRETE_NOUN_RE.lastIndex = 0
  const actions = (text.match(ACTION_RE) || []).length
  ACTION_RE.lastIndex = 0
  return clamp01((named * 1.7 + numbers + nouns + actions * 0.7) / words)
}

function genericDensity(text: string): number {
  const words = Math.max(1, visibleText(text).split(/\s+/).filter(Boolean).length)
  const hits = (text.match(GENERIC_NOUN_RE) || []).length
  GENERIC_NOUN_RE.lastIndex = 0
  return hits / words
}

function sentenceNovelty(sentences: SentenceRecord[]): { avg: number; perSentence: number[] } {
  const vals: number[] = []
  const history: Set<string>[] = []
  for (const s of sentences) {
    const now = tokenSet(s.text)
    const prior = new Set<string>()
    for (const h of history.slice(-3)) for (const t of h) prior.add(t)
    let fresh = 0
    for (const t of now) if (!prior.has(t)) fresh++
    const v = now.size ? fresh / now.size : 1
    vals.push(v)
    history.push(now)
  }
  return { avg: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 1, perSentence: vals }
}

function skeletonFor(content: string): string {
  const classify = (h: string): string => {
    const s = h.toLowerCase()
    if (/in 60 seconds|tldr|key takeaways/.test(s)) return 'summary'
    if (/eligib|qualif|who can|who is/.test(s)) return 'eligibility'
    if (/document|evidence|paperwork|checklist/.test(s)) return 'documents'
    if (/step|process|apply|application|how to/.test(s)) return 'process'
    if (/time|timeline|processing|how long/.test(s)) return 'timing'
    if (/fee|cost|price|pay/.test(s)) return 'cost'
    if (/risk|mistake|refus|problem|avoid/.test(s)) return 'risk'
    if (/score|points|calculate/.test(s)) return 'score'
    if (/faq|frequently asked/.test(s)) return 'faq'
    if (/source|reference/.test(s)) return 'sources'
    return 'topic'
  }
  return sections(content).map((s) => classify(s.heading)).join('>')
}

function qualificationRate(text: string): number {
  const sentenceCount = Math.max(1, splitSentenceText(visibleText(text)).length)
  const hits = (text.match(QUALIFIER_RE) || []).length
  QUALIFIER_RE.lastIndex = 0
  return clamp01(hits / sentenceCount)
}

function boilerplateRate(paras: ParagraphRecord[]): number {
  if (!paras.length) return 0
  return paras.filter((p) => BOILERPLATE_RE.test(visibleText(p.text))).length / paras.length
}

function compressionPressure(paras: ParagraphRecord[]): number {
  if (!paras.length) return 0
  let pressured = 0
  for (const p of paras) {
    const spec = concreteDensity(p.text)
    if (p.words >= 120 && (p.sentenceCount <= 3 || (spec < 0.045 && genericDensity(p.text) > 0.018))) pressured++
  }
  return pressured / paras.length
}

export function extractEditorialFingerprint(content: string): EditorialFingerprint {
  const paras = paragraphRecords(content)
  const sentences = sentenceRecords(content, paras)
  const sentenceLens = sentences.map((s) => sentenceWords(s.text)).filter((n) => n >= 4)
  const paraLens = paras.map((p) => p.words)
  const tri = trigrams(content)
  const actors = actorDistribution(sentences)
  const discourses = discourseDistribution(paras)
  const totalActors = Math.max(1, Object.values(actors).reduce((a, b) => a + b, 0))
  const actorTop = Math.max(0, ...Object.values(actors)) / totalActors
  const novelty = sentenceNovelty(sentences)
  const avgSpec = paras.length ? paras.reduce((a, p) => a + concreteDensity(p.text), 0) / paras.length : 0
  return {
    metrics: {
      sentenceBurstiness: clamp01(cv(sentenceLens)),
      paragraphBurstiness: clamp01(cv(paraLens)),
      trigramVariety: tri.total ? tri.unique / tri.total : 1,
      entityCarryover: clamp01(entityCarryover(sentences)),
      specificity: clamp01(avgSpec),
      informationNovelty: clamp01(novelty.avg),
      actorConcentration: clamp01(actorTop),
      discourseDiversity: entropyDiversity(discourses),
      qualificationRate: qualificationRate(content),
      boilerplateRate: clamp01(boilerplateRate(paras)),
      compressionPressure: clamp01(compressionPressure(paras)),
    },
    actorDistribution: actors,
    discourseDistribution: discourses,
    skeleton: skeletonFor(content),
    paragraphCount: paras.length,
    sentenceCount: sentences.length,
  }
}

function metricDistribution(values: number[]): MetricDistribution {
  if (!values.length) return { mean: 0, sd: 0 }
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length
  return { mean, sd: Math.sqrt(variance) }
}

function distributions(fps: EditorialFingerprint[]): Record<EditorialMetricName, MetricDistribution> | null {
  if (!fps.length) return null
  const names = Object.keys(fps[0].metrics) as EditorialMetricName[]
  const out = {} as Record<EditorialMetricName, MetricDistribution>
  for (const name of names) out[name] = metricDistribution(fps.map((f) => f.metrics[name]))
  return out
}

export function buildEditorialCorpusProfile(input: {
  accepted: string[]
  rejected?: string[]
}): EditorialCorpusProfile {
  const accepted = input.accepted.filter((s) => visibleText(s).split(/\s+/).length >= 120).map(extractEditorialFingerprint)
  const rejected = (input.rejected || []).filter((s) => visibleText(s).split(/\s+/).length >= 120).map(extractEditorialFingerprint)
  const skeletonCounts: Record<string, number> = {}
  for (const fp of accepted) if (fp.skeleton) skeletonCounts[fp.skeleton] = (skeletonCounts[fp.skeleton] || 0) + 1
  return {
    acceptedCount: accepted.length,
    rejectedCount: rejected.length,
    accepted: distributions(accepted),
    rejected: distributions(rejected),
    skeletonCounts,
  }
}

const METRIC_SCALE_FLOOR: Record<EditorialMetricName, number> = {
  sentenceBurstiness: 0.08,
  paragraphBurstiness: 0.08,
  trigramVariety: 0.04,
  entityCarryover: 0.10,
  specificity: 0.025,
  informationNovelty: 0.06,
  actorConcentration: 0.08,
  discourseDiversity: 0.08,
  qualificationRate: 0.05,
  boilerplateRate: 0.03,
  compressionPressure: 0.03,
}

export function fingerprintDistance(
  fp: EditorialFingerprint,
  dist: Record<EditorialMetricName, MetricDistribution> | null,
): number | null {
  if (!dist) return null
  const names = Object.keys(fp.metrics) as EditorialMetricName[]
  let total = 0
  let n = 0
  for (const name of names) {
    const d = dist[name]
    if (!d) continue
    const scale = Math.max(d.sd, METRIC_SCALE_FLOOR[name])
    total += Math.min(4, Math.abs(fp.metrics[name] - d.mean) / scale)
    n++
  }
  return n ? total / n : null
}

function corpusFindings(fp: EditorialFingerprint, profile?: EditorialCorpusProfile | null): EditorialNaturalnessFinding[] {
  if (!profile || profile.acceptedCount < 4 || !profile.accepted) return []
  const findings: EditorialNaturalnessFinding[] = []
  const acceptedDistance = fingerprintDistance(fp, profile.accepted)
  if (acceptedDistance != null && acceptedDistance > 1.65) {
    findings.push({
      code: 'corpus_style_drift', severity: 'warning',
      message: `Draft style fingerprint is ${acceptedDistance.toFixed(2)}σ-like units from accepted estate prose.`,
      evidence: `distance=${acceptedDistance.toFixed(2)};accepted=${profile.acceptedCount}`,
      instruction: 'Move this passage toward the accepted house distribution without copying any author: vary cadence, actors and paragraph shape while keeping facts.',
    })
  }
  if (profile.rejectedCount >= 3 && profile.rejected) {
    const rejectedDistance = fingerprintDistance(fp, profile.rejected)
    if (acceptedDistance != null && rejectedDistance != null && rejectedDistance + 0.25 < acceptedDistance) {
      findings.push({
        code: 'rejected_style_proximity', severity: 'warning',
        message: 'Draft fingerprint is closer to prior compliance-rejected prose than to accepted estate prose.',
        evidence: `accepted=${acceptedDistance.toFixed(2)};rejected=${rejectedDistance.toFixed(2)}`,
        instruction: 'Break the rejected pattern: remove boilerplate, add concrete actors/actions and vary rhetorical function while preserving factual meaning.',
      })
    }
  }
  const repeats = fp.skeleton ? profile.skeletonCounts[fp.skeleton] || 0 : 0
  if (profile.acceptedCount >= 8 && repeats >= 3 && repeats / profile.acceptedCount >= 0.22) {
    findings.push({
      code: 'corpus_template_repetition', severity: 'warning',
      message: `This H2 skeleton already appears in ${repeats}/${profile.acceptedCount} accepted corpus samples.`,
      evidence: `skeleton=${fp.skeleton};count=${repeats}`,
      instruction: 'Keep the sealed headings, but vary paragraph roles and section development so this page does not read like a cloned template.',
    })
  }
  return findings
}

function paragraphPenalty(p: ParagraphRecord): number {
  const sents = splitSentenceText(visibleText(p.text))
  const lens = sents.map(sentenceWords).filter((n) => n >= 4)
  const tri = trigrams(p.text)
  let penalty = 0
  if (sents.length >= 3 && cv(lens) < 0.12) penalty += 2
  if (tri.total >= 15 && tri.unique / tri.total < 0.72) penalty += 2
  if (concreteDensity(p.text) < 0.04 && genericDensity(p.text) > 0.018) penalty += 2
  if (BOILERPLATE_RE.test(visibleText(p.text))) penalty += 2
  if (p.words >= 120 && p.sentenceCount <= 3) penalty += 2
  return penalty
}

function worstParagraphSpans(content: string, code: EditorialNaturalnessCode, instruction: string, count = 2): EditorialRepairSpan[] {
  return paragraphRecords(content)
    .map((p) => ({ p, penalty: paragraphPenalty(p) }))
    .filter((x) => x.penalty >= 2)
    .sort((a, b) => b.penalty - a.penalty || b.p.words - a.p.words)
    .slice(0, count)
    .map(({ p }) => ({ code, start: p.start, end: p.end, strength: 'mid' as const, instruction }))
}

function pushFinding(
  findings: EditorialNaturalnessFinding[],
  spans: EditorialRepairSpan[],
  finding: EditorialNaturalnessFinding,
  span?: EditorialRepairSpan,
): void {
  findings.push(finding)
  if (span) spans.push(span)
}

export function evaluateEditorialNaturalness(
  content: string,
  opts: { corpusProfile?: EditorialCorpusProfile | null; fragment?: boolean } = {},
): EditorialNaturalnessReport {
  const text = String(content || '')
  const paras = paragraphRecords(text)
  const sentences = sentenceRecords(text, paras)
  const secs = sections(text).filter((s) => !STRUCTURAL_H2.test(s.heading.trim()))
  const fingerprint = extractEditorialFingerprint(text)
  const findings: EditorialNaturalnessFinding[] = []
  const spans: EditorialRepairSpan[] = []

  if (!opts.fragment && sentences.length >= 10) {
    // Semantic repetition across non-neighbour paragraphs. Synonym folding and
    // light stemming catch "submit documents" ≈ "file evidence" without an
    // embedding service; exact duplication is not required.
    let best: { score: number; a: ParagraphRecord; b: ParagraphRecord } | null = null
    for (let i = 0; i < paras.length; i++) {
      const a = tokenSet(paras[i].text)
      if (a.size < 9) continue
      for (let j = i + 1; j < paras.length; j++) {
        if (j === i + 1 && paras[i].sectionHeading === paras[j].sectionHeading) continue
        const b = tokenSet(paras[j].text)
        if (b.size < 9) continue
        const score = jaccard(a, b)
        if (score >= 0.58 && (!best || score > best.score)) best = { score, a: paras[i], b: paras[j] }
      }
    }
    if (best) {
      pushFinding(findings, spans, {
        code: 'semantic_repetition', severity: 'warning',
        message: `Two developed paragraphs repeat substantially the same proposition (${Math.round(best.score * 100)}% semantic-token overlap).`,
        evidence: `section=${best.b.sectionHeading};overlap=${best.score.toFixed(2)}`,
        start: best.b.start, end: best.b.end,
        instruction: 'Rewrite the later paragraph so it adds a new decision, constraint, consequence or example instead of paraphrasing earlier prose.',
      }, {
        code: 'semantic_repetition', start: best.b.start, end: best.b.end, strength: 'high',
        instruction: 'Advance new information. Do not paraphrase an earlier paragraph. Keep all factual tokens and claim-specific citations.',
      })
    }

    // All-pairs H2 distance, not just adjacent sections.
    let secBest: { score: number; later: SectionRecord; earlier: SectionRecord } | null = null
    for (let i = 0; i < secs.length; i++) {
      const a = tokenSet(secs[i].body)
      if (a.size < 15) continue
      for (let j = i + 1; j < secs.length; j++) {
        const b = tokenSet(secs[j].body)
        if (b.size < 15) continue
        const score = jaccard(a, b)
        if (score >= 0.55 && (!secBest || score > secBest.score)) secBest = { score, earlier: secs[i], later: secs[j] }
      }
    }
    if (secBest) {
      pushFinding(findings, spans, {
        code: 'section_semantic_overlap', severity: secBest.score >= 0.68 ? 'blocker' : 'warning',
        message: `H2 “${secBest.later.heading}” repeats the information carried by “${secBest.earlier.heading}” (${Math.round(secBest.score * 100)}% overlap).`,
        evidence: `earlier=${encodeURIComponent(secBest.earlier.heading)};later=${encodeURIComponent(secBest.later.heading)};overlap=${secBest.score.toFixed(2)}`,
        start: secBest.later.bodyStart, end: secBest.later.end,
        instruction: 'Keep the H2 but make its body perform a different job and introduce new information.',
      }, {
        code: 'section_semantic_overlap', start: secBest.later.bodyStart, end: secBest.later.end,
        strength: secBest.score >= 0.68 ? 'high' : 'mid',
        instruction: 'Rewrite this section body so it advances a distinct rule, decision, sequence or consequence. Keep the heading and facts.',
      })
    }
  }

  // Information gain: detect paragraphs containing a run of sentences whose
  // content words are already present in the immediately preceding discourse.
  if (sentences.length >= 8) {
    const nov = sentenceNovelty(sentences).perSentence
    const byPara = new Map<number, number[]>()
    nov.forEach((v, i) => {
      const pi = sentences[i].paragraphIndex
      const arr = byPara.get(pi) || []
      arr.push(v)
      byPara.set(pi, arr)
    })
    let worst: { p: ParagraphRecord; avg: number; low: number } | null = null
    for (const [pi, vals] of byPara) {
      const p = paras[pi]
      if (!p || vals.length < 2 || p.words < 55) continue
      const low = vals.filter((v) => v < 0.2).length
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length
      if (low >= 2 && avg < 0.42 && (!worst || avg < worst.avg)) worst = { p, avg, low }
    }
    if (worst) {
      pushFinding(findings, spans, {
        code: 'low_information_gain', severity: 'warning',
        message: `A paragraph adds little new information across ${worst.low} sentence(s).`,
        evidence: `section=${worst.p.sectionHeading};novelty=${worst.avg.toFixed(2)}`,
        start: worst.p.start, end: worst.p.end,
        instruction: 'Compress repeated explanation and use the saved space for a concrete rule, action, qualification or consequence.',
      }, {
        code: 'low_information_gain', start: worst.p.start, end: worst.p.end, strength: 'high',
        instruction: 'Remove semantic restatement. Preserve facts, then make each remaining sentence contribute a distinct piece of information.',
      })
    }
  }

  // Entity-grid continuity: a specialist usually carries a key agency/form/
  // program from one sentence into the next before deliberately switching.
  if (sentences.length >= 10) {
    let eligible = 0
    let carried = 0
    for (let i = 1; i < sentences.length; i++) {
      if (sentences[i - 1].sectionHeading !== sentences[i].sectionHeading) continue
      const a = entities(sentences[i - 1].text)
      if (!a.size) continue
      eligible++
      const b = entities(sentences[i].text)
      if ([...a].some((e) => b.has(e))) carried++
    }
    const rate = eligible ? carried / eligible : 1
    if (eligible >= 6 && rate < 0.17) {
      const target = paras.find((p) => entities(p.text).size >= 2 && p.words >= 55)
      pushFinding(findings, spans, {
        code: 'entity_grid_break', severity: 'warning',
        message: `Named entities are dropped between sentences too often (${Math.round(rate * 100)}% carry-over across ${eligible} transitions).`,
        evidence: `carry=${rate.toFixed(2)};transitions=${eligible}`,
        ...(target ? { start: target.start, end: target.end } : {}),
        instruction: 'Keep the relevant agency, form, program or document in focus long enough for the reader to follow the relationship before switching entities.',
      }, target ? {
        code: 'entity_grid_break', start: target.start, end: target.end, strength: 'mid',
        instruction: 'Improve entity continuity: connect each sentence to the agency, form, program or document established just before it. Do not invent entities.',
      } : undefined)
    }
  }

  // Actor concentration catches "You... You... You..." as well as a page that
  // starts every sentence with "Applicants" or "The process".
  if (sentences.length >= 12) {
    const dist = actorDistribution(sentences)
    const total = Object.values(dist).reduce((a, b) => a + b, 0)
    const top = Object.entries(dist).sort((a, b) => b[1] - a[1])[0]
    if (top && total > 0 && top[1] / total >= 0.64) {
      const target = paras.find((p) => splitSentenceText(visibleText(p.text)).filter((s) => actor(s) === top[0]).length >= 2)
      pushFinding(findings, spans, {
        code: 'actor_monotony', severity: 'warning',
        message: `One grammatical actor (“${top[0]}”) leads ${Math.round((top[1] / total) * 100)}% of sentences.`,
        evidence: `${top[0]}=${top[1]}/${total}`,
        ...(target ? { start: target.start, end: target.end } : {}),
        instruction: 'Rotate naturally among the reader, agency, form/document, institution, rule and consequence instead of changing only synonyms.',
      }, target ? {
        code: 'actor_monotony', start: target.start, end: target.end, strength: 'mid',
        instruction: 'Vary the grammatical actor naturally while preserving second-person usefulness. Lead some sentences with the agency, document, rule or consequence.',
      } : undefined)
    }
  }

  if (paras.length >= 6) {
    const lengths = paras.map((p) => p.words)
    const sentenceCounts = paras.map((p) => p.sentenceCount).filter((n) => n > 0)
    const commonShape = sentenceCounts.length ? Math.max(...sentenceCounts.map((n) => sentenceCounts.filter((x) => x === n).length)) / sentenceCounts.length : 0
    if (cv(lengths) < 0.18 && commonShape >= 0.65) {
      const target = paras[paras.length - 2] || paras[paras.length - 1]
      pushFinding(findings, spans, {
        code: 'uniform_paragraph_shape', severity: 'warning',
        message: 'Paragraph lengths and sentence counts are unusually uniform, producing a templated page rhythm.',
        evidence: `paragraphCv=${cv(lengths).toFixed(2)};commonShape=${commonShape.toFixed(2)}`,
        ...(target ? { start: target.start, end: target.end } : {}),
        instruction: 'Let paragraph length follow the job: a short transition, a developed explanation, a warning or a compact action block should not all have the same shape.',
      }, target ? {
        code: 'uniform_paragraph_shape', start: target.start, end: target.end, strength: 'mid',
        instruction: 'Reshape this paragraph for its actual editorial job instead of matching the surrounding paragraph length. Keep facts and formatting.',
      } : undefined)
    }

    const dd = discourseDistribution(paras)
    const total = Object.values(dd).reduce((a, b) => a + b, 0)
    const dominant = Object.entries(dd).sort((a, b) => b[1] - a[1])[0]
    if (dominant && total >= 6 && dominant[1] / total >= 0.68) {
      const target = paras.find((p) => discourse(splitSentenceText(visibleText(p.text))[0] || p.text) === dominant[0] && p.words >= 50)
      pushFinding(findings, spans, {
        code: 'discourse_monotony', severity: 'warning',
        message: `Paragraphs repeatedly perform the same rhetorical job (“${dominant[0]}”, ${dominant[1]}/${total}).`,
        evidence: `${dominant[0]}=${dominant[1]}/${total}`,
        ...(target ? { start: target.start, end: target.end } : {}),
        instruction: 'Progress through answer/rule → explanation → evidence/qualification → action or consequence instead of stacking explanation paragraphs.',
      }, target ? {
        code: 'discourse_monotony', start: target.start, end: target.end, strength: 'mid',
        instruction: 'Give this paragraph a distinct rhetorical job (decision, evidence, qualification, action or consequence) while preserving its factual content.',
      } : undefined)
    }
  }

  // Specificity + compression + boilerplate are paragraph-local and ideal for
  // surgical denoise rather than a document-wide "humanize" instruction.
  let lowSpecificity: ParagraphRecord | null = null
  let underCompressed: ParagraphRecord | null = null
  let boilerplate: ParagraphRecord | null = null
  for (const p of paras) {
    if (!lowSpecificity && p.words >= 75 && concreteDensity(p.text) < 0.035 && genericDensity(p.text) >= 0.018) lowSpecificity = p
    if (!underCompressed && p.words >= 125 && (p.sentenceCount <= 3 || (concreteDensity(p.text) < 0.04 && genericDensity(p.text) >= 0.02))) underCompressed = p
    if (!boilerplate && BOILERPLATE_RE.test(visibleText(p.text))) boilerplate = p
  }
  if (lowSpecificity) {
    pushFinding(findings, spans, {
      code: 'low_specificity', severity: 'warning',
      message: 'A developed paragraph relies on generic process/requirement language without enough named actors, artefacts or actions.',
      evidence: `section=${lowSpecificity.sectionHeading};specificity=${concreteDensity(lowSpecificity.text).toFixed(3)}`,
      start: lowSpecificity.start, end: lowSpecificity.end,
      instruction: 'Use the exact agency, form/document, account, action or decision already supported by the brief instead of generic nouns. Do not invent specifics.',
    }, {
      code: 'low_specificity', start: lowSpecificity.start, end: lowSpecificity.end, strength: 'mid',
      instruction: 'Replace generic process language with concrete actors, artefacts and actions already supported by this passage. Do not add unsupported facts.',
    })
  }
  if (underCompressed) {
    pushFinding(findings, spans, {
      code: 'under_compressed_prose', severity: 'warning',
      message: `A ${underCompressed.words}-word paragraph carries too little distinct information for its length.`,
      evidence: `section=${underCompressed.sectionHeading};words=${underCompressed.words}`,
      start: underCompressed.start, end: underCompressed.end,
      instruction: 'Compress the paragraph by removing explanation that does not change the reader’s decision. Keep every factual/legal token.',
    }, {
      code: 'under_compressed_prose', start: underCompressed.start, end: underCompressed.end, strength: 'mid',
      instruction: 'Compress repeated explanation. Preserve all numbers, legal qualifiers, claim-specific URLs and distinct propositions.',
    })
  }
  if (boilerplate) {
    pushFinding(findings, spans, {
      code: 'predictable_boilerplate', severity: 'warning',
      message: 'A paragraph opens with a highly predictable editorial template instead of the useful fact or decision.',
      evidence: visibleText(boilerplate.text).slice(0, 100),
      start: boilerplate.start, end: boilerplate.end,
      instruction: 'Start with the concrete answer, actor, constraint or action. Remove throat-clearing without adding decorative vocabulary.',
    }, {
      code: 'predictable_boilerplate', start: boilerplate.start, end: boilerplate.end, strength: 'mid',
      instruction: 'Remove the template opener and start with the concrete fact, decision, constraint or next action. Keep the meaning plain.',
    })
  }

  if (!opts.fragment) {
    // Claim–evidence distance is an editorial warning, not permission to invent
    // citations. Throughline may move an EXISTING source closer; denoise does
    // not receive a repair span for this finding.
    let distantClaims = 0
    for (const sec of secs) {
      const ss = sentences.filter((s) => s.start >= sec.bodyStart && s.start < sec.end)
      const citationIdx = ss.map((s, i) => CITATION_RE.test(s.text) ? i : -1).filter((i) => i >= 0)
      if (!citationIdx.length) continue
      for (let i = 0; i < ss.length; i++) {
        if (!LEGAL_OR_FACT_RE.test(ss[i].text) || CITATION_RE.test(ss[i].text)) continue
        const distance = Math.min(...citationIdx.map((ci) => Math.abs(ci - i)))
        if (distance > 3) distantClaims++
      }
    }
    if (distantClaims >= 2) findings.push({
      code: 'claim_evidence_distance', severity: 'warning',
      message: `${distantClaims} factual/legal claims sit more than three sentences from an existing citation in the same section.`,
      evidence: `distantClaims=${distantClaims}`,
      instruction: 'Move an existing supporting citation closer to the claim it supports when accurate. Never invent or repurpose a source.',
    })

    let unqualified: SectionRecord | null = null
    for (const sec of secs) {
      const prose = visibleText(sec.body)
      const words = prose.split(/\s+/).filter(Boolean).length
      const hasNormative = /\b(?:must|eligible|eligibility|required|score|deadline|refus\w*|approval|processing)\b/i.test(prose)
      QUALIFIER_RE.lastIndex = 0
      const hasQualifier = QUALIFIER_RE.test(prose)
      QUALIFIER_RE.lastIndex = 0
      if (words >= 180 && hasNormative && !hasQualifier) { unqualified = sec; break }
    }
    if (unqualified) {
      pushFinding(findings, spans, {
        code: 'missing_qualification', severity: 'warning',
        message: `Section “${unqualified.heading}” states rules/conditions for a long stretch without a supported distinction, exception or qualification.`,
        evidence: `heading=${encodeURIComponent(unqualified.heading)}`,
        start: unqualified.bodyStart, end: unqualified.end,
        instruction: 'Where the existing facts support it, make the limiting condition or distinction explicit. Do not fabricate exceptions merely for style.',
      }, {
        code: 'missing_qualification', start: unqualified.bodyStart, end: unqualified.end, strength: 'mid',
        instruction: 'Make an existing limitation, distinction or conditional relationship explicit if the source text supports one. Do not invent an exception.',
      })
    }
  }

  const corpus = corpusFindings(fingerprint, opts.corpusProfile)
  findings.push(...corpus)
  for (const f of corpus) {
    spans.push(...worstParagraphSpans(text, f.code, f.instruction || 'Move this paragraph toward the accepted house distribution without copying another article.', 1))
  }

  // De-duplicate overlapping repair regions and keep the strongest/highest
  // value local defects.  The caller may impose an even smaller generation cap.
  const severityWeight = (code: EditorialNaturalnessCode) =>
    code === 'section_semantic_overlap' || code === 'semantic_repetition' || code === 'low_information_gain' ? 3 :
      code === 'corpus_style_drift' || code === 'rejected_style_proximity' ? 2 : 1
  const selected: EditorialRepairSpan[] = []
  for (const span of [...spans].sort((a, b) => severityWeight(b.code) - severityWeight(a.code) || a.start - b.start)) {
    if (selected.some((s) => span.start < s.end && span.end > s.start)) continue
    selected.push(span)
    if (selected.length >= 6) break
  }

  const weight = (f: EditorialNaturalnessFinding): number =>
    f.severity === 'blocker' ? 12 :
      f.code === 'semantic_repetition' || f.code === 'low_information_gain' || f.code === 'section_semantic_overlap' ? 7 :
        f.code === 'corpus_style_drift' || f.code === 'rejected_style_proximity' ? 6 : 4
  const score = Math.max(0, Math.round(100 - findings.reduce((a, f) => a + weight(f), 0)))
  return { score, findings: findings.slice(0, 12), repairSpans: selected, fingerprint }
}

/** Small-span score used by contrastive reranking. No corpus or section rules. */
export function editorialFragmentScore(text: string): number {
  const fp = extractEditorialFingerprint(text)
  let score = 100
  if (fp.sentenceCount >= 3 && fp.metrics.sentenceBurstiness < 0.12) score -= 12
  if (fp.metrics.trigramVariety < 0.72) score -= 10
  if (fp.metrics.specificity < 0.035) score -= 10
  if (fp.metrics.boilerplateRate > 0) score -= 12
  if (fp.metrics.compressionPressure > 0) score -= 10
  if (fp.sentenceCount >= 4 && fp.metrics.actorConcentration > 0.72) score -= 8
  return Math.max(0, score)
}
