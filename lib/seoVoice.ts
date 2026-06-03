// Voice + craft layer for the AI gig-draft path.
//
// Where lib/seoKnowledgeBase.ts answers WHAT keywords to use (380+
// competitor-mapped + Q3-strategy terms), this file answers HOW to
// write so the output sounds like a real practitioner with 10+ years
// in the niche — not a thesaurus-parade ChatGPT default.
//
// Three layers, all injected into the AI prompt by lib/seoSuggest.ts:
//
//   1. BANNED_AI_TELLS — phrases that immediately mark copy as
//      machine-generated. The strategy doc's BANNED_PHRASES (in
//      seoKnowledgeBase.ts) covers brand-safety bans ("guaranteed",
//      "fast PR"); this list covers PROSE-quality bans — the lazy
//      AI defaults every reader instantly clocks.
//
//   2. VOICE_PLAYBOOK — sentence rhythm, active voice, show-don't-tell,
//      contractions guidance, anti-throat-clearing, second-person
//      bias, no summary sentences.
//
//   3. KEYWORD_WEAVING_PLAYBOOK — the layer a senior SEO engineer
//      adds: primary-KW position, semantic clusters not exact-match
//      repetition, intent matching by position in the listing,
//      featured-snippet patterns, entity-density over keyword-density,
//      schema-friendly language, EEAT weaving.
//
// Plus FIELD_TONE_SCAFFOLDS — per-field register guidance so a TITLE
// reads as a punchy declarative service line, a PITCH reads as an
// outcome promise, an FAQ answer reads as a snippet-perfect Q+A pair,
// a DESCRIPTION reads as conversational expertise, and TIER FEATURES
// read as imperative deliverables — each calibrated to how the field
// will actually be consumed by the buyer.

// ---------- BANNED AI TELLS ----------
// Dead-giveaway phrases that immediately mark copy as machine-
// generated. Surfaced in every prompt so the model self-censors at
// generation time. Lowercase for case-insensitive comparison.
//
// Kept distinct from BANNED_PHRASES in seoKnowledgeBase.ts because
// these are PROSE-QUALITY bans (don't sound like an AI) vs the strategy
// doc's BRAND-SAFETY bans (don't make compliance-risky claims). The
// two lists are concatenated in the prompt; both fully enforced.
export const BANNED_AI_TELLS = [
  // Overused openers
  "in today's fast-paced world",
  "in today's ever-changing",
  "in the realm of",
  "in the world of",
  "in this dynamic landscape",
  "embarking on a journey",
  "embark on",
  "let me take you",
  "let's dive into",
  "as we navigate",
  // Overused verbs
  'delve into',
  'dive deep into',
  'navigate the complexities',
  'navigate the world of',
  'elevate',
  'leverage',
  'leveraging',
  'harness the power of',
  'unlock the potential',
  'unlock',
  'unleash',
  'revolutionize',
  // Overused adjectives
  'robust',
  'seamless',
  'cutting-edge',
  'transformative',
  'game-changing',
  'game-changer',
  'revolutionary',
  'comprehensive',
  'holistic',
  'synergistic',
  'ever-evolving',
  'world-class',
  'best-in-class',
  // Overused connectors
  'moreover',
  'furthermore',
  'additionally',
  'in conclusion',
  'to sum up',
  'in summary',
  "it's worth noting",
  "it's important to note",
  "it's important to remember",
  'rest assured',
  // Overused metaphors
  'rich tapestry',
  'tapestry of',
  'stand out from the crowd',
  'go the extra mile',
  'level the playing field',
  // Generic platitudes
  'your journey to success',
  'achieve your dreams',
  'a brighter future',
  'tailored to your needs',
  'one size does not fit all',
  'second to none',
] as const

