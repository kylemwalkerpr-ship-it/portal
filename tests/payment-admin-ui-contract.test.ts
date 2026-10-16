import fs from 'node:fs'

describe('payment provider admin UI accessibility and viewport contract', () => {
  it('provides semantic section labels, explicit input names, and visible keyboard focus', () => {
    const component = fs.readFileSync('components/admin/payments/ProvidersPage.tsx', 'utf8')
    const css = fs.readFileSync('components/admin/payments/providers-page.module.css', 'utf8')
    expect(component).toContain('aria-labelledby="providers-heading"')
    expect(component).toContain('aria-labelledby="methods-heading"')
    expect(component).toContain('aria-labelledby="audit-heading"')
    expect(component).toContain('aria-label={`${provider.label} owner test allowlist`}')
    expect(component).toContain('aria-label={`${provider.label} ${method.label} minimum USD equivalent`}')
    expect(css).toContain('.page button:focus-visible')
  })

  it('switches to stacked provider rows and method cards for narrow screens', () => {
    const css = fs.readFileSync('components/admin/payments/providers-page.module.css', 'utf8')
    expect(css).toMatch(/@media \(max-width: 980px\)/)
    expect(css).toMatch(/@media \(max-width: 760px\)/)
    expect(css).toMatch(/@media \(max-width: 430px\)/)
    expect(css).toContain('.methodTable tbody tr { display: grid;')
    expect(css).toContain('.providerRow { grid-template-columns: 1fr;')
  })

  it('routes the legacy page to the payment provider Settings tab', () => {
    const page = fs.readFileSync('app/admin/payments/providers/page.tsx', 'utf8')
    expect(page).toContain("redirect('/dashboard/admin/settings?tab=payments')")
  })

  it('registers a persistent Payment providers tab and requires a reason before saving', () => {
    const settings = fs.readFileSync('components/design/admin.jsx', 'utf8')
    const component = fs.readFileSync('components/admin/payments/ProvidersPage.tsx', 'utf8')
    expect(settings).toContain("{ id: 'payments', label: 'Payment providers', icon: '💳' }")
    expect(settings).toContain('TABS.some(x => x.id === t)')
    expect(component).toContain('!reason.trim()')
    expect(component).toContain('placeholder="Required for the audit log"')
  })
})
