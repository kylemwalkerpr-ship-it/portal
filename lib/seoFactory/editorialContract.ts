/** Shared reader-engagement contract for every generated page and brief. */

import { writingFamilyFor } from './writingShape'

export const EDITORIAL_CONTRACT_VERSION = '2026.08.reader-engagement.v3'

/**
 * GUIDE contract (legal_guide / article). Existing imports keep this name.
 * Blogs use `blogEditorialContract()`; regional pages use the regional variant
 * via `formattingContractFor`.
 */
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
  '11. KEYWORD CONTRACT (mandatory on every draft). The brief supplies a sealed list with provenance:',
  '    - DEMAND short keywords — ≥3 distinct head terms, each ≤3 words. Each must appear at least once in the body, in context, and at most 4 times (no stuffing). Missing a demand short is a HARD blocker named missing_short_keyword on guides and regional pages; on blogs it is a WARNING, never a reason to stuff the phrase.',
  '    - DEMAND long-tail keywords — ≥4 distinct long-tail terms, each ≥4 words. Coverage is meaning in prose (the query intent lands in a bounded passage), not a forced exact 6-word string. Never paste a long-tail as the question text or as an H2. Missing a demand long-tail is a HARD blocker named missing_long_tail_keyword on guides/regional.',
  '    - SYNTHESIZED floor-fill exists only to meet the count floors. It is optional: place it only if a grammatical slot already exists. Omitting it is a warning, never a ship blocker. Never stuff an unplaceable phrase.',
  '    Distribute demand keywords across the article. Do not front-load every keyword in the first paragraphs. Do not convert a long-tail into an FAQ question or H2 — Harper cannot rewrite headings or invent a slot for a broken phrase. Outline H2s, the primary keyword, and the owner URL are frozen identity: the outline-completion hop / briefing / a human own those, never Harper.',
  '',
  '12. ANTI-WALL-OF-TEXT (mandatory on legal guides and regional pages, NOT on narrative blogs): paragraphs of 1-3 sentences, each under 180 characters. No prose block may run longer than 180 chars without a visual break — split with bullets, a numbered step, a table, a callout, or a new paragraph with a bold lead. Avoid creating long blocks: the scanner flags blocks >180 chars that also have either >520 chars or ≥5 sentences. Break sections into 2-4 short paragraphs. Blogs MAY use a 4–6 sentence developed paragraph.',
  '13. CONCRETE WORKED EXAMPLE (mandatory for long-form guides/regional): every page ≥1,000 words MUST include procedural concreteness (forms, documents, sequences). Do NOT invent a named person, testimonial, or personal story. If EXPERIENCE_BEATS are supplied in the brief, use those anonymised beats only. Label a genuine procedure "Example:" or "Worked example:" when it helps the reader. The scanner may look for "for example", "for instance", or "e.g." as a hint — never invent a protagonist to satisfy it.',
  '14. SCHEMA JSON-LD (mandatory for indexable pages): Article JSON-LD `{"@type":"Article","author":{...},"datePublished":"...","description":"..."}` must be present in every page. FAQPage JSON-LD `{"@type":"FAQPage","mainEntity":[...]}` is required when the page has 4+ FAQ sections. These are rendered by the template from the article meta, keywords, and FAQ content — do not write raw schema blocks manually. The scanner will warn (not block) if either schema type is absent. Narrative blogs do not require FAQPage.',
  '',
  '## READER-ENGAGEMENT ARTEFACTS (mandatory — these keep the reader on the page)',
  '',
  'E1. HOOK (first 40 words): open with the reader\'s exact problem or question using a concrete noun and a verb, then answer it in the same breath. No throat-clearing, no "In today\'s …", no history lesson, no dictionary definition of an obvious term.',
  'E2. SIGNPOST SUBHEADINGS: every ## H2 must read as a signpost the reader recognises — state the payoff or ask the question they would type ("What documents you need", "How long it takes", "What happens if you are refused"). Never use vague labels like "More information" or "Details".',
  'E3. SO-WHAT TEST: before keeping any sentence, paragraph, or section, ask "does this move the reader one step closer to their next action?". Cut anything that does not. Every section must earn its place; a section with no actionable takeaway is padding.',
  'E4. SENTENCE RHYTHM: vary sentence length — a short punchy sentence after a longer explanatory one. Active voice, second person ("you"), concrete nouns (agency, form, document, deadline). No two consecutive sentences the same length and no robotic repeated openers. PRONOUN CLARITY: never open a sentence with a bare "It", "This", or "They" when it stands for a specific actor (the employer, the officer, the sponsor, a named person). Repeat the noun or restructure — "The employer then compares the duties", never "It then compares". Avoid the robotic "X does A. It then does B." chain by naming the actor or joining the sentences.',
  'E5. BOLD LEAD-INS: begin long list items and paragraphs with a bolded lead phrase so a skimmer gets the point without reading the rest (`**Passport:** must be valid for six months…`).',
  'E6. FORWARD MOMENTUM: end each major section with a one-line pointer to the next action or next section so the reader is never left wondering "now what?". Avoid the saggy middle by making the middle sections procedural, not filler.',
  'E7. CONCRETE OVER ABSTRACT: replace every abstract noun with a concrete artefact — a named form (Form I-485), an agency (USCIS), a document (passport), a deadline, a fee schedule. If you cannot name the artefact, say "check the official schedule" rather than inventing one.',
  'E8. READER TRUST: distinguish official rules from practical guidance, cite primary sources with full HTTPS URLs, add a currentness note where rules change, and keep the educational disclaimer visible (see item 7).',
  'E9. VISUAL RHYTHM: alternate prose with a checklist, numbered steps, a comparison table, a worked example, or a blockquote callout — never two consecutive wall-of-text paragraphs (see items 5 and 12).',
  '',
  '## HARD FORMAT SPEC (every long-form page)',
  '',
  '- TABLE OF CONTENTS: for guides with 4+ H2 sections, open the body with exactly:',
  '    ## Table of contents',
  '    - [First section](#first-section)',
  '    - [Second section](#second-section)',
  '  Anchor = heading slug (lowercase, spaces/punctuation → hyphens). The slug',
  '  MUST exactly equal the H2 heading text written below ("Eligibility requirements"',
  '  → #eligibility-requirements). The renderer resolves these anchors; a broken',
  '  slug reads as raw markdown on the live page.',
  '',
  '- MINIMUM H2 COUNT: every page MUST have at least 4 H2 (##) sections. If the brief provides an h2Outline, follow it exactly — never drop or reorder sections. If no outline is provided, you MUST create your own H2 structure covering: overview, eligibility/requirements, process, documents, timeline, costs, FAQ (4-6 Q&A), worked example, and risks/warnings. Zero H2s is a hard failure; the scanner requires ≥4.',
  '',
  '- HEADING HIERARCHY: exactly one H1. ## for major sections only. ### only',
  '  nested directly under a ##. Never skip levels (H1 → H3), never use ####+.',
  '',
  '- COLLAPSIBLE SECTIONS: wrap long optional reading (fee tables, big checklists,',
  '  deep FAQ answers) in HTML <details><summary> blocks so the page stays',
  '  scannable. The renderer passes these through verbatim.',
  '',
  '- "IN 60 SECONDS" ANSWER BLOCK (mandatory): immediately after the opening paragraph, insert:',
  '    ## In 60 seconds',
  '    - [bullet 1: the core answer in one sentence]',
  '    - [bullet 2-5: key facts, eligibility, timeline, next step]',
  '  This block is the AI-overview / llms.txt anchor. The scanner checks for',
  '  "in 60 seconds" or "tldr" or "quick answer" or "key takeaways" — you MUST',
  '  include one of these exact headers. Without it, the page is invisible to LLM',
  '  answer engines.',
  '',
  '',
  '- SCANNABILITY: paragraphs of 1–3 sentences; bullets for sets; numbered steps',
  '  for sequences; tables only for genuine comparisons; FAQ answers that stand',
  '  alone. Bold the lead phrase of long list items.',
  '',
  '## MARKDOWN FORMAT SPEC (deterministic — the renderer converts this verbatim)',
  '',
  '- NUMBERED LISTS: use real markdown numbers for ordered steps — `1. `, `2. `,',
  '  `3. `, one per line. The renderer turns these into a numbered <ol> that keeps',
  '  the count on the live page. Never fake numbering with manual "1)", "Step 1:",',
  '  or prose — always use `N. ` lines.',
  '',
  '- BULLETS: use a single `- ` (hyphen + space) for sets and checklists. Never',
  '  mix bullets and numbers in one list; end one list and start a new one when',
  '  the type changes.',
  '',
  '- LIST ITEMS: bold the lead phrase of long items (`**Lead phrase:** rest of the',
  '  item`) and keep every item in the same grammatical form.',
  '',
  '- TABLES: for comparisons or structured facts only, emit a markdown table with',
  '  a header row, a separator row of `---`, and body rows:',
  '    | Column | Column |',
  '    | --- | --- |',
  '    | cell | cell |',
  '  The renderer converts this to a real <table>. Never write a table as plain',
  '  text or inside a code fence.',
  '',
  '- CALLOUTS: for a warning or note use a blockquote — `> **Note:** the text.`',
  '  The renderer converts this to a <blockquote>.',
  '',
  '- INLINE EMPHASIS: `**bold**` for key terms and lead-ins, `*italic*` for',
  '  references, backticks for form/field names (e.g. `Form I-485`). No ALL-CAPS',
  '  shouting.',
  '',
  '- SPACING: exactly ONE blank line between paragraphs, headings, lists, tables,',
  '  and blockquotes. Never leave two consecutive blank lines and never leave',
  '  trailing spaces at the end of a line.',
  '',
  '- PARAGRAPHS: 1–3 sentences each, under 180 characters, with the lead sentence',
  '  carrying the point.',
  '',
  'FINAL READER TEST: Could a busy reader understand the answer, scan the headings, find the relevant step, verify the source, and know the next safe action without reading every word?',
].join('\n')

