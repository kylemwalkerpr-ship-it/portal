import { topicPathMismatch } from '@/lib/seoFactory/topicPathGuard'

describe('topicPathMismatch — ship-refuse guard (topic vs path last slug)', () => {
  it('refuses asylum topic shipped to an OPT slug (live defect)', () => {
    const err = topicPathMismatch(
      'asylum application process for iranians in the us',
      'asylum application process',
      'content/us/opt-stem-opt-complete-guide.md',
    )
    expect(typeof err).toBe('string')
    expect(err).toContain('Content-topic mismatch')
    expect(err).toContain('opt-stem-opt-complete-guide')
  })

  it('passes when topic tokens match the slug', () => {
    expect(
      topicPathMismatch(
        'uk student visa requirements',
        'uk student visa requirements',
        'content/uk/uk-student-visa-requirements-2026.md',
      ),
    ).toBeNull()
  })

  it('matches via primaryKeyword tokens too', () => {
    expect(
      topicPathMismatch('Everything students must know', 'h1b cap registration', 'content/us/h1b-cap-registration-guide.md'),
    ).toBeNull()
  })

  it('ignores stopwords like guide/complete/application', () => {
    expect(
      topicPathMismatch('complete guide', 'the application', 'content/us/opt-stem-opt-complete-guide.md'),
    ).toBeNull()
  })

  it('returns null when the path has no slug or inputs are empty', () => {
    expect(topicPathMismatch('', '', 'content/us/')).toBeNull()
    expect(topicPathMismatch('asylum', '', '')).toBeNull()
    expect(topicPathMismatch('', 'asylum', '/')).toBeNull()
  })
})
