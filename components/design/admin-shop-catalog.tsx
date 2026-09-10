'use client'

import React from 'react'
import { FILE_SHOP_PRODUCTS } from '@/lib/files-shop-catalog'

const C = {
  surface: '#FFFFFF',
  surface2: '#F4F2EE',
  border: 'rgba(0,0,0,0.08)',
  text: '#1F2937',
  textMuted: '#6B7280',
  textDim: '#9CA3AF',
  cyan: '#3C3B6E',
  green: '#166534',
  serif: "var(--portal-font-display, 'Cormorant Garamond', 'Garamond', Georgia, 'Times New Roman', serif)",
}

export default function AdminShopCatalogue() {
  const products = FILE_SHOP_PRODUCTS.filter((product) => product.published)
  const immigrationCount = products.filter((product) => product.file >= '21').length

  return (
    <section aria-labelledby="admin-shop-catalogue-heading" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ color: C.textMuted, fontSize: '10px', letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 800, marginBottom: '4px' }}>
            Payhip file shop
          </div>
          <h3 id="admin-shop-catalogue-heading" style={{ fontFamily: C.serif, fontSize: '22px', fontWeight: 500, color: C.text, margin: '0 0 4px' }}>
            Complete 36-product catalogue
          </h3>
          <p style={{ margin: 0, color: C.textMuted, fontSize: '12px', lineHeight: 1.5 }}>
            {products.length} published products · {immigrationCount} immigration preparation packs · source-controlled and read-only here
          </p>
        </div>
        <a
          href="https://market.yousafeconsultancy.com/shop"
          target="_blank"
          rel="noopener noreferrer"
          style={{ padding: '8px 12px', borderRadius: '999px', border: `1px solid ${C.border}`, background: C.surface, color: C.cyan, fontSize: '12px', fontWeight: 700, textDecoration: 'none' }}
        >
          Open live shop ↗
        </a>
      </div>

      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '760px' }}>
            <thead>
              <tr style={{ background: '#0F172A' }}>
                {['#', 'Product', 'Type', 'Price', 'Destination', 'Status'].map((heading) => (
                  <th key={heading} style={{ padding: '11px 13px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.72)', whiteSpace: 'nowrap', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {products.map((product, index) => {
                const internalProductPage = product.href.startsWith('/shop/')
                const destination = internalProductPage
                  ? `https://market.yousafeconsultancy.com${product.href}`
                  : product.href
                return (
                  <tr key={product.id} style={{ borderBottom: `1px solid ${C.border}`, background: index % 2 === 0 ? C.surface : C.surface2 }}>
                    <td style={{ padding: '10px 13px', color: C.textDim, fontSize: '11px', fontFamily: 'monospace' }}>{product.file}</td>
                    <td style={{ padding: '10px 13px' }}>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: C.text, maxWidth: '360px' }}>{product.title}</div>
                      <div style={{ marginTop: '2px', fontSize: '10px', color: C.textDim, fontFamily: 'monospace' }}>{product.id}</div>
                    </td>
                    <td style={{ padding: '10px 13px', color: C.textMuted, fontSize: '11px' }}>{product.format}</td>
                    <td style={{ padding: '10px 13px', color: C.cyan, fontSize: '12px', fontWeight: 800 }}>${product.price}</td>
                    <td style={{ padding: '10px 13px' }}>
                      <a href={destination} target="_blank" rel="noopener noreferrer" style={{ color: C.cyan, fontSize: '11px', fontWeight: 700 }}>
                        {internalProductPage ? 'Shop page ↗' : 'Payhip ↗'}
                      </a>
                    </td>
                    <td style={{ padding: '10px 13px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '3px 8px', borderRadius: '999px', background: '#DCFCE7', color: C.green, fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        <span aria-hidden="true" style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22C55E' }} />
                        Published
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p style={{ margin: 0, color: C.textMuted, fontSize: '11px', lineHeight: 1.5 }}>
        Shop products are managed in source control and Payhip. The editable template table below remains the database-backed service catalogue; it is intentionally kept separate so admin edits cannot overwrite Payhip product destinations.
      </p>
    </section>
  )
}
