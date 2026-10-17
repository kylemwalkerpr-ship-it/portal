export type DetectedCardBrand = 'visa' | 'mastercard' | 'amex' | 'discover' | 'jcb' | 'unionpay' | 'unknown'

export function detectCardBrand(value: string): DetectedCardBrand {
  const digits = value.replace(/\D/g, '')
  if (/^4/.test(digits)) return 'visa'
  if (/^(5[1-5]|2(2[2-9]|[3-6]\d|7[01]|720))/.test(digits)) return 'mastercard'
  if (/^(34|37)/.test(digits)) return 'amex'
  if (/^(6011|65|64[4-9]|622)/.test(digits)) return 'discover'
  if (/^(35)/.test(digits)) return 'jcb'
  if (/^(62)/.test(digits)) return 'unionpay'
  return 'unknown'
}

export function formatCardNumber(value: string, brand = detectCardBrand(value)): string {
  const digits = value.replace(/\D/g, '').slice(0, brand === 'amex' ? 15 : 19)
  if (brand === 'amex') return [digits.slice(0, 4), digits.slice(4, 10), digits.slice(10, 15)].filter(Boolean).join(' ')
  return digits.match(/.{1,4}/g)?.join(' ') || ''
}

export function formatExpiry(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 4)
  return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits
}

export function formatCvc(value: string, brand: DetectedCardBrand = 'unknown'): string {
  return value.replace(/\D/g, '').slice(0, brand === 'amex' ? 4 : 3)
}

export function formatCurrencyAmount(value: string, currency = 'USD', locale = 'en-US'): string {
  const digits = value.replace(/[^\d.]/g, '')
  const [whole = '', ...fractionParts] = digits.split('.')
  const fraction = fractionParts.join('').slice(0, 2)
  if (!whole && !fraction) return ''
  const number = Number(`${whole || '0'}${fraction ? `.${fraction}` : ''}`)
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(number)
}
