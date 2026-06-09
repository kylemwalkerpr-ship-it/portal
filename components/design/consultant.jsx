'use client'
// @ts-nocheck
import React from 'react'
import { C, Btn, Badge, Card, Avatar, UserMenu, StatusBadge, NavItem } from './shared'
import DashboardRightPane from './dashboard-right-pane'
import CustomOfferDialog from './custom-offer-dialog'
import { GlobalLanguageBar } from '@/components/GlobalLanguageBar'
import UnifiedInbox from '../messaging/UnifiedInbox'
import ConsultantOverview from './consultant-overview'
import ConsultantOrders, { OrderDetail } from './consultant-orders'
import ConsultantEarnings from './consultant-earnings'
import ConsultantSettings from './consultant-settings'
import ConsultantProfile from './consultant-profile'
import { usePortalTheme } from './usePortalTheme'
import { resizeAvatarFile } from '@/lib/imageResize'

const PAGE_TITLES = {
  overview: 'Overview',
  orders: 'Orders',
  messages: 'Messages',
  earnings: 'Earnings',
  connect: 'Payout Setup',
  profile: 'My Profile',
  settings: 'Settings',
}

function ConsultantApp({ onLogout }) {
  const [theme, applyTheme] = usePortalTheme()
  const initialPage = React.useMemo(() => {
    if (typeof window === 'undefined') return 'overview';
    const params = new URLSearchParams(window.location.search);
    const goto = params.get('goto') || params.get('page');
    const allowed = ['overview','orders','messages','earnings','profile','settings'];
    return allowed.includes(goto) ? goto : 'overview';
  }, []);
  const [page, setPage] = React.useState(initialPage);
  // Order-detail "Open conversation in Messages" dispatches yousafe-open-messages;
  // switch to the Messages page with that thread so all order comms live in the
  // unified messenger.
  React.useEffect(() => {
    const handler = (e) => {
      const threadId = e?.detail?.threadId;
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        if (threadId) url.searchParams.set('thread', threadId); else url.searchParams.delete('thread');
        window.history.replaceState({}, '', url.toString());
      }
      setPage('messages');
    };
    window.addEventListener('yousafe-open-messages', handler);
    return () => window.removeEventListener('yousafe-open-messages', handler);
  }, []);
  const [selectedOrder, setSelectedOrder] = React.useState(null);
  const [msgInput, setMsgInput] = React.useState('');
  const [messages, setMessages] = React.useState([]);
  const [consultantOffers, setConsultantOffers] = React.useState([]);
  const [showOfferModal, setShowOfferModal] = React.useState(false);
  const [messagesLoading, setMessagesLoading] = React.useState(false);
  const [orders, setOrders] = React.useState([]);
  // Deep-link to a specific order from the messenger offer card.
  React.useEffect(() => {
    const handler = (e) => {
      const orderId = e?.detail?.orderId;
      if (!orderId) return;
      const found = orders.find(o => o.id === orderId);
      if (found) { setSelectedOrder(found); setPage('order-detail'); }
      else { setPage('orders'); }
    };
    window.addEventListener('yousafe-open-order', handler);
    return () => window.removeEventListener('yousafe-open-order', handler);
  }, [orders]);
  const [earningsByDay, setEarningsByDay] = React.useState([]);
  const [notifications, setNotifications] = React.useState([]);
  const [readNotifKeys, setReadNotifKeys] = React.useState(() => new Set());
  const [profileName, setProfileName] = React.useState('');
  const [profileEmail, setProfileEmail] = React.useState('');
  const [profileBio, setProfileBio] = React.useState('');
  const [profileAvatarUrl, setProfileAvatarUrl] = React.useState('');
  const [offersFreeConsult, setOffersFreeConsult] = React.useState(false);
  const [consultBookingUrl, setConsultBookingUrl] = React.useState('');
  const [gigUsage, setGigUsage] = React.useState({ used: 0, limit: 5 });
  const [unreadMessages, setUnreadMessages] = React.useState(0);
  const [uploadingAvatar, setUploadingAvatar] = React.useState(false);
  const [available, setAvailable] = React.useState(true);
  const [notifPrefs, setNotifPrefs] = React.useState({ orders: true, messages: true, payments: true });
  const [autoWithdraw, setAutoWithdraw] = React.useState(false);
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
  const messageFileInputRef = React.useRef(null);
  const avatarInputRef = React.useRef(null);
  const headshotInputRef = React.useRef(null);
  const [uploadingHeadshot, setUploadingHeadshot] = React.useState(false);
  const [privPrefs, setPrivPrefs] = React.useState({ show_full_name: true, share_email_with_clients: false, allow_analytics: true, marketing_emails: false });

  React.useEffect(() => {
    if (selectedOrder) setOrderDetailProgress(Number(selectedOrder.progress) || 0);
  }, [selectedOrder?.id, selectedOrder?.progress]);

  const activeOrders = orders.filter(o => o.status === 'active' || o.status === 'review').length;
  const newOrders = orders.filter(o => o.status === 'new').length;
  const totalEarnings = orders.filter(o => o.status === 'completed').reduce((a, o) => a + (parseInt(String(o.earn || '0').replace(/[^0-9]/g, '')) || 0), 0);
  const monthEarnings = orders.filter(o => o.status !== 'cancelled').reduce((a, o) => a + (parseInt(String(o.earn || '0').replace(/[^0-9]/g, '')) || 0), 0);

  const refreshConsultantData = React.useCallback(() => {
    setLoading(true);
    return fetch('/api/consultant/data')
      .then(async r => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'Unable to load consultant data');
        return data;
      })
      .then((data) => {
        setOrders(data.orders ?? []);
        setEarningsByDay(data.earningsByDay ?? []);
        setProfileName(data.consultant?.name || '');
        setProfileEmail(data.consultant?.email || '');
        setProfileBio(data.consultant?.bio || '');
        setProfileAvatarUrl(data.consultant?.avatarUrl || '');
        setAvailable(data.consultant?.available !== false);
        setOffersFreeConsult(Boolean(data.consultant?.offers_free_consult || data.consultant?.offersFreeConsult));
        setConsultBookingUrl(String(data.consultant?.consult_booking_url || data.consultant?.consultBookingUrl || ''));
        setNotifPrefs(data.consultant?.notifPrefs || { orders: true, messages: true, payments: true });
        setAutoWithdraw(Boolean(data.consultant?.autoWithdraw));
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

  React.useEffect(() => {
    let cancelled = false;
    const pull = () => {
      fetch('/api/messages/unread', { credentials: 'same-origin' })
        .then(r => r.json().catch(() => ({})))
        .then(d => { if (!cancelled) setUnreadMessages(Number(d?.unread || 0)); })
        .catch(() => null);
    };
    pull();
    const id = setInterval(() => { if (document.visibilityState === 'visible') pull(); }, 30_000);
    return () => { cancelled = true; clearInterval(id); }
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
      offers_free_consult: offersFreeConsult,
      consult_booking_url: consultBookingUrl.trim() || null,
    });
    if (ok) setActionNotice('Profile saved.');
  };

  const uploadAvatar = async file => {
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const resized = await resizeAvatarFile(file);
      const form = new FormData();
      form.append('file', resized);
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

  const uploadHeadshot = async file => {
    if (!file) return;
    setUploadingHeadshot(true);
    try {
      const resized = await resizeAvatarFile(file);
      const form = new FormData();
      form.append('file', resized);
      const res = await fetch('/api/consultant/profile/avatar', { method: 'POST', credentials: 'same-origin', body: form });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'Upload failed');
      setProfileAvatarUrl(data.avatar_url || '');
    } catch (e) {
      setActionNotice(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploadingHeadshot(false);
      if (headshotInputRef.current) headshotInputRef.current.value = '';
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

  React.useEffect(() => {
    let cancelled = false;
    const fetchGigCount = () => {
      if (cancelled) return;
      fetch('/api/gigs?countOnly=true', { credentials: 'same-origin' })
        .then(async r => {
          const payload = await r.json().catch(() => ({}));
          const data = payload?.data || payload;
          if (!r.ok) return;
          const next = { used: Number(data.used ?? data.count ?? 0), limit: Number(data.limit ?? 5) };
          if (!cancelled) setGigUsage(next);
        })
        .catch(() => {});
    };
    fetchGigCount();
    const onVisibility = () => { if (document.visibilityState === 'visible') fetchGigCount(); };
    document.addEventListener('visibilitychange', onVisibility);
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') fetchGigCount();
    }, 30000);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      clearInterval(interval);
    };
  }, []);

  const refreshNotifReads = React.useCallback(async () => {
    try {
      const res = await fetch('/api/consultant/notifications');
      const data = await res.json();
      if (res.ok) setReadNotifKeys(new Set(data.readKeys || []));
    } catch { /* non-blocking */ }
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
    } catch { /* best-effort */ }
  }, []);

  const clearReadNotifs = React.useCallback(async () => {
    setReadNotifKeys(new Set());
    try {
      await fetch('/api/consultant/notifications', { method: 'DELETE' });
    } catch { /* best-effort */ }
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
            ? ` Payout transfer failed: ${data.payout.error || 'see payout dashboard'}.`
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
      setActionNotice(`Order ${order.id} started.`);
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
        created_at: m.created_at,
        time: new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      })));
      setConsultantOffers(data.offers ?? []);
    } catch (e) {
      setActionNotice(e.message);
    } finally {
      setMessagesLoading(false);
    }
  }, []);

  const sendMessage = async (file) => {
    const text = msgInput.trim();
    if ((!text && !file) || !selectedOrder?.id) return;
    setMsgInput('');
    try {
      let res;
      if (file) {
        const form = new FormData();
        form.append('orderId', selectedOrder.id);
        form.append('body', text);
        form.append('file', file);
        res = await fetch('/api/consultant/messages', { method: 'POST', body: form });
      } else {
        res = await fetch('/api/consultant/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId: selectedOrder.id, body: text }),
        });
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to send message');
      const m = data.message;
      setMessages(prev => [...prev, {
        id: m.id,
        from: 'consultant',
        text: m.body,
        created_at: m.created_at,
        time: new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }]);
    } catch (e) {
      setMsgInput(text);
      setActionNotice(e.message);
    } finally {
      if (messageFileInputRef.current) messageFileInputRef.current.value = '';
    }
  };

  const withdrawConsultantOffer = async offerOrId => {
    const offer = typeof offerOrId === 'object' && offerOrId ? offerOrId : null;
    const offerId = offer?.id || offerOrId;
    const unified = offer?.source_type === 'unified_offer';
    try {
      let res = await fetch(unified ? `/api/offers/${offerId}/withdraw` : `/api/consultant/offers/${offerId}/withdraw`, { method: 'POST' });
      let data = await res.json().catch(() => null);
      if (!res.ok && !unified) {
        res = await fetch(`/api/offers/${offerId}/withdraw`, { method: 'POST' });
        data = await res.json().catch(() => null);
      }
      if (!res.ok) throw new Error(data?.error?.message || data?.error || 'Could not withdraw offer.');
      await loadMessagesFor(selectedOrder);
    } catch (e) {
      setActionNotice(e.message);
    }
  };

  React.useEffect(() => {
    if (!selectedOrder) {
      setMessages([]);
      setConsultantOffers([]);
      return undefined;
    }
    loadMessagesFor(selectedOrder);
    if (page !== 'messages' && page !== 'order-detail') return undefined;
    const interval = setInterval(() => loadMessagesFor(selectedOrder), 6000);
    return () => clearInterval(interval);
  }, [selectedOrder, loadMessagesFor, page]);

  // Poll consultant data on a slow timer
  React.useEffect(() => {
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      refreshConsultantData();
    }, 30000);
    return () => clearInterval(interval);
  }, [refreshConsultantData]);

  // Privacy prefs state used by ConsultantSettings
  const [privDirty, setPrivDirty] = React.useState(false)
  const [privSaving, setPrivSaving] = React.useState(false)

  React.useEffect(() => {
    fetch('/api/consultant/profile', { credentials: 'same-origin' })
      .then(r => r.json().catch(() => ({})))
      .then(data => {
        if (data?.privacy_prefs) setPrivPrefs({ ...data.privacy_prefs })
      })
      .catch(() => {})
  }, [])

  // ── SIDEBAR ──
  const Sidebar = () => {
    const [loggingOut, setLoggingOut] = React.useState(false);
    const goToRoute = href => {
      if (typeof window !== 'undefined') window.location.href = href;
    };
    const handleLogout = () => {
      if (loggingOut) return;
      setLoggingOut(true);
      onLogout?.();
    };
    const gigsActive = typeof window !== 'undefined' && window.location.pathname.startsWith('/dashboard/gigs');
    const gigsBadge = `${Number(gigUsage?.used || 0)}/${Number(gigUsage?.limit || 5)}`;
    const gigsAtLimit = Number(gigUsage?.used || 0) >= Number(gigUsage?.limit || 5);

    return (
    <div className="yousafe-sidebar" style={{
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
      <div className="yousafe-sidebar-nav" style={{ padding: '12px 8px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <NavItem icon="⬛" label="Overview" active={page === 'overview'} onClick={() => setPage('overview')} />
        <NavItem icon="📦" label="Orders" active={page === 'orders'} onClick={() => setPage('orders')} badge={newOrders > 0 ? `${newOrders} new` : null} />
        <NavItem icon="💬" label="Messages" active={page === 'messages'} onClick={() => setPage('messages')} badge={unreadMessages > 0 ? unreadMessages : null} />
        <NavItem icon="💼" label="My Office" active={gigsActive} onClick={() => goToRoute('/dashboard/gigs')} badge={gigsBadge} badgeColor={gigsAtLimit ? 'orange' : 'gray'} />
        <NavItem icon="📊" label="SEO Analytics" active={typeof window !== 'undefined' && window.location.pathname === '/dashboard/seo-analytics'} onClick={() => goToRoute('/dashboard/seo-analytics')} />
        <div style={{ height: '1px', background: C.border, margin: '8px 6px' }} />
        <NavItem icon="💰" label="Earnings" active={page === 'earnings'} onClick={() => setPage('earnings')} />
        <NavItem icon="👤" label="My Profile" active={page === 'profile'} onClick={() => setPage('profile')} />
        <NavItem icon="⚙️" label="Settings" active={page === 'settings'} onClick={() => setPage('settings')} />
      </div>
      <div className="yousafe-sidebar-user" style={{ padding: '12px', borderTop: `1px solid ${C.border}` }}>
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
            onClick={handleLogout}
            disabled={loggingOut}
            aria-label="Log out and return to YouSafe Consultancy"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              border: `1px solid ${C.border}`,
              borderRadius: '8px',
              background: C.surface,
              color: loggingOut ? C.textDim : C.textMuted,
              cursor: loggingOut ? 'not-allowed' : 'pointer',
              fontSize: '12px',
              fontWeight: 700,
              padding: '7px 9px',
              opacity: loggingOut ? 0.6 : 1,
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
  };

  // ── TOPBAR ──
  const TopBar = ({ title }) => (
    <div className="yousafe-topbar" style={{
      height: '60px', background: C.surface, borderBottom: `1px solid ${C.border}`,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 28px', position: 'sticky', top: 0, zIndex: 10,
    }}>
      <h1 style={{ fontSize: '16px', fontWeight: 700 }}>{title}</h1>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <GlobalLanguageBar />
        {newOrders > 0 && <Badge color="orange">{newOrders} new order{newOrders > 1 ? 's' : ''}</Badge>}
        <div style={{ position: 'relative' }}>
          <button onClick={() => setNotifOpen(!notifOpen)} style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: '8px', padding: '7px 10px', cursor: 'pointer', color: C.textMuted, fontSize: '16px' }}>🔔</button>
          {visibleNotifications.length > 0 && <div style={{ position: 'absolute', top: '4px', right: '4px', width: '8px', height: '8px', background: C.red, borderRadius: '50%', border: `2px solid ${C.surface}` }} />}
          {notifOpen && (
            <div className="yousafe-notification-menu" style={{ position: 'absolute', right: 0, top: '44px', width: '320px', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)', zIndex: 100 }}>
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
            { label: uploadingHeadshot ? 'Uploading photo…' : (profileAvatarUrl ? 'Change photo' : 'Upload headshot'), icon: '🖼️', action: () => headshotInputRef.current?.click() },
            { label: 'Earnings', icon: '💰', action: () => setPage('earnings') },
            { label: 'Messages', icon: '💬', action: () => setPage('messages') },
            { label: 'Orders', icon: '📦', action: () => setPage('orders') },
          ]}
        />
      </div>
    </div>
  );

  return (
    <div className="yousafe-dashboard-shell" style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: C.bg }}>
      <input ref={headshotInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => uploadHeadshot(e.target.files?.[0])} />
      {Sidebar()}
      <div className="yousafe-dashboard-main" style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        {page === 'order-detail'
          ? <TopBar title="Order Details" />
          : <TopBar title={PAGE_TITLES[page] || 'Overview'} />
        }
        <div className="yousafe-dashboard-body" style={{ flex: 1, display: 'flex', alignItems: 'flex-start', minHeight: 0 }}>
          <div className="yousafe-dashboard-content" style={{ flex: 1, minWidth: 0 }}>
            {loadError && <div style={{ margin: '16px 28px 0', padding: '12px 14px', background: 'rgba(220,38,38,0.10)', border: `1px solid rgba(220,38,38,0.25)`, borderRadius: '10px', color: C.red, fontSize: '13px' }}>{loadError}</div>}
            {loading && <div style={{ margin: '16px 28px 0', color: C.textMuted, fontSize: '13px' }}>Loading consultant data…</div>}
            {actionNotice && (
              <div style={{ margin: '16px 28px 0', padding: '12px 14px', background: `${C.cyan}10`, border: `1px solid ${C.cyan}33`, borderRadius: '10px', color: C.cyan, fontSize: '13px', display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                <span>{actionNotice}</span>
                <button onClick={() => setActionNotice('')} style={{ background: 'none', border: 'none', color: C.cyan, cursor: 'pointer', fontWeight: 800 }}>×</button>
              </div>
            )}
            {page === 'overview' && <ConsultantOverview onJump={setPage} profileName={profileName} />}
            {page === 'orders' && (
              <ConsultantOrders
                orders={orders}
                orderFilter={orderFilter}
                setOrderFilter={setOrderFilter}
                setSelectedOrder={setSelectedOrder}
                setPage={setPage}
                onAcceptOrder={acceptOrder}
                onDeclineOrder={declineOrder}
              />
            )}
            {page === 'order-detail' && selectedOrder && (
              <OrderDetail
                order={selectedOrder}
                onBack={() => setPage('orders')}
                orderDetailProgress={orderDetailProgress}
                setOrderDetailProgress={setOrderDetailProgress}
                messages={messages}
                messagesLoading={messagesLoading}
                consultantOffers={consultantOffers}
                msgInput={msgInput}
                setMsgInput={setMsgInput}
                orderFiles={orderFiles}
                filesLoading={filesLoading}
                uploadingFile={uploadingFile}
                fileInputRef={fileInputRef}
                messageFileInputRef={messageFileInputRef}
                onAcceptOrder={acceptOrder}
                onDeclineOrder={declineOrder}
                onSaveProgress={saveOrderProgress}
                onMarkComplete={markOrderComplete}
                onSendMessage={sendMessage}
                onWithdrawOffer={withdrawConsultantOffer}
                onUploadFile={uploadFile}
                onDeleteFile={deleteFile}
                setShowOfferModal={setShowOfferModal}
              />
            )}
            {page === 'messages' && (
              <div style={{ height: 'calc(100vh - 60px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <UnifiedInbox
                  canSendOffer
                  defaultThreadId={typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('thread') : null}
                  onThreadChange={(id) => {
                    if (typeof window === 'undefined') return
                    const url = new URL(window.location.href)
                    if (id) url.searchParams.set('thread', id); else url.searchParams.delete('thread')
                    window.history.replaceState({}, '', url.toString())
                  }}
                />
              </div>
            )}
            {page === 'earnings' && (
              <ConsultantEarnings
                orders={orders}
                monthEarnings={monthEarnings}
                totalEarnings={totalEarnings}
                onNavigate={setPage}
              />
            )}
            {page === 'profile' && <ConsultantProfile />}
            {page === 'settings' && (
              <ConsultantSettings
                profileName={profileName}
                setProfileName={setProfileName}
                profileEmail={profileEmail}
                setProfileEmail={setProfileEmail}
                profileBio={profileBio}
                setProfileBio={setProfileBio}
                profileAvatarUrl={profileAvatarUrl}
                offersFreeConsult={offersFreeConsult}
                setOffersFreeConsult={setOffersFreeConsult}
                consultBookingUrl={consultBookingUrl}
                setConsultBookingUrl={setConsultBookingUrl}
                available={available}
                toggleAvailable={toggleAvailable}
                notifPrefs={notifPrefs}
                toggleNotifPref={toggleNotifPref}
                privPrefs={privPrefs}
                setPrivPrefs={setPrivPrefs}
                privDirty={privDirty}
                setPrivDirty={setPrivDirty}
                privSaving={privSaving}
                setPrivSaving={setPrivSaving}
                uploadingAvatar={uploadingAvatar}
                avatarInputRef={avatarInputRef}
                headshotInputRef={headshotInputRef}
                uploadingHeadshot={uploadingHeadshot}
                onSaveProfile={saveProfile}
                onUploadAvatar={uploadAvatar}
              />
            )}
          </div>
          <DashboardRightPane role="consultant" />
        </div>
      </div>
      {showOfferModal && selectedOrder && (
        <CustomOfferDialog
          chatId={selectedOrder.id}
          providerRole="consultant"
          recipientName={selectedOrder.clientName || selectedOrder.student || 'Client'}
          onClose={() => setShowOfferModal(false)}
          onCreated={async () => {
            setShowOfferModal(false);
            await loadMessagesFor(selectedOrder);
          }}
        />
      )}
    </div>
  );
}

export default ConsultantApp;
