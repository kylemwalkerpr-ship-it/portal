'use client'
import React from 'react'
import { C, Btn, Badge, Card, Avatar, StatusBadge, PayoutBadge, ProgressBar, Input, MessageBody } from './shared'
import ChatScreen from '../messaging/ChatScreen'
import MessageBubble from '../messaging/MessageBubble'
import AutoGrowInput from '../messaging/AutoGrowInput'
import { dateLabel, sameDay } from '@/lib/messaging/format'

const CONSULTANT_QUICK_REPLIES = [
  {
    label: 'Intro & next steps',
    body:
      'Hello — thanks for placing your order. I\'ve reviewed the details and I\'m ready to get started.\n\nHere\'s what I\'ll need from you:\n1. Any supporting documents (transcripts, acceptance letters, financial proofs)\n2. Your preferred timeline for submission\n3. Specific questions or concerns you\'d like addressed\n\nReply here or upload files using the paperclip button below.',
  },
  {
    label: 'Documents needed',
    body:
      'Could you upload the following so I can proceed with your order?\n\n• Valid passport / government-issued ID\n• Academic transcripts and certificates\n• Proof of English proficiency (if applicable)\n• Visa / immigration correspondence (if any)\n• Any previous applications or submissions\n\nUse the paperclip in the composer to attach files.',
  },
  {
    label: 'Timeline & delivery',
    body:
      'Thanks for your patience. Here\'s where things stand:\n\n• Current progress is reflected in the progress bar above.\n• I\'ll update you at each stage of the work.\n• The estimated delivery date is shown on the order card.\n• If anything changes on your end, just let me know.\n\nI\'ll notify you as soon as the deliverable is ready for review.',
  },
  {
    label: 'Out of scope',
    body:
      'Thank you for reaching out. After reviewing your request, this specific item falls outside the scope of our current service agreement.\n\nI can still proceed with the original scope we agreed on. If you need something different, feel free to describe what you\'re looking for and I can check if I\'m able to help.',
  },
]

// ── Helper: Offer timeline ────────────────────────────────────────────
function isOfferSystemMessage(message) {
  const body = String(message?.body || message?.text || '')
  return /^(New consultant offer:|Custom offer:)/i.test(body.trim())
}

function itemTime(item) {
  const raw = item?.created_at || item?.message?.created_at || item?.offer?.created_at
  const ts = raw ? new Date(raw).getTime() : 0
  return Number.isFinite(ts) ? ts : 0
}

function buildOfferTimeline(messages = [], offers = []) {
  const hasOffers = offers.length > 0
  return [
    ...messages
      .filter(message => !(hasOffers && isOfferSystemMessage(message)))
      .map(message => ({ kind: 'message', key: `message-${message.id || itemTime({ message })}`, message, created_at: message.created_at })),
    ...offers.map(offer => ({ kind: 'offer', key: `offer-${offer.id}`, offer, created_at: offer.created_at })),
  ].sort((a, b) => itemTime(a) - itemTime(b))
}

