'use client'
// @ts-nocheck
import React from 'react'
import { C, Btn, Badge, Card, Input, Avatar, UserMenu, StatusBadge, PayoutBadge, Divider, StatCard, ProgressBar, NavItem } from './shared'
import DashboardRightPane from './dashboard-right-pane'

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

function ConsultantApp({ onLogout }) {
  const [page, setPage] = React.useState('dashboard');
  const [selectedOrder, setSelectedOrder] = React.useState(null);
  const [msgInput, setMsgInput] = React.useState('');
  const [messages, setMessages] = React.useState([]);
  const [messagesLoading, setMessagesLoading] = React.useState(false);
  const [orders, setOrders] = React.useState([]);
  const [earningsByDay, setEarningsByDay] = React.useState([]);
  const [notifications, setNotifications] = React.useState([]);
  const [readNotifKeys, setReadNotifKeys] = React.useState(() => new Set());
  const [profileName, setProfileName] = React.useState('');
  const [profileEmail, setProfileEmail] = React.useState('');
  const [profileBio, setProfileBio] = React.useState('');
  const [profileAvatarUrl, setProfileAvatarUrl] = React.useState('');
  const [uploadingAvatar, setUploadingAvatar] = React.useState(false);
  const [available, setAvailable] = React.useState(true);
  const [notifPrefs, setNotifPrefs] = React.useState({ orders: true, messages: true, payments: true });
  const [autoWithdraw, setAutoWithdraw] = React.useState(false);
  const [connectStatus, setConnectStatus] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState(null);
  const [orderFilter, setOrderFilter] = React.useState('all');
  const [notifOpen, setNotifOpen] = React.useState(false);
  const [actionNotice, setActionNotice] = React.useState('');
  const [orderFiles, setOrderFiles] = React.useState([]);
  const [filesLoading, setFilesLoading] = React.useState(false);
  const [uploadingFile, setUploadingFile] = React.useState(false);
  const [orderDetailProgress, setOrderDetailProgress] = React.useState(0);
  const fileInputRef = React.useRef(null);
  const avatarInputRef = React.useRef(null);

  React.useEffect(() => {
    if (selectedOrder) setOrderDetailProgress(Number(selectedOrder.progress) || 0);
  }, [selectedOrder?.id, selectedOrder?.progress]);

  const activeOrders = orders.filter(o => o.status === 'active' || o.status === 'review').length;
  const newOrders = orders.filter(o => o.status === 'new').length;
  const totalEarnings = orders.filter(o => o.status === 'completed').reduce((a, o) => a + (parseInt(String(o.earn || '0').replace(/[^0-9]/g, '')) || 0), 0);
  const monthEarnings = orders.filter(o => o.status !== 'cancelled').reduce((a, o) => a + (parseInt(String(o.earn || '0').replace(/[^0-9]/g, '')) || 0), 0);
  const filteredOrders = orderFilter === 'all' ? orders : orders.filter(o => o.status === orderFilter);

  const refreshConsultantData = React.useCallback(() => {
    setLoading(true);
    return Promise.all([
      fetch('/api/consultant/data').then(async r => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'Unable to load consultant data');
        return data;
      }),
      fetch('/api/connect/status').then(async r => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'Unable to load Connect status');
        return data;
      }),
    ])
      .then(([data, status]) => {
        setOrders(data.orders ?? []);
        setEarningsByDay(data.earningsByDay ?? []);
        setProfileName(data.consultant?.name || '');
        setProfileEmail(data.consultant?.email || '');
        setProfileBio(data.consultant?.bio || '');
        setProfileAvatarUrl(data.consultant?.avatarUrl || '');
        setAvailable(data.consultant?.available !== false);
        setNotifPrefs(data.consultant?.notifPrefs || { orders: true, messages: true, payments: true });
        setAutoWithdraw(Boolean(data.consultant?.autoWithdraw));
        setConnectStatus(status);
        const newOrderNotifs = (data.orders ?? [])
          .filter(o => o.status === 'new' || o.status === 'pending')
          .map(o => ({
            key: `order-new:${o.id}`,
            text: `New order: ${o.service} from ${o.student}`,
            time: o.date,
            dot: C.cyan,
            order: o,
          }));
        const failedPayoutNotifs = (data.orders ?? [])
          .filter(o => o.payoutStatus === 'failed')
          .map(o => ({
            key: `payout-failed:${o.id}`,
            text: `Payout failed for ${o.service}`,
            time: 'Needs review',
            dot: C.red,
            order: o,
            target: 'earnings',
          }));
        setNotifications([...newOrderNotifs, ...failedPayoutNotifs]);
        setLoadError(null);
      })
      .catch(e => setLoadError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const persistConsultantPrefs = async patch => {
    try {
      const res = await fetch('/api/consultant/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to update preferences');
      return true;
    } catch (e) {
      setActionNotice(e.message);
      return false;
    }
  };

  const saveProfile = async () => {
    if (profileName.trim().split(/\s+/).length < 2) {
      setActionNotice('Add your first and last name before saving.');
      return;
    }
    const ok = await persistConsultantPrefs({
      full_name: profileName,
      email: profileEmail,
      bio: profileBio,
    });
    if (ok) setActionNotice('Profile saved.');
  };

  const uploadAvatar = async file => {
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/consultant/profile/avatar', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setProfileAvatarUrl(data.avatar_url || '');
      setActionNotice('Profile photo updated.');
    } catch (e) {
      setActionNotice(e.message);
    } finally {
      setUploadingAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  };

  const toggleAvailable = async () => {
    const next = !available;
    setAvailable(next);
    const ok = await persistConsultantPrefs({ available: next });
    if (!ok) setAvailable(!next);
  };

  const toggleNotifPref = async key => {
    const next = { ...notifPrefs, [key]: !notifPrefs[key] };
    setNotifPrefs(next);
    const ok = await persistConsultantPrefs({ notif_prefs: next });
    if (!ok) setNotifPrefs(notifPrefs);
  };

  const toggleAutoWithdraw = async () => {
    const next = !autoWithdraw;
    setAutoWithdraw(next);
    const ok = await persistConsultantPrefs({ auto_withdraw: next });
    if (!ok) setAutoWithdraw(!next);
  };

  React.useEffect(() => { refreshConsultantData(); }, [refreshConsultantData]);

  const refreshNotifReads = React.useCallback(async () => {
    try {
      const res = await fetch('/api/consultant/notifications');
      const data = await res.json();
      if (res.ok) setReadNotifKeys(new Set(data.readKeys || []));
    } catch {
      /* non-blocking */
    }
  }, []);

  React.useEffect(() => { refreshNotifReads(); }, [refreshNotifReads]);

  const markNotifsRead = React.useCallback(async keys => {
    if (!keys || keys.length === 0) return;
    setReadNotifKeys(prev => {
      const next = new Set(prev);
      for (const k of keys) next.add(k);
      return next;
    });
    try {
      await fetch('/api/consultant/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keys }),
      });
    } catch {
      /* best-effort */
    }
  }, []);

  const clearReadNotifs = React.useCallback(async () => {
    setReadNotifKeys(new Set());
    try {
      await fetch('/api/consultant/notifications', { method: 'DELETE' });
    } catch {
      /* best-effort */
    }
  }, []);

  const visibleNotifications = React.useMemo(
    () => notifications.filter(n => !readNotifKeys.has(n.key)),
    [notifications, readNotifKeys],
  );

  const handleNotificationClick = async n => {
    await markNotifsRead([n.key]);
    setNotifOpen(false);
    if (n.target) {
      setPage(n.target);
    } else if (n.order) {
      setSelectedOrder(n.order);
      setPage('order-detail');
    }
  };

  const loadOrderFiles = React.useCallback(async order => {
    if (!order?.id) return;
    setFilesLoading(true);
    try {
      const res = await fetch(`/api/consultant/orders/${order.id}/files`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to load files');
      setOrderFiles(data.files || []);
    } catch (e) {
      setActionNotice(e.message);
    } finally {
      setFilesLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (selectedOrder) loadOrderFiles(selectedOrder);
    else setOrderFiles([]);
  }, [selectedOrder, loadOrderFiles]);

  const uploadFile = async file => {
    if (!file || !selectedOrder?.id) return;
    setUploadingFile(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`/api/consultant/orders/${selectedOrder.id}/files`, {
        method: 'POST',
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setOrderFiles(prev => [data.file, ...prev]);
      setActionNotice(`Uploaded ${data.file.name}.`);
    } catch (e) {
      setActionNotice(e.message);
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const deleteFile = async fileId => {
    if (!selectedOrder?.id || !fileId) return;
    if (typeof window !== 'undefined' && !window.confirm('Delete this file?')) return;
    try {
      const res = await fetch(`/api/consultant/orders/${selectedOrder.id}/files?fileId=${encodeURIComponent(fileId)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to delete file');
      setOrderFiles(prev => prev.filter(f => f.id !== fileId));
    } catch (e) {
      setActionNotice(e.message);
    }
  };

  const [connectBusy, setConnectBusy] = React.useState(false);

  const startConnectOnboarding = async () => {
    setConnectBusy(true);
    setActionNotice('');
    try {
      const res = await fetch('/api/connect/onboard', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        throw new Error(data.error || `Unable to start onboarding (HTTP ${res.status})`);
      }
      window.location.href = data.url;
    } catch (e) {
      setActionNotice(e.message);
      setConnectBusy(false);
    }
  };

  const openConnectDashboard = async () => {
    setConnectBusy(true);
    setActionNotice('');
    try {
      const res = await fetch('/api/connect/dashboard-link', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        throw new Error(data.error || `Unable to open payout dashboard (HTTP ${res.status})`);
      }
      window.location.href = data.url;
    } catch (e) {
      setActionNotice(e.message);
      setConnectBusy(false);
    }
  };

  const markOrderComplete = async order => {
    if (!order) return;
    try {
      const res = await fetch(`/api/consultant/orders/${order.id}/complete`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Unable to complete order');
      await refreshConsultantData();
      setSelectedOrder(prev => prev ? { ...prev, status: 'completed', payoutStatus: data.payout?.transferred ? 'transferred' : prev.payoutStatus } : prev);
      const payoutMsg = data.payout?.transferred
        ? ' Payout transferred to your connected bank.'
        : data.payout?.skipped
          ? ` Payout skipped: ${data.payout.reason || 'see payout setup'}.`
          : data.payout?.failed
            ? ` Payout transfer failed: ${data.payout.error || 'see Stripe dashboard'}.`
            : '';
      setActionNotice(`Order ${order.id} marked complete.${payoutMsg}`);
    } catch (e) {
      setActionNotice(e.message);
    }
  };

  const acceptOrder = async order => {
    if (!order) return;
    try {
      const res = await fetch(`/api/consultant/orders/${order.id}/accept`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to accept order');
      await refreshConsultantData();
      setSelectedOrder(prev => prev && prev.id === order.id ? { ...prev, status: 'active' } : prev);
      setActionNotice(`Order ${order.id} accepted.`);
    } catch (e) {
      setActionNotice(e.message);
    }
  };

  const declineOrder = async order => {
    if (!order) return;
    try {
      const res = await fetch(`/api/consultant/orders/${order.id}/decline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: 'Declined by consultant' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to decline order');
      await refreshConsultantData();
      setSelectedOrder(prev => prev && prev.id === order.id ? null : prev);
      if (page === 'order-detail') setPage('orders');
      setActionNotice(`Order ${order.id} declined and returned to queue.`);
    } catch (e) {
      setActionNotice(e.message);
    }
  };

  const saveOrderProgress = async (order, progress) => {
    if (!order) return;
    try {
      const res = await fetch(`/api/consultant/orders/${order.id}/progress`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ progress }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to save progress');
      await refreshConsultantData();
      setSelectedOrder(prev => prev && prev.id === order.id ? { ...prev, progress, status: data.order?.status || prev.status } : prev);
      setActionNotice('Progress saved.');
    } catch (e) {
      setActionNotice(e.message);
    }
  };

  const loadMessagesFor = React.useCallback(async order => {
    if (!order?.id) return;
    setMessagesLoading(true);
    try {
      const res = await fetch(`/api/consultant/messages?orderId=${encodeURIComponent(order.id)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to load messages');
      setMessages((data.messages ?? []).map(m => ({
        id: m.id,
        from: m.sender_role === 'consultant' ? 'consultant' : 'student',
        text: m.body,
        name: order.student,
        time: new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      })));
    } catch (e) {
      setActionNotice(e.message);
    } finally {
      setMessagesLoading(false);
    }
  }, []);

  const sendMessage = async () => {
    const text = msgInput.trim();
    if (!text || !selectedOrder?.id) return;
    setMsgInput('');
    try {
      const res = await fetch('/api/consultant/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: selectedOrder.id, body: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to send message');
      const m = data.message;
      setMessages(prev => [...prev, {
        id: m.id,
        from: 'consultant',
        text: m.body,
        time: new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }]);
    } catch (e) {
      setMsgInput(text);
      setActionNotice(e.message);
    }
  };

  React.useEffect(() => {
    if (!selectedOrder) {
      setMessages([]);
      return undefined;
    }
    loadMessagesFor(selectedOrder);
    if (page !== 'messages' && page !== 'order-detail') return undefined;
    const interval = setInterval(() => loadMessagesFor(selectedOrder), 6000);
    return () => clearInterval(interval);
  }, [selectedOrder, loadMessagesFor, page]);

  // Poll consultant data on a slow timer so new orders / payouts surface without manual refresh
  React.useEffect(() => {
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      refreshConsultantData();
    }, 30000);
    return () => clearInterval(interval);
  }, [refreshConsultantData]);

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
        <NavItem icon="🏦" label="Payout Setup" active={page === 'connect'} onClick={() => setPage('connect')} />
        <NavItem icon="⚙️" label="Settings" active={page === 'settings'} onClick={() => setPage('settings')} />
      </div>
      <div style={{ padding: '12px', borderTop: `1px solid ${C.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', borderRadius: '10px', background: C.surface2 }}>
          <Avatar name={profileName || 'Consultant'} src={profileAvatarUrl} size={32} color={C.purple} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profileName || 'Consultant'}</div>
            <button
              type="button"
              onClick={toggleAvailable}
              title={available ? 'Available — click to pause new orders' : 'Unavailable — click to resume'}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: '11px', color: available ? C.green : C.textDim, fontFamily: 'inherit' }}
            >
              ● {available ? 'Available' : 'Unavailable'}
            </button>
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
          {visibleNotifications.length > 0 && <div style={{ position: 'absolute', top: '4px', right: '4px', width: '8px', height: '8px', background: C.red, borderRadius: '50%', border: `2px solid ${C.surface}` }} />}
          {notifOpen && (
            <div style={{ position: 'absolute', right: 0, top: '44px', width: '320px', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)', zIndex: 100 }}>
              <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', fontWeight: 700 }}>Notifications</span>
                {visibleNotifications.length > 0 && (
                  <button onClick={() => markNotifsRead(visibleNotifications.map(n => n.key))} style={{ background: 'none', border: 'none', color: C.cyan, cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit', fontWeight: 600 }}>
                    Mark all read
                  </button>
                )}
              </div>
              {visibleNotifications.length > 0 ? visibleNotifications.map((n, i) => (
                <button
                  key={n.key}
                  type="button"
                  onClick={() => handleNotificationClick(n)}
                  style={{ width: '100%', textAlign: 'left', padding: '12px 16px', display: 'flex', gap: '10px', alignItems: 'flex-start', borderBottom: i < visibleNotifications.length - 1 ? `1px solid ${C.border}` : 'none', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: n.dot || C.cyan, marginTop: '5px', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', color: C.text, lineHeight: 1.4 }}>{n.text}</div>
                    <div style={{ fontSize: '11px', color: C.textDim, marginTop: '3px' }}>{n.time}</div>
                  </div>
                </button>
              )) : (
                <div style={{ padding: '20px', color: C.textMuted, fontSize: '14px', textAlign: 'center' }}>
                  You're all caught up.
                </div>
              )}
              {readNotifKeys.size > 0 && (
                <div style={{ padding: '10px 16px', borderTop: `1px solid ${C.border}`, textAlign: 'center' }}>
                  <button onClick={clearReadNotifs} style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit' }}>
                    Reset read state
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        <UserMenu
          name={profileName || 'Consultant'}
          role="Consultant"
          email={profileEmail}
          avatarSrc={profileAvatarUrl}
          color={C.purple}
          onNavigate={setPage}
          onLogout={onLogout}
          items={[
            { label: 'Profile settings', icon: '⚙️', action: () => setPage('settings') },
            { label: 'Orders', icon: '📦', action: () => setPage('orders') },
            { label: 'Messages', icon: '💬', action: () => setPage('messages') },
            { label: 'Payout setup', icon: '🏦', action: () => setPage('connect') },
          ]}
        />
      </div>
    </div>
  );

  // ── DASHBOARD ──
  const Dashboard = () => (
    <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <h2 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '4px' }}>Welcome back, {profileName || 'Consultant'} 👋</h2>
        <p style={{ color: C.textMuted, fontSize: '14px' }}>{newOrders > 0 ? `You have ${newOrders} new order${newOrders === 1 ? '' : 's'} waiting for acceptance.` : 'All orders are up to date.'}</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
        <StatCard label="Active Orders" value={activeOrders} icon="📦" color={C.cyan} />
        <StatCard label="New Requests" value={newOrders} icon="🆕" color={C.orange} />
        <StatCard label="This Month" value={`$${monthEarnings}`} icon="💰" color={C.green} />
        <StatCard label="Completed" value={orders.filter(o => o.status === 'completed').length} icon="🏆" color={C.purple} />
      </div>
      {!connectStatus?.onboarded && (
        <div style={{ background: `${C.orange}12`, border: `1px solid ${C.orange}33`, borderRadius: '14px', padding: '18px', display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '240px' }}>
            <div style={{ fontWeight: 700, color: C.orange, fontSize: '15px' }}>Connect your bank account to receive payouts</div>
            <div style={{ color: C.textMuted, fontSize: '13px', marginTop: '4px' }}>Stripe Connect is required before completed services can be paid out automatically.</div>
          </div>
          <Btn variant="primary" size="sm" onClick={() => setPage('connect')}>Set up payouts</Btn>
        </div>
      )}

      {/* New order alert */}
      {newOrders > 0 && (
        <div style={{ background: `${C.orange}12`, border: `1px solid ${C.orange}33`, borderRadius: '14px', padding: '20px', display: 'flex', gap: '16px', alignItems: 'center' }}>
          <div style={{ fontSize: '28px' }}>📬</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: '15px', color: C.orange }}>New order request</div>
            <div style={{ color: C.textMuted, fontSize: '13px', marginTop: '3px' }}>A new request is waiting for your review.</div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Btn variant="success" size="sm" onClick={() => acceptOrder(orders.find(o => o.status === 'new'))}>Accept</Btn>
            <Btn variant="danger" size="sm" onClick={() => declineOrder(orders.find(o => o.status === 'new'))}>Decline</Btn>
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

      {/* Earnings chart */}
      <div>
        <h3 style={{ fontWeight: 700, fontSize: '15px', marginBottom: '16px' }}>Earnings — Last 30 days</h3>
        <Card style={{ padding: '20px' }}>
          <EarningsChart days={earningsByDay} />
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
                <PayoutBadge status={order.payoutStatus} />
                <span style={{ fontSize: '11px', color: C.textDim }}>Due: {order.deadline}</span>
              </div>
            </div>
            {(order.status === 'new' || order.status === 'pending') && (
              <div style={{ display: 'flex', gap: '8px', marginTop: '14px', paddingTop: '14px', borderTop: `1px solid ${C.border}` }} onClick={e => e.stopPropagation()}>
                <Btn variant="success" size="sm" onClick={() => acceptOrder(order)}>Accept order</Btn>
                <Btn variant="danger" size="sm" onClick={() => declineOrder(order)}>Decline</Btn>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );

  // ── ORDER DETAIL (consultant view) ──
  const OrderDetail = ({ order }) => {
    const progressVal = orderDetailProgress;
    const setProgressVal = setOrderDetailProgress;
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
        {(order.status === 'new' || order.status === 'pending') && (
          <div style={{ background: `${C.orange}12`, border: `1px solid ${C.orange}33`, borderRadius: '12px', padding: '16px', display: 'flex', gap: '12px', alignItems: 'center' }}>
            <span>📬</span>
            <span style={{ color: C.orange, fontWeight: 600, fontSize: '14px' }}>New order — waiting for your acceptance</span>
            <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
              <Btn variant="success" size="sm" onClick={() => acceptOrder(order)}>Accept</Btn>
              <Btn variant="danger" size="sm" onClick={() => declineOrder(order)}>Decline</Btn>
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
                <Btn variant="primary" size="sm" onClick={() => saveOrderProgress(order, progressVal)}>Save progress</Btn>
                {progressVal >= 90 && order.status !== 'completed' && <Btn variant="success" size="sm" onClick={() => markOrderComplete(order)}>Mark as complete</Btn>}
              </div>
            </Card>
            {/* Messages */}
            <Card style={{ padding: '20px' }}>
              <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '16px' }}>Chat with {order.student}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '240px', overflowY: 'auto', marginBottom: '16px' }}>
                {messagesLoading && messages.length === 0 && (
                  <div style={{ color: C.textMuted, fontSize: '13px' }}>Loading messages…</div>
                )}
                {!messagesLoading && messages.length === 0 && (
                  <div style={{ color: C.textMuted, fontSize: '13px' }}>No messages yet — say hello.</div>
                )}
                {messages.map((m, i) => (
                  <div key={m.id || i} style={{ display: 'flex', gap: '10px', flexDirection: m.from === 'consultant' ? 'row-reverse' : 'row' }}>
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
                <input
                  ref={fileInputRef}
                  type="file"
                  style={{ display: 'none' }}
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) uploadFile(f);
                  }}
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
                          <button onClick={() => deleteFile(f.id)} title="Delete" style={{ background: 'none', border: 'none', color: C.red, cursor: 'pointer', fontSize: '14px', padding: '0 4px' }}>×</button>
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
  };

  // ── CLIENTS ──
  const Clients = () => {
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
  };

  // ── EARNINGS ──
  const Earnings = () => {
    const completed = orders.filter(o => o.status === 'completed');
    const transferredCents = completed.reduce((a, o) => a + (o.payoutStatus === 'transferred' ? Number(o.consultantPayoutAmount || 0) : 0), 0);
    const pendingCents = completed.reduce((a, o) => a + (o.payoutStatus !== 'transferred' ? Number(o.consultantPayoutAmount || 0) : 0), 0);
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

        <div style={{ background: `linear-gradient(135deg, ${C.navy} 0%, #0d2060 100%)`, borderRadius: '20px', padding: '28px', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: 0, right: 0, width: '6px', height: '100%', background: C.cyan }} />
          <div style={{ position: 'absolute', top: 0, right: '6px', width: '6px', height: '100%', background: '#fff', opacity: 0.15 }} />
          <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', marginBottom: '8px', fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase' }}>Transferred to your bank</div>
          <div style={{ fontSize: '48px', fontWeight: 800, color: '#fff', marginBottom: '8px' }}>${transferredDollars}</div>
          <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: '13px', marginBottom: '20px' }}>
            Payouts move to your connected bank automatically when orders are completed and approved by the student.
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            {connectStatus?.onboarded ? (
              <Btn variant="primary" size="md" onClick={openConnectDashboard} disabled={connectBusy}>
                {connectBusy ? 'Opening Stripe…' : 'Open Stripe payout dashboard'}
              </Btn>
            ) : (
              <Btn variant="primary" size="md" onClick={() => setPage('connect')}>Set up payouts</Btn>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button onClick={toggleAutoWithdraw} style={{
                width: '40px', height: '22px', borderRadius: '99px', border: 'none', cursor: 'pointer',
                background: autoWithdraw ? C.cyan : 'rgba(255,255,255,0.2)', position: 'relative', transition: 'background 0.2s',
              }}>
                <div style={{ position: 'absolute', top: '3px', left: autoWithdraw ? '20px' : '3px', width: '16px', height: '16px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
              </button>
              <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '13px' }}>Auto-transfer on order approval</span>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '16px' }}>
          <StatCard label="This Month" value={`$${monthEarnings}`} icon="📈" color={C.green} />
          <StatCard label="All Time" value={`$${totalEarnings}`} icon="💰" color={C.cyan} />
          <StatCard label="Pending Payout" value={`$${pendingDollars}`} icon="⏳" color={C.orange} />
          <StatCard label="Completed Orders" value={completedOrders} icon="✅" color={C.purple} />
        </div>

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
              No transferred payouts yet. Earnings appear here once Stripe Connect transfers complete.
            </div>
          )}
        </Card>

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
                  <PayoutBadge status={o.payoutStatus} />
                  <span style={{ fontWeight: 700, color: o.payoutStatus === 'transferred' ? C.green : C.orange }}>{o.earn}</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: C.textMuted, fontSize: '14px', lineHeight: 1.8 }}>
              Your payout history will populate when Stripe Connect transfers settle.
            </div>
          )}
        </Card>
      </div>
    );
  };

  const Connect = () => (
    <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '720px' }}>
      <div>
        <h2 style={{ fontSize: '20px', fontWeight: 800, marginBottom: '4px' }}>Payout Setup</h2>
        <p style={{ color: C.textMuted, fontSize: '14px' }}>Connect your bank account with Stripe Express to receive automatic payouts when services are completed.</p>
      </div>
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '260px' }}>
            <div style={{ fontWeight: 800, fontSize: '16px', marginBottom: '8px' }}>
              {connectStatus?.onboarded ? 'Your payout account is connected' : 'Connect your bank account'}
            </div>
            <div style={{ color: C.textMuted, fontSize: '14px', lineHeight: 1.7 }}>
              {connectStatus?.onboarded
                ? 'You will receive payouts automatically when orders are completed and approved.'
                : 'Stripe securely collects and verifies your bank details. YouSafe never stores your bank account information.'}
            </div>
          </div>
          <Badge color={connectStatus?.onboarded ? 'green' : 'orange'}>
            {connectStatus?.onboarded ? 'Connected' : 'Not connected'}
          </Badge>
        </div>
        <Divider style={{ margin: '20px 0' }} />
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {connectStatus?.onboarded ? (
            <Btn variant="primary" onClick={openConnectDashboard} disabled={connectBusy}>
              {connectBusy ? 'Opening Stripe…' : 'View Payout Dashboard'}
            </Btn>
          ) : (
            <Btn variant="primary" onClick={startConnectOnboarding} disabled={connectBusy}>
              {connectBusy ? 'Redirecting to Stripe…' : 'Connect Bank Account'}
            </Btn>
          )}
          <Btn variant="secondary" onClick={refreshConsultantData} disabled={connectBusy}>Refresh Status</Btn>
        </div>
        <div style={{ marginTop: '16px', color: C.textMuted, fontSize: '13px' }}>
          Charges enabled: {connectStatus?.chargesEnabled ? 'Yes' : 'No'} · Payouts enabled: {connectStatus?.payoutsEnabled ? 'Yes' : 'No'}
        </div>
      </Card>
    </div>
  );

  // ── SETTINGS ──
  const Settings = () => (
    <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '640px' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 800 }}>Settings</h2>
      <Card>
        <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '20px' }}>Profile</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
          <Avatar name={profileName || 'Consultant'} src={profileAvatarUrl} size={60} color={C.purple} />
          <div>
            <div style={{ fontWeight: 700 }}>{profileName || 'Consultant Name'}</div>
            <div style={{ color: C.textMuted, fontSize: '13px' }}>{profileEmail || 'you@example.com'}</div>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              style={{ display: 'none' }}
              onChange={e => uploadAvatar(e.target.files?.[0])}
            />
            <Btn variant="secondary" size="sm" style={{ marginTop: '8px' }} disabled={uploadingAvatar} onClick={() => avatarInputRef.current?.click()}>
              {uploadingAvatar ? 'Uploading...' : profileAvatarUrl ? 'Change photo' : 'Upload headshot'}
            </Btn>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <Input label="First and last name" value={profileName} onChange={setProfileName} placeholder="First Last" />
          <Input label="Email" type="email" value={profileEmail} onChange={setProfileEmail} placeholder="Email address" />
          <Input label="Bio" value={profileBio} onChange={setProfileBio} placeholder="Short profile summary" />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderTop: `1px solid ${C.border}` }}>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 600 }}>Available for orders</div>
              <div style={{ fontSize: '12px', color: C.textMuted }}>Toggle off to pause new requests</div>
            </div>
            <button onClick={toggleAvailable} style={{
              width: '44px', height: '24px', borderRadius: '99px', border: 'none', cursor: 'pointer',
              background: available ? C.green : C.surface3, position: 'relative', transition: 'background 0.2s',
            }}>
              <div style={{ position: 'absolute', top: '3px', left: available ? '22px' : '3px', width: '18px', height: '18px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
            </button>
          </div>
          <Btn variant="primary" size="sm" style={{ alignSelf: 'flex-start' }} onClick={saveProfile}>Save changes</Btn>
        </div>
      </Card>
      <Card>
        <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '20px' }}>Notifications</div>
        {[['orders', 'New order requests'], ['messages', 'Student messages'], ['payments', 'Payment confirmations']].map(([key, label]) => (
          <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${C.border}` }}>
            <span style={{ fontSize: '14px' }}>{label}</span>
            <button onClick={() => toggleNotifPref(key)} style={{
              width: '44px', height: '24px', borderRadius: '99px', border: 'none', cursor: 'pointer',
              background: notifPrefs[key] ? C.cyan : C.surface3, position: 'relative', transition: 'background 0.2s',
            }}>
              <div style={{ position: 'absolute', top: '3px', left: notifPrefs[key] ? '22px' : '3px', width: '18px', height: '18px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
            </button>
          </div>
        ))}
      </Card>
    </div>
  );

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
              {messagesLoading && messages.length === 0 && (
                <div style={{ color: C.textMuted, fontSize: '13px' }}>Loading messages…</div>
              )}
              {!messagesLoading && messages.length === 0 && (
                <div style={{ color: C.textMuted, fontSize: '13px' }}>No messages yet.</div>
              )}
              {messages.map((m, i) => (
                <div key={m.id || i} style={{ display: 'flex', gap: '10px', flexDirection: m.from === 'consultant' ? 'row-reverse' : 'row' }}>
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
      {Sidebar()}
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        {TopBar({ title: { dashboard: 'Dashboard', orders: 'Orders', clients: 'Clients', messages: 'Messages', earnings: 'Earnings', connect: 'Payout Setup', settings: 'Settings', 'order-detail': 'Order Details' }[page] || 'Dashboard' })}
        <div style={{ flex: 1, display: 'flex', alignItems: 'flex-start', minHeight: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {loadError && <div style={{ margin: '16px 28px 0', padding: '12px 14px', background: 'rgba(220,38,38,0.10)', border: `1px solid rgba(220,38,38,0.25)`, borderRadius: '10px', color: C.red, fontSize: '13px' }}>{loadError}</div>}
            {loading && <div style={{ margin: '16px 28px 0', color: C.textMuted, fontSize: '13px' }}>Loading consultant data…</div>}
            {actionNotice && (
              <div style={{ margin: '16px 28px 0', padding: '12px 14px', background: `${C.cyan}10`, border: `1px solid ${C.cyan}33`, borderRadius: '10px', color: C.cyan, fontSize: '13px', display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                <span>{actionNotice}</span>
                <button onClick={() => setActionNotice('')} style={{ background: 'none', border: 'none', color: C.cyan, cursor: 'pointer', fontWeight: 800 }}>×</button>
              </div>
            )}
            {page === 'dashboard' && Dashboard()}
            {page === 'orders' && Orders()}
            {page === 'order-detail' && selectedOrder && OrderDetail({ order: selectedOrder })}
            {page === 'clients' && Clients()}
            {page === 'messages' && Messages()}
            {page === 'earnings' && Earnings()}
            {page === 'connect' && Connect()}
            {page === 'settings' && Settings()}
          </div>
          <DashboardRightPane role="consultant" />
        </div>
      </div>
    </div>
  );
}

export default ConsultantApp;
