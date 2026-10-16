import fs from 'node:fs'
import path from 'node:path'

describe('hosted card brand icons', () => {
  it('provides brands for hosted card methods and renders card icons independent of mode', () => {
    const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8')
    const api = read('app/api/payments/methods/route.ts')
    const checkout = read('components/checkout/Checkout.tsx')
    const preview = read('app/dev/market-checkout-preview/page.tsx')

    expect(api).toContain("method.id === 'card' ? { supportedBrands: supportedBrandsByProvider[method.provider] || [] }")
    expect(checkout).toContain("choice.method.id === 'card' ? <span className={styles.methodBrands}><CardBrandIcons")
    expect(checkout).toContain('choice.method.supportedBrands || supportedBrandsByProvider[choice.method.provider] || []')
    expect(preview).toContain("id: 'card'")
    expect(preview).toContain("supportedBrands: ['visa', 'mastercard', 'amex']")
  })
})
