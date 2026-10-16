import type { CardBrand } from '@/lib/payments/registry'
import styles from './checkout.module.css'

const labels: Record<CardBrand, string> = { visa: 'Visa', mastercard: 'Mastercard', amex: 'American Express', discover: 'Discover', jcb: 'JCB', unionpay: 'UnionPay' }

function Mark({ brand }: { brand: CardBrand }) {
  if (brand === 'visa') return <svg viewBox="0 0 40 26" aria-hidden="true"><rect width="40" height="26" rx="4" fill="#fff"/><path fill="#1434CB" d="M15.7 18.5h-3l1.9-11h3l-1.9 11Zm10.8-10.7c-.6-.2-1.5-.4-2.7-.4-3 0-5.1 1.5-5.1 3.7 0 1.6 1.5 2.5 2.7 3 1.2.6 1.6 1 1.6 1.5 0 .8-1 1.2-1.9 1.2-1.3 0-2-.2-3.1-.7l-.4-.2-.4 2.5c.8.4 2.2.7 3.7.7 3.2 0 5.3-1.5 5.3-3.8 0-1.3-.8-2.3-2.6-3.1-1.1-.5-1.8-.9-1.8-1.5 0-.5.6-1.1 1.9-1.1 1.1 0 1.9.2 2.5.5l.3.1.4-2.4Zm7.6-.3h-2.3c-.7 0-1.2.2-1.5.9l-4.2 10.1h3.2l.6-1.7h3.9l.4 1.7h2.8L34.1 7.5Zm-3.3 7.1 1.6-4.3.9 4.3h-2.5ZM10.2 7.5H5.4l-.1.3c3.5.9 5.8 2.9 6.7 5.3l-1-4.7c-.2-.7-.7-.9-1.3-.9Z"/></svg>
  if (brand === 'mastercard') return <svg viewBox="0 0 40 26" aria-hidden="true"><rect width="40" height="26" rx="4" fill="#fff"/><circle cx="16" cy="13" r="7.4" fill="#EB001B"/><circle cx="24" cy="13" r="7.4" fill="#F79E1B"/><path d="M20 7.2a7.4 7.4 0 0 1 0 11.6 7.4 7.4 0 0 1 0-11.6Z" fill="#FF5F00"/></svg>
  if (brand === 'amex') return <svg viewBox="0 0 40 26" aria-hidden="true"><rect width="40" height="26" rx="4" fill="#2E77BC"/><path fill="#fff" d="M4 8h7l1 2 1-2h7v2h-4l-1 2 1 2h4v2h-7l-1-2-1 2H4v-2h4l1-2-1-2H4V8Zm17 0h14v2h-5v1h5v2h-5v1h5v2H21V8Zm-15 9 2-4H5v-2h7l-2 4h3v2H6Zm17 0v-2h5l-2-2 2-2h-5V9h9v2l-2 2 2 2v2h-12Z"/></svg>
  if (brand === 'discover') return <svg viewBox="0 0 40 26" aria-hidden="true"><rect width="40" height="26" rx="4" fill="#fff"/><text x="4" y="15" fill="#243B7A" fontSize="6" fontWeight="700">DISCOVER</text><path fill="#F58220" d="M19 17c4-4 10-5 17-2-3 5-10 7-17 2Z"/></svg>
  const word = brand === 'jcb' ? 'JCB' : '銀聯'
  return <svg viewBox="0 0 40 26" aria-hidden="true"><rect width="40" height="26" rx="4" fill="#fff"/><text x="20" y="17" textAnchor="middle" fill={brand === 'jcb' ? '#1265A8' : '#D9222A'} fontSize="12" fontWeight="800">{word}</text></svg>
}

export default function CardBrandIcons({ brands, activeBrand }: { brands: readonly CardBrand[]; activeBrand?: CardBrand | 'unknown' }) {
  return <div className={styles.cardBrands} aria-label={`Accepted cards: ${brands.map((brand) => labels[brand]).join(', ')}`}>
    {brands.map((brand) => <span key={brand} className={`${styles.brandIcon} ${activeBrand === brand ? styles.brandActive : ''}`} title={labels[brand]}><Mark brand={brand} /></span>)}
  </div>
}
