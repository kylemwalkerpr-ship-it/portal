import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { getTemplatePack } from '@/lib/template-packs'

const PORTAL_URL = 'https://portal.yousafeconsultancy.com'

export const metadata: Metadata = {
  title: 'Order Confirmation',
  robots: { index: false, follow: false },
}

const C = {
  bg: '#FBFAF7',
  surface: '#FFFFFF',
  surface2: '#F4F2EE',
  border: 'rgba(0,0,0,0.08)',
  cyan: '#3C3B6E',
  text: '#1F2937',
  textMuted: '#6B7280',
  textDim: '#9CA3AF',
  success: '#1A6B45',
  successBg: '#E8F5EE',
}

const SERIF = "'Cormorant Garamond', 'Garamond', Georgia, 'Times New Roman', serif"
const SANS = "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif"

interface OrderRecord {
  id: string
  email: string
  name: string | null
  slugs: string[]
  amount_cents: number
  transaction_id: string | null
  status: string
  created_at: string
}

export default async function SuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ orderId?: string }>
}) {
  const { orderId } = await searchParams
  if (!orderId) notFound()

  let order: OrderRecord | null = null
  try {
    const db = createSupabaseAdminClient()
    const { data, error } = await db
      .from('template_orders')
      .select('*')
      .eq('id', orderId)
      .single()
    if (!error && data) order = data as OrderRecord
  } catch {
    order = null
  }

  const isPaid = order?.status === 'paid'

  return (
    <main style={{ maxWidth: '720px', margin: '0 auto', padding: '64px 24px 80px', fontFamily: SANS, color: C.text }}>
      {isPaid ? (
        <>
          <div
            style={{
              background: C.successBg,
              border: `1px solid rgba(26,107,69,0.15)`,
              borderRadius: '12px',
              padding: '24px 28px',
              marginBottom: '32px',
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
            }}
          >
            <div style={{ fontSize: '32px' }}>✅</div>
            <div>
              <h1 style={{ fontFamily: SERIF, fontSize: '24px', fontWeight: 500, margin: '0 0 4px', color: C.success }}>
                Payment Confirmed
              </h1>
              <p style={{ fontSize: '14px', color: C.textMuted, margin: 0 }}>
                Order <code style={{ fontFamily: 'monospace', fontSize: '13px' }}>{orderId}</code> ·{' '}
                ${(order.amount_cents / 100).toFixed(2)} USD
              </p>
            </div>
          </div>

          <p style={{ fontSize: '15px', color: C.textMuted, lineHeight: 1.6, margin: '0 0 28px' }}>
            Thank you for your purchase. A confirmation email has been sent to{' '}
            <strong style={{ color: C.text }}>{order.email}</strong>. Your downloads are listed below.
          </p>

          <h2 style={{ fontFamily: SERIF, fontSize: '22px', fontWeight: 500, margin: '0 0 16px' }}>
            Your Template Packs
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '40px' }}>
            {order.slugs.map((slug) => {
              const pack = getTemplatePack(slug)
              if (!pack) return null
              const hasDeliveryFile = Boolean(pack.delivery_file)
              return (
                <div
                  key={slug}
                  style={{
                    background: C.surface,
                    border: `1px solid ${C.border}`,
                    borderRadius: '10px',
                    padding: '18px 22px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '16px',
                    flexWrap: 'wrap',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '15px', marginBottom: '2px' }}>{pack.name}</div>
                    <div style={{ fontSize: '13px', color: C.textMuted }}>{pack.category}</div>
                  </div>
                  {hasDeliveryFile ? (
                    <a
                      href={`/${pack.delivery_file}`}
                      download
                      style={{
                        padding: '8px 18px',
                        borderRadius: '6px',
                        background: C.cyan,
                        color: '#fff',
                        fontSize: '13px',
                        fontWeight: 600,
                        textDecoration: 'none',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Download
                    </a>
                  ) : (
                    <span style={{ fontSize: '13px', color: C.textDim, fontStyle: 'italic' }}>
                      Download link coming soon
                    </span>
                  )}
                </div>
              )
            })}
          </div>

          <div
            style={{
              background: C.surface2,
              borderRadius: '10px',
              padding: '18px 22px',
              fontSize: '13px',
              color: C.textMuted,
              lineHeight: 1.6,
            }}
          >
            <strong style={{ color: C.text }}>Need help?</strong> If you do not receive your download link
            within a few minutes, check your spam folder or contact us at{' '}
            <a href="mailto:support@yousafeconsultancy.com" style={{ color: C.cyan, fontWeight: 600 }}>
              support@yousafeconsultancy.com
            </a>{' '}
            with your order ID.
          </div>
        </>
      ) : (
        <div
          style={{
            textAlign: 'center',
            padding: '56px 24px',
            background: C.surface,
            borderRadius: '12px',
            border: `1px solid ${C.border}`,
          }}
        >
          <div style={{ fontSize: '40px', marginBottom: '16px' }}>🔍</div>
          <h1 style={{ fontFamily: SERIF, fontSize: '24px', fontWeight: 500, margin: '0 0 8px' }}>
            We could not confirm this payment
          </h1>
          <p style={{ fontSize: '15px', color: C.textMuted, margin: '0 0 24px', maxWidth: '440px', marginLeft: 'auto', marginRight: 'auto' }}>
            The order reference was not found or the payment has not been verified. If you believe this is an error, please contact support with your transaction details.
          </p>
          <a
            href="mailto:support@yousafeconsultancy.com"
            style={{
              display: 'inline-block',
              padding: '10px 24px',
              borderRadius: '8px',
              background: C.cyan,
              color: '#fff',
              fontSize: '15px',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Contact Support
          </a>
        </div>
      )}
    </main>
  )
}