// ── OrderDetail ────────────────────────────────────────────────────────
function OrderDetail({ order, onBack, orderDetailProgress, setOrderDetailProgress, messages, messagesLoading, consultantOffers, msgInput, setMsgInput, orderFiles, filesLoading, uploadingFile, fileInputRef, messageFileInputRef, onAcceptOrder, onDeclineOrder, onSaveProgress, onMarkComplete, onSendMessage, onWithdrawOffer, onUploadFile, onDeleteFile, setShowOfferModal }) {
  const progressVal = orderDetailProgress;
  const timeline = [
    { label: 'Order received', date: order.date, done: true },
    { label: 'Accepted', date: '+1 day', done: order.status !== 'new' },
    { label: 'Working on deliverable', date: 'In progress', done: progressVal >= 40 },
    { label: 'Sent for review', date: order.deadline, done: progressVal >= 90 },
    { label: 'Completed', date: '—', done: order.status === 'completed' },
  ];
  const orderTimeline = buildOfferTimeline(messages, consultantOffers);

  return (
    <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <Btn variant="ghost" size="sm" onClick={onBack}>← Back</Btn>
        <h2 style={{ fontSize: '18px', fontWeight: 800 }}>{order.service}</h2>
        <StatusBadge status={order.status} />
      </div>
      {(order.status === 'new' || order.status === 'pending') && (
        <div style={{ background: `${C.orange}12`, border: `1px solid ${C.orange}33`, borderRadius: '12px', padding: '16px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <span>📬</span>
          <span style={{ color: C.orange, fontWeight: 600, fontSize: '14px' }}>New order — ready for you to start</span>
          <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto', flexWrap: 'wrap' }}>
            <Btn variant="success" size="sm" onClick={() => onAcceptOrder(order)}>Start order</Btn>
            <Btn variant="danger" size="sm" onClick={() => onDeclineOrder(order)}>Decline</Btn>
          </div>
        </div>
      )}
      <div className="yousafe-mobile-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '20px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Update progress */}
          <Card>
            <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '16px' }}>Update Progress</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '13px', color: C.textMuted }}>Completion</span>
              <span style={{ fontSize: '13px', fontWeight: 700, color: C.cyan }}>{progressVal}%</span>
            </div>
            <ProgressBar value={progressVal} />
            <input type="range" min="0" max="100" value={progressVal} onChange={e => setOrderDetailProgress(+e.target.value)}
              style={{ width: '100%', marginTop: '12px', accentColor: C.cyan }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '16px' }}>
              {timeline.map((t, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: t.done ? C.cyan : C.surface3, border: `2px solid ${t.done ? C.cyan : C.border2}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: t.done ? '#000' : C.textDim, fontWeight: 700, flexShrink: 0 }}>{t.done ? '✓' : ''}</div>
                  <span style={{ flex: 1, fontSize: '14px', color: t.done ? C.text : C.textMuted }}>{t.label}</span>
                  <span style={{ fontSize: '12px', color: C.textDim }}>{t.date}</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <Btn variant="primary" size="sm" onClick={() => onSaveProgress(order, progressVal)}>Save progress</Btn>
              {progressVal >= 90 && order.status !== 'completed' && <Btn variant="success" size="sm" onClick={() => onMarkComplete(order)}>Mark as complete</Btn>}
            </div>
          </Card>
          {/* Messages */}
          <Card style={{ padding: 0, height: 420, overflow: 'hidden' }}>
            <ChatScreen
              mode="panel"
              header={
                <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${C.border}`, background: '#fff' }}>
                  <div style={{ fontWeight: 700, fontSize: '15px' }}>Chat with {order.student}</div>
                  <Btn variant="secondary" size="sm" onClick={() => setShowOfferModal(true)}>Send offer</Btn>
                </div>
              }
              messages={
                <>
                  {messagesLoading && orderTimeline.length === 0 && (
                    <div style={{ color: C.textMuted, fontSize: '13px', textAlign: 'center', marginTop: 20 }}>Loading messages…</div>
                  )}
                  {!messagesLoading && orderTimeline.length === 0 && (
                    <div style={{ color: C.textMuted, fontSize: '13px', textAlign: 'center', marginTop: 20 }}>No messages yet — say hello.</div>
                  )}
                  {orderTimeline.map((item, i) => {
                    if (item.kind === 'offer') {
                      return (
                        <OfferBubble key={item.key} mine createdAt={item.created_at}>
                          <ConsultantOfferCard offer={item.offer} onWithdraw={() => onWithdrawOffer(item.offer)} />
                        </OfferBubble>
                      )
                    }
                    const prev = orderTimeline[i - 1]
                    const next = orderTimeline[i + 1]
                    const mine = item.message.from === 'consultant'
                    const isFirstInGroup = !prev || prev.kind !== 'message' || (prev.message.from === 'consultant') !== mine
                    const isLastInGroup = !next || next.kind !== 'message' || (next.message.from === 'consultant') !== mine
                    const prevDate = prev && (prev.kind === 'message' ? prev.message.created_at : prev.created_at)
                    const showDate = !prev || !sameDay(item.message.created_at, prevDate)
                    return (
                      <React.Fragment key={item.key || i}>
                        {showDate && (
                          <div style={{ textAlign: 'center', margin: '12px 0', fontSize: '12px', color: C.textMuted, fontWeight: 600 }}>
                            {dateLabel(item.message.created_at)}
                          </div>
                        )}
                        <MessageBubble
                          mine={mine}
                          isFirstInGroup={isFirstInGroup}
                          isLastInGroup={isLastInGroup}
                          timestamp={item.message.created_at}
                          body={<MessageBody body={item.message.text} linkColor={C.cyan} />}
                        />
                      </React.Fragment>
                    )
                  })}
                </>
              }
              composer={
                <div style={{ padding: '8px 16px', borderTop: `1px solid ${C.border}`, background: '#fff' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', color: C.textDim, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: '4px' }}>
                      Quick replies
                    </span>
                    {CONSULTANT_QUICK_REPLIES.map(t => (
                      <button
                        key={t.label}
                        type="button"
                        onClick={() => setMsgInput(prev => prev ? `${prev.replace(/\n+$/, '')}\n\n${t.body}` : t.body)}
                        style={{
                          border: `1px solid ${C.border}`,
                          background: C.surface2,
                          color: C.textMuted,
                          borderRadius: '999px',
                          padding: '4px 10px',
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                        }}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                    <input ref={messageFileInputRef} type="file" style={{ display: 'none' }} onChange={e => onSendMessage(e.target.files?.[0])} />
                    <Btn variant="secondary" size="sm" onClick={() => messageFileInputRef.current?.click()} title="Attach a file">📎</Btn>
                    <AutoGrowInput
                      value={msgInput}
                      onChange={setMsgInput}
                      onSubmit={onSendMessage}
                      placeholder="Message student…"
                    />
                    <Btn variant="primary" size="sm" onClick={onSendMessage}>Send</Btn>
                  </div>
                </div>
              }
            />
          </Card>
        </div>
        {/* Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <Card style={{ padding: '20px' }}>
            <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '16px' }}>Student</div>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <Avatar name={order.student} size={44} />
              <div>
                <div style={{ fontWeight: 700, fontSize: '14px' }}>{order.student}</div>
                <div style={{ color: C.textMuted, fontSize: '12px' }}>{order.country}</div>
              </div>
            </div>
            <div style={{ height: '1px', background: C.border, margin: '14px 0' }} />
            {[['Order', order.id], ['Placed', order.date], ['Your Earn', order.earn], ['Payout', <PayoutBadge status={order.payoutStatus} />], ['Deadline', order.deadline]].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '13px' }}>
                <span style={{ color: C.textMuted }}>{k}</span>
                <span style={{ color: k === 'Your Earn' ? C.green : C.text, fontWeight: 600 }}>{v}</span>
              </div>
            ))}
          </Card>
          <Card style={{ padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div style={{ fontWeight: 700, fontSize: '14px' }}>Files</div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingFile}
                style={{ background: C.surface2, border: `1px solid ${C.border2}`, borderRadius: '8px', padding: '6px 10px', cursor: uploadingFile ? 'not-allowed' : 'pointer', color: C.text, fontSize: '12px', fontWeight: 600, opacity: uploadingFile ? 0.6 : 1 }}
              >
                {uploadingFile ? 'Uploading…' : '+ Upload'}
              </button>
              <input ref={fileInputRef} type="file" style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) onUploadFile(f); }}
              />
            </div>
            {filesLoading && orderFiles.length === 0 && (
              <div style={{ color: C.textMuted, fontSize: '13px' }}>Loading files…</div>
            )}
            {!filesLoading && orderFiles.length === 0 && (
              <div style={{ color: C.textMuted, fontSize: '13px', lineHeight: 1.6 }}>No files yet. Upload deliverables here — your student will see them instantly.</div>
            )}
            {orderFiles.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {orderFiles.map((f, i) => {
                  const sizeKb = f.size_bytes ? Math.max(1, Math.round(f.size_bytes / 1024)) : null;
                  const date = f.created_at ? new Date(f.created_at).toLocaleDateString() : '';
                  const mine = f.uploader_role === 'consultant';
                  return (
                    <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 0', borderBottom: i < orderFiles.length - 1 ? `1px solid ${C.border}` : 'none', fontSize: '13px' }}>
                      <span style={{ flexShrink: 0 }}>📄</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: C.text }}>{f.name}</div>
                        <div style={{ fontSize: '11px', color: C.textDim }}>
                          {mine ? 'You' : f.uploader_name || 'Student'}{sizeKb ? ` · ${sizeKb} KB` : ''}{date ? ` · ${date}` : ''}
                        </div>
                      </div>
                      {f.url && (
                        <a href={f.url} target="_blank" rel="noreferrer" style={{ color: C.cyan, fontSize: '12px', fontWeight: 600, textDecoration: 'none' }}>Open</a>
                      )}
                      {mine && (
                        <button onClick={() => onDeleteFile(f.id)} title="Delete" style={{ background: 'none', border: 'none', color: C.red, cursor: 'pointer', fontSize: '14px', padding: '0 4px' }}>×</button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <div style={{ marginTop: '12px', fontSize: '11px', color: C.textDim, lineHeight: 1.5 }}>
              Files are stored privately. Links expire after 10 minutes — they're regenerated each time the order is opened.
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ── Offer Bubble ─────────────────────────────────────────────────────────
function OfferBubble({ children, mine, createdAt }) {
  const timeLabel = createdAt ? new Date(createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
  return (
    <div style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
      <div style={{ maxWidth: '70%', display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start', gap: '4px' }}>
        {children}
        {timeLabel && <div style={{ fontSize: '11px', color: C.textDim, marginTop: '2px', textAlign: mine ? 'right' : 'left' }}>{timeLabel}</div>}
      </div>
    </div>
  )
}

function ConsultantOfferCard({ offer, onWithdraw }) {
  const pending = offer.status === 'sent'
  const platformFee = Number(offer.platform_fee || 0)
  const payout = Number(offer.consultant_payout || 0) || Math.max(0, Number(offer.price || 0) - platformFee)
  return (
    <div style={{ alignSelf: 'stretch', border: `1px solid ${pending ? C.cyan : C.border}`, borderRadius: '12px', padding: '14px', background: pending ? `${C.cyan}0d` : C.surface2 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
        <div style={{ fontWeight: 800, fontSize: '14px', color: C.text }}>{offer.title}</div>
        <Badge color={pending ? 'orange' : offer.status === 'accepted' ? 'green' : offer.status === 'withdrawn' ? 'gray' : 'gray'}>{offer.status}</Badge>
      </div>
      <div style={{ marginTop: '6px', color: C.textMuted, fontSize: '13px', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{offer.description}</div>
      <div style={{ marginTop: '10px', display: 'grid', gap: '4px', fontSize: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Client pays</span><strong>${Number(offer.price || 0).toFixed(2)}</strong></div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Platform amount</span><strong>${platformFee.toFixed(2)}</strong></div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Your payout</span><strong>${payout.toFixed(2)}</strong></div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Delivery</span><strong>{offer.delivery_days} days</strong></div>
      </div>
      {pending && <Btn variant="ghost" size="sm" onClick={onWithdraw} style={{ marginTop: '10px' }}>Withdraw</Btn>}
    </div>
  )
}

// ── Orders list page ────────────────────────────────────────────────────
export default function ConsultantOrders({ orders, orderFilter, setOrderFilter, setSelectedOrder, setPage, onAcceptOrder, onDeclineOrder }) {
  const filteredOrders = orderFilter === 'all' ? orders : orders.filter(o => o.status === orderFilter);

  return (
    <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 800, marginBottom: '4px' }}>Orders</h2>
          <p style={{ color: C.textMuted, fontSize: '14px' }}>{orders.length} total</p>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {['all', 'new', 'active', 'review', 'pending', 'completed'].map(f => (
          <button key={f} onClick={() => setOrderFilter(f)} style={{
            padding: '6px 16px', borderRadius: '20px', border: `1px solid ${orderFilter === f ? C.cyan : C.border}`,
            background: orderFilter === f ? `${C.cyan}18` : C.surface2,
            color: orderFilter === f ? C.cyan : C.textMuted,
            fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: orderFilter === f ? 600 : 400,
            transition: 'all 0.15s', textTransform: 'capitalize',
          }}>{f}</button>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {filteredOrders.map(order => (
          <Card key={order.id} hover style={{ padding: '20px', cursor: 'pointer' }} onClick={() => { setSelectedOrder(order); setPage('order-detail'); }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
              <Avatar name={order.student} size={44} />
              <div style={{ flex: 1, minWidth: '200px' }}>
                <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '2px' }}>{order.service}</div>
                <div style={{ color: C.textMuted, fontSize: '13px' }}>{order.orderNumber || order.id} · {order.student} · {order.country}</div>
                {order.progress > 0 && <ProgressBar value={order.progress} style={{ marginTop: '8px', maxWidth: '200px' }} />}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-end' }}>
                <StatusBadge status={order.status} />
                <span style={{ fontSize: '14px', fontWeight: 700, color: C.green }}>{order.earn}</span>
                <PayoutBadge status={order.payoutStatus} />
                <span style={{ fontSize: '11px', color: C.textDim }}>Due: {order.deadline}</span>
              </div>
            </div>
            {(order.status === 'new' || order.status === 'pending') && (
              <div style={{ display: 'flex', gap: '8px', marginTop: '14px', paddingTop: '14px', borderTop: `1px solid ${C.border}` }} onClick={e => e.stopPropagation()}>
                <Btn variant="success" size="sm" onClick={() => onAcceptOrder(order)}>Start order</Btn>
                <Btn variant="danger" size="sm" onClick={() => onDeclineOrder(order)}>Decline</Btn>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

// ── Clients page ────────────────────────────────────────────────────────
export function ConsultantClients({ orders, setSelectedOrder, setPage }) {
  const clientMap = orders.reduce((acc, o) => {
    const key = o.clientId || o.student;
    if (!key) return acc;
    const entry = acc.get(key) || { id: key, name: o.student, country: o.country, totalCents: 0, orders: 0, lastDate: null };
    entry.orders += 1;
    entry.totalCents += Number(o.consultantPayoutAmount || 0);
    const ts = o.date ? new Date(o.date).getTime() : 0;
    if (!entry.lastDate || ts > entry.lastDate) entry.lastDate = ts;
    acc.set(key, entry);
    return acc;
  }, new Map());
  const clients = Array.from(clientMap.values()).sort((a, b) => (b.lastDate || 0) - (a.lastDate || 0));

  return (
    <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 800 }}>Clients</h2>
      {clients.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {clients.map(c => {
            const clientOrders = orders.filter(o => (o.clientId || o.student) === c.id);
            const firstOrder = clientOrders[0];
            return (
              <Card key={c.id} hover style={{ padding: '16px', cursor: firstOrder ? 'pointer' : 'default' }} onClick={() => firstOrder && (setSelectedOrder(firstOrder), setPage('order-detail'))}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                  <Avatar name={c.name} size={42} />
                  <div style={{ flex: 1, minWidth: '180px' }}>
                    <div style={{ fontWeight: 700, fontSize: '14px' }}>{c.name}</div>
                    <div style={{ color: C.textMuted, fontSize: '12px' }}>{c.country} · {c.orders} order{c.orders === 1 ? '' : 's'}</div>
                  </div>
                  <span style={{ fontSize: '13px', color: C.green, fontWeight: 700 }}>${(c.totalCents / 100).toFixed(2)}</span>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card style={{ padding: '24px', textAlign: 'center' }}>
          <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '12px' }}>No clients yet</div>
          <div style={{ color: C.textMuted, fontSize: '14px', lineHeight: 1.8 }}>
            Once students are matched to your services, they will appear here.
          </div>
        </Card>
      )}
    </div>
  );
}

// ── ConsultantOfferModal ────────────────────────────────────────────────
export function ConsultantOfferModal({ order, onClose, onCreated }) {
  const [title, setTitle] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [price, setPrice] = React.useState('')
  const [discount, setDiscount] = React.useState('0')
  const [deliveryDays, setDeliveryDays] = React.useState('7')
  const [revisionCount, setRevisionCount] = React.useState('1')
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState('')
  const discounted = Math.max(0, Number(price || 0) * (1 - Math.min(Math.max(Number(discount || 0), 0), 95) / 100))

  async function submit(e) {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true); setError('')
    try {
      const res = await fetch(`/api/consultant/orders/${order.id}/offers`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, price: Number(price), discount_percent: Number(discount), delivery_days: Number(deliveryDays), revision_count: Number(revisionCount) }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Could not create offer.')
      onCreated()
    } catch (e) { setError(e.message) }
    finally { setSubmitting(false) }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <form onClick={e => e.stopPropagation()} onSubmit={submit} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '14px', padding: '24px', maxWidth: '520px', width: '100%', display: 'grid', gap: '12px', color: C.text }}>
        <div style={{ fontWeight: 800, fontSize: '17px' }}>Send custom offer</div>
        <Input label="Offer title" value={title} onChange={e => setTitle(e.target.value)} placeholder="Add-on document review" />
        <label style={{ display: 'grid', gap: '6px', fontSize: '12px', color: C.textMuted, fontWeight: 700 }}>
          Details
          <textarea rows={5} value={description} onChange={e => setDescription(e.target.value)} style={{ padding: '10px 12px', background: C.surface2, border: `1px solid ${C.border2}`, borderRadius: '10px', color: C.text, fontFamily: 'inherit', fontSize: '14px' }} />
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <Input label="Price" type="number" min="1" step="0.01" value={price} onChange={e => setPrice(e.target.value)} />
          <Input label="Discount %" type="number" min="0" max="95" step="1" value={discount} onChange={e => setDiscount(e.target.value)} />
          <Input label="Delivery days" type="number" min="1" step="1" value={deliveryDays} onChange={e => setDeliveryDays(e.target.value)} />
          <Input label="Revisions" type="number" min="0" max="10" step="1" value={revisionCount} onChange={e => setRevisionCount(e.target.value)} />
        </div>
        <div style={{ padding: '10px 12px', borderRadius: '10px', background: C.surface2, fontSize: '13px' }}>
          Client pays <strong>${discounted.toFixed(2)}</strong>. Platform payout split uses the live admin payment settings.
        </div>
        {error && <div style={{ color: C.red, fontSize: '13px' }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <Btn type="button" variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn type="submit" variant="primary" disabled={submitting}>{submitting ? 'Sending…' : 'Send offer'}</Btn>
        </div>
      </form>
    </div>
  )
}

export { OrderDetail, OfferBubble, ConsultantOfferCard, buildOfferTimeline, isOfferSystemMessage }
