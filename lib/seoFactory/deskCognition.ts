/**
 * Conversation-visible chain of thought for the linear desk.
 *
 * Explore (before the brief) and self-reflection (after every draft) are
 * JSON turns in the same thread. They steer the article; they are never
 * the article. Hidden provider thinking is a separate knob (reasoningEffort).
 */

import { unwrapWholeDocumentFence } from './contentDepth'

export type DeskExplore = {
  readerQuestion: string
  evidenceWeHave: string[]
  wouldHaveToInvent: string[]
  argumentSpine: string
  chapterPlan: Array<{ heading: string; because: string; covers: string[] }>
  kitRisks: string[]
  gateWatch: string[]
  takeawayClaims: string[]
  faqThatDoesNotEchoH2s: string[]
}

export type DeskReflection = {
  throughline: string
  guesswork: string[]
  stuffing: string[]
  kitSplices: string[]
  layout: string[]
  gateRisks: string[]
  verdict: 'ship' | 'revise'
  revisePlan: string[]
}

const COGNITION_KEYS =
  /"(argumentSpine|verdict|readerQuestion|wouldHaveToInvent|gateWatch|revisePlan|takeawayClaims|kitRisks|gateRisks)"\s*:/

export function explorePrompt(): string {
  return [
    'EXPLORE — chain of thought before the brief. Return ONLY a JSON object.',
    'Do not write the article. Do not invent facts. This JSON is thinking and will never be published.',
    '{',
    '  "readerQuestion": "the actual question this page must answer",',
    '  "evidenceWeHave": ["facts, URLs, constraints present in Discover"],',
    '  "wouldHaveToInvent": ["fees, dates, stats, forms not in Discover — these will be omitted"],',
    '  "argumentSpine": "one sentence the whole article will argue",',
    '  "chapterPlan": [{ "heading": "reader-question or decision-frame H2", "because": "why this chapter exists", "covers": ["topic from Discover"] }],',
    '  "kitRisks": ["places a mill writer would splice a kit piece or restate the thesis"],',
    '  "gateWatch": ["ship gates most likely to fail if we are careless"],',
    '  "takeawayClaims": ["complete claim: subject + verb + consequence"],',
    '  "faqThatDoesNotEchoH2s": ["reader worry the H2s will not already settle"]',
    '}',
    'RULES:',
    '- Use ONLY Discover intelligence. If it is not in Discover, it goes in wouldHaveToInvent.',
    '- argumentSpine is a claim, never the raw primary keyword.',
    '- takeawayClaims are complete sentences, never keyword fragments.',
    '- Chapter headings are reader questions or decision frames, never a keyword dump.',
    '- wouldHaveToInvent items become unresolved on the brief and are omitted from the article.',
  ].join('\n')
}

export function briefFromExploreAddendum(explore: DeskExplore): string {
  return [
    'You already explored in the previous turn. Seal the brief FROM that exploration — do not start over, do not invent.',
    `- thesis ← argumentSpine: ${explore.argumentSpine || '(fill from Discover, not the raw keyword)'}`,
    explore.takeawayClaims.length
      ? `- takeaways ← takeawayClaims:\n${explore.takeawayClaims.map((t) => `  - ${t}`).join('\n')}`
      : '- takeaways ← complete claims, not keyword fragments',
    explore.wouldHaveToInvent.length
      ? `- unresolved MUST include every wouldHaveToInvent item (omitted from the article): ${explore.wouldHaveToInvent.join(' · ')}`
      : '- unresolved lists anything you would still have to invent',
    explore.faqThatDoesNotEchoH2s.length
      ? `- faqQuestions ← faqThatDoesNotEchoH2s:\n${explore.faqThatDoesNotEchoH2s.map((q) => `  - ${q}`).join('\n')}`
      : '- faqQuestions are reader worries the H2s do not already settle',
    '- Later content H2s have bridgeFrom naming the previous claim.',
  ].join('\n')
}

export function reflectPrompt(): string {
  return [
    'SELF-REFLECT. Critique the article you just wrote against the sealed brief and the ship gates — they have not changed since turn 0.',
    'Return ONLY a JSON object. Do not rewrite the article in this turn. This JSON is thinking and will never be published.',
    '{',
    '  "throughline": "does one argument hold, or did a chapter restart?",',
    '  "guesswork": ["claims not in Discover or the brief"],',
    '  "stuffing": ["keyword pasted as heading, opener, or checkbox"],',
    '  "kitSplices": ["H2 that reads like a standalone mini-guide"],',
    '  "layout": ["incomplete takeaways, mill opener, FAQ echoing an H2, missing bridge"],',
    '  "gateRisks": ["which ship gates would still fail, with evidence"],',
    '  "verdict": "ship" | "revise",',
    '  "revisePlan": ["if revise: the exact repair, keeping one article"]',
    '}',
    'Verdict is "ship" only if the article would pass as written. If stuffing, kit splices, guesswork, a restarted chapter, or a mill opener is present, verdict is "revise".',
  ].join('\n')
}

export function rewriteFromReflectionPrompt(opts: {
  reflection: DeskReflection | null
  blockerNotes: string
  warningNotes: string
}): string {
  const plan = opts.reflection?.revisePlan?.filter(Boolean) || []
  return [
    'REWRITE from your self-reflection. SELF-REVIEW against the same ship gates — they have not changed.',
    'Keep one argument. Do not stuff keywords. Do not splice kit pieces. Do not invent. Do not leak chain-of-thought.',
    plan.length ? `Revise plan:\n${plan.map((s) => `- ${s}`).join('\n')}` : '',
    opts.blockerNotes,
    opts.warningNotes,
    'Return the complete corrected markdown article only. No JSON. No preamble. No <think> block.',
  ].filter(Boolean).join('\n\n')
}

