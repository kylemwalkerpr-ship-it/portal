'use client'

import Link from 'next/link'
import { useCart } from './CartProvider'

export function CartIcon() {
  const { itemCount } = useCart()

  return (
    <Link
      href="/marketplace/cart"
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '36px',
        height: '36px',
        borderRadius: '8px',
        background: 'rgba(255,255,255,0.08)',
        color: '#fff',
        textDecoration: 'none',
        fontSize: '16px',
      }}
      aria-label="Shopping cart"
    >
      🛒
      {itemCount > 0 && (
        <span
          style={{
            position: 'absolute',
            top: '-4px',
            right: '-4px',
            minWidth: '18px',
            height: '18px',
            padding: '0 5px',
            borderRadius: '9px',
            background: '#C4A45A',
            color: '#0F172A',
            fontSize: '10px',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {itemCount > 9 ? '9+' : itemCount}
        </span>
      )}
    </Link>
  )
}
