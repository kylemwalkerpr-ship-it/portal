import { smoothSentenceRhythm } from '../lib/seoFactory/editorialScaffold'
import { evaluateContentQuality } from '../lib/seoFactory/contentQualityGate'

describe('smoothSentenceRhythm — Australia Im pattern', () => {
  it('clears 14x Australia Im corruption so gate passes', () => {
    const tails = ['imposes', 'immigration', 'implements', 'improves', 'impacts', 'includes', 'influences', 'involves', 'identifies', 'ignores', 'illustrates', 'indicates', 'informs', 'initiates']
    const lines = tails.map(t => `Australia ${t} requirements for skilled workers are well documented.`)
    const body = lines.join('. ')

    const result = smoothSentenceRhythm(body)
    expect(result.replaced).toBeGreaterThanOrEqual(8)

    const after = evaluateContentQuality({ content: result.content, contentType: 'legal_guide', primaryKeyword: 'skilled independent visa' })
    const repAfter = after.findings.find(f => f.code === 'sentence_start_repetition')
    expect(repAfter).toBeUndefined()
  })
})
