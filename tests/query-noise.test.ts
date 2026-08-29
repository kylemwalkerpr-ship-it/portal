import { isJunkQuery, isFileOrUrlLikeTerm } from '@/lib/seoFactory/queryNoise'

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
