import type { CardBrand } from '@/lib/payments/registry'
import styles from './checkout.module.css'

const labels: Record<CardBrand, string> = { visa: 'Visa', mastercard: 'Mastercard', amex: 'American Express', discover: 'Discover', jcb: 'JCB', unionpay: 'UnionPay' }

function Mark({ brand }: { brand: CardBrand }) {
  if (brand === 'visa') return <svg viewBox="0 0 44 28" aria-hidden="true"><rect width="44" height="28" rx="4" fill="#fff"/><path fill="#1434CB" d="m13.9 7.7-2.5 7.1-.3-1.4c-.5-1.7-2-3.5-3.8-4.4l2.4 9h2.8l4.2-10.3h-2.8Zm-5.1 0H4.7l-.1.3c3.2.8 5.3 2.7 6.2 5L9.7 8.5c-.2-.6-.6-.8-.9-.8Zm8.9 10.3 3.1-10.3h2.7l-3.1 10.3h-2.7Zm12.2-10c-.5-.2-1.4-.5-2.5-.5-2.6 0-4.6 1.3-4.6 3.2 0 1.4 1.2 2.1 2.1 2.6 1 .5 1.3.8 1.3 1.2 0 .7-.8 1-1.6 1-1.1 0-1.7-.2-2.5-.6l-.4-.2-.4 2.3c.7.3 1.9.6 3.2.6 2.8 0 4.7-1.4 4.7-3.5 0-1.2-.7-2-2.3-2.8-1-.5-1.5-.8-1.5-1.3 0-.4.5-1 1.7-1 .8 0 1.6.2 2.1.4l.3.1.4-2Zm6.3-.3h-2.1c-.6 0-1.1.2-1.4.8l-3.9 9.5h2.8l.6-1.6h3.5l.3 1.6h2.5L36.2 7.7Zm-3.3 6.7 1.4-3.8.8 3.8h-2.2Z"/></svg>
  if (brand === 'mastercard') return <svg viewBox="0 0 44 28" aria-hidden="true"><rect width="44" height="28" rx="4" fill="#fff"/><circle cx="18" cy="14" r="9" fill="#EB001B"/><circle cx="26" cy="14" r="9" fill="#F79E1B"/><path d="M22 6.1a9 9 0 0 1 0 15.8 9 9 0 0 1 0-15.8Z" fill="#FF5F00"/></svg>
  if (brand === 'amex') return <svg viewBox="0 0 44 28" aria-hidden="true"><rect width="44" height="28" rx="3" fill="#2E77BC"/><path fill="#fff" d="M3 9h8l2 3 2-3h8v2h-6l-2 2 2 2h6v2h-8l-2-3-2 3H3v-2h5l2-2-2-2H3V9Zm22 0h16v2h-6v1h6v2h-6v1h6v3H25V9ZM4 19l3-5h-3v-2h9l-3 4h3v3H4Zm21 0v-2h6l-2-2 2-2h-6v-2h12v2l-3 2 3 2v2H25Z"/></svg>
  if (brand === 'discover') return <svg viewBox="0 0 40 26" aria-hidden="true"><rect width="40" height="26" rx="4" fill="#fff"/><text x="4" y="15" fill="#243B7A" fontSize="6" fontWeight="700">DISCOVER</text><path fill="#F58220" d="M19 17c4-4 10-5 17-2-3 5-10 7-17 2Z"/></svg>
  const word = brand === 'jcb' ? 'JCB' : '銀聯'
  return <svg viewBox="0 0 40 26" aria-hidden="true"><rect width="40" height="26" rx="4" fill="#fff"/><text x="20" y="17" textAnchor="middle" fill={brand === 'jcb' ? '#1265A8' : '#D9222A'} fontSize="12" fontWeight="800">{word}</text></svg>
}

export default function CardBrandIcons({ brands, activeBrand }: { brands: readonly CardBrand[]; activeBrand?: CardBrand | 'unknown' }) {
  return <div className={styles.cardBrands} aria-label={`Accepted cards: ${brands.map((brand) => labels[brand]).join(', ')}`}>
    {brands.map((brand) => <span key={brand} className={`${styles.brandIcon} ${activeBrand === brand ? styles.brandActive : ''} ${activeBrand && activeBrand !== 'unknown' && activeBrand !== brand ? styles.brandDimmed : ''}`}><Mark brand={brand} /></span>)}
  </div>
}
