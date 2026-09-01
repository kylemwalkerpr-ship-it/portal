import { readFileSync } from 'fs'
import { join } from 'path'

const source = readFileSync(join(process.cwd(), 'components/design/admin-content-studio.tsx'), 'utf8')

describe('Draft workspace performance and handoff contract', () => {
  it('keeps SSE text out of parent state and samples it inside the isolated editor', () => {
    expect(source).toContain("const generationBufRef = React.useRef('')")
    expect(source).toContain('generationBuffer: React.MutableRefObject<string>')
    expect(source).toContain('}, 900)')
    expect(source).not.toContain('generationFlushTimerRef')
    expect(source).not.toContain('setGenerationChars')
  })

  it('does not mount the expensive queue and review trees while streaming', () => {
    expect(source).toContain("tab === 'draft' && !generating && draftOperationsOpen")
    expect(source).toContain('setDraftOperationsOpen(false)')
  })

  it('uses a lightweight memoized published-page renderer instead of reparsing markdown per paint', () => {
    expect(source).toContain('const StudioDocPage = React.memo')
    // The published-format page hides pipeline metadata (YAML + JSON-LD).
    expect(source).toContain('<script\\b[^>]*>[\\s\\S]*?<\\/script>')
    // Word-like chrome is gone; docs-style header replaced it.
    expect(source).not.toContain('YouSafe Writer')
    expect(source).not.toContain('Draft editor menu')
    expect(source).not.toContain('<MarkdownDocument source={generationText}')
  })

  it('keeps exactly one Generate Draft handoff', () => {
    expect(source.match(/Generate Draft →/g) || []).toHaveLength(1)
  })
})