// ---------- VOICE PLAYBOOK ----------
// Sentence-craft rules. Surfaced in the prompt after the SEO playbook
// (which governs keyword discipline) and before the field-specific
// task (which governs shape). The model treats these as hard rules,
// not suggestions — that's the whole point of a playbook.
export const VOICE_PLAYBOOK = [
  '## Voice + craft rules — apply to every draft',
  "V1. WRITE LIKE A PERSON WHO DOES THIS WORK. Imagine a real practitioner with 10+ years in the niche explaining their service to a serious buyer. Concrete, confident, specific. Not a marketing brochure, not a thesaurus parade, not a generic AI explainer.",
  'V2. SENTENCE RHYTHM. Vary length. Short punchy line. Then a medium-length sentence that does the real work and names the specific deliverable. Occasionally a longer sentence — but only when the content earns it. Never four sentences of the same shape in a row.',
  'V3. ACTIVE, CONCRETE, SPECIFIC. Active voice over passive. Concrete nouns (the SOP, the Common App essay, the SEC filing, the LLC operating agreement) over abstractions (your document, your application, the paperwork). Specific numbers (3 rounds of edits, 48-hour turnaround, 500-word essay, $99 base tier) over vague claims (multiple rounds, fast delivery, short essay, affordable pricing).',
  'V4. SHOW, DON\'T TELL. Bad: "I have extensive experience." Good: "I\'ve reviewed 300+ Common App essays in the last admissions cycle." Bad: "Quality is my priority." Good: "Every essay goes through two structural passes and one line-edit before delivery." Replace any claim of expertise/quality with a concrete artifact, count, or process.',
  'V5. NO THROAT CLEARING. Cut "I want to start by saying," "It\'s important to note that," "Let me take you through," "Rest assured that." Start in the buyer\'s problem or with the deliverable. The first 8 words of any field carry the most weight; don\'t waste them.',
  'V6. SKIP THE AI TELLS. The "Banned AI tells" list below contains the phrases that immediately mark copy as machine-generated. If you reach for one, rewrite from the buyer\'s specific situation instead. These exact strings will not appear in your output.',
  'V7. CONTRACTIONS IN CONVERSATIONAL FIELDS. Pitch, FAQ answers, and long-description prose — use contractions ("I\'ll", "you\'re", "won\'t", "it\'s", "you\'ll"). Titles, SEO meta, and tier features stay slightly more formal. Never write "do not" when "don\'t" reads naturally.',
  'V8. SECOND-PERSON BIAS. Address the buyer ("your statement", "you\'ll get") more than the seller ("my service offers", "we provide"). Buyer is reading; talk to them. Exception: title and pitch — those are seller-speaking-to-market, "I will".',
  'V9. TRIM ADJECTIVES. One strong adjective beats three weak ones. "A reviewed, edited, polished essay" → "A reviewed and edited essay" → in many cases just "an edited essay" reads stronger. If the adjective doesn\'t add specific information a buyer would weigh, cut it.',
  'V10. NO SUMMARY SENTENCES. Don\'t end with "In conclusion," "To sum up," or a wrapped-up restatement. The last sentence does new work — a CTA, a concrete next step, or a final specific detail.',
].join('\n')

// ---------- KEYWORD WEAVING PLAYBOOK ----------
// The layer a senior SEO engineer adds. Rules that prevent the
// model from doing the lazy "stuff the primary keyword 5 times"
// approach and instead spread topic relevance via semantic entities,
// schema-friendly structures, and featured-snippet patterns.
export const KEYWORD_WEAVING_PLAYBOOK = [
  '## Keyword weaving — the senior SEO-engineer layer',
  'K1. PRIMARY KEYWORD POSITION. The first entry in the priority list goes in the first 60 characters of any prose field (title, seo_title, seo_description, pitch). For long-form description, it goes in sentence 1 or 2 of paragraph 1. The position itself is a ranking signal — Google weights early-positioned terms more heavily.',
  'K2. NATURAL CADENCE OVER VERBATIM. If the primary keyword is 5+ words ("STEM OPT employer monitoring site visit 2026"), extract the 1-3 most salient tokens and write the rest of the sentence naturally. Forced exact-match stuffing wrecks readability AND triggers Google\'s helpful-content downweight (they\'ve scored exact-match stuffing since 2022).',
  'K3. SEMANTIC CLUSTERS, NOT REPETITION. After placing the primary keyword once, switch to semantic relatives for the next 200-300 words. If primary = "personal statement editing", weave in "essay review", "statement feedback", "draft revision", "editorial pass" instead of repeating the primary phrase. Google\'s semantic models score topic depth via co-occurring entities, not exact-match repetition.',
  'K4. INTENT MATCHING BY POSITION. Different positions in the listing match different buyer intents — write each to its native intent:',
  '   • Title + pitch: declarative service intent ("I will edit your X")',
  '   • SEO title + meta: search intent ("X service for Y audience")',
  '   • Description opening: outcome intent (what the buyer ships at the end)',
  '   • FAQ: question intent (buyers\' actual Google queries)',
  '   • Tier features: deliverable intent (what\'s literally in the box)',
  'K5. FAQ → FEATURED SNIPPETS. FAQ answers should read as standalone snippet candidates. Open the first sentence with a direct definition or answer in 40-60 words. Use the question\'s exact phrasing in the answer\'s first clause to anchor the snippet. Don\'t open with "Yes," or "No," — open with the substantive answer.',
  'K6. NO KEYWORD STUFFING. Each priority term appears at most TWICE in the entire output. If you find yourself looking for a third place to fit it, that\'s the signal to use a synonym or related entity instead.',
  'K7. ENTITY DENSITY > KEYWORD DENSITY. Modern SEO ranks pages by semantic entity coverage (people, places, documents, processes, programs). For an SOP gig: name the actual entities the buyer recognizes — "AMCAS", "Common App", "UCAS", "GRE", "MS in CS", "PhD program", "Fulbright", "Chevening", "Yale", "Wharton", "AMCAS secondary". Each named entity is a topic-relevance signal Google reads.',
  'K8. SCHEMA-FRIENDLY LANGUAGE. The following copy patterns align with how schema.org markup is parsed:',
  '   • Service offers: lead with what\'s delivered ("Two structural-edit rounds + one final proofread")',
  '   • Person bios: lead with credentials ("Former admissions reader, MS in English")',
  '   • FAQ: question-and-answer pairs — the question itself doubles as the heading-like opener',
  '   • Price/duration: specifics that Offer schema parses ("From $79 for a 500-word essay, 3-day turnaround")',
  'K9. NO META-TALK. Never write about the gig itself ("In this service, I will provide…", "This package includes…"). Write the service itself ("You\'ll get two structural-edit rounds + a final proofread"). The buyer doesn\'t want a description of the service; they want the service\'s outcome.',
  'K10. EEAT WEAVE. Drop specific Experience / Expertise / Authoritativeness / Trustworthiness signals at concrete places — not abstract claims. "I\'ve reviewed 300+ Common App essays" (E + E). "Former admissions reader at a top-30 US school" (A). "Two structural passes + one line-edit; revision rounds included" (T). One concrete signal per 100-150 words, no more.',
  'K11. FIRST-PARAGRAPH BUYER PULL. For long-form description, the first paragraph must answer the buyer\'s "is this for me?" check. Name the buyer ("graduate-school applicants targeting STEM programs in the US"), the deliverable ("a 500-word SOP with two rounds of editorial revision"), and the outcome ("a statement that reads as you, not as a template"). Three specifics, one paragraph, no preamble.',
].join('\n')

