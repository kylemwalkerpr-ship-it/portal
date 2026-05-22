'use client'

import React from 'react'

type Role = 'attorney' | 'consultant' | 'client' | 'seller'

interface Step {
  icon: string
  title: string
  body: string
}

interface GuideConfig {
  heading: string
  subheading: string
  accent: string
  steps: Step[]
  tip: string
}

const GUIDES: Record<Role, GuideConfig> = {
  attorney: {
    heading: 'How your dashboard works',
    subheading: 'Everything you need to find clients, manage cases, and get paid — in one place.',
    accent: '#1B2D4F',
    steps: [
      {
        icon: '📥',
        title: 'Review inquiries',
        body: 'Clients submit legal questions. Open the Queue to see all open inquiries and pick cases that match your expertise.',
      },
      {
        icon: '💬',
        title: 'Engage & respond',
        body: 'Reply to inquiries directly, build rapport, and understand the client\'s situation before committing to work.',
      },
      {
        icon: '📋',
        title: 'Send a custom offer',
        body: 'Once you understand the scope, send a priced offer through the message thread. Clients pay securely through the platform.',
      },
      {
        icon: '⚖️',
        title: 'Deliver your work',
        body: 'Upload documents, communicate progress, and mark the order complete when the client is satisfied.',
      },
      {
        icon: '💰',
        title: 'Receive payment',
        body: 'Earnings are released to your connected account after the client approves. Set up payouts in Settings.',
      },
    ],
    tip: 'Tip: Respond to inquiries within 24 hours — fast response rates boost your ranking on the marketplace.',
  },
  consultant: {
    heading: 'How your dashboard works',
    subheading: 'Build your service catalogue, serve clients, and grow your practice with YouSafe.',
    accent: '#1B2D4F',
    steps: [
      {
        icon: '🏗',
        title: 'Complete your profile',
        body: 'Add your credentials, specialties, languages, and a professional bio so clients can find and trust you.',
      },
      {
        icon: '📋',
        title: 'Create your services',
        body: 'Build gigs with 3 pricing tiers (Basic, Standard, Premium), delivery timelines, and clear descriptions.',
      },
      {
        icon: '📬',
        title: 'Accept incoming orders',
        body: 'When a client purchases your service, you\'ll be notified. Review the requirements and confirm the order to begin.',
      },
      {
        icon: '📁',
        title: 'Deliver your work',
        body: 'Upload files, send progress updates, and use the message thread to communicate directly with the client.',
      },
      {
        icon: '💰',
        title: 'Get paid',
        body: 'Once the client approves your delivery, earnings move to your connected account. Set up payouts in Payout Setup.',
      },
    ],
    tip: 'Tip: Services with 3 complete pricing tiers and at least one gallery image get significantly more clicks.',
  },
  client: {
    heading: 'Welcome — here\'s how to get started',
    subheading: 'Find qualified attorneys and consultants, place orders, and track everything in one place.',
    accent: '#1B2D4F',
    steps: [
      {
        icon: '🔍',
        title: 'Browse the marketplace',
        body: 'Search by category, budget, rating, or delivery time. Filter by attorney or consultant depending on your needs.',
      },
      {
        icon: '💬',
        title: 'Message a provider',
        body: 'Have questions before committing? Click "Message" on any gig or attorney profile to start a free conversation.',
      },
      {
        icon: '🛒',
        title: 'Place a secure order',
        body: 'Choose a pricing package, enter your requirements, and pay securely. Funds are held in escrow until you approve.',
      },
      {
        icon: '📊',
        title: 'Track your order',
        body: 'Monitor status updates, exchange files, and message your provider directly from the Orders tab.',
      },
      {
        icon: '✅',
        title: 'Approve & review',
        body: 'Once satisfied with the delivery, approve it to release payment. Leave a rating to help others choose.',
      },
    ],
    tip: 'Tip: For immigration and legal matters, use the "Find an Attorney" section for certified legal professionals.',
  },
  seller: {
    heading: 'How the Seller Centre works',
    subheading: 'Create high-quality service listings and attract clients through the YouSafe marketplace.',
    accent: '#9A7B3B',
    steps: [
      {
        icon: '✏️',
        title: 'Write a strong title',
        body: '20–80 characters. Lead with the outcome ("Prepare your UK Skilled Worker visa application"), not the task.',
      },
      {
        icon: '🏷',
        title: 'Set clear pricing tiers',
        body: 'Offer Basic, Standard, and Premium packages. Price anchoring increases average order value by up to 40%.',
      },
      {
        icon: '📸',
        title: 'Add gallery images',
        body: 'Services with at least one image receive 3× more clicks. Use a professional photo or a clean document preview.',
      },
      {
        icon: '🚀',
        title: 'Publish your service',
        body: 'Complete all required fields and click Publish. Your service goes live on the marketplace immediately after validation.',
      },
      {
        icon: '📈',
        title: 'Track & optimise',
        body: 'Monitor impressions, clicks, and saves from the Gig Manager. Use the Profile Strength panel to improve weak spots.',
      },
    ],
    tip: 'Tip: A complete profile score above 80% significantly improves your ranking in marketplace search results.',
  },
}

const sans  = "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif"
const serif = "'Cormorant Garamond', 'Garamond', Georgia, 'Times New Roman', serif"

function storageKey(role: Role) { return `ys_guide_dismissed_v1_${role}` }