export function parseExplore(raw: string): DeskExplore | null {
  const o = extractJsonObject(raw)
  if (!o) return null
  const argumentSpine = str(o.argumentSpine)
  const readerQuestion = str(o.readerQuestion)
  if (!argumentSpine && !readerQuestion) return null
  return {
    readerQuestion,
    evidenceWeHave: strs(o.evidenceWeHave),
    wouldHaveToInvent: strs(o.wouldHaveToInvent),
    argumentSpine,
    chapterPlan: Array.isArray(o.chapterPlan)
      ? o.chapterPlan.map((row) => {
          const c = row && typeof row === 'object' ? (row as Record<string, unknown>) : {}
          return {
            heading: str(c.heading),
            because: str(c.because),
            covers: strs(c.covers),
          }
        }).filter((c) => c.heading)
      : [],
    kitRisks: strs(o.kitRisks),
    gateWatch: strs(o.gateWatch),
    takeawayClaims: strs(o.takeawayClaims),
    faqThatDoesNotEchoH2s: strs(o.faqThatDoesNotEchoH2s),
  }
}

export function parseReflection(raw: string): DeskReflection | null {
  const o = extractJsonObject(raw)
  if (!o) return null
  const stuffing = strs(o.stuffing)
  const kitSplices = strs(o.kitSplices)
  const guesswork = strs(o.guesswork)
  const layout = strs(o.layout)
  const gateRisks = strs(o.gateRisks)
  const revisePlan = strs(o.revisePlan)
  const explicit = String(o.verdict || '').trim().toLowerCase()
  const inferred: 'ship' | 'revise' =
    stuffing.length || kitSplices.length || guesswork.length || gateRisks.length || layout.length
      ? 'revise'
      : 'ship'
  const verdict: 'ship' | 'revise' = explicit === 'ship' || explicit === 'revise' ? explicit : inferred
  return {
    throughline: str(o.throughline),
    guesswork,
    stuffing,
    kitSplices,
    layout,
    gateRisks,
    verdict,
    revisePlan,
  }
}

export function needsRewrite(reflection: DeskReflection | null, hasBlockers: boolean): boolean {
  if (hasBlockers) return true
  return reflection?.verdict === 'revise'
}

export function mergeExploreIntoBrief<T extends {
  thesis: string
  takeaways: string[]
  faqQuestions: string[]
  unresolved: string[]
}>(brief: T, explore: DeskExplore | null): T {
  if (!explore) return brief
  const unresolved = uniqueStrings([...brief.unresolved, ...explore.wouldHaveToInvent])
  return {
    ...brief,
    thesis: brief.thesis || explore.argumentSpine,
    takeaways: brief.takeaways.length ? brief.takeaways : explore.takeawayClaims.slice(0, 5),
    faqQuestions: brief.faqQuestions.length ? brief.faqQuestions : explore.faqThatDoesNotEchoH2s.slice(0, 6),
    unresolved,
  }
}

/**
 * Drop provider CoT wrappers and leaked explore/reflect JSON so the published
 * body is the article, not the thinking that produced it.
 */
export function stripDeskThinking(raw: string): string {
  let text = String(raw || '')
  text = text.replace(/<think(?:ing)?\b[^>]*>[\s\S]*?<\/think(?:ing)?>/gi, '\n')
  text = text.replace(/<reasoning\b[^>]*>[\s\S]*?<\/reasoning>/gi, '\n')
  text = text.replace(/<think(?:ing)?\b[^>]*>[\s\S]*$/gi, '\n')
  text = unwrapWholeDocumentFence(text)
  text = stripLeadingCognitionJson(text)
  text = text.replace(
    /^\s*(?:chain of thought|let'?s think step by step|reasoning|self-reflect(?:ion)?|explore)\s*:\s*[\s\S]*?(?=\n---|\n# )/i,
    '',
  )
  return text.trim()
}

export function looksLikeCognitionJson(raw: string): boolean {
  const o = extractJsonObject(raw)
  if (o) {
    return Boolean(
      o.argumentSpine ||
      o.verdict ||
      o.readerQuestion ||
      o.wouldHaveToInvent ||
      o.gateWatch ||
      o.revisePlan ||
      o.takeawayClaims ||
      o.kitRisks ||
      o.gateRisks,
    )
  }
  return COGNITION_KEYS.test(String(raw || ''))
}

function stripLeadingCognitionJson(text: string): string {
  let t = text.trim()
  const fence = t.match(/^```json\s*([\s\S]*?)```(?:\s*|$)/i)
  if (fence && looksLikeCognitionJson(fence[1])) {
    return t.slice(fence[0].length).trim()
  }
  if (t.startsWith('{')) {
    const end = matchingBrace(t, 0)
    if (end > 0 && looksLikeCognitionJson(t.slice(0, end + 1))) {
      return t.slice(end + 1).trim()
    }
  }
  return text
}

function extractJsonObject(raw: string): Record<string, unknown> | null {
  const text = String(raw || '').trim()
  if (!text) return null
  const unfenced = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  const start = unfenced.indexOf('{')
  const end = unfenced.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const parsed: unknown = JSON.parse(unfenced.slice(start, end + 1))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    return parsed as Record<string, unknown>
  } catch {
    return null
  }
}

function matchingBrace(text: string, openAt: number): number {
  let depth = 0
  let inString = false
  let escape = false
  for (let i = openAt; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escape) {
        escape = false
        continue
      }
      if (ch === '\\') {
        escape = true
        continue
      }
      if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

function str(value: unknown): string {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function strs(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return uniqueStrings(value.map((v) => str(v)))
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const v of values) {
    const t = v.trim()
    if (!t) continue
    const key = t.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(t)
  }
  return out
}
