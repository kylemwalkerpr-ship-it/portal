'use client'
import React from 'react'
import { C, Badge, Card, StatCard } from './shared'

/**
 * Consultant → Earnings (mirrors AttorneyEarnings pattern).
 *
 * Self-contained component that handles its own data fetching for
 * the Earnings + Payout Setup pages.
 */

export default function ConsultantEarnings({ orders, monthEarnings, totalEarnings, pendingPayoutCents }) {
  const completed = orders.filter(o => o.status === 'completed');
  const transferredCents = completed.reduce((a, o) => a + (o.payoutStatus === 'transferred' ? Number(o.consultantPayoutAmount || 0) : 0), 0);
  // Canonical pending payout = sum of releasable provider_earnings (reconciled
  // with admin financials + the weekly Tuesday batch). Fall back to the
  // order-derived estimate only if the canonical figure wasn't supplied.
  const pendingCents = (pendingPayoutCents !== undefined && pendingPayoutCents !== null)
    ? Number(pendingPayoutCents)
    : completed.reduce((a, o) => a + (o.payoutStatus !== 'transferred' ? Number(o.consultantPayoutAmount || 0) : 0), 0);
  const transferredDollars = (transferredCents / 100).toFixed(2);
  const pendingDollars = (pendingCents / 100).toFixed(2);
  const completedOrders = completed.length;

  const monthlyByKey = completed.reduce((acc, o) => {
    if (!o.date || o.payoutStatus !== 'transferred') return acc;
    const d = new Date(o.date);
    if (Number.isNaN(d.getTime())) return acc;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleString(undefined, { month: 'short', year: 'numeric' });
    acc[key] = acc[key] || { label, cents: 0, count: 0 };
    acc[key].cents += Number(o.consultantPayoutAmount || 0);
    acc[key].count += 1;
    return acc;
  }, {});
  const monthlyRows = Object.entries(monthlyByKey).sort(([a], [b]) => b.localeCompare(a)).slice(0, 12);
  const payoutRows = completed.filter(o => o.payoutStatus === 'transferred' || o.payoutStatus === 'failed');

  return (
    <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 800 }}>Earnings</h2>

      {/* Hero card */}
      <div style={{ background: `linear-gradient(135deg, ${C.navy} 0%, #0d2060 100%)`, borderRadius: '20px', padding: '28px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, right: 0, width: '6px', height: '100%', background: C.cyan }} />
        <div style={{ position: 'absolute', top: 0, right: '6px', width: '6px', height: '100%', background: '#fff', opacity: 0.15 }} />
        <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', marginBottom: '8px', fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase' }}>Paid out</div>
        <div style={{ fontSize: '48px', fontWeight: 800, color: '#fff', marginBottom: '8px' }}>${transferredDollars}</div>
        <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: '13px' }}>
          Payouts are released once an order is completed and approved by the student, then paid out in the weekly batch every Tuesday. No setup needed.
        </div>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '16px' }}>
        <StatCard label="This Month" value={`$${monthEarnings}`} icon="📈" color={C.green} />
        <StatCard label="All Time" value={`$${totalEarnings}`} icon="💰" color={C.cyan} />
        <StatCard label="Pending Payout" value={`$${pendingDollars}`} icon="⏳" color={C.orange} />
        <StatCard label="Completed Orders" value={completedOrders} icon="✅" color={C.purple} />
      </div>

      {/* Monthly breakdown */}
      <Card>
        <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '16px' }}>Monthly Breakdown</div>
        {monthlyRows.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {monthlyRows.map(([key, row]) => (
              <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderRadius: '10px', background: C.surface2, fontSize: '13px' }}>
                <span style={{ color: C.text, fontWeight: 600 }}>{row.label}</span>
                <span style={{ color: C.textMuted }}>{row.count} order{row.count === 1 ? '' : 's'}</span>
                <span style={{ color: C.green, fontWeight: 700 }}>${(row.cents / 100).toFixed(2)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ color: C.textMuted, fontSize: '14px', lineHeight: 1.8 }}>
            No transferred payouts yet. Earnings appear here once your delivery is approved.
          </div>
        )}
      </Card>

      {/* Payout history */}
      <Card>
        <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '16px' }}>Payout History</div>
        {payoutRows.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {payoutRows.map(o => (
              <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${C.border}`, fontSize: '13px' }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{o.service}</div>
                  <div style={{ color: C.textMuted, fontSize: '12px' }}>{o.id} · {o.date}</div>
                </div>
                <Badge color={o.payoutStatus === 'transferred' ? 'green' : 'red'} style={{ fontSize: 10 }}>{o.payoutStatus}</Badge>
                <span style={{ fontWeight: 700, color: o.payoutStatus === 'transferred' ? C.green : C.orange }}>{o.earn}</span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ color: C.textMuted, fontSize: '14px', lineHeight: 1.8 }}>
            Your payout history will populate once your delivery is approved.
          </div>
        )}
      </Card>
    </div>
  );
}