export default function DashboardGuide({ role }: { role: Role }) {
  const [dismissed, setDismissed] = React.useState(true) // start hidden to avoid flash
  const [collapsed, setCollapsed]  = React.useState(false)

  // Read localStorage only once, after mount (avoids SSR mismatch)
  React.useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey(role))
      if (stored === 'true') {
        setDismissed(true)
      } else {
        setDismissed(false)
      }
    } catch {
      setDismissed(false)
    }
  }, [role])

  const dismiss = () => {
    setDismissed(true)
    try { window.localStorage.setItem(storageKey(role), 'true') } catch { /* ignore */ }
  }

  const cfg = GUIDES[role]

  // Fully dismissed — show a subtle re-open pill
  if (dismissed) {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '-8px' }}>
        <button
          onClick={() => {
            setDismissed(false)
            setCollapsed(false)
            try { window.localStorage.removeItem(storageKey(role)) } catch { /* ignore */ }
          }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: '#9097A8', fontFamily: sans, display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 0' }}
        >
          <span style={{ fontSize: '14px' }}>?</span> How to use this dashboard
        </button>
      </div>
    )
  }

  return (
    <div style={{
      background: '#FFFFFF',
      border: '1px solid #DDD8CE',
      borderTop: `3px solid ${cfg.accent}`,
      borderRadius: '8px',
      overflow: 'hidden',
      boxShadow: '0 1px 4px rgba(27,45,79,0.07)',
      fontFamily: sans,
    }}>
      {/* Header bar */}
      <div style={{ padding: '16px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', borderBottom: collapsed ? 'none' : '1px solid #F2EFE9', cursor: 'pointer' }}
        onClick={() => setCollapsed(c => !c)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '6px', background: cfg.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM7.25 6a.75.75 0 1 1 1.5 0v4a.75.75 0 0 1-1.5 0V6zm.75-2.5a.875.875 0 1 1 0 1.75.875.875 0 0 1 0-1.75z" fill="white"/>
            </svg>
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: serif, fontWeight: 600, fontSize: '16px', color: '#1B2D4F', letterSpacing: '-0.01em', lineHeight: 1.2 }}>{cfg.heading}</div>
            {!collapsed && <div style={{ fontSize: '12px', color: '#9097A8', marginTop: '2px', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cfg.subheading}</div>}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <button
            onClick={(e) => { e.stopPropagation(); dismiss() }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: '#9097A8', fontFamily: sans, padding: '4px 8px', borderRadius: '4px' }}
          >
            Hide
          </button>
          <span style={{ fontSize: '12px', color: '#9097A8', userSelect: 'none' }}>{collapsed ? '▾' : '▴'}</span>
        </div>
      </div>

      {/* Steps */}
      {!collapsed && (
        <div style={{ padding: '20px 22px 0' }}>
          {/* Subheading */}
          <p style={{ margin: '0 0 20px', fontSize: '13px', color: '#5C6070', lineHeight: 1.6 }}>{cfg.subheading}</p>

          {/* Step flow */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '2px', position: 'relative' }}>
            {cfg.steps.map((step, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', padding: '0 8px 20px' }}>
                {/* Connector line */}
                {i < cfg.steps.length - 1 && (
                  <div style={{ position: 'absolute', top: '19px', left: 'calc(50% + 24px)', right: 'calc(-50% + 24px)', height: '2px', background: '#F2EFE9', zIndex: 0, display: 'block' }} className="ys-guide-connector" />
                )}

                {/* Step circle */}
                <div style={{ position: 'relative', zIndex: 1, width: '40px', height: '40px', borderRadius: '50%', background: '#F7F5F0', border: `2px solid ${i === 0 ? cfg.accent : '#DDD8CE'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '10px', flexShrink: 0 }}>
                  <span style={{ fontSize: '18px', lineHeight: 1 }}>{step.icon}</span>
                  {/* Step number */}
                  <span style={{ position: 'absolute', top: '-4px', right: '-4px', width: '16px', height: '16px', borderRadius: '50%', background: i === 0 ? cfg.accent : '#9097A8', color: '#FFF', fontSize: '9px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: sans }}>
                    {i + 1}
                  </span>
                </div>

                {/* Step text */}
                <div style={{ textAlign: 'center', maxWidth: '160px' }}>
                  <div style={{ fontWeight: 700, fontSize: '13px', color: '#1B2D4F', marginBottom: '4px', lineHeight: 1.3 }}>{step.title}</div>
                  <div style={{ fontSize: '12px', color: '#5C6070', lineHeight: 1.55 }}>{step.body}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Tip bar */}
          <div style={{ margin: '4px -22px 0', padding: '12px 22px', background: '#F7F5F0', borderTop: '1px solid #F2EFE9', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
            <span style={{ fontSize: '14px', flexShrink: 0, marginTop: '1px' }}>💡</span>
            <span style={{ fontSize: '12px', color: '#5C6070', lineHeight: 1.55, flex: 1 }}>{cfg.tip}</span>
            <button
              onClick={dismiss}
              style={{ flexShrink: 0, background: 'none', border: '1px solid #DDD8CE', borderRadius: '5px', padding: '5px 14px', fontSize: '12px', fontWeight: 600, color: '#1B2D4F', cursor: 'pointer', fontFamily: sans, whiteSpace: 'nowrap' }}
            >
              Got it ✓
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
