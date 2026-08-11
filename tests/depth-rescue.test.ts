/**
 * Regression tests for the extracted depth-rescue loop (lib/seoFactory/depthRescue.ts).
 *
 * Locks in the full rescue behavior with mocked providers:
 *   expand-clears   — PASS 1 full rewrite reaches the floor → done on pass 1
 *   append rotation — thin rewrite rolls into append passes with rotating focus
 *   provider failure— a throwing pass is logged and the rescue keeps going
 *   stall           — 3 consecutive no-growth passes terminate with a stall event
 *   time budget     — a wall-clock budget caps the rescue, keeping best draft
 */

import { runDepthRescue, RESCUE_MAX_MS, APPEND_FOCUSES, type DepthRescueEvent } from '@/lib/seoFactory/depthRescue'
import { countBodyWords } from '@/lib/seoFactory/contentDepth'
import { auditContent } from '@/lib/seoFactory/audit'
import { mergeAppendedSections } from '@/lib/seoFactory/prompts'

const CONTENT_TYPE = 'legal_guide'
const PRIMARY = 'student visa'
const REGION = 'US'
const MIN_WORDS = 1800
const TARGET_WORDS = 2200
const MAX_WORDS = 2800
const MIN_AUDIT = 65
const OWNERSHIP_BLOCKERS: string[] = []

/** Build a draft whose body-prose word count is EXACT. `countBodyWords` counts
 *  every whitespace token in the body, so we pad with `word` tokens until the
 *  measured body count equals `bodyWords` — the fixed skeleton words (H1,
 *  headings, disclaimer) are compensated so tests reason in exact word counts. */
function buildDraft(bodyWords: number): string {
  const skeleton = [
    '---',
    `title: Student Visa Guide`,
    `primaryKeyword: ${PRIMARY}`,
    '---',
    '',
    '# Student Visa Guide',
    '',
    'In 60 seconds: eligibility, documents, and process explained in plain language.',
    '',
    '## Eligibility Requirements',
    '',
    '## Application Process',
    '',
    '## Documents Checklist',
    '',
    '## Common Mistakes',
    '',
    '## Sources',
    '',
    '- https://example.gov/student-visa',
    '',
    'Disclaimer: educational only, not legal advice.',
  ].join('\n')
  // Measure the real body count of the skeleton, then pad with exactly enough
  // `word` tokens so the finished draft measures EXACTLY `bodyWords`.
  const fixed = countBodyWords(skeleton)
  const pad = Math.max(0, bodyWords - fixed)
  const filler = pad > 0 ? `## Eligibility Requirements\n\n${Array(pad).fill('word').join(' ')}\n\n` : ''
  return filler + skeleton
}

/** A single H2 append section whose body carries exactly `words` body words.
 *  Appends carry no front matter and no duplicate of existing skeleton. */
function buildAppendSection(heading: string, words: number): string {
  return `## ${heading}\n\n` + Array(words).fill('word').join(' ')
}

/** Wrap a deterministic text factory into the injected generateText contract. */
function makeGenerate(
  sequence: Array<{ growTo?: number; throw?: boolean; append?: string }>,
) {
  const calls: Array<{ maxTokens: number; temperature: number; prompt: string }> = []
  const gen = async (opts: { system: string; prompt: string; maxTokens: number; temperature: number; aiProvider?: string }) => {
    calls.push({ maxTokens: opts.maxTokens, temperature: opts.temperature, prompt: opts.prompt })
    const step = sequence.shift() ?? { growTo: 0 }
    if (step.throw) throw new Error('provider exploded')
    const provider = 'mock-provider'
    const model = step.append ? 'mock-append' : 'mock-expand'
    let text = ''
    if (step.append) {
      // Append passes return ONLY new sections (mirrors mergeAppendedSections).
      const merged = mergeAppendedSections(buildDraft(0), step.append)
      text = merged
    } else {
      text = (step.growTo ?? 0) > 0 ? buildDraft(step.growTo) : ''
    }
    return { text, provider, model }
  }
  return { gen, calls }
}

/** Drain the generator, collecting events + the final done payload. */
async function drain(opts: Parameters<typeof runDepthRescue>[0]) {
  const events: DepthRescueEvent[] = []
  let done: Extract<DepthRescueEvent, { type: 'done' }> | null = null
  for await (const ev of runDepthRescue(opts)) {
    events.push(ev)
    if (ev.type === 'done') done = ev
  }
  return { events, done }
}

