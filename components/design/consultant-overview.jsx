'use client'
import React from 'react'
import { C, Btn, Badge, Card, Avatar, ProgressBar, StatusBadge } from './shared'
import DashboardGuide from './DashboardGuide'

/**
 * Consultant → Overview (mirrors AttorneyOverview).
 *
 * Self-contained component fetching from /api/consultant/data with
 * visibility-aware auto-refresh. Shows the premium "My Office" hero
 * strip, stat cells, active orders, earnings chart, and active gigs.
 */

const fmtN = n => Number(n ?? 0).toLocaleString('en-US')

function ConsultantHeroStat({ label, value, accent }) {
  return (
    <div style={{ padding: '14px 12px', borderRight: `1px solid ${C.border}` }}>
      <div style={{
        fontSize: '11px', fontWeight: 800, color: C.textMuted,
        letterSpacing: '.12em', textTransform: 'uppercase',
      }}>{label}</div>
      <div style={{
        fontSize: '20px', fontWeight: 700, color: accent || C.text,
        marginTop: '2px', fontFamily: C.serif, letterSpacing: '-0.012em',
      }}>{value}</div>
    </div>
  )
}

function EarningsChart({ days }) {
  const data = Array.isArray(days) && days.length > 0 ? days : [];
  if (data.length === 0) {
    return (
      <div style={{ color: C.textMuted, fontSize: '14px', lineHeight: 1.8 }}>
        Earnings trends will populate as your completed orders accumulate.
      </div>
    );
  }
  const maxCents = Math.max(1, ...data.map(d => d.cents || 0));
  const totalCents = data.reduce((a, d) => a + (d.cents || 0), 0);
  const totalOrders = data.reduce((a, d) => a + (d.orders || 0), 0);
  const formatLabel = iso => {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };
  const firstLabel = formatLabel(data[0].date);
  const lastLabel = formatLabel(data[data.length - 1].date);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: C.text }}>${(totalCents / 100).toFixed(2)}</div>
          <div style={{ fontSize: '12px', color: C.textMuted }}>{totalOrders} completed order{totalOrders === 1 ? '' : 's'} in 30 days</div>
        </div>
        <div style={{ fontSize: '11px', color: C.textDim }}>{firstLabel} → {lastLabel}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '120px' }}>
        {data.map(d => {
          const pct = (d.cents || 0) / maxCents;
          const height = Math.max(2, Math.round(pct * 110));
          const tooltip = `${formatLabel(d.date)} · $${((d.cents || 0) / 100).toFixed(2)}${d.orders ? ` · ${d.orders} order${d.orders === 1 ? '' : 's'}` : ''}`;
          return (
            <div
              key={d.date}
              title={tooltip}
              style={{
                flex: 1,
                height: `${height}px`,
                background: d.cents > 0 ? C.cyan : C.surface3,
                borderRadius: '3px 3px 0 0',
                transition: 'background 0.2s',
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

export default function ConsultantOverview({ onJump, profileName }) {
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [gigs, setGigs] = React.useState([]);
  const [gigsLoading, setGigsLoading] = React.useState(true);
  const [available, setAvailable] = React.useState(true);

  const load = React.useCallback(() => {
    setLoading(true); setError(null);
    fetch('/api/consultant/data', { credentials: 'same-origin' })
      .then(async r => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Unable to load consultant data');
        return d;
      })
      .then((d) => {
        setData(d);
        if (typeof d.consultant?.available === 'boolean') setAvailable(d.consultant.available);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => { load() }, [load]);

  // Visibility-aware refresh
  React.useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible') load() };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [load]);

  // Fetch active gigs
  React.useEffect(() => {
    fetch('/api/gigs', { credentials: 'same-origin' })
      .then(async r => {
        const payload = await r.json().catch(() => ({}));
        const d = payload?.data ?? payload;
        setGigs((d?.gigs ?? []).filter(g => g.status === 'active'));
      })
      .catch(() => {})
      .finally(() => setGigsLoading(false));
  }, []);

  const orders = data?.orders ?? [];
  const earningsByDay = data?.earningsByDay ?? [];
  const activeOrders = orders.filter(o => o.status === 'active' || o.status === 'review').length;
  const newOrders = orders.filter(o => o.status === 'new').length;
  const totalEarnings = orders.filter(o => o.status === 'completed').reduce((a, o) => a + (parseInt(String(o.earn || '0').replace(/[^0-9]/g, '')) || 0), 0);
  const monthEarnings = orders.filter(o => o.status !== 'cancelled').reduce((a, o) => a + (parseInt(String(o.earn || '0').replace(/[^0-9]/g, '')) || 0), 0);
  const completedOrders = orders.filter(o => o.status === 'completed').length;

  return (
    <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Premium "My Office" header — gradient panel matching the attorney overview */}
      <div style={{
        background: `linear-gradient(135deg, ${C.surface} 0%, ${C.surface2 || C.bg} 100%)`,
        border: `1px solid ${C.border}`,
        borderRadius: '16px',
        padding: '24px 24px 0',
        boxShadow: '0 10px 30px -22px rgba(60,59,110,0.35)',
        overflow: 'hidden',
      }}>
        <div style={{ paddingBottom: '20px' }}>
          <div style={{
            fontSize: '11px', fontWeight: 800,
            letterSpacing: '.14em', textTransform: 'uppercase',
            color: C.cyan, marginBottom: '4px',
          }}>
            My Office · Today
          </div>
          <h1 style={{
            fontFamily: C.serif, fontSize: 'clamp(26px, 3.4vw, 36px)',
            fontWeight: 600, margin: 0, letterSpacing: '-0.012em',
            color: C.text, lineHeight: 1.1,
          }}>
            {loading ? 'Loading…' : `Welcome back, ${profileName || 'Consultant'}.`}
          </h1>
          <p style={{
            color: C.textMuted, fontSize: '14px', margin: '6px 0 0',
            lineHeight: 1.55,
          }}>
            {loading ? 'Pulling your pipeline…'
              : newOrders > 0
                ? `You have ${newOrders} new order${newOrders === 1 ? '' : 's'} waiting for acceptance.`
                : activeOrders > 0
                  ? `${activeOrders} active order${activeOrders === 1 ? '' : 's'} in progress.`
                  : completedOrders > 0
                    ? `${completedOrders} completed order${completedOrders === 1 ? '' : 's'} — great work!`
                    : 'No orders yet. Once students place orders, they will appear here.'}
          </p>
        </div>
        {!loading && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
            borderTop: `1px solid ${C.border}`,
            background: C.surface,
            margin: '0 -24px',
            padding: '0 24px',
          }}>
            <ConsultantHeroStat label="Active orders" value={activeOrders} accent={C.cyan} />
            <ConsultantHeroStat label="New requests" value={newOrders} accent={C.orange || C.amber || C.text} />
            <ConsultantHeroStat label="This month" value={`$${monthEarnings}`} accent={C.green} />
            <ConsultantHeroStat label="Completed" value={completedOrders} accent={C.purple || C.text} />
          </div>
        )}
      </div>

      {error && (
        <div style={{ background: `${C.red}10`, border: `1px solid ${C.red}33`, borderRadius: '12px', padding: '14px', color: C.red, fontSize: '13px' }}>
          {error}
        </div>
      )}

      <DashboardGuide role="consultant" />

      {/* New order alert */}
      {!loading && newOrders > 0 && (
        <div style={{ background: `${C.orange}12`, border: `1px solid ${C.orange}33`, borderRadius: '14px', padding: '20px', display: 'flex', gap: '16px', alignItems: 'center' }}>
          <div style={{ fontSize: '28px' }}>📬</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: '15px', color: C.orange }}>New order request</div>
            <div style={{ color: C.textMuted, fontSize: '13px', marginTop: '3px' }}>A new request is waiting for your review.</div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Btn variant="success" size="sm" onClick={() => onJump?.('orders')}>View orders</Btn>
          </div>
        </div>
      )}

      {/* Active orders summary */}
      {!loading && activeOrders > 0 && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontWeight: 700, fontSize: '15px' }}>Active Orders</h3>
            <Btn variant="ghost" size="sm" onClick={() => onJump?.('orders')}>View all →</Btn>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {orders.filter(o => ['active', 'review', 'new'].includes(o.status)).slice(0, 5).map(order => (
              <Card key={order.id} hover style={{ padding: '18px', cursor: 'pointer' }} onClick={() => onJump?.('orders')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                  <Avatar name={order.student} size={40} />
                  <div style={{ flex: 1, minWidth: '180px' }}>
                    <div style={{ fontWeight: 700, fontSize: '14px' }}>{order.service}</div>
                    <div style={{ color: C.textMuted, fontSize: '12px' }}>{order.student} · {order.country}</div>
                    {order.progress > 0 && <ProgressBar value={order.progress} style={{ marginTop: '8px' }} />}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-end' }}>
                    <StatusBadge status={order.status} />
                    <span style={{ fontSize: '13px', color: C.green, fontWeight: 700 }}>{order.earn}</span>
                    <span style={{ fontSize: '11px', color: C.textDim }}>Deadline: {order.deadline}</span>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Earnings chart */}
      {!loading && (
        <div>
          <h3 style={{ fontWeight: 700, fontSize: '15px', marginBottom: '16px' }}>Earnings — Last 30 days</h3>
          <Card style={{ padding: '20px' }}>
            <EarningsChart days={earningsByDay} />
          </Card>
        </div>
      )}

      {/* Active gigs */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ fontWeight: 700, fontSize: '15px', margin: 0 }}>Your active services</h3>
          <a href="/dashboard/gigs" style={{ color: C.cyan, fontSize: '12px', fontWeight: 600, textDecoration: 'none' }}>Manage all →</a>
        </div>
        {gigsLoading ? null : gigs.length === 0 ? (
          <Card style={{ padding: '18px' }}>
            <div style={{ color: C.textMuted, fontSize: '13px' }}>
              No active services yet.{' '}
              <a href="/dashboard/gigs/new" style={{ color: C.cyan, textDecoration: 'none', fontWeight: 600 }}>Create your first service →</a>
            </div>
          </Card>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {gigs.map(gig => (
              <Card key={gig.id} style={{ padding: '14px 18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '14px', color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{gig.title}</div>
                    {gig.category && <div style={{ fontSize: '12px', color: C.textMuted, marginTop: '2px' }}>{gig.category}</div>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
                    {gig.metrics && (
                      <div style={{ fontSize: '11px', color: C.textMuted, display: 'flex', gap: '10px' }}>
                        <span>{gig.metrics.impressions ?? 0} views</span>
                        <span>{gig.metrics.clicks ?? 0} clicks</span>
                      </div>
                    )}
                    <a href={`/dashboard/gigs/${gig.id}/edit`} style={{ fontSize: '12px', color: C.cyan, fontWeight: 600, textDecoration: 'none' }}>Edit</a>
                    <a href={`/marketplace/gigs/${gig.slug}`} target="_blank" rel="noreferrer" style={{ fontSize: '12px', color: C.textMuted, fontWeight: 500, textDecoration: 'none' }}>View ↗</a>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