// ---------- FIELD TONE SCAFFOLDS ----------
// Per-field register guidance. Each scaffold names the field's
// native voice + the 2-3 highest-impact craft moves for that field.
// Selected and prepended to the field-specific prompt in
// buildFieldSpec, so the model sees the voice constraint BEFORE it
// sees the per-field format spec.
export type FieldName =
  | 'title' | 'seo_title' | 'seo_description'
  | 'pitch' | 'tagline' | 'description' | 'tags' | 'requirements'
  | 'faq' | 'tier_features'

export function getFieldToneScaffold(field: FieldName, role: 'attorney' | 'consultant'): string {
  switch (field) {
    case 'title':
      return [
        '### Voice — TITLE',
        'Punchy declarative service line. Starts with "I will". 50-75 chars. Names the deliverable + the buyer outcome in one breath. No adjective stacking. No "professional", "expert", "high-quality" — those are throat-clearing.',
        'Pattern that works: "I will [action verb] your [specific deliverable] for [buyer/jurisdiction]" — e.g. "I will edit your Common App personal statement for US college applications".',
        'Pattern that does NOT work: "Professional personal statement editing service for your college application journey" — adjective stack, vague action, throat-clearing, generic outcome.',
      ].join('\n')
    case 'pitch':
    case 'tagline':
      return [
        '### Voice — PITCH / TAGLINE',
        'Outcome-led punch. 80-160 chars. Names what the buyer SHIPS, not what the seller provides. Contractions OK ("you\'ll", "I\'ll"). One concrete specific minimum (a count, a turnaround, a document name).',
        'Pattern that works: "You\'ll ship a 500-word SOP that reads as you — not as a template. Two structural-edit rounds, 72-hour turnaround." (94 chars, two specifics, buyer-as-subject)',
        'Pattern that does NOT work: "I provide comprehensive personal statement editing services tailored to your needs." (88 chars, banned adjective, no specifics, generic platitude)',
      ].join('\n')
    case 'seo_title':
      return [
        '### Voice — SEO TITLE',
        'Google search-result title, 50-60 chars. Search-intent native — "X service for Y audience" or "X for Y in Z jurisdiction". Primary keyword in first 30 chars (literally — count them). NEVER starts with "I will" (that\'s the public title field, not the SEO title).',
        'Pattern that works: "SOP Writing Service for US Graduate Schools — YouSafe" (52 chars, primary KW in first 17 chars, em-dash separator).',
        'Pattern that does NOT work: "I will write your statement of purpose for graduate school" — first-person preamble, not search-intent shape.',
      ].join('\n')
    case 'seo_description':
      return [
        '### Voice — SEO DESCRIPTION (meta)',
        'Snippet-perfect 140-155 chars. Primary keyword in first 60 chars. One concrete deliverable + the jurisdiction or audience + a soft CTA fragment ("Start today.", "Book a 15-min call.", "Get a free essay review."). No trailing ellipsis. No quotation marks.',
        'Pattern that works: "Personal statement editing for US grad-school applicants. Two structural rounds, 72h turnaround, from $89. Book a free 15-min essay review." (146 chars)',
        'Pattern that does NOT work: "Professional admissions essay editing service tailored to your unique journey, with comprehensive feedback and personalized support." (133 chars, three banned adjectives, no specifics, no CTA)',
      ].join('\n')
    case 'description':
      return [
        '### Voice — LONG-FORM DESCRIPTION',
        'Conversational expertise. 500-700 words. Mostly second-person ("you\'ll get", "your essay"); first-person for credentials ("I\'ve reviewed 300+ Common App essays"). Vary paragraph length: short opener (50-80 words), medium body (100-180 words), short closer (40-60 words).',
        'Paragraph 1: BUYER PULL. Name the buyer, the deliverable, the outcome. Three specifics, one paragraph, no preamble. No "Welcome to my service".',
        'Paragraph 2: PROCESS. Name the actual steps the buyer goes through. "Step 1: you upload your draft. Step 2: I do a structural pass — line edits + macro-comments on argument structure. Step 3: you revise. Step 4: I do a final proofread + a deliverability check (word limits, formatting, school-specific quirks)."',
        'Paragraph 3: CREDENTIALS / EEAT. Specific count, specific institution type, specific document expertise. "I\'ve reviewed essays for AMCAS, Common App, UCAS, and 12 graduate-school applications across the US and UK in 2024 alone."',
        'Paragraph 4: WHAT YOU GET. Concrete deliverables list. Not adjective stack. "Two structural-edit rounds. One final proofread. A word-count + formatting check against the target school\'s spec. A 15-minute follow-up call if you want to talk through the feedback."',
        'Paragraph 5: SOFT CTA. One sentence + a specific next step. "Bring your draft and we\'ll book a 15-minute call to scope the work."',
        role === 'consultant'
          ? 'CONSULTANT CONSTRAINT: do not write language that implies licensed legal practice ("attorney review", "legal opinion", "case strategy"). You are an editorial / coaching / advisory consultant.'
          : 'ATTORNEY CONSTRAINT: precise legal-system anchors throughout (USCIS / IRCC / Home Office, form codes, statutes when relevant). Avoid colloquial substitutions ("immigration office" for USCIS, "government" for Home Office).',
      ].join('\n')
    case 'faq':
      return [
        '### Voice — FAQ',
        'Each entry is a snippet candidate. The question is phrased exactly as a buyer would type it into Google ("how long does SOP editing take", "do you guarantee admission", "can you edit my essay in 24 hours"). The answer\'s FIRST SENTENCE is a 40-60 word standalone definition or direct response — that\'s what Google pulls into a featured-snippet box.',
        'Do NOT open answers with "Yes," or "No," or "Great question!" — open with the substantive answer.',
        'Each answer ends with a concrete next step (a document name, a controlling source, a CTA). No "rest assured", no "feel free to reach out".',
        'Minimum 5 entries. Mix question types: how-long, what-do-I-get, how-much, can-you, do-you. Avoid all-yes-or-no questions.',
      ].join('\n')
    case 'tier_features':
      return [
        '### Voice — TIER FEATURES',
        'Imperative deliverables list. Each bullet is what the buyer LITERALLY GETS in that tier. ≤ 120 chars per bullet. Specific count or scope per bullet. No adjective stacks.',
        'Pattern that works: "Two structural-edit rounds on essays up to 650 words" / "One 30-minute follow-up call to walk through edits" / "Final proofread + word-count + formatting check"',
        'Pattern that does NOT work: "Comprehensive editing" / "Personalized feedback" / "Quality assurance" — abstract claims, no deliverable, banned adjectives.',
      ].join('\n')
    case 'tags':
      return [
        '### Voice — TAGS',
        'Lowercase, marketplace-search-native. 3-5 tags max. Each tag is a short term a buyer would actually type ("sop writing", "scholarship essay help", "mba personal statement"). NOT a category label ("graduate school", "academic"). NOT a generic adjective ("professional", "fast").',
      ].join('\n')
    case 'requirements':
      return [
        '### Voice — REQUIREMENTS',
        'What the seller needs from the buyer to start. Imperative, concrete, numbered or bulleted in the underlying prose. "Your current essay draft (any length)." "The school name + word limit." "Your target submission date." Skip generic asks ("any relevant information").',
      ].join('\n')
    default:
      return ''
  }
}

// ---------- SERIALIZER ----------
// Compact rendering of the banned AI tells for the prompt. Single
// line, comma-separated, double-quoted — the LLM reliably treats this
// shape as a hard exclude list.
export function getBannedAiTellsBlock(): string {
  return `BANNED AI TELLS (do NOT use any of these phrases — they immediately mark copy as machine-generated): "${BANNED_AI_TELLS.join('", "')}"`
}
