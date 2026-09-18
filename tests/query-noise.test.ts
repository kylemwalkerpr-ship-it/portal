import { isActionableDemandQuery, isJunkQuery, isJunkTopic, isFileOrUrlLikeTerm } from '@/lib/seoFactory/queryNoise'

describe('isJunkQuery — GSC noise filter', () => {
  it('flags PDF-filename + URL blobs (the failing cannibal sweep terms)', () => {
    expect(isJunkQuery('"2026-2027 stockton room and meal plan rates final.pdf" pacific.edu/sites/default/files/users/user2983')).toBe(true)
  })

  it('flags file extensions', () => {
    expect(isJunkQuery('form i-765 instructions.pdf')).toBe(true)
    expect(isJunkQuery('brochure final.docx')).toBe(true)
  })

  it('flags pasted URLs / domains', () => {
    expect(isJunkQuery('https://pacific.edu/sites/default/files/rates.pdf')).toBe(true)
    expect(isJunkQuery('www.example.com/guide')).toBe(true)
  })

  it('flags file-system path fragments', () => {
    expect(isJunkQuery('sites/default/files/users/user2983')).toBe(true)
  })

  it('flags overly long pasted strings (> 8 words)', () => {
    expect(isJunkQuery('a b c d e f g h i j')).toBe(true)
  })

  it('keeps real keyword phrases', () => {
    expect(isJunkQuery('0300 number eligibility')).toBe(false)
    expect(isJunkQuery('uk dependent visa')).toBe(false)
    expect(isJunkQuery('cpt approval letter uscis')).toBe(false)
    expect(isJunkQuery('"cpt approval letter" uscis')).toBe(false)
    expect(isJunkQuery('485 visa english requirement pte')).toBe(false)
  })

  it('flags the Work Plan leftovers that Resolve-all could not merge', () => {
    expect(isJunkQuery('"user2983" "stockton room and meal plan rates"')).toBe(true)
    expect(isJunkQuery('"stockton room and meal plan rates final" pacific')).toBe(true)
    expect(isJunkQuery('"user2983" "stockton room and meal plan rates" pacific')).toBe(true)
    expect(isJunkQuery('"2026-04" "stockton room and meal plan rates" pacific')).toBe(true)
    expect(isJunkQuery('"2026-2027 stockton room and meal plan rates" "iamhome@pacific.edu"')).toBe(true)
    expect(isJunkQuery('"issued by yale university" weekly new haven')).toBe(true)
  })

  it('treats empty/blank input as junk', () => {
    expect(isJunkQuery('')).toBe(true)
    expect(isJunkQuery('   ')).toBe(true)
  })

  it('flags bare brand and campus-CMS leftovers', () => {
    expect(isJunkQuery('yousafeconsultancy.com')).toBe(true)
    expect(isJunkQuery('yousafe')).toBe(true)
    expect(isJunkQuery('pacific.edu/sites/default/files/users/user2983')).toBe(true)
  })

  it('flags the SPACED self-brand form that GSC reported as actionable ("you safe")', () => {
    // PR #224 production proof: the live opportunities/score response surfaced
    // the estate's own brand query `you safe` even though the run-together
    // forms (`yousafe` / `yousafeconsultancy`) were already brand junk.
    expect(isJunkQuery('you safe')).toBe(true)
    expect(isJunkQuery('you safe consultancy')).toBe(true)
    expect(isJunkQuery('YOU SAFE')).toBe(true)
    expect(isJunkTopic('you safe')).toBe(true)
  })

  it('never junkes ordinary prose merely because it contains "you safe" or "safe"', () => {
    // The spaced brand rule is an EXACT-term match, so real queries keep their
    // classification: place-safety demand is off-mission (not junk) and
    // activity questions are ordinary on-mission queries.
    expect(isJunkQuery('is warwick safe for international students')).toBe(false)
    expect(isJunkQuery('are you safe to travel on a visa')).toBe(false)
    // 9 words: the pre-existing >8-word pasted-text guard is an unrelated
    // existing rule, so the brand boundary for the full sentence is proved on
    // the topic guard (same heuristics, no word-count rule).
    expect(isJunkTopic('are you safe to travel on a student visa')).toBe(false)
    expect(isJunkQuery('safe')).toBe(false)
    expect(isJunkQuery('how safe is london')).toBe(false)
  })

  it('flags BOUNDED self-brand navigational forms without junking brand-like prose', () => {
    // Review finding: the exact spaced brand was junk, but its navigational
    // forms (`you safe login`, `you safe portal`, `you safe consultancy
    // london`) still reached the score action surface. The rule stays BOUNDED
    // (brand + a closed set of navigational qualifiers), never an unbounded
    // `^you safe\b.*` that would swallow prose.
    for (const term of [
      'you safe login',
      'you safe reviews',
      'you safe app',
      'you safe portal',
      'you safe contact',
      'you safe consultancy london',
      'YOU SAFE PORTAL',
    ]) {
      expect(isJunkQuery(term)).toBe(true)
      expect(isJunkTopic(term)).toBe(true)
    }
    // Prose that merely STARTS with the brand words is real demand: the
    // trailing words are not bounded navigational qualifiers.
    expect(isJunkQuery('you safe to travel on a student visa')).toBe(false)
    expect(isJunkTopic('you safe to travel on a student visa')).toBe(false)
    expect(isJunkQuery('you safe to travel on a visa')).toBe(false)
    expect(isJunkTopic('are you safe to travel on a student visa')).toBe(false)
    expect(isJunkQuery('how do you safely apply for a visa')).toBe(false)
    expect(isJunkQuery('is warwick safe for international students')).toBe(false)
  })

  it('keeps mission-safety activity questions over the 8-word pasted-text guard junk-free', () => {
    // Final review finding: natural mission-safety questions are longer than
    // the pasted-text guard and were junked. They satisfy the campus-safety
    // activity exception (`safe for … students to <mission activity>`) and/or
    // carry explicit immigration context, so only THEY are exempt — the guard
    // itself is untouched.
    const missionSafety = [
      'is it safe for international students to work in the uk',
      'is it safe for international students to study in canada',
      'is it safe for international students to travel while on a visa',
    ]
    for (const term of missionSafety) {
      expect(isJunkQuery(term)).toBe(false)
      expect(isJunkTopic(term)).toBe(false)
      expect(isActionableDemandQuery(term)).toBe(true)
    }
    // Safety question + explicit visa context, without the student frame.
    expect(isJunkQuery('are you safe to travel on a student visa')).toBe(false)
    expect(isActionableDemandQuery('are you safe to travel on a student visa')).toBe(true)
    // The pasted-text guard is NOT removed: long blobs and long non-safety
    // queries stay junk.
    expect(isJunkQuery('a b c d e f g h i j')).toBe(true)
    expect(isJunkQuery('how to apply for a uk spouse visa step by step guide')).toBe(true)
    expect(
      isJunkQuery(
        '"2026-2027 stockton room and meal plan rates final.pdf" pacific.edu/sites/default/files/users/user2983',
      ),
    ).toBe(true)
  })

  it('flags quoted fiscal-year housing leftovers that drop the .pdf dot', () => {
    expect(isJunkQuery('"fy27 stk housing rates" pacific pdf')).toBe(true)
    expect(isJunkQuery('fy27 stk housing rates pacific pdf')).toBe(true)
    expect(isJunkQuery('"fy27 stk housing rates" pacific')).toBe(true)
  })

  it('flags the production quoted underscore fiscal-year housing artifact', () => {
    // PR #224 production proof: GSC rendered the filename stamps with
    // underscores (`fy27_stk_housing_rates`), which dodged the `\b` boundaries
    // of the document-stamp heuristics and leaked through as actionable.
    expect(isJunkQuery('"fy27_stk_housing_rates" pacific')).toBe(true)
    expect(isJunkQuery('"fy27_stk_housing_rates" pacific pdf')).toBe(true)
    expect(isJunkQuery('fy27_stk_housing_rates pacific')).toBe(true)
  })

  it('does not treat a real Pacific housing keyword as junk', () => {
    expect(isJunkQuery('university of the pacific student housing')).toBe(false)
  })

  it('keeps tenancy/legal and bounded near-campus demand out of the junk class', () => {
    // Tenancy instruments are legal intent, not malformed input.
    expect(isJunkQuery('student rental agreement')).toBe(false)
    expect(isJunkQuery('student rent agreement')).toBe(false)
    expect(isJunkQuery('student rental deposit')).toBe(false)
    expect(isJunkQuery('student security deposit rights')).toBe(false)
    // Bounded near-campus demand is REAL (observable) demand — off-mission,
    // never junk.
    expect(isJunkQuery('student rent near university')).toBe(false)
    expect(isJunkQuery('rooms near university campus')).toBe(false)
    expect(isJunkQuery('international student self storage')).toBe(false)
    // Bare everyday uses of rent/room/storage stay ordinary keywords.
    expect(isJunkQuery('storage locker rental prices')).toBe(false)
    expect(isJunkQuery('room cleaning checklist')).toBe(false)
  })

  it('keeps opt-out / opt-in process demand observable, but refuses it as a topic', () => {
    // Diff review finding: `on\s+opt` matched the ordinary verb inside
    // "opt out" / "opt-in", so dining/housing process rows were treated as
    // immigration-status demand. They are REAL (observable) demand — never
    // junk — and off-mission, never actionable.
    for (const term of [
      'meal plan information on opt out',
      'meal plan details on opt-out',
      'student housing details on opt-in',
      'student housing details on opt in',
    ]) {
      expect(isJunkQuery(term)).toBe(false)
      expect(isJunkTopic(term)).toBe(true)
      expect(isActionableDemandQuery(term)).toBe(false)
    }
    // The unambiguous status phrase keeps its anchor.
    expect(isJunkQuery('is it safe for international students on opt')).toBe(false)
    expect(isJunkTopic('is it safe for international students on opt')).toBe(false)
    expect(isActionableDemandQuery('is it safe for international students on opt')).toBe(true)
    // Bare dining opt-out never had the anchor and stays observable.
    expect(isJunkQuery('meal plan opt out')).toBe(false)
  })

  it('decodes plus-encoding before classifying', () => {
    expect(isJunkQuery('international+student+storage+cornell')).toBe(false)
    expect(isJunkQuery('form+i-765+instructions.pdf')).toBe(true)
  })
})

