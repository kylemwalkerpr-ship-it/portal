/** Shared reader-engagement contract for every generated page and brief. */

export const EDITORIAL_CONTRACT_VERSION = '2026.08.reader-engagement.v1'

export const EDITORIAL_FORMATTING_CONTRACT = [
  `## READER-ENGAGEMENT AND EDITORIAL FORMAT CONTRACT (${EDITORIAL_CONTRACT_VERSION})`,
  '',
  'Write for a person who needs a clear next step, not for a word-count target or a crawler.',
  '1. Answer first: in the opening 1–2 paragraphs, answer the primary question in plain English. Do not begin with history, hype, or a promise.',
  '2. Build a reading path: one H1, descriptive H2s, nested H3s only when needed, and a short table of contents for long guides. Never skip heading levels for styling.',
  '3. Make it scannable: use short paragraphs (usually 1–3 sentences), informative lead sentences, bullets for sets, numbered steps for sequences, and tables only for genuine comparisons or structured facts.',
  '4. Add usable detail: explain who a step is for, what to prepare, what can change, common mistakes, and what to do next. Prefer concrete forms, agencies, documents, dates, and examples over abstract advice.',
  '5. Use deliberate visual rhythm: alternate explanatory prose with a checklist, process, comparison, example, or callout when it improves comprehension. Never add decorative lists or tables that repeat the prose.',
  '6. Make sections self-contained for answer engines: define the term, state the qualification or caveat, then explain the action. FAQ answers must answer the question directly and stand alone.',
  '7. Earn trust: distinguish official rules from practical guidance, cite authoritative primary sources with full HTTPS URLs, include a currentness note where rules change, and keep YMYL disclaimers visible.',
  '8. Link with meaning: use contextual internal links with descriptive anchor text and explain why the destination helps. Never use “click here” or inject unrelated links.',
  '9. Use calm, precise, inclusive language. No clickbait, keyword stuffing, fake urgency, invented statistics, unsupported testimonials, outcome guarantees, or manipulative “keep reading” teasers.',
  '10. Keep variation topic-led: blogs may be lighter and more narrative; procedural guides may use steps and checklists; comparisons may use a table. Apply the principles without forcing identical headings.',
  '',
  'FINAL READER TEST: Could a busy reader understand the answer, scan the headings, find the relevant step, verify the source, and know the next safe action without reading every word?',
].join('\n')

export function editorialBriefPromptBlock(): string {
  return [
    EDITORIAL_FORMATTING_CONTRACT,
    '',
    '## BRIEF FORMAT (required for every SEO Master Engine and GSC brief)',
    'Return a compact, skimmable brief with these labeled sections:',
    '- READER / INTENT: who is asking, what they need answered, and the safe next action.',
    '- PROMISE OF VALUE: one accurate sentence describing what the page will help the reader do; never promise an outcome.',
    '- PAGE SHAPE: recommended content type and a logical H2/H3 outline.',
    '- ANSWER-FIRST: the answer the opening should deliver in 1–2 sentences.',
    '- EVIDENCE / SOURCES: official authorities, facts to verify, and freshness risks.',
    '- ENGAGEMENT DEVICES: only the useful checklist, steps, table, example, callout, FAQ, and internal-link opportunities for this query.',
    '- COMPLIANCE NOTES: YMYL boundaries, disclaimer, uncertainty, and claims to avoid.',
    'Use short labeled bullets rather than a wall of prose. Do not invent search data, fees, timelines, sources, or credentials.',
  ].join('\n')
}