function baseOpts(over: Partial<Parameters<typeof runDepthRescue>[0]> = {}) {
  const content = buildDraft(400)
  return {
    content,
    audit: auditContent({
      content,
      contentType: CONTENT_TYPE,
      primaryKeyword: PRIMARY,
      indexable: true,
      ownershipBlockers: OWNERSHIP_BLOCKERS,
    }),
    title: 'Student Visa Guide',
    topic: 'student visa',
    primaryKeyword: PRIMARY,
    region: REGION,
    contentType: CONTENT_TYPE,
    minWords: MIN_WORDS,
    targetWords: TARGET_WORDS,
    maxWords: MAX_WORDS,
    minAudit: MIN_AUDIT,
    indexable: true,
    ownershipBlockers: OWNERSHIP_BLOCKERS,
    // Default mock — tests override via `over.generateText`.
    generateText: async () => ({ text: '', provider: 'mock-provider', model: 'mock-default' }),
    ...over,
  }
}

describe('runDepthRescue', () => {
  it('expand pass clears the floor → done after a single rewrite pass', async () => {
    const { gen, calls } = makeGenerate([{ growTo: MIN_WORDS + 300 }])
    const { events, done } = await drain(baseOpts({ generateText: gen }))

    const progress = events.filter((e) => e.type === 'progress' && e.message.includes('Depth rescue 1/10'))
    expect(progress.length).toBe(1)
    // First pass used the full-rewrite expand prompt (16k budget)
    // maxTokens is now calculated: Math.min(16384, Math.max(2000, (minWords - currentWords) * 3))
    // should be within the 2000-16384 band
    expect(calls[0].maxTokens).toBeGreaterThanOrEqual(2000)
    expect(calls[0].maxTokens).toBeLessThanOrEqual(16384)
    expect(calls[0].prompt).toMatch(/DEPTH EXPANSION PASS/)

    expect(done).not.toBeNull()
    expect(done!.expandPasses).toBe(1)
    expect(countBodyWords(done!.content)).toBeGreaterThanOrEqual(MIN_WORDS)
    // The rewrite grew the draft — provider/model tracked from the result
    expect(done!.provider).toBe('mock-provider')
    expect(done!.model).toBe('mock-expand')
    // Stats contract: a clean single-pass rescue reports zero stalls, elapsed
    // time, and the exact budget cap the UI renders a budget bar against.
    expect(done!.stallCount).toBe(0)
    expect(done!.timeMs).toBeGreaterThanOrEqual(0)
    expect(done!.budgetMs).toBe(RESCUE_MAX_MS)
  })

  it('thin rewrite rolls into append passes with rotating focus until the floor is met', async () => {
    const appendA = buildAppendSection('Regional Nuances for Dependents', 800)
    const appendB = buildAppendSection('Fees and Processing Logistics', 800)
    const { gen, calls } = makeGenerate([
      { growTo: 700 }, // pass 1: rewrite still short
      { append: appendA }, // pass 2: append focus[0] (+800)
      { append: appendB }, // pass 3: append focus[1] (+800)
    ])
    const { done } = await drain(baseOpts({ generateText: gen }))

    // Pass 2 + 3 used the append prompt with the first two rotating focuses
    const appendCall = calls[1]
    // maxTokens is now calculated: Math.min(8000, Math.max(1500, (minWords - currentWords) * 3))
    expect(appendCall.maxTokens).toBeGreaterThanOrEqual(1500)
    expect(appendCall.maxTokens).toBeLessThanOrEqual(8000)
    expect(appendCall.prompt).toMatch(/APPEND SECTIONS ONLY/)
    expect(appendCall.prompt).toContain(`FOCUS THIS PASS ON: ${APPEND_FOCUSES[0]}`)
    expect(calls[2].prompt).toContain(`FOCUS THIS PASS ON: ${APPEND_FOCUSES[1]}`)

    expect(done).not.toBeNull()
    // 400 → 700 (rewrite) → 700+800 → +800 crosses 1800
    expect(countBodyWords(done!.content)).toBeGreaterThanOrEqual(MIN_WORDS)
    // The appended section headings are present in the merged draft
    expect(done!.content).toMatch(/Regional Nuances for Dependents/)
    expect(done!.content).toMatch(/Fees and Processing Logistics/)
    // The intro + rewritten H1 stayed (merge preserved the draft)
    expect(done!.content).toMatch(/Student Visa Guide/)
  })

  it('a throwing provider pass is logged and the rescue continues', async () => {
    const { gen } = makeGenerate([
      { throw: true }, // pass 1: provider failure
      { growTo: MIN_WORDS + 100 }, // pass 2: recovers
    ])
    const { events, done } = await drain(baseOpts({ generateText: gen }))

    expect(events.some((e) => e.type === 'progress' && e.message.includes('failed (provider exploded)'))).toBe(true)
    expect(done).not.toBeNull()
    expect(done!.expandPasses).toBe(2)
    expect(countBodyWords(done!.content)).toBeGreaterThanOrEqual(MIN_WORDS)
  })

  it('stalls after 3 consecutive no-growth passes and keeps the best draft', async () => {
    // Every pass returns an EMPTY append (mergeAppendedSections keeps the draft
    // unchanged for empty append markdown) → zero growth on every pass.
    const { gen, calls } = makeGenerate([{ append: '' }, { append: '' }, { append: '' }])
    const { events, done } = await drain(baseOpts({ generateText: gen }))

    expect(calls.length).toBe(3) // exactly 3 no-growth passes, then stall
    const stall = events.find((e) => e.type === 'progress' && e.message.includes('Depth rescue stalled'))
    expect(stall).toBeDefined()
    expect(done).not.toBeNull()
    expect(done!.expandPasses).toBe(3)
    // All three passes were no-growth, so the stall counter must read 3 — this
    // is the number surfaced on the Draft stage stats strip.
    expect(done!.stallCount).toBe(3)
    // Best draft kept — the loop never replaced content with a non-grow result
    expect(countBodyWords(done!.content)).toBe(countBodyWords(buildDraft(400)))
  })

  it('time budget caps the rescue and yields the best draft so far', async () => {
    // Mutable clock the rescue reads at start + each pass. Jump it past the
    // budget once the first pass completes so the second pass's budget check
    // fires and the rescue keeps the best draft instead of expanding forever.
    let jumps = 0
    const now = () => (++jumps > 2 ? RESCUE_MAX_MS + 1000 : 0)
    const { gen } = makeGenerate([{ growTo: 600 }, { growTo: 900 }, { growTo: 1200 }])
    const { events, done } = await drain(baseOpts({ generateText: gen, now }))

    const budget = events.find((e) => e.type === 'progress' && e.message.includes('Depth rescue time budget reached'))
    expect(budget).toBeDefined()
    expect(done).not.toBeNull()
    // Budget cut the rescue short before the floor was reached.
    expect(countBodyWords(done!.content)).toBeLessThan(MIN_WORDS)
    // The single grow (400 → 600) was kept as the best draft.
    expect(countBodyWords(done!.content)).toBe(countBodyWords(buildDraft(600)))
    // The done stats report elapsed time beyond the budget cap.
    expect(done!.timeMs).toBeGreaterThan(RESCUE_MAX_MS)
    expect(done!.budgetMs).toBe(RESCUE_MAX_MS)
  })

  it('reports expansion rounds, attempts, stalls and time budget on done', async () => {
    const appendA = buildAppendSection('Regional Nuances for Dependents', 1200)
    const { gen } = makeGenerate([
      { growTo: 700 }, // pass 1: rewrite still short (400 → 700)
      { append: appendA }, // pass 2: append crosses the floor (700 + 1200 > 1800)
    ])
    const { events, done } = await drain(baseOpts({ generateText: gen }))

    expect(done).not.toBeNull()
    // Two expand/append rounds were needed before the floor was met.
    expect(done!.expandPasses).toBe(2)
    expect(done!.attempts).toBe(2)
    expect(done!.stallCount).toBe(0)
    expect(done!.timeMs).toBeGreaterThanOrEqual(0)
    expect(done!.budgetMs).toBe(RESCUE_MAX_MS)
    // The rescue also surfaced a progress line per round for the Draft feed.
    const rescueLines = events.filter(
      (e): e is Extract<DepthRescueEvent, { type: 'progress' }> =>
        e.type === 'progress' && e.message.startsWith('Depth rescue '),
    )
    expect(rescueLines.length).toBe(2)
    expect(rescueLines[0].message).toContain('Depth rescue 1/10')
    expect(rescueLines[1].message).toContain('Depth rescue 2/10')
  })
})
