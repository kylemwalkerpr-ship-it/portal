import { detectCardBrand, formatCardNumber, formatCurrencyAmount, formatCvc, formatExpiry } from '@/lib/payments/inputMask'
import { getBuyerMethodLabel } from '@/lib/payments/registry'

describe('payment input helpers', () => {
  it('detects supported brands by card prefix', () => {
    expect(detectCardBrand('4111')).toBe('visa')
    expect(detectCardBrand('5555')).toBe('mastercard')
    expect(detectCardBrand('3714')).toBe('amex')
    expect(detectCardBrand('6011')).toBe('discover')
  })

  it('formats standard and Amex numbers in their expected groups', () => {
    expect(formatCardNumber('4111-1111 1111 1111')).toBe('4111 1111 1111 1111')
    expect(formatCardNumber('378282246310005')).toBe('3782 822463 10005')
  })

  it('formats expiry, limits security code length and currency amounts', () => {
    expect(formatExpiry('1228')).toBe('12/28')
    expect(formatCvc('123456', 'amex')).toBe('1234')
    expect(formatCvc('123456')).toBe('123')
    expect(formatCurrencyAmount('25.5')).toBe('$25.50')
  })

  it('uses YouSafe buyer labels for card options regardless of provider', () => {
    expect(getBuyerMethodLabel('pesapal', 'card', 'Pesapal Card')).toBe('Card payment')
    expect(getBuyerMethodLabel('nmi', 'card', 'NMI Card')).toBe('Card payment')
    expect(getBuyerMethodLabel('legacy', 'other', 'Payhip')).toBe('YouSafe')
  })
})
