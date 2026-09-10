import fs from 'node:fs'
import path from 'node:path'

const source = fs.readFileSync(path.join(process.cwd(), 'components/marketplace/GigDetailPage.tsx'), 'utf8')

describe('Marketplace GA4 purchase contract', () => {
  it('fires purchase only from the confirmed-order success path with dedupe and revenue fields', () => {
    expect(source).toContain("import { trackPurchase } from '@/lib/analytics/ga4'")
    expect(source).toContain('const orderId = payload?.orderId || payload?.order?.id || null')
    expect(source).toContain('const purchaseKey = `ys_ga4_purchase_${orderId}`')
    expect(source).toContain('if (!window.sessionStorage.getItem(purchaseKey))')
    expect(source).toContain('trackPurchase({')
    expect(source).toContain('transaction_id: orderId')
    expect(source).toContain('value,')
    expect(source).toContain("currency: 'USD'")
    expect(source).toContain('window.sessionStorage.setItem(purchaseKey')
    expect(source.indexOf('const orderId = payload?.orderId')).toBeLessThan(source.indexOf('trackPurchase({'))
  })
})
