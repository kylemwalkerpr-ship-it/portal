import { isJunkQuery } from '@/lib/seoFactory/queryNoise'

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
    expect(isJunkQuery('485 visa english requirement pte')).toBe(false)
  })

  it('treats empty/blank input as junk', () => {
    expect(isJunkQuery('')).toBe(true)
    expect(isJunkQuery('   ')).toBe(true)
  })
})