describe('isFileOrUrlLikeTerm — intake guard', () => {
  it('flags file extensions, URLs, and CMS path fragments', () => {
    expect(isFileOrUrlLikeTerm('"2026-2027 stockton room and meal plan rates final.pdf" pacific.edu/sites/default/files/users/user2983')).toBe(true)
    expect(isFileOrUrlLikeTerm('form i-765 instructions.pdf')).toBe(true)
    expect(isFileOrUrlLikeTerm('https://pacific.edu/sites/default/files/rates.pdf')).toBe(true)
    expect(isFileOrUrlLikeTerm('sites/default/files/users/user2983')).toBe(true)
  })

  it('keeps long-but-clean topics (no word-count heuristic)', () => {
    expect(isFileOrUrlLikeTerm('can i work on a student visa in the uk during holidays')).toBe(false)
    expect(isFileOrUrlLikeTerm('how to apply for a uk spouse visa step by step guide')).toBe(false)
  })

  it('keeps ordinary keyword phrases', () => {
    expect(isFileOrUrlLikeTerm('uk dependent visa')).toBe(false)
    expect(isFileOrUrlLikeTerm('cpt approval letter uscis')).toBe(false)
  })

  it('treats empty input as not file/url-like (callers handle empty)', () => {
    expect(isFileOrUrlLikeTerm('')).toBe(false)
    expect(isFileOrUrlLikeTerm('   ')).toBe(false)
  })
})
