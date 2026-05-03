'use client'
// @ts-nocheck
import React from 'react'
import { C, Btn, Badge, Card, Input, Select, Avatar, StatusBadge, Divider, StatCard, ProgressBar, NavItem } from './shared'

function ConsultantApp({ onLogout }) {
  const [page, setPage] = React.useState('dashboard');
  const [selectedOrder, setSelectedOrder] = React.useState(null);
  const [msgInput, setMsgInput] = React.useState('');
  const [messages, setMessages] = React.useState([]);
  const [orders, setOrders] = React.useState([]);
  const [notifications, setNotifications] = React.useState([]);
  const [profileName, setProfileName] = React.useState('');
  const [profileEmail, setProfileEmail] = React.useState('');
  const [profileBio, setProfileBio] = React.useState('');
  const [orderFilter, setOrderFilter] = React.useState('all');
  const [notifOpen, setNotifOpen] = React.useState(false);

  const activeOrders = orders.filter(o => o.status === 'active' || o.status === 'review').length;
  const newOrders = orders.filter(o => o.status === 'new').length;
  const totalEarnings = orders.filter(o => o.status === 'completed').reduce((a, o) => a + (parseInt(String(o.earn || '0').replace(/[^0-9]/g, '')) || 0), 0);
  const monthEarnings = orders.filter(o => o.status !== 'cancelled').reduce((a, o) => a + (parseInt(String(o.earn || '0').replace(/[^0-9]/g, '')) || 0), 0);
  const filteredOrders = orderFilter === 'all' ? orders : orders.filter(o => o.status === orderFilter);

  const sendMessage = () => {
    if (!msgInput.trim()) return;
    setMessages(prev => [...prev, { from: 'consultant', text: msgInput, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
    setMsgInput('');
  };

  // ── SIDEBAR ──
  const Sidebar = () => (
    <div style={{
      width: '240px', flexShrink: 0, background: C.surface, borderRight: `1px solid ${C.border}`,
      display: 'flex', flexDirection: 'column', height: '100vh', position: 'sticky', top: 0,
    }}>
      <div style={{ padding: '20px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: '8px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '3px', background: `linear-gradient(90deg, ${C.cyan} 0%, ${C.cyan} 40%, #fff 40%, #fff 60%, ${C.navy} 60%, ${C.navy} 100%)` }} />
        <a href="https://yousafeconsultancy.com" style={{ display: 'inline-flex' }}>
          <img src="logo.png" style={{ height: '32px', filter: 'invert(1)' }} alt="YouSafe" />
        </a>
        <Badge color="purple" style={{ fontSize: '10px', padding: '2px 8px' }}>Consultant</Badge>
      </div>
      <div style={{ padding: '12px 8px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <NavItem icon="⬛" label="Dashboard" active={page === 'dashboard'} onClick={() => setPage('dashboard')} />
        <NavItem icon="📦" label="Orders" active={page === 'orders'} onClick={() => setPage('orders')} badge={newOrders > 0 ? `${newOrders} new` : null} />
        <NavItem icon="👥" label="Clients" active={page === 'clients'} onClick={() => setPage('clients')} />
        <NavItem icon="💬" label="Messages" active={page === 'messages'} onClick={() => { setPage('messages'); }} badge={notifications.length > 0 ? `${notifications.length} new` : null} />
        <div style={{ height: '1px', background: C.border, margin: '8px 6px' }} />
        <NavItem icon="💰" label="Earnings" active={page === 'earnings'} onClick={() => setPage('earnings')} />
        <NavItem icon="⚙️" label="Settings" active={page === 'settings'} onClick={() => setPage('settings')} />
      </div>
      <div style={{ padding: '12px', borderTop: `1px solid ${C.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', borderRadius: '10px', background: C.surface2 }}>
          <Avatar name="Dr. Sarah Ahmed" size={32} color={C.purple} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Dr. Sarah Ahmed</div>
            <div style={{ fontSize: '11px', color: C.green }}>● Available</div>
          </div>
          <button onClick={onLogout} style={{ background: 'none', border: 'none', color: C.textDim, cursor: 'pointer', fontSize: '16px' }} title="Log out">⏻</button>
        </div>
      </div>
    </div>
  );

  // ── TOPBAR ──
  const TopBar = ({ title }) => (
    <div style={{
      height: '60px', background: C.surface, borderBottom: `1px solid ${C.border}`,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 28px', position: 'sticky', top: 0, zIndex: 10,
    }}>
      <h1 style={{ fontSize: '16px', fontWeight: 700 }}>{title}</h1>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {newOrders > 0 && <Badge color="orange">{newOrders} new order{newOrders > 1 ? 's' : ''}</Badge>}
        <div style={{ position: 'relative' }}>
          <button onClick={() => setNotifOpen(!notifOpen)} style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: '8px', padding: '7px 10px', cursor: 'pointer', color: C.textMuted, fontSize: '16px' }}>🔔</button>
          <div style={{ position: 'absolute', top: '4px', right: '4px', width: '8px', height: '8px', background: C.red, borderRadius: '50%', border: `2px solid ${C.surface}` }} />
          {notifOpen && (
            <div style={{ position: 'absolute', right: 0, top: '44px', width: '300px', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)', zIndex: 100 }}>
              <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}`, fontSize: '13px', fontWeight: 700 }}>Notifications</div>
              {notifications.length > 0 ? notifications.map((n, i) => (
                <div key={i} style={{ padding: '12px 16px', display: 'flex', gap: '10px', alignItems: 'flex-start', borderBottom: i < notifications.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: n.dot || C.cyan, marginTop: '5px', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: '13px', color: C.text, lineHeight: 1.4 }}>{n.text}</div>
                    <div style={{ fontSize: '11px', color: C.textDim, marginTop: '3px' }}>{n.time}</div>
                  </div>
                </div>
              )) : (
                <div style={{ padding: '20px', color: C.textMuted, fontSize: '14px', textAlign: 'center' }}>
                  No notifications yet
                </div>
              )}
            </div>
          )}
        </div>
        <Avatar name="Dr. Sarah Ahmed" size={32} color={C.purple} />
      </div>
    </div>
  );

  // ── DASHBOARD ──
  const Dashboard = () => (
    <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <h2 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '4px' }}>Welcome back, Dr. Sarah 👋</h2>
        <p style={{ color: C.textMuted, fontSize: '14px' }}>{newOrders > 0 ? `You have ${newOrders} new order waiting for acceptance.` : 'All orders are up to date.'}</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
        <StatCard label="Active Orders" value={activeOrders} icon="📦" color={C.cyan} delta="+2" />
        <StatCard label="New Requests" value={newOrders} icon="🆕" color={C.orange} />
        <StatCard label="This Month" value={`£${monthEarnings}`} icon="💰" color={C.green} delta="+£396" />
        <StatCard label="Avg Rating" value="4.9 ⭐" icon="🏆" color={C.purple} />
      </div>

      {/* New order alert */}
      {newOrders > 0 && (
        <div style={{ background: `${C.orange}12`, border: `1px solid ${C.orange}33`, borderRadius: '14px', padding: '20px', display: 'flex', gap: '16px', alignItems: 'center' }}>
          <div style={{ fontSize: '28px' }}>📬</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: '15px', color: C.orange }}>New order request</div>
            <div style={{ color: C.textMuted, fontSize: '13px', marginTop: '3px' }}>A new request is waiting for your review.</div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Btn variant="success" size="sm" onClick={() => {
              const order = orders.find(o => o.status === 'new');
              if (order) { setSelectedOrder(order); setPage('order-detail'); }
            }}>Accept</Btn>
            <Btn variant="danger" size="sm">Decline</Btn>
          </div>
        </div>
      )}

      {/* Active orders */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ fontWeight: 700, fontSize: '15px' }}>Active Orders</h3>
          <Btn variant="ghost" size="sm" onClick={() => setPage('orders')}>View all →</Btn>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {orders.filter(o => ['active', 'review', 'new'].includes(o.status)).map(order => (
            <Card key={order.id} hover style={{ padding: '18px', cursor: 'pointer' }} onClick={() => { setSelectedOrder(order); setPage('order-detail'); }}>
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

      {/* Earnings chart placeholder */}
      <div>
        <h3 style={{ fontWeight: 700, fontSize: '15px', marginBottom: '16px' }}>Earnings — Last 30 days</h3>
        <Card style={{ padding: '20px' }}>
          <div style={{ color: C.textMuted, fontSize: '14px', lineHeight: 1.8 }}>
            Earnings trends will be available here once your order history is connected to the dashboard.
          </div>
        </Card>
      </div>
    </div>
  );

  // ── ORDERS ──
  const Orders = () => (
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
                <div style={{ color: C.textMuted, fontSize: '13px' }}>{order.id} · {order.student} · {order.country}</div>
                {order.progress > 0 && <ProgressBar value={order.progress} style={{ marginTop: '8px', maxWidth: '200px' }} />}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-end' }}>
                <StatusBadge status={order.status} />
                <span style={{ fontSize: '14px', fontWeight: 700, color: C.green }}>{order.earn}</span>
                <span style={{ fontSize: '11px', color: C.textDim }}>Due: {order.deadline}</span>
              </div>
            </div>
            {order.status === 'new' && (
              <div style={{ display: 'flex', gap: '8px', marginTop: '14px', paddingTop: '14px', borderTop: `1px solid ${C.border}` }}>
                <Btn variant="success" size="sm">Accept order</Btn>
                <Btn variant="danger" size="sm">Decline</Btn>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );

  // ── ORDER DETAIL (consultant view) ──
  const OrderDetail = ({ order }) => {
    const [progressVal, setProgressVal] = React.useState(order.progress);
    const timeline = [
      { label: 'Order received', date: order.date, done: true },
      { label: 'Accepted', date: '+1 day', done: order.status !== 'new' },
      { label: 'Working on deliverable', date: 'In progress', done: progressVal >= 40 },
      { label: 'Sent for review', date: order.deadline, done: progressVal >= 90 },
      { label: 'Completed', date: '—', done: order.status === 'completed' },
    ];
    return (
      <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Btn variant="ghost" size="sm" onClick={() => setPage('orders')}>← Back</Btn>
          <h2 style={{ fontSize: '18px', fontWeight: 800 }}>{order.service}</h2>
          <StatusBadge status={order.status} />
        </div>
        {order.status === 'new' && (
          <div style={{ background: `${C.orange}12`, border: `1px solid ${C.orange}33`, borderRadius: '12px', padding: '16px', display: 'flex', gap: '12px', alignItems: 'center' }}>
            <span>📬</span>
            <span style={{ color: C.orange, fontWeight: 600, fontSize: '14px' }}>New order — waiting for your acceptance</span>
            <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
              <Btn variant="success" size="sm">Accept</Btn>
              <Btn variant="danger" size="sm">Decline</Btn>
            </div>
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Update progress */}
            <Card>
              <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '16px' }}>Update Progress</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '13px', color: C.textMuted }}>Completion</span>
                <span style={{ fontSize: '13px', fontWeight: 700, color: C.cyan }}>{progressVal}%</span>
              </div>
              <ProgressBar value={progressVal} />
              <input type="range" min="0" max="100" value={progressVal} onChange={e => setProgressVal(+e.target.value)}
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
                <Btn variant="primary" size="sm">Save progress</Btn>
                {progressVal >= 90 && order.status !== 'completed' && <Btn variant="success" size="sm">Mark as complete</Btn>}
              </div>
            </Card>
            {/* Messages */}
            <Card style={{ padding: '20px' }}>
              <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '16px' }}>Chat with {order.student}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '240px', overflowY: 'auto', marginBottom: '16px' }}>
                {messages.map((m, i) => (
                  <div key={i} style={{ display: 'flex', gap: '10px', flexDirection: m.from === 'consultant' ? 'row-reverse' : 'row' }}>
                    {m.from === 'student' && <Avatar name={m.name} size={30} />}
                    <div style={{ maxWidth: '70%' }}>
                      <div style={{
                        padding: '10px 14px', borderRadius: '12px', fontSize: '14px', lineHeight: 1.5,
                        background: m.from === 'consultant' ? C.cyan : C.surface2,
                        color: m.from === 'consultant' ? '#000' : C.text,
                      }}>{m.text}</div>
                      <div style={{ fontSize: '11px', color: C.textDim, marginTop: '4px', textAlign: m.from === 'consultant' ? 'right' : 'left' }}>{m.time}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input value={msgInput} onChange={e => setMsgInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendMessage()}
                  placeholder="Message student…"
                  style={{ flex: 1, padding: '10px 14px', background: C.surface2, border: `1px solid ${C.border2}`, borderRadius: '10px', color: C.text, fontSize: '14px', fontFamily: 'inherit', outline: 'none' }} />
                <Btn variant="primary" size="sm" onClick={sendMessage}>Send</Btn>
              </div>
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
              <Divider style={{ margin: '14px 0' }} />
              {[['Order', order.id], ['Placed', order.date], ['Your Earn', order.earn], ['Deadline', order.deadline]].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '13px' }}>
                  <span style={{ color: C.textMuted }}>{k}</span>
                  <span style={{ color: k === 'Your Earn' ? C.green : C.text, fontWeight: 600 }}>{v}</span>
                </div>
              ))}
            </Card>
            <Card style={{ padding: '20px' }}>
              <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '12px' }}>Student Documents</div>
              {order.documents && order.documents.length > 0 ? order.documents.map((f, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: `1px solid ${C.border}`, fontSize: '13px' }}>
                  <span>📄 {f}</span>
                  <Btn variant="ghost" size="sm">↓</Btn>
                </div>
              )) : (
                <div style={{ color: C.textMuted, fontSize: '14px', lineHeight: 1.6 }}>No student documents available.</div>
              )}
              <Btn variant="secondary" fullWidth size="sm" style={{ marginTop: '10px' }}>+ Upload deliverable</Btn>
            </Card>
          </div>
        </div>
      </div>
    );
  };

  // ── CLIENTS ──
  const Clients = () => (
    <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 800 }}>Clients</h2>
      <Card style={{ padding: '24px', textAlign: 'center' }}>
        <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '12px' }}>Client list is not available</div>
        <div style={{ color: C.textMuted, fontSize: '14px', lineHeight: 1.8 }}>
          Client summaries will appear here once your platform orders and student relationships are loaded.
        </div>
      </Card>
    </div>
  );

  // ── EARNINGS ──
  const Earnings = () => {
    const [withdrawModal, setWithdrawModal] = React.useState(false);
    const [withdrawMethod, setWithdrawMethod] = React.useState('paypal');
    const [paypalEmail, setPaypalEmail] = React.useState('');
    const [routingNum, setRoutingNum] = React.useState('');
    const [accountNum, setAccountNum] = React.useState('');
    const [autoWithdraw, setAutoWithdraw] = React.useState(false);
    const [withdrawn, setWithdrawn] = React.useState(false);
    const availableBalance = orders.filter(o => o.status === 'completed').reduce((a, o) => a + (parseInt(String(o.earn || '0').replace(/[^0-9]/g, '')) || 0), 0);
    const completedOrders = orders.filter(o => o.status === 'completed').length;

    const handleWithdraw = () => {
      setWithdrawModal(false);
      setWithdrawn(true);
    };

    return (
      <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 800 }}>Earnings</h2>

        {withdrawn && (
          <div style={{ background: `${C.green}15`, border: `1px solid ${C.green}33`, borderRadius: '12px', padding: '16px', display: 'flex', gap: '12px', alignItems: 'center' }}>
            <span style={{ fontSize: '20px' }}>✅</span>
            <div>
              <div style={{ fontWeight: 700, color: C.green }}>Withdrawal initiated!</div>
              <div style={{ fontSize: '13px', color: C.textMuted }}>£{availableBalance} will arrive within 1–2 business days.</div>
            </div>
          </div>
        )}

        <div style={{ background: `linear-gradient(135deg, ${C.navy} 0%, #0d2060 100%)`, borderRadius: '20px', padding: '28px', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: 0, right: 0, width: '6px', height: '100%', background: C.cyan }} />
          <div style={{ position: 'absolute', top: 0, right: '6px', width: '6px', height: '100%', background: '#fff', opacity: 0.15 }} />
          <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', marginBottom: '8px', fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase' }}>Available to withdraw</div>
          <div style={{ fontSize: '48px', fontWeight: 800, color: '#fff', marginBottom: '20px' }}>£{withdrawn ? '0' : availableBalance}</div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            <Btn variant="primary" size="md" onClick={() => !withdrawn && setWithdrawModal(true)} disabled={withdrawn}>
              {withdrawn ? '✓ Withdrawn' : 'Withdraw now'}
            </Btn>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button onClick={() => setAutoWithdraw(a => !a)} style={{
                width: '40px', height: '22px', borderRadius: '99px', border: 'none', cursor: 'pointer',
                background: autoWithdraw ? C.cyan : 'rgba(255,255,255,0.2)', position: 'relative', transition: 'background 0.2s',
              }}>
                <div style={{ position: 'absolute', top: '3px', left: autoWithdraw ? '20px' : '3px', width: '16px', height: '16px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
              </button>
              <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '13px' }}>Auto-withdraw on approval</span>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '16px' }}>
          <StatCard label="This Month" value={`£${monthEarnings}`} icon="📈" color={C.green} delta="" />
          <StatCard label="All Time" value={`£${totalEarnings}`} icon="💰" color={C.cyan} />
          <StatCard label="Pending" value={withdrawn ? '£0' : `£${availableBalance}`} icon="⏳" color={C.orange} />
          <StatCard label="Completed Orders" value={completedOrders} icon="✅" color={C.purple} />
        </div>

        <Card>
          <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '20px' }}>Monthly Breakdown</div>
          <div style={{ color: C.textMuted, fontSize: '14px', lineHeight: 1.8 }}>
            Monthly earnings trends will appear here once order and payout data is available.
          </div>
        </Card>

        <Card>
          <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '16px' }}>Payout History</div>
          <div style={{ color: C.textMuted, fontSize: '14px', lineHeight: 1.8 }}>
            Your payout history will populate when payments are processed through the system.
          </div>
        </Card>

        {withdrawModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '20px', padding: '32px', width: '100%', maxWidth: '460px', position: 'relative' }}>
              <button onClick={() => setWithdrawModal(false)} style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: '18px' }}>✕</button>
              <h3 style={{ fontSize: '18px', fontWeight: 800, marginBottom: '6px' }}>Withdraw funds</h3>
              <p style={{ color: C.textMuted, fontSize: '13px', marginBottom: '24px' }}>£{availableBalance} available from approved orders.</p>

              <div style={{ display: 'flex', gap: '10px', marginBottom: '24px' }}>
                {[['paypal', '🅿️ PayPal'], ['bank', '🏦 US Bank (ACH)']].map(([val, lbl]) => (
                  <button key={val} onClick={() => setWithdrawMethod(val)} style={{
                    flex: 1, padding: '12px', border: `1px solid ${withdrawMethod === val ? C.cyan : C.border2}`,
                    borderRadius: '12px', background: withdrawMethod === val ? `${C.cyan}18` : C.surface2,
                    color: withdrawMethod === val ? C.cyan : C.textMuted,
                    fontWeight: withdrawMethod === val ? 700 : 400, fontSize: '13px',
                    cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                  }}>{lbl}</button>
                ))}
              </div>

              {withdrawMethod === 'paypal' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <Input label="PayPal email address" type="email" value={paypalEmail} onChange={e => setPaypalEmail(e.target.value)} placeholder="your@paypal.com" icon="✉" />
                  <div style={{ background: C.surface2, borderRadius: '10px', padding: '14px', fontSize: '13px', color: C.textMuted }}>
                    Funds arrive instantly to your PayPal account. PayPal fees may apply.
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <Input label="Routing number (ABA)" value={routingNum} onChange={e => setRoutingNum(e.target.value)} placeholder="9-digit routing number" icon="🏦" />
                  <Input label="Account number" value={accountNum} onChange={e => setAccountNum(e.target.value)} placeholder="Your checking account" icon="🔢" />
                  <div style={{ background: C.surface2, borderRadius: '10px', padding: '14px', fontSize: '13px', color: C.textMuted }}>
                    ACH transfers arrive in 1–2 business days. US bank accounts only.
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '24px', padding: '16px', background: C.surface2, borderRadius: '12px', marginBottom: '20px' }}>
                <span style={{ fontSize: '14px', color: C.textMuted }}>Withdrawal amount</span>
                <span style={{ fontSize: '20px', fontWeight: 800, color: C.cyan }}>£{availableBalance}</span>
              </div>
              <Btn variant="primary" fullWidth size="lg" onClick={handleWithdraw}>
                Withdraw £{availableBalance} →
              </Btn>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── SETTINGS ──
  const Settings = () => {
    const [avail, setAvail] = React.useState(true);
    const [notifs, setNotifs] = React.useState({ orders: true, messages: true, payments: true });
    return (
      <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '640px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 800 }}>Settings</h2>
        <Card>
          <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '20px' }}>Profile</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
            <Avatar name={profileName || 'Consultant'} size={60} color={C.purple} />
            <div>
              <div style={{ fontWeight: 700 }}>{profileName || 'Consultant Name'}</div>
              <div style={{ color: C.textMuted, fontSize: '13px' }}>{profileEmail || 'you@example.com'}</div>
              <Btn variant="secondary" size="sm" style={{ marginTop: '8px' }}>Change photo</Btn>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <Input label="Full name" value={profileName} onChange={e => setProfileName(e.target.value)} placeholder="Full name" />
            <Input label="Email" type="email" value={profileEmail} onChange={e => setProfileEmail(e.target.value)} placeholder="Email address" />
            <Input label="Bio" value={profileBio} onChange={e => setProfileBio(e.target.value)} placeholder="Short profile summary" />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderTop: `1px solid ${C.border}` }}>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 600 }}>Available for orders</div>
                <div style={{ fontSize: '12px', color: C.textMuted }}>Toggle off to pause new requests</div>
              </div>
              <button onClick={() => setAvail(a => !a)} style={{
                width: '44px', height: '24px', borderRadius: '99px', border: 'none', cursor: 'pointer',
                background: avail ? C.green : C.surface3, position: 'relative', transition: 'background 0.2s',
              }}>
                <div style={{ position: 'absolute', top: '3px', left: avail ? '22px' : '3px', width: '18px', height: '18px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
              </button>
            </div>
            <Btn variant="primary" size="sm" style={{ alignSelf: 'flex-start' }}>Save changes</Btn>
          </div>
        </Card>
        <Card>
          <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '20px' }}>Notifications</div>
          {[['orders', 'New order requests'], ['messages', 'Student messages'], ['payments', 'Payment confirmations']].map(([key, label]) => (
            <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${C.border}` }}>
              <span style={{ fontSize: '14px' }}>{label}</span>
              <button onClick={() => setNotifs(n => ({ ...n, [key]: !n[key] }))} style={{
                width: '44px', height: '24px', borderRadius: '99px', border: 'none', cursor: 'pointer',
                background: notifs[key] ? C.cyan : C.surface3, position: 'relative', transition: 'background 0.2s',
              }}>
                <div style={{ position: 'absolute', top: '3px', left: notifs[key] ? '22px' : '3px', width: '18px', height: '18px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
              </button>
            </div>
          ))}
        </Card>
      </div>
    );
  };

  // ── MESSAGES ──
  const Messages = () => (
    <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 800 }}>Messages</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '20px', height: 'calc(100vh - 180px)' }}>
        <div style={{ background: C.surface, borderRadius: '16px', border: `1px solid ${C.border}`, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '14px', borderBottom: `1px solid ${C.border}`, fontSize: '13px', fontWeight: 700, color: C.textMuted }}>STUDENTS</div>
          {orders.length > 0 ? orders.map(o => (
            <div key={o.id} onClick={() => setSelectedOrder(o)} style={{
              padding: '14px', display: 'flex', gap: '10px', cursor: 'pointer',
              background: selectedOrder?.id === o.id ? C.surface2 : 'transparent',
              borderBottom: `1px solid ${C.border}`,
            }}>
              <Avatar name={o.student} size={36} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.student}</div>
                <div style={{ fontSize: '12px', color: C.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.service}</div>
              </div>
            </div>
          )) : (
            <div style={{ padding: '20px', color: C.textMuted, textAlign: 'center' }}>No conversations available.</div>
          )}
        </div>
        {selectedOrder ? (
          <Card style={{ display: 'flex', flexDirection: 'column', padding: '0', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', gap: '12px', alignItems: 'center' }}>
              <Avatar name={selectedOrder.student} size={36} />
              <div>
                <div style={{ fontWeight: 700, fontSize: '14px' }}>{selectedOrder.student}</div>
                <div style={{ fontSize: '12px', color: C.textMuted }}>{selectedOrder.service}</div>
              </div>
            </div>
            <div style={{ flex: 1, padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {messages.map((m, i) => (
                <div key={i} style={{ display: 'flex', gap: '10px', flexDirection: m.from === 'consultant' ? 'row-reverse' : 'row' }}>
                  {m.from === 'student' && <Avatar name={m.name} size={30} />}
                  <div style={{ maxWidth: '60%' }}>
                    <div style={{ padding: '10px 14px', borderRadius: '12px', fontSize: '14px', lineHeight: 1.5, background: m.from === 'consultant' ? C.cyan : C.surface2, color: m.from === 'consultant' ? '#000' : C.text }}>{m.text}</div>
                    <div style={{ fontSize: '11px', color: C.textDim, marginTop: '4px', textAlign: m.from === 'consultant' ? 'right' : 'left' }}>{m.time}</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ padding: '16px', borderTop: `1px solid ${C.border}`, display: 'flex', gap: '8px' }}>
              <input value={msgInput} onChange={e => setMsgInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendMessage()} placeholder="Message student…" style={{ flex: 1, padding: '10px 14px', background: C.surface2, border: `1px solid ${C.border2}`, borderRadius: '10px', color: C.text, fontSize: '14px', fontFamily: 'inherit', outline: 'none' }} />
              <Btn variant="primary" size="sm" onClick={sendMessage}>Send</Btn>
            </div>
          </Card>
        ) : (
          <Card style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ textAlign: 'center', color: C.textMuted }}>
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>💬</div>
              <div>Select a conversation</div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: C.bg }}>
      <Sidebar />
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        <TopBar title={{ dashboard: 'Dashboard', orders: 'Orders', clients: 'Clients', messages: 'Messages', earnings: 'Earnings', settings: 'Settings', 'order-detail': 'Order Details' }[page] || 'Dashboard'} />
        <div style={{ flex: 1 }}>
          {page === 'dashboard' && <Dashboard />}
          {page === 'orders' && <Orders />}
          {page === 'order-detail' && selectedOrder && <OrderDetail order={selectedOrder} />}
          {page === 'clients' && <Clients />}
          {page === 'messages' && <Messages />}
          {page === 'earnings' && <Earnings />}
          {page === 'settings' && <Settings />}
        </div>
      </div>
    </div>
  );
}

export default ConsultantApp;
