'use client'
// @ts-nocheck
import React from 'react'
import { C, Btn, Badge, Card, Input, Select, Avatar, UserMenu, StatusBadge, Divider, StatCard, ProgressBar, NavItem } from './shared'

const formatMoney = (value, currency = 'USD') => new Intl.NumberFormat('en-US', { style: 'currency', currency: String(currency || 'USD').toUpperCase(), minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(value || 0));
// Legacy alias kept temporarily; new call sites should use formatPrimary from
// inside AdminApp which respects the admin-controlled primary_currency.
const formatUSD = value => formatMoney(value, 'usd');
const moneyValue = value => Number(String(value ?? 0).replace(/[^0-9.-]/g, '')) || 0;
const DEFAULT_SETTINGS = {
  platform_fee_percent: 20,
  consultant_fee_percent: 80,
  auto_release_days: 14,
  allow_admin_force_release: true,
  platform_name: 'Yousafe Consultancy',
  support_email: 'support@yousafeconsultancy.com',
  primary_currency: 'usd',
  usd_to_cad_rate: 1.37,
};
const SUPPORTED_CURRENCIES = ['usd', 'cad'];
const normalizeCurrency = c => SUPPORTED_CURRENCIES.includes(String(c || '').toLowerCase()) ? String(c).toLowerCase() : 'usd';
const deliveryLabel = days => {
  const n = Number(days || 0);
  if (!n) return 'Timeline TBD';
  if (n >= 365) return '12 months';
  if (n >= 90) return '3 months';
  if (n >= 28) return '2–4 weeks';
  return `${n} day${n === 1 ? '' : 's'}`;
};
const normalizeRole = role => role === 'client' ? 'student' : (role || 'student');
const roleBadgeColor = role => ({
  student: 'cyan',
  consultant: 'purple',
  support: 'orange',
  admin: 'red',
})[role] || 'gray';
const approvalLabel = role => role === 'support' ? 'Customer support access' : 'Consultant access';

function AdminApp({ onLogout }) {
  const [page, setPage] = React.useState('dashboard');
  const [userFilter, setUserFilter] = React.useState('all');
  const [orderFilter, setOrderFilter] = React.useState('all');
  const [selectedUser, setSelectedUser] = React.useState(null);
  const [selectedOrder, setSelectedOrder] = React.useState(null);
  const [inviteModal, setInviteModal] = React.useState(false);
  const [actionNotice, setActionNotice] = React.useState('');
  const [notifOpen, setNotifOpen] = React.useState(false);
  const [users, setUsers] = React.useState([]);
  const [currentAdminId, setCurrentAdminId] = React.useState(null);
  const [orders, setOrders] = React.useState([]);
  const [services, setServices] = React.useState([]);
  const [alerts, setAlerts] = React.useState([]);
  const [platformName, setPlatformName] = React.useState('');
  const [supportEmail, setSupportEmail] = React.useState('');
  const [platformSettings, setPlatformSettings] = React.useState(DEFAULT_SETTINGS);
  const [consultantShare, setConsultantShare] = React.useState(DEFAULT_SETTINGS.consultant_fee_percent);
  const [autoReleaseDays, setAutoReleaseDays] = React.useState(String(DEFAULT_SETTINGS.auto_release_days));
  const [allowForceRelease, setAllowForceRelease] = React.useState(DEFAULT_SETTINGS.allow_admin_force_release);
  const [primaryCurrency, setPrimaryCurrency] = React.useState(DEFAULT_SETTINGS.primary_currency);
  const [usdToCadRate, setUsdToCadRate] = React.useState(String(DEFAULT_SETTINGS.usd_to_cad_rate));
  const [stripePublishableKey, setStripePublishableKey] = React.useState('');
  const [stripeSecretKey, setStripeSecretKey] = React.useState('');
  const [webhookSigningSecret, setWebhookSigningSecret] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState(null);

  const consultantFeePercent = Number(platformSettings.consultant_fee_percent || DEFAULT_SETTINGS.consultant_fee_percent);
  const platformFeePercent = Number(platformSettings.platform_fee_percent || (100 - consultantFeePercent));
  const activeCurrency = normalizeCurrency(platformSettings.primary_currency);
  const formatPrimary = React.useCallback(v => formatMoney(v, activeCurrency), [activeCurrency]);

  const normalizeAdminData = React.useCallback(data => {
    const settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
    setCurrentAdminId(data.currentAdminId || null);
    const consultantPercent = Number(settings.consultant_fee_percent || DEFAULT_SETTINGS.consultant_fee_percent);
    const platformPercent = Number(settings.platform_fee_percent || (100 - consultantPercent));
    const adminCurrency = normalizeCurrency(settings.primary_currency);
    const fmt = v => formatMoney(v, adminCurrency);
    const profiles = data.users ?? [];
    const profileById = new Map(profiles.map(p => [p.id, p]));
    const itemsByOrder = new Map((data.orderItems ?? []).map(i => [i.order_id, i]));
    const serviceById = new Map((data.services ?? []).map(s => [s.id, s]));
    const normalizedUsers = profiles.map(p => ({
      id: p.id,
      name: p.full_name || p.email || 'Unnamed user',
      email: p.email || '',
      role: normalizeRole(p.role),
      country: p.country || '—',
      joined: p.created_at ? new Date(p.created_at).toLocaleDateString() : '—',
      createdAt: p.created_at,
      orders: (data.orders ?? []).filter(o => o.client_id === p.id || o.consultant_id === p.id).length,
      spend: fmt((data.orders ?? []).filter(o => o.client_id === p.id).reduce((sum, o) => sum + Number(o.total_amount || 0), 0)),
      status: p.status || 'active',
    }));
    const normalizedOrders = (data.orders ?? []).map(o => {
      const item = itemsByOrder.get(o.id);
      const service = serviceById.get(item?.service_id);
      const student = profileById.get(o.client_id);
      const consultant = profileById.get(o.consultant_id);
      const amount = Number(o.total_amount ?? item?.subtotal ?? 0);
      const released = ['released', 'paid', 'completed'].includes(String(o.escrow_status || '').toLowerCase()) || o.payout_released_at;
      return {
        id: o.id,
        service: service?.title || o.service_title || 'Service unavailable',
        student: student?.full_name || student?.email || 'Unknown student',
        consultant: consultant?.full_name || consultant?.email || null,
        consultantId: o.consultant_id || null,
        amount: fmt(amount),
        amountValue: amount,
        consultantPay: fmt(amount * (consultantPercent / 100)),
        adminCut: fmt(amount * (platformPercent / 100)),
        escrow: released ? 'released' : 'held',
        status: o.status === 'queued' ? 'pending' : (o.status || 'pending'),
        createdAt: o.created_at,
      };
    });
    const orderCountByService = new Map((data.orderItems ?? []).map(item => [item.service_id, 0]));
    (data.orderItems ?? []).forEach(item => orderCountByService.set(item.service_id, (orderCountByService.get(item.service_id) || 0) + 1));
    const normalizedServices = (data.services ?? []).map(s => ({
      id: s.id,
      title: s.title || '',
      category: s.category || 'General',
      price: Number(s.price || 0),
      usd_price: Number(s.usd_price || 0),
      currency: s.currency || 'usd',
      delivery_days: Number(s.delivery_days || 7),
      active: Boolean(s.is_active),
      orders: orderCountByService.get(s.id) || 0,
    }));
    setUsers(normalizedUsers);
    setOrders(normalizedOrders);
    setServices(normalizedServices);
    setPlatformSettings(settings);
    setConsultantShare(consultantPercent);
    setAutoReleaseDays(String(settings.auto_release_days || DEFAULT_SETTINGS.auto_release_days));
    setAllowForceRelease(Boolean(settings.allow_admin_force_release));
    setPrimaryCurrency(normalizeCurrency(settings.primary_currency));
    setUsdToCadRate(String(Number(settings.usd_to_cad_rate || DEFAULT_SETTINGS.usd_to_cad_rate)));
    setPlatformName(settings.platform_name || '');
    setSupportEmail(settings.support_email || '');
    const pendingUsers = normalizedUsers.filter(u => ['consultant', 'support'].includes(u.role) && u.status === 'pending');
    setAlerts([
      ...pendingUsers.map(u => ({
        text: `${approvalLabel(u.role)} pending for ${u.name}`,
        time: u.createdAt ? new Date(u.createdAt).toLocaleDateString() : 'Now',
        dot: u.role === 'support' ? C.orange : C.purple,
      })),
      ...normalizedOrders.filter(o => o.status === 'pending').map(o => ({
        text: `Order ${o.id} is waiting for assignment`,
        time: o.createdAt ? new Date(o.createdAt).toLocaleDateString() : 'Now',
        dot: C.orange,
      })),
    ].slice(0, 8));
  }, []);

  const refreshAdminData = React.useCallback(() => {
    setLoading(true);
    fetch('/api/admin/data')
      .then(async r => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'Unable to load admin data');
        normalizeAdminData(data);
        setLoadError(null);
      })
      .catch(e => setLoadError(e.message))
      .finally(() => setLoading(false));
  }, [normalizeAdminData]);

  React.useEffect(() => { refreshAdminData(); }, [refreshAdminData]);

  const releaseOrder = async orderId => {
    const res = await fetch(`/api/admin/orders/${orderId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ escrow_status: 'released', force: true }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Release failed');
    refreshAdminData();
  };

  const savePlatformSettings = async updates => {
    const res = await fetch('/api/admin/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...platformSettings, ...updates }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Settings update failed');
    setPlatformSettings(data.settings);
    setConsultantShare(Number(data.settings.consultant_fee_percent));
    setAutoReleaseDays(String(data.settings.auto_release_days));
    setAllowForceRelease(Boolean(data.settings.allow_admin_force_release));
    setPrimaryCurrency(normalizeCurrency(data.settings.primary_currency));
    setUsdToCadRate(String(Number(data.settings.usd_to_cad_rate || DEFAULT_SETTINGS.usd_to_cad_rate)));
    setPlatformName(data.settings.platform_name || '');
    setSupportEmail(data.settings.support_email || '');
    await refreshAdminData();
    return data.settings;
  };

  const updateUser = async (user, payload) => {
    const res = await fetch(`/api/admin/users/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'User update failed');
    refreshAdminData();
    return data.user;
  };

  const isCurrentAdmin = user => Boolean(user?.id && user.id === currentAdminId);

  const approveUser = async user => {
    await updateUser(user, { status: 'active' });
    setActionNotice(`${approvalLabel(user.role)} approved for ${user.name}.`);
  };

  const deleteUser = async user => {
    if (!['consultant', 'support'].includes(user.role)) {
      setActionNotice('Only consultant and support staff accounts can be deleted here.');
      return;
    }
    if (!confirm(`Delete ${user.name}? This permanently removes the ${user.role} account and cannot be undone.`)) return;
    const res = await fetch(`/api/admin/users/${user.id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'User delete failed');
    setSelectedUser(null);
    setActionNotice(`${user.name} was deleted.`);
    refreshAdminData();
  };

  const totalRevenue = orders.filter(o => o.escrow === 'released').reduce((a, o) => a + moneyValue(o.adminCut), 0);
  const paidToConsultants = orders.filter(o => o.escrow === 'released').reduce((a, o) => a + moneyValue(o.consultantPay), 0);
  const pendingEscrow = orders.filter(o => o.escrow === 'held').reduce((a, o) => a + o.amountValue, 0);
  const totalStudents = users.filter(u => u.role === 'student').length;
  const totalConsultants = users.filter(u => u.role === 'consultant').length;
  const totalSupport = users.filter(u => u.role === 'support').length;
  const pendingApprovals = users.filter(u => ['consultant', 'support'].includes(u.role) && u.status === 'pending');
  const pendingOrders = orders.filter(o => o.status === 'new' || o.status === 'pending').length;
  const filteredUsers = userFilter === 'all'
    ? users
    : userFilter === 'pending'
      ? pendingApprovals
      : users.filter(u => u.role === userFilter);
  const filteredOrders = orderFilter === 'all' ? orders : orders.filter(o => o.status === orderFilter);
  const consultants = users.filter(u => u.role === 'consultant' && u.status === 'active');
  const consultantNames = consultants.map(u => u.name);

  // ── SIDEBAR ──
  const Sidebar = () => (
    <div style={{ width: '240px', flexShrink: 0, background: C.surface, borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', height: '100vh', position: 'sticky', top: 0 }}>
      <div style={{ padding: '20px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: '8px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '3px', background: `linear-gradient(90deg, ${C.cyan} 0%, ${C.cyan} 40%, #fff 40%, #fff 60%, ${C.navy} 60%, ${C.navy} 100%)` }} />
        <a href="https://yousafeconsultancy.com" style={{ display: 'inline-flex' }}>
          <img src="logo.png" style={{ height: '32px', filter: 'invert(1)' }} alt="YouSafe" />
        </a>
        <Badge color="red" style={{ fontSize: '10px', padding: '2px 8px' }}>Admin</Badge>
      </div>
      <div style={{ padding: '12px 8px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <NavItem icon="⬛" label="Dashboard" active={page === 'dashboard'} onClick={() => setPage('dashboard')} />
        <NavItem icon="👥" label="Users" active={page === 'users'} onClick={() => setPage('users')} badge={pendingApprovals.length || null} />
        <NavItem icon="📦" label="All Orders" active={page === 'orders'} onClick={() => setPage('orders')} badge={pendingOrders > 0 ? pendingOrders : null} />
        <NavItem icon="🔒" label="Escrow" active={page === 'escrow'} onClick={() => setPage('escrow')} />
        <NavItem icon="💰" label="Payouts" active={page === 'payouts'} onClick={() => setPage('payouts')} />
        <NavItem icon="📊" label="Analytics" active={page === 'analytics'} onClick={() => setPage('analytics')} />
        <div style={{ height: '1px', background: C.border, margin: '8px 6px' }} />
        <NavItem icon="🛒" label="Services" active={page === 'services'} onClick={() => setPage('services')} />
        <NavItem icon="⚙️" label="Settings" active={page === 'settings'} onClick={() => setPage('settings')} />
      </div>
      <div style={{ padding: '12px', borderTop: `1px solid ${C.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', borderRadius: '10px', background: C.surface2 }}>
          <Avatar name="Admin" size={32} color={C.red} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: C.text }}>Super Admin</div>
            <div style={{ fontSize: '11px', color: C.textMuted }}>admin@yousafe.com</div>
          </div>
          <button
            type="button"
            onClick={onLogout}
            aria-label="Log out and return to Yousafe Consultancy"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              border: `1px solid ${C.border}`,
              borderRadius: '8px',
              background: C.surface,
              color: C.textMuted,
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 700,
              padding: '7px 9px',
              whiteSpace: 'nowrap',
            }}
            title="Log out"
          >
            <span style={{ fontSize: '14px', lineHeight: 1 }}>⏻</span>
            <span>Logout</span>
          </button>
        </div>
      </div>
    </div>
  );

  // ── TOPBAR ──
  const TopBar = ({ title }) => (
    <div style={{ height: '60px', background: C.surface, borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px', position: 'sticky', top: 0, zIndex: 10 }}>
      <h1 style={{ fontSize: '16px', fontWeight: 700 }}>{title}</h1>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <Badge color="orange">{pendingApprovals.length} approvals</Badge>
        <Badge color="orange">{pendingOrders} orders</Badge>
        <div style={{ position: 'relative' }}>
          <button onClick={() => setNotifOpen(!notifOpen)} style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: '8px', padding: '7px 10px', cursor: 'pointer', color: C.textMuted, fontSize: '16px' }}>🔔</button>
          <div style={{ position: 'absolute', top: '4px', right: '4px', width: '8px', height: '8px', background: C.red, borderRadius: '50%', border: `2px solid ${C.surface}` }} />
          {notifOpen && (
            <div style={{ position: 'absolute', right: 0, top: '44px', width: '300px', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)', zIndex: 100 }}>
              <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}`, fontSize: '13px', fontWeight: 700 }}>Admin Alerts</div>
              {alerts.length > 0 ? alerts.map((n, i) => (
                <div key={i} style={{ padding: '12px 16px', display: 'flex', gap: '10px', borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: n.dot || C.cyan, marginTop: '5px', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: '13px', color: C.text, lineHeight: 1.4 }}>{n.text}</div>
                    <div style={{ fontSize: '11px', color: C.textDim, marginTop: '3px' }}>{n.time}</div>
                  </div>
                </div>
              )) : (
                <div style={{ padding: '20px', color: C.textMuted, fontSize: '14px', textAlign: 'center' }}>
                  No alerts available
                </div>
              )}
            </div>
          )}
        </div>
        <UserMenu
          name="Super Admin"
          role="Admin"
          email="admin@yousafe.com"
          color={C.red}
          onNavigate={setPage}
          onLogout={onLogout}
          items={[
            { label: 'Admin settings', icon: '⚙️', action: () => setPage('settings') },
            { label: 'User management', icon: '👥', action: () => setPage('users') },
            { label: 'All orders', icon: '📦', action: () => setPage('orders') },
            { label: 'Escrow queue', icon: '🔒', action: () => setPage('escrow') },
          ]}
        />
      </div>
    </div>
  );

  // ── DASHBOARD ──
  const Dashboard = () => (
    <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <h2 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '4px' }}>Admin Overview</h2>
        <p style={{ color: C.textMuted, fontSize: '14px' }}>Full platform visibility — all users, orders and funds.</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '16px' }}>
        <StatCard label="Total Students" value={totalStudents} icon="🎓" color={C.cyan} delta="+3" />
        <StatCard label="Consultants" value={totalConsultants} icon="👤" color={C.purple} />
        <StatCard label="Support Team" value={totalSupport} icon="🎧" color={C.orange} />
        <StatCard label="Approvals" value={pendingApprovals.length} icon="✅" color={C.green} />
        <StatCard label="In Escrow" value={formatPrimary(pendingEscrow)} icon="🔒" color={C.orange} />
        <StatCard label="Admin Revenue" value={formatPrimary(totalRevenue)} icon="💰" color={C.green} />
      </div>

      {/* Unified approvals */}
      <div>
        <h3 style={{ fontWeight: 700, fontSize: '15px', marginBottom: '16px' }}>Pending User Approvals</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {pendingApprovals.length === 0 ? (
            <div style={{ color: C.textMuted, fontSize: '14px', padding: '20px', textAlign: 'center' }}>No consultant or support approvals waiting.</div>
          ) : pendingApprovals.map(user => (
            <Card key={user.id} style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
              <Avatar name={user.name} size={38} color={user.role === 'support' ? C.orange : C.purple} />
              <div style={{ flex: 1, minWidth: '220px' }}>
                <div style={{ fontWeight: 700, fontSize: '14px' }}>{user.name}</div>
                <div style={{ color: C.textMuted, fontSize: '12px' }}>{user.email}</div>
              </div>
              <Badge color={roleBadgeColor(user.role)}>{approvalLabel(user.role)}</Badge>
              <Btn variant="success" size="sm" onClick={() => approveUser(user)}>Approve</Btn>
              <Btn variant="danger" size="sm" onClick={() => updateUser(user, { status: 'suspended' })}>Reject</Btn>
            </Card>
          ))}
        </div>
      </div>

      {/* Escrow alerts */}
      <div>
        <h3 style={{ fontWeight: 700, fontSize: '15px', marginBottom: '16px' }}>Pending Escrow Releases</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {orders.filter(o => o.status === 'completed' && o.escrow === 'held').length === 0 ? (
            <div style={{ color: C.textMuted, fontSize: '14px', padding: '20px', textAlign: 'center' }}>No pending escrow releases</div>
          ) : orders.filter(o => o.status === 'completed' && o.escrow === 'held').map(order => (
            <Card key={order.id} style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: '14px' }}>{order.service}</div>
                <div style={{ color: C.textMuted, fontSize: '12px' }}>{order.student} → {order.consultant}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 700, color: C.orange }}>{order.amount} held</div>
                <div style={{ fontSize: '12px', color: C.textMuted }}>{order.consultantPay} / {order.adminCut}</div>
              </div>
              <Btn variant="success" size="sm" onClick={() => releaseOrder(order.id)}>Release</Btn>
            </Card>
          ))}
        </div>
      </div>

      {/* Recent orders */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ fontWeight: 700, fontSize: '15px' }}>Recent Orders</h3>
          <Btn variant="ghost" size="sm" onClick={() => setPage('orders')}>View all →</Btn>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {orders.slice(0, 5).map(order => (
            <Card key={order.id} style={{ padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '200px' }}>
                  <div style={{ fontWeight: 600, fontSize: '14px' }}>{order.service}</div>
                  <div style={{ color: C.textMuted, fontSize: '12px' }}>{order.id} · {order.student} · {order.consultant}</div>
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <StatusBadge status={order.status} />
                  <Badge color={order.escrow === 'released' ? 'green' : 'orange'}>{order.escrow === 'released' ? 'Released' : 'In escrow'}</Badge>
                  <span style={{ fontWeight: 700, fontSize: '14px' }}>{order.amount}</span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Revenue split summary */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <Card>
          <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '16px' }}>Revenue Split (all time)</div>
          {[
            { label: 'Total collected', value: orders.reduce((a, o) => a + o.amountValue, 0), color: C.text },
            { label: `Consultant share (${consultantFeePercent}%)`, value: orders.reduce((a, o) => a + moneyValue(o.consultantPay), 0), color: C.cyan },
            { label: `Platform share (${platformFeePercent}%)`, value: orders.reduce((a, o) => a + moneyValue(o.adminCut), 0), color: C.green },
          ].map(r => (
            <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: `1px solid ${C.border}` }}>
              <span style={{ fontSize: '14px', color: C.textMuted }}>{r.label}</span>
              <span style={{ fontSize: '15px', fontWeight: 700, color: r.color }}>{formatPrimary(r.value)}</span>
            </div>
          ))}
        </Card>
        <Card>
          <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '16px' }}>Platform Health</div>
          {[
            { label: 'Avg order value', value: orders.length ? formatPrimary(orders.reduce((a, o) => a + o.amountValue, 0) / orders.length) : 'N/A' },
            { label: 'Completion rate', value: 'N/A' },
            { label: 'Avg response time', value: 'N/A' },
            { label: 'Student satisfaction', value: 'N/A' },
          ].map(r => (
            <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: `1px solid ${C.border}` }}>
              <span style={{ fontSize: '14px', color: C.textMuted }}>{r.label}</span>
              <span style={{ fontSize: '14px', fontWeight: 700, color: C.text }}>{r.value}</span>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );

  // ── USERS ──
  const Users = () => {
    const [inviteEmail, setInviteEmail] = React.useState('');
    const [inviteRole, setInviteRole] = React.useState('student');
    return (
    <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 800, marginBottom: '4px' }}>Users</h2>
          <p style={{ color: C.textMuted, fontSize: '14px' }}>{users.length} total · {totalStudents} students · {totalConsultants} consultants · {totalSupport} support</p>
        </div>
        <Btn variant="primary" size="sm" onClick={() => setInviteModal(true)}>+ Invite user</Btn>
      </div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {['all', 'pending', 'student', 'consultant', 'support'].map(f => (
          <button key={f} onClick={() => setUserFilter(f)} style={{
            padding: '6px 16px', borderRadius: '20px', border: `1px solid ${userFilter === f ? C.cyan : C.border}`,
            background: userFilter === f ? `${C.cyan}18` : C.surface2,
            color: userFilter === f ? C.cyan : C.textMuted,
            fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: userFilter === f ? 600 : 400, textTransform: 'capitalize', transition: 'all 0.15s',
          }}>{f === 'all' ? 'All users' : f === 'pending' ? `Pending approvals (${pendingApprovals.length})` : f === 'student' ? `Students (${totalStudents})` : f === 'consultant' ? `Consultants (${totalConsultants})` : `Support (${totalSupport})`}</button>
        ))}
      </div>
      <Card style={{ padding: '0', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.border}` }}>
              {['User', 'Role', 'Country', 'Joined', 'Orders', 'Financials', 'Status', 'Actions'].map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 700, color: C.textMuted, whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((u, i) => (
              <tr key={u.id} style={{ borderBottom: i < filteredUsers.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                <td style={{ padding: '14px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Avatar name={u.name} size={32} color={u.role === 'consultant' ? C.purple : u.role === 'support' ? C.orange : C.cyan} />
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 600 }}>{u.name}</div>
                      <div style={{ fontSize: '12px', color: C.textMuted }}>{u.email}</div>
                    </div>
                  </div>
                </td>
                <td style={{ padding: '14px 16px' }}><Badge color={roleBadgeColor(u.role)}>{u.role}</Badge></td>
                <td style={{ padding: '14px 16px', fontSize: '13px', color: C.textMuted }}>{u.country}</td>
                <td style={{ padding: '14px 16px', fontSize: '13px', color: C.textMuted }}>{u.joined}</td>
                <td style={{ padding: '14px 16px', fontSize: '14px', fontWeight: 600 }}>{u.orders}</td>
                <td style={{ padding: '14px 16px', fontSize: '13px', color: u.role === 'consultant' ? C.green : C.text, fontWeight: 600 }}>{u.spend}</td>
                <td style={{ padding: '14px 16px' }}><Badge color={u.status === 'active' ? 'green' : 'orange'}>{u.status}</Badge></td>
                <td style={{ padding: '14px 16px' }}>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <Btn variant="ghost" size="sm" onClick={() => setSelectedUser(u)}>View</Btn>
                    {['consultant', 'support'].includes(u.role) && u.status === 'pending' && (
                      <Btn variant="success" size="sm" onClick={() => approveUser(u)}>Approve</Btn>
                    )}
                    {isCurrentAdmin(u) ? (
                      <Badge color="red">You</Badge>
                    ) : (
                      <Btn variant="danger" size="sm" onClick={() => updateUser(u, { status: u.status === 'active' ? 'suspended' : 'active' })}>{u.status === 'active' ? 'Suspend' : 'Activate'}</Btn>
                    )}
                    {['consultant', 'support'].includes(u.role) && !isCurrentAdmin(u) && (
                      <Btn variant="danger" size="sm" onClick={() => deleteUser(u)}>Delete</Btn>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {selectedUser && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }} onClick={() => setSelectedUser(null)}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '18px', padding: '28px', width: '100%', maxWidth: '520px' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <Avatar name={selectedUser.name} size={48} color={selectedUser.role === 'consultant' ? C.purple : selectedUser.role === 'support' ? C.orange : C.cyan} />
                <div>
                  <h3 style={{ fontSize: '18px', fontWeight: 800 }}>{selectedUser.name}</h3>
                  <div style={{ color: C.textMuted, fontSize: '13px' }}>{selectedUser.email}</div>
                </div>
              </div>
              <button onClick={() => setSelectedUser(null)} style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: '18px' }}>✕</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
              {[
                ['Role', selectedUser.role],
                ['Status', selectedUser.status],
                ['Country', selectedUser.country],
                ['Joined', selectedUser.joined],
                ['Orders', selectedUser.orders],
                ['Financials', selectedUser.spend],
              ].map(([label, value]) => (
                <div key={label} style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: '12px', padding: '12px' }}>
                  <div style={{ color: C.textMuted, fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>{label}</div>
                  <div style={{ color: C.text, fontSize: '14px', fontWeight: 700, marginTop: '4px' }}>{value}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <Btn variant="primary" size="sm" onClick={() => { setSelectedUser(null); setOrderFilter('all'); setPage('orders'); }}>View orders</Btn>
              {['consultant', 'support'].includes(selectedUser.role) && selectedUser.status === 'pending' && (
                <Btn variant="success" size="sm" onClick={() => approveUser(selectedUser)}>Approve access</Btn>
              )}
              {isCurrentAdmin(selectedUser) ? (
                <Badge color="red">Current admin account</Badge>
              ) : (
                <Btn variant={selectedUser.status === 'active' ? 'danger' : 'success'} size="sm" onClick={() => updateUser(selectedUser, { status: selectedUser.status === 'active' ? 'suspended' : 'active' })}>
                  {selectedUser.status === 'active' ? 'Suspend user' : 'Activate user'}
                </Btn>
              )}
              {['consultant', 'support'].includes(selectedUser.role) && !isCurrentAdmin(selectedUser) && (
                <Btn variant="danger" size="sm" onClick={() => deleteUser(selectedUser)}>Delete user</Btn>
              )}
              <Btn variant="ghost" size="sm" onClick={() => setSelectedUser(null)}>Close</Btn>
            </div>
          </div>
        </div>
      )}
      {inviteModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }} onClick={() => setInviteModal(false)}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '18px', padding: '28px', width: '100%', maxWidth: '460px' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 800 }}>Invite user</h3>
              <button onClick={() => setInviteModal(false)} style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: '18px' }}>✕</button>
            </div>
            <div style={{ display: 'grid', gap: '14px' }}>
              <Input label="Email address" value={inviteEmail} onChange={setInviteEmail} placeholder="student@example.com" />
              <Select label="Role" value={inviteRole} onChange={setInviteRole} options={[{ value: 'student', label: 'Student' }, { value: 'consultant', label: 'Consultant' }, { value: 'admin', label: 'Admin' }]} />
              <Btn variant="primary" onClick={() => { setInviteModal(false); setActionNotice(`Invite prepared for ${inviteEmail || 'new user'} as ${inviteRole}. Connect an email provider to send real invitations.`); }}>Create invite</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
    );
  };

  // ── ALL ORDERS ──
  const Orders = () => {
    const [assignModal, setAssignModal] = React.useState(null);
    const CONSULTANTS = consultants;
    const filtered = orderFilter === 'all' ? orders : orders.filter(o => o.status === orderFilter);
    const updateOrder = async (orderId, payload) => {
      const res = await fetch(`/api/admin/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Order update failed');
      refreshAdminData();
    };
    const cancelOrder = async orderId => {
      if (!confirm('Cancel this order? It will remain visible for records.')) return;
      await updateOrder(orderId, { status: 'cancelled', note: 'Order cancelled by admin' });
      setSelectedOrder(null);
      setActionNotice(`Order ${orderId} cancelled.`);
    };
    const deleteOrder = async orderId => {
      if (!confirm('Permanently delete this order and its line items? This cannot be undone.')) return;
      const res = await fetch(`/api/admin/orders/${orderId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Order delete failed');
      setSelectedOrder(null);
      setActionNotice(`Order ${orderId} deleted.`);
      refreshAdminData();
    };
    const handleAssign = async (orderId, consultant) => {
      await updateOrder(orderId, { consultant_id: consultant.id, status: 'active' });
      setAssignModal(null);
    };
    const handleUnassign = orderId => updateOrder(orderId, { consultant_id: null, status: 'queued' });
    return (
      <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div><h2 style={{ fontSize: '20px', fontWeight: 800, marginBottom: '4px' }}>All Orders</h2><p style={{ color: C.textMuted, fontSize: '14px' }}>{orders.length} total orders</p></div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {['all','new','active','review','pending','completed','cancelled'].map(f => (
            <button key={f} onClick={() => setOrderFilter(f)} style={{ padding: '6px 16px', borderRadius: '20px', border: `1px solid ${orderFilter===f?C.cyan:C.border}`, background: orderFilter===f?`${C.cyan}18`:C.surface2, color: orderFilter===f?C.cyan:C.textMuted, fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: orderFilter===f?600:400, textTransform: 'capitalize', transition: 'all 0.15s' }}>{f}</button>
          ))}
        </div>
        <Card style={{ padding: '0', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ borderBottom: `1px solid ${C.border}` }}>{['Order','Service','Student','Consultant','Amount','Split','Escrow','Status','Actions'].map(h=><th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 700, color: C.textMuted, whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
            <tbody>
              {filtered.map((o, i) => (
                <tr key={o.id} style={{ borderBottom: i < filtered.length-1 ? `1px solid ${C.border}` : 'none' }}>
                  <td style={{ padding: '14px 16px', fontSize: '13px', fontWeight: 600, color: C.cyan }}>{o.id}</td>
                  <td style={{ padding: '14px 16px', fontSize: '13px', maxWidth: '150px' }}><div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.service}</div></td>
                  <td style={{ padding: '14px 16px', fontSize: '13px', color: C.textMuted }}>{o.student}</td>
                  <td style={{ padding: '14px 16px', fontSize: '13px', color: o.consultant ? C.text : C.textDim, fontStyle: o.consultant ? 'normal' : 'italic' }}>{o.consultant || 'Unassigned'}</td>
                  <td style={{ padding: '14px 16px', fontSize: '14px', fontWeight: 700 }}>{o.amount}</td>
                  <td style={{ padding: '14px 16px', fontSize: '12px' }}><span style={{ color: C.cyan }}>{o.consultantPay}</span> / <span style={{ color: C.green }}>{o.adminCut}</span></td>
                  <td style={{ padding: '14px 16px' }}><Badge color={o.escrow==='released'?'green':'orange'}>{o.escrow==='released'?'✓ Released':'🔒 Held'}</Badge></td>
                  <td style={{ padding: '14px 16px' }}><StatusBadge status={o.status} /></td>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      <Btn variant="ghost" size="sm" onClick={() => setSelectedOrder(o)}>View</Btn>
                      {o.escrow==='held' && o.status==='completed' && <Btn variant="success" size="sm" onClick={() => updateOrder(o.id, { escrow_status: 'released', force: true })}>Release</Btn>}
                      {o.status !== 'cancelled' && <Btn variant="danger" size="sm" onClick={() => cancelOrder(o.id)}>Cancel</Btn>}
                      {o.consultant ? (
                        <><Btn variant="secondary" size="sm" onClick={() => setAssignModal(o)}>Reassign</Btn><Btn variant="danger" size="sm" onClick={() => handleUnassign(o.id)}>Unassign</Btn></>
                      ) : (
                        <Btn variant="primary" size="sm" onClick={() => setAssignModal(o)}>Assign</Btn>
                      )}
                      <Btn variant="danger" size="sm" onClick={() => deleteOrder(o.id)}>Delete</Btn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        {assignModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '20px', padding: '32px', width: '100%', maxWidth: '440px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                <div><h3 style={{ fontSize: '17px', fontWeight: 800 }}>{assignModal.consultant ? 'Reassign' : 'Assign'} consultant</h3><div style={{ color: C.textMuted, fontSize: '13px', marginTop: '4px' }}>{assignModal.id} · {assignModal.service}</div></div>
                <button onClick={() => setAssignModal(null)} style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: '18px' }}>✕</button>
              </div>
              {assignModal.consultant && <div style={{ background: C.surface2, borderRadius: '10px', padding: '12px 14px', marginBottom: '16px', fontSize: '13px', color: C.textMuted }}>Current: <strong style={{ color: C.text }}>{assignModal.consultant}</strong></div>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
                {CONSULTANTS.filter(c => c.id !== assignModal.consultantId).map(c => (
                  <div key={c.id} style={{ padding: '14px 16px', background: C.surface2, borderRadius: '12px', border: `1px solid ${C.border}`, cursor: 'pointer', display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <Avatar name={c.name} size={36} color={C.purple} />
                    <div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: '14px' }}>{c.name}</div><div style={{ fontSize: '12px', color: C.green }}>Available</div></div>
                    <Btn variant="primary" size="sm" onClick={() => handleAssign(assignModal.id, c)}>Assign</Btn>
                  </div>
                ))}
              </div>
              <Btn variant="ghost" fullWidth onClick={() => setAssignModal(null)}>Cancel</Btn>
            </div>
          </div>
        )}
        {selectedOrder && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }} onClick={() => setSelectedOrder(null)}>
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '18px', padding: '28px', width: '100%', maxWidth: '620px' }} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                <div>
                  <h3 style={{ fontSize: '18px', fontWeight: 800 }}>Order details</h3>
                  <div style={{ color: C.cyan, fontSize: '13px', fontWeight: 700, marginTop: '4px' }}>{selectedOrder.id}</div>
                </div>
                <button onClick={() => setSelectedOrder(null)} style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: '18px' }}>✕</button>
              </div>
              <Card style={{ padding: '16px', marginBottom: '16px' }}>
                <div style={{ fontWeight: 800, marginBottom: '6px' }}>{selectedOrder.service}</div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <StatusBadge status={selectedOrder.status} />
                  <Badge color={selectedOrder.escrow === 'released' ? 'green' : 'orange'}>{selectedOrder.escrow === 'released' ? 'Released' : 'Escrow held'}</Badge>
                </div>
              </Card>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                {[
                  ['Student', selectedOrder.student],
                  ['Consultant', selectedOrder.consultant || 'Unassigned'],
                  ['Amount', selectedOrder.amount],
                  ['Consultant payout', selectedOrder.consultantPay],
                  ['Platform cut', selectedOrder.adminCut],
                  ['Created', selectedOrder.createdAt ? new Date(selectedOrder.createdAt).toLocaleString() : '—'],
                ].map(([label, value]) => (
                  <div key={label} style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: '12px', padding: '12px' }}>
                    <div style={{ color: C.textMuted, fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>{label}</div>
                    <div style={{ color: C.text, fontSize: '14px', fontWeight: 700, marginTop: '4px' }}>{value}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <Btn variant="primary" size="sm" onClick={() => { setAssignModal(selectedOrder); setSelectedOrder(null); }}>{selectedOrder.consultant ? 'Reassign consultant' : 'Assign consultant'}</Btn>
                {selectedOrder.escrow === 'held' && selectedOrder.status === 'completed' && (
                  <Btn variant="success" size="sm" onClick={() => updateOrder(selectedOrder.id, { escrow_status: 'released', force: true })}>Release escrow</Btn>
                )}
                {selectedOrder.status !== 'cancelled' && (
                  <Btn variant="danger" size="sm" onClick={() => cancelOrder(selectedOrder.id)}>Cancel order</Btn>
                )}
                <Btn variant="danger" size="sm" onClick={() => deleteOrder(selectedOrder.id)}>Delete order</Btn>
                <Btn variant="ghost" size="sm" onClick={() => setSelectedOrder(null)}>Close</Btn>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── ESCROW ──
  const Escrow = () => {
    const held = orders.filter(o => o.escrow === 'held');
    const released = orders.filter(o => o.escrow === 'released');
    const totalHeld = held.reduce((a, o) => a + o.amountValue, 0);
    const releaseOrder = async orderId => {
      const res = await fetch(`/api/admin/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ escrow_status: 'released', force: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Release failed');
      refreshAdminData();
    };
    return (
      <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 800, marginBottom: '4px' }}>Escrow Management</h2>
          <p style={{ color: C.textMuted, fontSize: '14px' }}>Payments held pending student approval. Released {consultantFeePercent}% to consultant, {platformFeePercent}% to platform.</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
          <StatCard label="Total Held" value={formatPrimary(totalHeld)} icon="🔒" color={C.orange} />
          <StatCard label="Orders in Escrow" value={held.length} icon="📦" color={C.cyan} />
          <StatCard label="Released All Time" value={formatPrimary(released.reduce((a, o) => a + o.amountValue, 0))} icon="✅" color={C.green} />
        </div>
        <div>
          <h3 style={{ fontWeight: 700, fontSize: '15px', marginBottom: '14px' }}>Held — Awaiting Student Approval</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {held.map(o => (
              <Card key={o.id} style={{ padding: '18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: '220px' }}>
                    <div style={{ fontWeight: 700, fontSize: '14px' }}>{o.service}</div>
                    <div style={{ color: C.textMuted, fontSize: '12px', marginTop: '2px' }}>{o.id} · {o.student} → {o.consultant}</div>
                  </div>
                  <div style={{ display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '16px', fontWeight: 800, color: C.orange }}>{o.amount}</div>
                      <div style={{ fontSize: '11px', color: C.textDim }}>Total held</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '16px', fontWeight: 800, color: C.cyan }}>{o.consultantPay}</div>
                      <div style={{ fontSize: '11px', color: C.textDim }}>{consultantFeePercent}% → consultant</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '16px', fontWeight: 800, color: C.green }}>{o.adminCut}</div>
                      <div style={{ fontSize: '11px', color: C.textDim }}>{platformFeePercent}% → platform</div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <StatusBadge status={o.status} />
                      {o.status === 'completed' && <Btn variant="success" size="sm" onClick={() => releaseOrder(o.id)}>Force release</Btn>}
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
        <div>
          <h3 style={{ fontWeight: 700, fontSize: '15px', marginBottom: '14px' }}>Released</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {released.map(o => (
              <Card key={o.id} style={{ padding: '16px', opacity: 0.7 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '14px' }}>{o.service}</div>
                    <div style={{ color: C.textMuted, fontSize: '12px' }}>{o.student} → {o.consultant}</div>
                  </div>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, color: C.green }}>{o.consultantPay} paid out</span>
                    <span style={{ fontWeight: 700, color: C.text }}>{o.adminCut} received</span>
                    <Badge color="green">Released</Badge>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // ── PAYOUTS ──
  const Payouts = () => (
    <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 800 }}>Payouts</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '16px' }}>
        <StatCard label="Platform Revenue" value={formatPrimary(totalRevenue)} icon="💰" color={C.green} />
        <StatCard label="Paid to Consultants" value={formatPrimary(paidToConsultants)} icon="👤" color={C.cyan} />
        <StatCard label="Pending Payouts" value={formatPrimary(pendingEscrow)} icon="⏳" color={C.orange} />
      </div>
      <Card>
        <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '16px' }}>Consultant Payout Queue</div>
        {consultantNames.length > 0 ? consultantNames.map((name, i) => (
          <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 0', borderBottom: `1px solid ${C.border}` }}>
            <Avatar name={name} size={36} color={C.purple} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: '14px' }}>{name}</div>
              <div style={{ fontSize: '12px', color: C.textMuted }}>Pending payout details will appear here</div>
            </div>
            <span style={{ fontWeight: 800, fontSize: '16px', color: C.cyan }}>{formatPrimary(0)}</span>
            <Btn variant="primary" size="sm" onClick={() => setActionNotice(`Payout review opened for ${name}. Stripe payout automation will process eligible released balances.`)}>Pay out</Btn>
          </div>
        )) : (
          <div style={{ padding: '20px', color: C.textMuted, fontSize: '14px', textAlign: 'center' }}>
            No payout queue data available
          </div>
        )}
      </Card>
    </div>
  );

  // ── ANALYTICS ──
  const Analytics = () => (
    <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 800 }}>Analytics</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        <Card>
          <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '16px' }}>Revenue summary</div>
          <div style={{ color: C.textMuted, fontSize: '14px', lineHeight: 1.8 }}>
            Analytics will appear here once platform order and payout history is available.
          </div>
        </Card>
        <Card>
          <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '16px' }}>Service trends</div>
          <div style={{ color: C.textMuted, fontSize: '14px', lineHeight: 1.8 }}>
            Real service volume and country breakdowns are not yet available.
          </div>
        </Card>
        <Card>
          <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '16px' }}>Student origins</div>
          <div style={{ color: C.textMuted, fontSize: '14px', lineHeight: 1.8 }}>
            Country analytics will be populated when student and order data are connected.
          </div>
        </Card>
        <Card>
          <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '16px' }}>Key metrics</div>
          <div style={{ color: C.textMuted, fontSize: '14px', lineHeight: 1.8 }}>
            No key metrics are available until platform data is sourced from the backend.
          </div>
        </Card>
      </div>
    </div>
  );

  // ── SERVICES MANAGEMENT ──
  const ServicesAdmin = () => {
    const [editing, setEditing] = React.useState(null);
    const [saving, setSaving] = React.useState(false);
    const blank = { title: '', category: 'General', price: 0, delivery_days: 7, active: true };
    const saveService = async () => {
      setSaving(true);
      const payload = {
        title: editing.title,
        category: editing.category,
        price: Number(editing.price || 0),
        delivery_days: Number(editing.delivery_days || 7),
        is_active: Boolean(editing.active),
      };
      const res = await fetch(editing.id ? `/api/admin/services/${editing.id}` : '/api/admin/services', {
        method: editing.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      setSaving(false);
      if (!res.ok) throw new Error(data.error || 'Service save failed');
      setEditing(null);
      refreshAdminData();
    };
    const toggleService = async s => {
      const res = await fetch(`/api/admin/services/${s.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: s.title, category: s.category, price: s.price, delivery_days: s.delivery_days, is_active: !s.active }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Service update failed');
      refreshAdminData();
    };
    return (
      <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 800, marginBottom: '4px' }}>Service Catalogue</h2>
            <p style={{ color: C.textMuted, fontSize: '14px' }}>Manage all services available to students.</p>
          </div>
          <Btn variant="primary" size="sm" onClick={() => setEditing(blank)}>+ Add service</Btn>
        </div>
        <Card style={{ padding: '0', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {['Service', 'Category', 'Price', 'Consultant cut', 'Platform cut', 'Orders', 'Status', ''].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 700, color: C.textMuted, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {services.length > 0 ? services.map((s, i) => (
                <tr key={s.id} style={{ borderBottom: i < services.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                  <td style={{ padding: '14px 16px', fontWeight: 600, fontSize: '14px' }}>
                    <div>{s.title}</div>
                    <div style={{ color: C.textMuted, fontSize: '12px', marginTop: '3px' }}>{deliveryLabel(s.delivery_days)}</div>
                  </td>
                  <td style={{ padding: '14px 16px' }}><Badge color="gray">{s.category}</Badge></td>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ fontWeight: 700 }}>{formatMoney(s.price, s.currency)}</div>
                    {String(s.currency || 'usd').toLowerCase() !== 'usd' && s.usd_price > 0 && (
                      <div style={{ color: C.textMuted, fontSize: '12px', marginTop: '3px' }}>{formatMoney(s.usd_price, 'usd')}</div>
                    )}
                  </td>
                  <td style={{ padding: '14px 16px', color: C.cyan, fontWeight: 600 }}>{formatMoney(s.price * (consultantFeePercent / 100), s.currency)}</td>
                  <td style={{ padding: '14px 16px', color: C.green, fontWeight: 600 }}>{formatMoney(s.price * (platformFeePercent / 100), s.currency)}</td>
                  <td style={{ padding: '14px 16px', fontSize: '14px', fontWeight: 600 }}>{s.orders}</td>
                  <td style={{ padding: '14px 16px' }}>
                    <button onClick={() => toggleService(s)} style={{
                      width: '40px', height: '22px', borderRadius: '99px', border: 'none', cursor: 'pointer',
                      background: s.active ? C.cyan : C.surface3, position: 'relative', transition: 'background 0.2s',
                    }}>
                      <div style={{ position: 'absolute', top: '3px', left: s.active ? '20px' : '3px', width: '16px', height: '16px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
                    </button>
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <Btn variant="ghost" size="sm" onClick={() => setEditing(s)}>Edit</Btn>
                    </div>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="8" style={{ padding: '24px 16px', textAlign: 'center', color: C.textMuted }}>No services available yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
        {editing && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '520px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ fontSize: '17px', fontWeight: 800 }}>{editing.id ? 'Edit service' : 'Add service'}</h3>
                <button onClick={() => setEditing(null)} style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: '18px' }}>✕</button>
              </div>
              <div style={{ display: 'grid', gap: '14px' }}>
                <Input label="Service title" value={editing.title} onChange={v => setEditing(s => ({ ...s, title: v }))} />
                <Input label="Category" value={editing.category} onChange={v => setEditing(s => ({ ...s, category: v }))} />
                <Input label="Price (USD)" type="number" value={editing.price} onChange={v => setEditing(s => ({ ...s, price: v }))} />
                <Input label="Delivery days" type="number" value={editing.delivery_days} onChange={v => setEditing(s => ({ ...s, delivery_days: v }))} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: C.surface2, borderRadius: '10px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 600 }}>Visible to students</span>
                  <button onClick={() => setEditing(s => ({ ...s, active: !s.active }))} style={{ width: '44px', height: '24px', borderRadius: '99px', border: 'none', cursor: 'pointer', background: editing.active ? C.cyan : C.surface3, position: 'relative' }}>
                    <div style={{ position: 'absolute', top: '3px', left: editing.active ? '22px' : '3px', width: '18px', height: '18px', borderRadius: '50%', background: '#fff' }} />
                  </button>
                </div>
                <Btn variant="primary" onClick={saveService} disabled={saving}>{saving ? 'Saving…' : 'Save service'}</Btn>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── SETTINGS ──
  const Settings = () => (
    <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '640px' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 800 }}>Platform Settings</h2>
      <Card>
        <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '8px' }}>Primary Currency</div>
        <div style={{ fontSize: '12px', color: C.textMuted, marginBottom: '16px', lineHeight: 1.6 }}>
          The default currency used for new services, the wallet, consultant
          payouts (Stripe transfers), and admin revenue summaries when no
          specific currency is set on the underlying record.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <Select
            label="Currency"
            value={primaryCurrency}
            onChange={setPrimaryCurrency}
            options={[
              { value: 'usd', label: 'US Dollar (USD)' },
              { value: 'cad', label: 'Canadian Dollar (CAD)' },
            ]}
          />
          <div style={{ fontSize: '12px', color: C.textMuted, lineHeight: 1.5 }}>
            Note: Stripe Connect transfers are denominated in this currency.
            CAD payouts require your platform Stripe account to support CAD —
            verify in dashboard.stripe.com before changing.
          </div>
          <Input
            label="USD → CAD display rate"
            value={usdToCadRate}
            onChange={setUsdToCadRate}
            placeholder="1.37"
            hint="Used by the storefront's currency selector to show converted prices. Each service still charges in its own native currency at checkout."
          />
          <Btn variant="primary" size="sm" style={{ alignSelf: 'flex-start' }} onClick={async () => {
            try {
              const rate = Number(usdToCadRate)
              if (!Number.isFinite(rate) || rate <= 0) {
                setActionNotice('Enter a positive USD→CAD rate (e.g. 1.37).');
                return;
              }
              await savePlatformSettings({
                primary_currency: normalizeCurrency(primaryCurrency),
                usd_to_cad_rate: rate,
              });
              setActionNotice(`Currency saved: ${primaryCurrency.toUpperCase()} primary · 1 USD ≈ ${rate.toFixed(4)} CAD.`);
            } catch (e) {
              setActionNotice(e.message || 'Currency update failed.');
            }
          }}>Save currency</Btn>
        </div>
      </Card>
      <Card>
        <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '20px' }}>Revenue Split</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ fontSize: '13px', fontWeight: 600, color: C.textMuted, display: 'block', marginBottom: '8px' }}>Consultant share</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <input type="range" min="50" max="95" value={consultantShare} onChange={e => setConsultantShare(Number(e.target.value))} style={{ flex: 1, accentColor: C.cyan }} />
              <span style={{ fontSize: '16px', fontWeight: 800, color: C.cyan, width: '40px' }}>{consultantShare}%</span>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', background: C.surface2, borderRadius: '10px', fontSize: '14px' }}>
            <span style={{ color: C.textMuted }}>Platform receives</span>
            <span style={{ fontWeight: 700, color: C.green }}>{100 - consultantShare}%</span>
          </div>
          <Btn variant="primary" size="sm" style={{ alignSelf: 'flex-start' }} onClick={async () => {
            try {
              await savePlatformSettings({ consultant_fee_percent: consultantShare, platform_fee_percent: 100 - consultantShare });
              setActionNotice(`Revenue split saved: ${consultantShare}% consultant / ${100 - consultantShare}% platform. Future payouts will use this split.`);
            } catch (e) {
              setActionNotice(e.message || 'Revenue split update failed.');
            }
          }}>Save split</Btn>
        </div>
      </Card>
      <Card>
        <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '20px' }}>Escrow Rules</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <Select label="Auto-release escrow after" value={autoReleaseDays} onChange={setAutoReleaseDays} options={[
            { value: '7', label: '7 days' },
            { value: '14', label: '14 days' },
            { value: '21', label: '21 days' },
            { value: '30', label: '30 days' },
            { value: 'never', label: 'Never (manual only)' },
          ]} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 600 }}>Allow admin force-release</div>
              <div style={{ fontSize: '12px', color: C.textMuted }}>Admin can release escrow without student approval</div>
            </div>
            <button onClick={() => setAllowForceRelease(v => !v)} style={{ width: '44px', height: '24px', borderRadius: '99px', border: 'none', cursor: 'pointer', background: allowForceRelease ? C.cyan : C.surface3, position: 'relative' }}>
              <div style={{ position: 'absolute', top: '3px', left: allowForceRelease ? '22px' : '3px', width: '18px', height: '18px', borderRadius: '50%', background: '#fff' }} />
            </button>
          </div>
          <Btn variant="primary" size="sm" style={{ alignSelf: 'flex-start' }} onClick={async () => {
            try {
              await savePlatformSettings({ auto_release_days: autoReleaseDays, allow_admin_force_release: allowForceRelease });
              setActionNotice(`Escrow rules saved. Admin force-release is ${allowForceRelease ? 'enabled' : 'disabled'}.`);
            } catch (e) {
              setActionNotice(e.message || 'Escrow rules update failed.');
            }
          }}>Save rules</Btn>
        </div>
      </Card>
      <Card>
        <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '20px' }}>Platform Info</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <Input label="Platform name" value={platformName} onChange={setPlatformName} placeholder="Enter platform name" />
          <Input label="Support email" value={supportEmail} onChange={setSupportEmail} placeholder="Enter support email" />
          <Btn variant="primary" size="sm" style={{ alignSelf: 'flex-start' }} onClick={async () => {
            try {
              await savePlatformSettings({ platform_name: platformName, support_email: supportEmail });
              setActionNotice('Platform info saved.');
            } catch (e) {
              setActionNotice(e.message || 'Platform info update failed.');
            }
          }}>Save</Btn>
        </div>
      </Card>
      <Card>
        <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '16px' }}>Stripe Integration</div>
        <div style={{ fontSize: '12px', color: C.textMuted, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ background: '#635bff', color: '#fff', fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px' }}>stripe</span>
          All payments and payouts processed via Stripe Connect.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <Input label="Stripe publishable key" value={stripePublishableKey} onChange={setStripePublishableKey} placeholder="pk_live_..." />
          <Input label="Stripe secret key" value={stripeSecretKey} onChange={setStripeSecretKey} type="password" placeholder="sk_live_..." />
          <Input label="Webhook signing secret" value={webhookSigningSecret} onChange={setWebhookSigningSecret} type="password" placeholder="whsec_..." />
          <Btn variant="primary" size="sm" style={{ alignSelf: 'flex-start' }} onClick={() => setActionNotice('Stripe config saved for this session. Store secrets server-side before production use.')}>Save Stripe config</Btn>
        </div>
      </Card>
    </div>
  );

  const pages = { dashboard: 'Dashboard', users: 'Users', orders: 'All Orders', escrow: 'Escrow', payouts: 'Payouts', analytics: 'Analytics', services: 'Service Catalogue', settings: 'Settings' };

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: C.bg }}>
      <Sidebar />
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        <TopBar title={pages[page] || 'Admin'} />
        <div style={{ flex: 1 }}>
          {loadError && <div style={{ margin: '16px 28px 0', padding: '12px 14px', background: 'rgba(220,38,38,0.10)', border: `1px solid rgba(220,38,38,0.25)`, borderRadius: '10px', color: C.red, fontSize: '13px' }}>{loadError}</div>}
          {loading && <div style={{ margin: '16px 28px 0', color: C.textMuted, fontSize: '13px' }}>Loading live admin data…</div>}
          {actionNotice && (
            <div style={{ margin: '16px 28px 0', padding: '12px 14px', background: `${C.cyan}10`, border: `1px solid ${C.cyan}33`, borderRadius: '10px', color: C.cyan, fontSize: '13px', display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
              <span>{actionNotice}</span>
              <button onClick={() => setActionNotice('')} style={{ background: 'none', border: 'none', color: C.cyan, cursor: 'pointer', fontWeight: 800 }}>×</button>
            </div>
          )}
          {page === 'dashboard' && <Dashboard />}
          {page === 'users' && <Users />}
          {page === 'orders' && <Orders />}
          {page === 'escrow' && <Escrow />}
          {page === 'payouts' && <Payouts />}
          {page === 'analytics' && <Analytics />}
          {page === 'services' && <ServicesAdmin />}
          {page === 'settings' && <Settings />}
        </div>
      </div>
    </div>
  );
}

export default AdminApp;