const BLOG_EDITORIAL_CONTRACT = [
  `## BLOG EDITORIAL CONTRACT (${EDITORIAL_CONTRACT_VERSION} — narrative essay)`,
  '',
  'Write one specialist article. This is an essay, not a mini legal guide and not an SEO kit.',
  '',
  '1. Answer first: the opening 1–2 paragraphs state the thesis in plain English. No history lesson, no hype, no promise.',
  '2. One H1. Then 3–6 purpose-led H2s. Each H2 must advance the argument; never restate the intro.',
  '3. Paragraph rhythm MAY include a 4–6 sentence developed paragraph. Short paragraphs are welcome; a 180-character cap is NOT in force.',
  '4. Cite primary sources in the body where a fact is asserted (full HTTPS URLs). Do not dump a sources kit if the citations already live in prose. Factual blogs need at least one official citation.',
  '5. Short educational disclaimer on YMYL-adjacent topics (educational only, not legal advice). Author byline if the brief supplies one.',
  '6. One closer. Do not append a FAQ block, FAQPage JSON-LD, table of contents, or a TL;DR / answer-capsule kit unless the brief explicitly asks for it.',
  '7. Do not invent a personal anecdote, testimonial, or hypothetical protagonist. If EXPERIENCE_BEATS are supplied, use those anonymised beats only.',
  '8. Calm, precise, inclusive language. No clickbait, keyword stuffing, fake urgency, invented statistics, outcome guarantees, invented fees, dates, or URLs.',
  '9. KEYWORD CONTRACT: demand shorts appear naturally in prose (meaning coverage). Missing a demand short is a WARNING on blogs — never stuff the phrase to clear a checkbox. Long-tails: meaning in prose, not a forced exact string. Synthesized floor-fill is optional, never a ship blocker.',
  '10. Link with meaning when an allowlisted URL actually helps. Interlinks are not a ship gate for blogs. Never invent a URL.',
  '',
  'E1. HOOK (first 40 words): the reader\'s exact problem, then the answer in the same breath.',
  'E3. SO-WHAT TEST: every section earns its place by moving the thesis forward.',
  'E4. SENTENCE RHYTHM: vary sentence length. Active voice, second person ("you"). No robotic repeated openers.',
  'E8. READER TRUST: distinguish official rules from practical guidance; keep the educational disclaimer visible on YMYL-adjacent topics.',
  '',
  'HEADING HIERARCHY: exactly one H1. ## for major sections. ### only nested under a ##.',
  '',
  'FINAL READER TEST: Could a busy reader grasp the thesis, follow the argument through the H2s, verify a source, and know what to do next without reading a kit of FAQ/TOC/TL;DR blocks?',
].join('\n')

