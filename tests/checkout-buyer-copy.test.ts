import { getBuyerMethodLabel } from '@/lib/payments/registry'

describe('buyer checkout copy', () => {
  it('uses clean YouSafe labels for buyer payment methods', () => {
    const labels = [
      getBuyerMethodLabel('pesapal', 'card', 'Pesapal Card'),
      getBuyerMethodLabel('nmi', 'card', 'NMI Card'),
      getBuyerMethodLabel('legacy', 'other', 'Payhip'),
    ]
    expect(labels.join(' ')).not.toMatch(/pesapal|\bnmi\b|payhip/i)
    expect(labels).toEqual(['Card payment', 'Card payment', 'YouSafe'])
  })
})
