import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { validateCaseworksRenderedStructure } from '@/lib/seoFactory/contentStructureIntegrity'

const editorialProvenance = `
  author: { name: "MyCaseworks Editorial", firm: "MyCaseworks" },
  reviewer: { name: "MyCaseworks Editorial", firm: "MyCaseworks" },
  reviewStatus: "editorial-only",
`

function page(body: string, provenance = editorialProvenance): string {
  return `
const meta = {
  ${provenance}
}
export default function Page() {
  return <article><div className="prose">
    <h2 id="steps">Steps</h2>
    <ol><li>One</li><li>Two</li></ol>
    ${body}
    <h2 id="faq">FAQ</h2>
    <h3 id="q-1">What is the first question?</h3><p>Answer one.</p>
    <h3 id="q-2">What is the second question?</h3><p>Answer two.</p>
    <h3 id="q-3">What is the third question?</h3><p>Answer three.</p>
  </div></article>
}
`
}

describe('Content Studio → Caseworks rendered document integrity', () => {
  it('accepts semantic lists, aligned tables, FAQ H3s, and editorial-only provenance', () => {
    const result = validateCaseworksRenderedStructure(page(`
      <h2 id="comparison">Comparison</h2>
      <table><thead><tr><th>Option</th><th>Cost</th></tr></thead><tbody>
        <tr><td>A</td><td>$1</td></tr><tr><td>B</td><td>$2</td></tr>
      </tbody></table>
    `))
    expect(result).toEqual({ ok: true, errors: [] })
  })

  it('allows a legacy manual TOC because Caseworks suppresses it and renders the canonical TOC centrally', () => {
    const result = validateCaseworksRenderedStructure(page(`
      <h2 id="table-of-contents">Table of contents</h2>
      <ul><li><a href="#steps">Steps</a></li></ul>
    `))
    expect(result.ok).toBe(true)
  })

  it('rejects duplicate heading ids that would make TOC anchors ambiguous', () => {
    const result = validateCaseworksRenderedStructure(page('<h2 id="steps">Duplicate steps</h2>'))
    expect(result.ok).toBe(false)
    expect(result.errors.join('\n')).toMatch(/duplicate heading id "steps"/i)
  })

  it('rejects list/table markdown that leaked into prose paragraphs', () => {
    const listLeak = validateCaseworksRenderedStructure(page('<p>- Passport - Proof of funds</p>'))
    expect(listLeak.ok).toBe(false)
    expect(listLeak.errors.join('\n')).toMatch(/list marker leaked|multiple list items/i)

    const tableLeak = validateCaseworksRenderedStructure(page('<p>| Option | Cost |</p>'))
    expect(tableLeak.ok).toBe(false)
    expect(tableLeak.errors.join('\n')).toMatch(/table syntax leaked/i)
  })

  it('rejects table rows whose cell count no longer matches the header', () => {
    const result = validateCaseworksRenderedStructure(page(`
      <table><thead><tr><th>Option</th><th>Cost</th></tr></thead><tbody>
        <tr><td>A</td></tr>
      </tbody></table>
    `))
    expect(result.ok).toBe(false)
    expect(result.errors.join('\n')).toMatch(/1 cells but header has 2/i)
  })

  it('rejects flattened/broken FAQ sections', () => {
    const result = validateCaseworksRenderedStructure(`
      const meta = { reviewStatus: "editorial-only" }
      <article><div className="prose">
        <h2 id="faq">FAQ</h2><p>What is this? It is an answer.</p><p>How does it work? Another answer.</p>
      </div></article>
    `)
    expect(result.ok).toBe(false)
    expect(result.errors.join('\n')).toMatch(/semantic H3 question/i)
  })

  it('never lets editorial/generic metadata claim attorney-reviewed provenance', () => {
    const result = validateCaseworksRenderedStructure(page(
      '<h2 id="documents">Documents</h2><ul><li>Passport</li></ul>',
      `
        author: { name: "MyCaseworks Editorial", firm: "MyCaseworks" },
        reviewer: { name: "MyCaseworks Editorial", firm: "MyCaseworks" },
        reviewStatus: "attorney-reviewed",
      `,
    ))
    expect(result.ok).toBe(false)
    expect(result.errors.join('\n')).toMatch(/specific named reviewer plus credential metadata/i)
  })

  it('accepts attorney-reviewed only with a specific credentialed reviewer', () => {
    const source = page(
      '<h2 id="documents">Documents</h2><ul><li>Passport</li></ul>',
      `
        author: { name: "MyCaseworks Editorial", firm: "MyCaseworks" },
        reviewer: { name: "Jane Example", role: "Attorney", state: "New York" },
        reviewStatus: "attorney-reviewed",
      `,
    )
    expect(validateCaseworksRenderedStructure(source).ok).toBe(true)
  })

  it('is wired into the non-bypassable rendered-payload ship gate', () => {
    const shipGateSource = readFileSync(join(process.cwd(), 'lib/seoFactory/shipGate.ts'), 'utf8')
    expect(shipGateSource).toContain("import { validateCaseworksRenderedStructure } from './contentStructureIntegrity'")
    expect(shipGateSource).toContain('const structure = validateCaseworksRenderedStructure(content)')
    expect(shipGateSource).toContain('errors.push(...structure.errors)')
  })
})
