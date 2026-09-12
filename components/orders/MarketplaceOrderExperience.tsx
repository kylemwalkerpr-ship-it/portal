'use client'

import React from 'react'
import OrderActivityTimeline from './OrderActivityTimeline'
import OrderMessengerDock, { openOrderMessengerDock } from './OrderMessengerDock'

type Role = 'client' | 'attorney' | 'consultant' | 'admin' | null

function buttonText(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return ''
  const button = target.closest('button')
  return String(button?.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase()
}

/**
 * Marketplace-only enhancement layer around the mature role-specific order
 * detail components.
 *
 * Client: replaces the legacy Activity chat shell with the canonical order
 * lifecycle feed without rewriting Overview / Files / Receipt.
 * Provider: adds a first-class Workspace | Activity & pipeline switch while
 * preserving every existing provider action in the Workspace pane.
 *
 * It also fixes the legacy Overview "Open chat" button by intercepting that
 * specific action before it can merely switch to the old Activity composer.
 */
export default function MarketplaceOrderExperience({
  role,
  orderId,
  children,
}: {
  role: Role
  orderId: string
  children: React.ReactNode
}) {
  const isClient = role === 'client' || role === null
  const isProvider = role === 'attorney' || role === 'consultant'
  const [clientActivity, setClientActivity] = React.useState(false)
  const [providerView, setProviderView] = React.useState<'workspace' | 'activity'>('workspace')

  React.useEffect(() => {
    setClientActivity(false)
    setProviderView('workspace')
  }, [orderId])

  const onClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    const text = buttonText(event.target)

    // The old client detail treats "Open chat" as setTab('activity'). Stop
    // that target handler and open the actual unified Messenger instead.
    if (text === 'open chat' || text === 'open chat →' || text.includes('open chat')) {
      event.preventDefault()
      event.stopPropagation()
      openOrderMessengerDock(orderId)
      return
    }

    if (!isClient) return
    if (text.includes('activity')) setClientActivity(true)
    else if (text.includes('overview') || text.includes('files') || text.includes('receipt')) setClientActivity(false)
  }

  if (isProvider) {
    return (
      <div className="ys-market-order-experience ys-market-provider-order" onClickCapture={onClickCapture}>
        <style>{`
          .ys-market-provider-order-tabs {
            max-width: 1100px;
            margin: 18px auto 0;
            padding: 0 20px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            flex-wrap: wrap;
          }
          .ys-market-provider-order-switch {
            display: inline-flex;
            gap: 4px;
            padding: 4px;
            border: 1px solid #e2e8f0;
            border-radius: 999px;
            background: #f8fafc;
          }
          .ys-market-provider-order-switch button {
            border: 0;
            border-radius: 999px;
            padding: 8px 13px;
            background: transparent;
            color: #64748b;
            font: 700 12px/1.2 -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
            cursor: pointer;
          }
          .ys-market-provider-order-switch button.is-active {
            background: #111827;
            color: #fff;
            box-shadow: 0 1px 2px rgba(15,23,42,.12);
          }
          .ys-market-provider-order-chat {
            border: 1px solid #dbe2ea;
            border-radius: 999px;
            padding: 8px 13px;
            background: #fff;
            color: #111827;
            font: 700 12px/1.2 -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
            cursor: pointer;
          }
          .ys-market-provider-order-activity {
            max-width: 1100px;
            margin: 16px auto 0;
            padding: 0 20px 64px;
          }
        `}</style>

        <div className="ys-market-provider-order-tabs">
          <div className="ys-market-provider-order-switch" role="tablist" aria-label="Provider order workspace views">
            <button type="button" role="tab" aria-selected={providerView === 'workspace'} className={providerView === 'workspace' ? 'is-active' : ''} onClick={() => setProviderView('workspace')}>Order workspace</button>
            <button type="button" role="tab" aria-selected={providerView === 'activity'} className={providerView === 'activity' ? 'is-active' : ''} onClick={() => setProviderView('activity')}>Activity & pipeline</button>
          </div>
          <button type="button" className="ys-market-provider-order-chat" onClick={() => openOrderMessengerDock(orderId)}>💬 Open Messenger</button>
        </div>

        {providerView === 'workspace' ? children : (
          <div className="ys-market-provider-order-activity">
            <OrderActivityTimeline orderId={orderId} embedded />
          </div>
        )}
        <OrderMessengerDock orderId={orderId} />
      </div>
    )
  }

  return (
    <div
      className="ys-market-order-experience ys-market-client-order"
      data-enhanced-activity={clientActivity ? 'true' : 'false'}
      onClickCapture={onClickCapture}
    >
      <style>{`
        /* StudentOrderDetail keeps its trusted Overview / Files / Receipt
           implementation. Only its legacy Activity content grid is replaced. */
        .ys-market-client-order[data-enhanced-activity="true"] .ys-order-detail > .yousafe-mobile-stack {
          display: none !important;
        }
        .ys-market-client-order[data-enhanced-activity="true"] .ys-order-detail {
          min-height: 0 !important;
          padding-bottom: 0 !important;
        }
        .ys-market-client-order-activity {
          padding: 0 28px 60px;
          background: var(--portal-bg, #f8fafc);
        }
        @media (max-width: 700px) {
          .ys-market-client-order-activity { padding: 0 14px 40px; }
        }
      `}</style>
      {children}
      {clientActivity && (
        <div className="ys-market-client-order-activity">
          <OrderActivityTimeline orderId={orderId} embedded />
        </div>
      )}
      <OrderMessengerDock orderId={orderId} />
    </div>
  )
}
