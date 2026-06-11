'use client'

import React from 'react'
import Link from 'next/link'

const sans = "var(--portal-font-body, -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif)"
const serif = "var(--portal-font-display, 'Cormorant Garamond', 'Garamond', Georgia, 'Times New Roman', serif)"

interface TemplateItem {
  slug: string
  name: string
  category: string
  short_description: string
  includes: string[]
  purchased_at: string
  order_id: string
}

export default function MyTemplatesView({ items }: { items: TemplateItem[] }) {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#F7F5F0',
      fontFamily: sans,
      color: '#1A1F2E',
    }}>
      <div style={{ height: '3px', background: 'linear-gradient(90deg, #9A7B3B 0%, #C4A45A 50%, #9A7B3B 100%)' }} />

      <header style={{ background: '#FFFFFF', borderBottom: '1px solid #DDD8CE' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto', padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', flexWrap: 'wrap' as const }}>
            <Link href="/dashboard" style={{ fontSize: '12px', color: '#5C6070', textDecoration: 'none', fontWeight: 600 }}>
              ← Dashboard
            </Link>
            <span style={{ color: '#DDD8CE' }}>/</span>
            <span style={{ fontSize: '12px', color: '#9097A8' }}>My Templates</span>
          </div>
          <h1 style={{
            fontFamily: serif,
            fontSize: 'clamp(24px, 4vw, 32px)',
            fontWeight: 600,
            color: '#0F172A',
            margin: '8px 0 4px',
            letterSpacing: '-0.015em',
          }}>
            My Templates
          </h1>
          <p style={{ margin: 0, fontSize: '13px', color: '#5C6070' }}>
            Every template pack you&apos;ve purchased — re-download any time.
          </p>
        </div>
      </header>

      <main style={{ maxWidth: '900px', margin: '0 auto', padding: '28px 24px 80px' }}>
        {items.length === 0 ? (
          <EmptyState />
        ) : (
          <div style={{ display: 'grid', gap: '14px' }}>
            {items.map((item) => <TemplateCard key={`${item.slug}-${item.order_id}`} item={item} />)}
          </div>
        )}

        <div style={{
          marginTop: '32px',
          padding: '14px 18px',
          background: '#FFFFFF',
          border: '1px solid #E8E4DC',
          borderRadius: '8px',
          fontSize: '12px',
          color: '#5C6070',
          lineHeight: 1.6,
        }}>
          <strong style={{ color: '#0F172A' }}>Need help?</strong> If a download link fails or a file doesn&apos;t open,
          email <a href="mailto:support@yousafeconsultancy.com" style={{ color: '#3C3B6E', fontWeight: 600 }}>
            support@yousafeconsultancy.com
          </a> with the order ID shown on each card.
        </div>
      </main>
    </div>
  )
}

function EmptyState() {
  return (
    <div style={{
      padding: '48px 24px',
      background: '#FFFFFF',
      border: '1px dashed #C8C2B6',
      borderRadius: '10px',
      textAlign: 'center' as const,
    }}>
      <div style={{ fontSize: '32px', marginBottom: '12px' }}>📂</div>
      <h2 style={{ fontFamily: serif, fontSize: '20px', fontWeight: 600, color: '#0F172A', margin: '0 0 8px' }}>
        You haven&apos;t bought any templates yet
      </h2>
      <p style={{ fontSize: '14px', color: '#5C6070', lineHeight: 1.55, margin: '0 auto 18px', maxWidth: '420px' }}>
        Template packs are instant-download digital kits — checklists, worksheets, and letter templates
        organised by visa type and country.
      </p>
      <Link
        href="/marketplace/templates"
        style={{
          display: 'inline-block',
          padding: '10px 22px',
          background: '#0F172A',
          color: '#FFFFFF',
          fontSize: '13px',
          fontWeight: 600,
          borderRadius: '6px',
          textDecoration: 'none',
          letterSpacing: '0.01em',
        }}
      >
        Browse template packs →
      </Link>
    </div>
  )
}