const REGIONAL_EDITORIAL_CONTRACT = [
  EDITORIAL_FORMATTING_CONTRACT,
  '',
  '## REGIONAL PAGE SHAPE (overrides FAQ count only)',
  '',
  'Regional / university / from-country pages keep the YMYL apparatus: ## In 60 seconds, procedural H2s, FAQ (3–5 Q&A, not 4–6), ## Sources, and a short educational disclaimer.',
  'Geo-specific: agencies, forms, timelines, and local context. Procedural concreteness — not an invented protagonist.',
].join('\n')

export function blogEditorialContract(): string {
  return BLOG_EDITORIAL_CONTRACT
}

export function regionalEditorialContract(): string {
  return REGIONAL_EDITORIAL_CONTRACT
}

export function formattingContractFor(contentType: string): string {
  const family = writingFamilyFor(contentType)
  if (family === 'blog' || family === 'short') return blogEditorialContract()
  if (family === 'regional') return regionalEditorialContract()
  return EDITORIAL_FORMATTING_CONTRACT
}

export function editorialBriefPromptBlock(): string {
  return [
    EDITORIAL_FORMATTING_CONTRACT,
    '',
    '## BRIEF FORMAT (required for every SEO Master Engine and GSC brief)',
    'Return a compact, skimmable brief with these labeled sections:',
    '- READER / INTENT: who is asking, what they need answered, and the safe next action.',
    '- PROMISE OF VALUE: one accurate sentence describing what the page will help the reader do; never promise an outcome.',
    '- PAGE SHAPE: recommended content type and a logical H2/H3 outline. Page shape depends on content type: blogs (blog_post, blog_summary, news_summary) are narrative essays — answer-first opening, 3–6 purpose-led H2s, no mandatory FAQ / TOC / In 60 seconds / worked-example person. Legal guides and articles keep the YMYL apparatus. Regional pages use In 60 seconds, procedural H2s, FAQ 3–5, sources, and a disclaimer.',
    '- ANSWER-FIRST: the answer the opening should deliver in 1–2 sentences.',
    '- EVIDENCE / SOURCES: official authorities, facts to verify, and freshness risks.',
    '- ENGAGEMENT DEVICES: only the useful checklist, steps, table, example, callout, FAQ, and internal-link opportunities for this query. Blogs skip kit devices that do not serve the thesis.',
    '- COMPLIANCE NOTES: YMYL boundaries, disclaimer, uncertainty, and claims to avoid.',
    '- KEYWORD COVERAGE: echo the sealed KEYWORD CONTRACT. Demand shorts (≤3 words, floor 3 distinct terms) and demand long-tails (≥4 words) are required coverage on guides/regional; on blogs a missing demand short is a warning. Synthesized floor-fill is optional. Long-tails belong in prose (meaning coverage), never as the question text and never as an H2. Note any term with no clean slot so the writer can omit it rather than force-fit. Harper cannot later invent a grammatical slot for a broken phrase.',
    'Use short labeled bullets rather than a wall of prose. Do not invent search data, fees, timelines, sources, or credentials.',
  ].join('\n')
}
