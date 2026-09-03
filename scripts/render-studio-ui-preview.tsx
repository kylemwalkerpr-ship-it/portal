/**
 * Static UI preview + E2E contract probe for the refactored Content Studio
 * components. Renders StudioStageNav + ChapterIntro to HTML with react-dom
 * so the produced DOM can be diffed against the git-HEAD inline originals
 * (ids, roles, aria attrs, classes, gold active-bubble color).
 *
 * TAB ROSTER MUST MATCH the live `TABS` in admin-content-studio.tsx — the
 * current pipeline is I Discover · II Research · III Draft & Review ·
 * IV Approve & Track · V Configure (Shop is not a nav tab until it ships
 * through shipContent).
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { StudioStageNav } from '../components/design/studio-stage-nav'
import { ChapterIntro } from '../components/design/studio-chapter-intro'

const tabs = [
  { key: 'discover', numeral: 'I', label: 'Discover', sub: 'Signal Intelligence', hint: 'GSC · radar · gaps · opportunities' },
  { key: 'research', numeral: 'II', label: 'Research', sub: 'Keywords & Brief', hint: 'Intent · keywords · interlinks · template' },
  { key: 'draft', numeral: 'III', label: 'Draft & Review', sub: 'Generate · Gate · Fix', hint: '2 jobs · queue · review' },
  { key: 'approve', numeral: 'IV', label: 'Approve & Track', sub: 'Merge · Deploy · Verify', hint: 'PR · deploy · ledger · GSC' },
  { key: 'configure', numeral: 'V', label: 'Configure', sub: 'System Settings', hint: 'AI models · API keys · GSC · health' },
] as const

const availability: Record<string, { available: boolean; reason: string }> = {
  discover: { available: true, reason: '' },
  research: { available: true, reason: '' },
  draft: { available: false, reason: 'No brief yet' },
  approve: { available: true, reason: '' },
  configure: { available: true, reason: '' },
}

const navHtml = renderToStaticMarkup(
  <StudioStageNav
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tabs={tabs as any}
    active="research"
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    availability={availability as any}
    onSelect={() => undefined}
  />,
)

const introHtml = renderToStaticMarkup(
  <ChapterIntro
    numeral="I"
    title="Discover"
    subtitle="Signal intelligence — gap detection from every source wired into the engine."
    chapterKey="discover"
    scope={[
      { chip: 'Radar', text: 'Live opportunity radar from GSC deltas' },
      { chip: 'Knowledge', text: 'Planner report of all possible works' },
    ]}
    next="Research"
    prev="Configure"
    onJump={() => undefined}
  />,
)

const checks: Array<[string, boolean]> = [
  ['nav: id=studio-tab-discover present', navHtml.includes('id="studio-tab-discover"')],
  ['nav: id=studio-tab-research present', navHtml.includes('id="studio-tab-research"')],
  ['nav: id=studio-tab-approve present', navHtml.includes('id="studio-tab-approve"')],
  ['nav: id=studio-tab-configure present', navHtml.includes('id="studio-tab-configure"')],
  ['nav: every pill is a tab with role=tab', (navHtml.match(/role="tab"/g) || []).length === 5],
  ['nav: aria-selected=true on active (research)', navHtml.includes('aria-selected="true"')],
  ['nav: aria-controls=studio-panel-research', navHtml.includes('aria-controls="studio-panel-research"')],
  ['nav: aria-controls=studio-panel-approve', navHtml.includes('aria-controls="studio-panel-approve"')],
  ['nav: aria-disabled on locked draft pill', navHtml.includes('aria-disabled="true"')],
  ['nav: disabled attr on locked draft pill', /<button[^>]*disabled[^>]*>/.test(navHtml)],
  ['nav: title carries reason on locked pill', navHtml.includes('No brief yet')],
  ['nav: active bubble gold #A07E3A', navHtml.includes('background:#A07E3A')],
  ['nav: exactly 5 numerals I..V', ['I', 'II', 'III', 'IV', 'V'].every((n) => navHtml.includes(`>${n}<`))],
  ['nav: no shop / review / track pills', !navHtml.includes('>VI<') && !navHtml.includes('>VII<')],
  ['nav: aria-label on nav', navHtml.includes('aria-label="Content Studio pipeline"')],
  ['intro: class chapter-intro', introHtml.includes('class="chapter-intro"')],
  ['intro: data-chapter=discover', introHtml.includes('data-chapter="discover"')],
  ['intro: h2 title text', introHtml.includes('<h2') && introHtml.includes('Discover</h2>')],
  ['intro: scope chip labels', introHtml.includes('Radar') && introHtml.includes('Knowledge')],
  ['intro: jump buttons prev/next', introHtml.includes('← Configure') && introHtml.includes('Research →')],
  ['intro: mini-pill numerals', introHtml.includes('>I<') && introHtml.includes('>V<')],
]

let failures = 0
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) failures++
}
console.log(`\n${checks.length - failures}/${checks.length} contract checks passed`)
process.exit(failures ? 1 : 0)