function TemplateCard({ item }: { item: TemplateItem }) {
  const [downloading, setDownloading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const handleDownload = async () => {
    setDownloading(true)
    setError(null)
    try {
      // The endpoint 302s to a 60s signed Supabase URL. Navigating
      // directly via window.location lets the browser follow the
      // redirect AND the resulting Content-Disposition: attachment
      // so the file lands in Downloads (vs. opening in a tab).
      window.location.href = `/api/templates/download/${encodeURIComponent(item.slug)}`
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the download.')
    } finally {
      // Re-enable after a short window in case the redirect navigates
      // (button never visually re-enables; on error it does).
      setTimeout(() => setDownloading(false), 1500)
    }
  }

  return (
    <div
      style={{
        background: '#FFFFFF',
        border: '1px solid #E8E4DC',
        borderLeft: '3px solid #1A6B45',
        borderRadius: '10px',
        padding: '18px 22px',
        display: 'flex',
        flexDirection: 'column' as const,
        gap: '10px',
        boxShadow: '0 1px 3px rgba(15,23,42,0.04)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '14px', flexWrap: 'wrap' as const }}>
        <div style={{ flex: '1 1 280px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px', flexWrap: 'wrap' as const }}>
            <span style={{
              fontSize: '10px',
              fontWeight: 700,
              padding: '2px 7px',
              borderRadius: '4px',
              background: '#F7F5F0',
              color: '#5C6070',
              textTransform: 'uppercase' as const,
              letterSpacing: '0.06em',
            }}>
              {item.category}
            </span>
            <span style={{
              fontSize: '10px',
              fontWeight: 700,
              padding: '2px 7px',
              borderRadius: '4px',
              background: '#EAF5EE',
              color: '#1A6B45',
              textTransform: 'uppercase' as const,
              letterSpacing: '0.06em',
            }}>
              Paid
            </span>
          </div>
          <h3 style={{
            fontFamily: serif,
            fontSize: '17px',
            fontWeight: 600,
            color: '#0F172A',
            margin: 0,
            lineHeight: 1.25,
            letterSpacing: '-0.01em',
          }}>
            {item.name}
          </h3>
          <p style={{
            margin: '4px 0 0',
            fontSize: '12.5px',
            color: '#5C6070',
            lineHeight: 1.5,
          }}>
            {item.short_description}
          </p>
        </div>
        <button
          type="button"
          onClick={handleDownload}
          disabled={downloading}
          style={{
            padding: '8px 18px',
            borderRadius: '6px',
            background: downloading ? '#5C6070' : '#0F172A',
            color: '#FFFFFF',
            fontSize: '13px',
            fontWeight: 700,
            border: 'none',
            cursor: downloading ? 'wait' : 'pointer',
            fontFamily: sans,
            whiteSpace: 'nowrap' as const,
            letterSpacing: '0.01em',
          }}
        >
          {downloading ? 'Starting…' : '↓ Download'}
        </button>
      </div>

      {error && (
        <div style={{
          fontSize: '12px',
          color: '#8B1A1A',
          background: '#FAEAEA',
          padding: '6px 10px',
          borderRadius: '5px',
        }}>
          {error}
        </div>
      )}

      <details style={{ fontSize: '12px', color: '#5C6070' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
          What&apos;s inside ({item.includes.length} items)
        </summary>
        <ul style={{ margin: '8px 0 0', paddingLeft: '18px', display: 'grid', gap: '3px' }}>
          {item.includes.map((inc, i) => (
            <li key={i} style={{ lineHeight: 1.5 }}>{inc}</li>
          ))}
        </ul>
      </details>

      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: '10px',
        color: '#9097A8',
        paddingTop: '6px',
        borderTop: '1px solid #F2EFE9',
      }}>
        <span>Order {item.order_id.slice(0, 12)}…</span>
        <span>{item.purchased_at ? new Date(item.purchased_at).toLocaleDateString() : ''}</span>
      </div>
    </div>
  )
}
