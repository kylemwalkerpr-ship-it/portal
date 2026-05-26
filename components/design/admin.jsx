'use client'
import React from 'react'
import { C, Btn, Badge, Card, Input, Select, Avatar, UserMenu, StatusBadge, Divider, StatCard, ProgressBar, NavItem, SearchInput } from './shared'
import AdminFinancials from './admin-financials'
import AdminGigsManager from './admin-gigs'
import { GlobalLanguageBar } from '@/components/GlobalLanguageBar'
import AdminAnalyticsPro from './admin-analytics'
import AdminPayouts from './admin-payouts'
import AdminOrders from './admin-orders'
import AdminEscrow from './admin-escrow'
import AdminDashboard from './admin-dashboard'
import AdminAttorneyApplications from './admin-attorney-applications'
import { usePortalTheme } from './usePortalTheme'
import ThemePicker from './ThemePicker'
import { LanguageSelector } from '../language-selector'

const formatMoney = (value, currency = 'USD') => new Intl.NumberFormat('en-US', { style: 'currency', currency: String(currency || 'USD').toUpperCase(), minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(value || 0));
// Legacy alias kept temporarily; new call sites should use formatPrimary from
// inside AdminApp which respects the admin-controlled primary_currency.
const formatUSD = value => formatMoney(value, 'usd');
const moneyValue = value => Number(String(value ?? 0).replace(/[^0-9.-]/g, '')) || 0;
const DEFAULT_SETTINGS = {
  platform_fee_percent: 20,
  consultant_fee_percent: 80,
  attorney_platform_fee_percent: 25,
  auto_release_days: 14,
  allow_admin_force_release: true,
  platform_name: 'Yousafe Consultancy',
  support_email: 'support@yousafeconsultancy.com',
  primary_currency: 'usd',
  usd_to_cad_rate: 1.37,
};
const SUPPORTED_CURRENCIES = ['usd', 'cad'];
const normalizeCurrency = c => SUPPORTED_CURRENCIES.includes(String(c || '').toLowerCase()) ? String(c).toLowerCase() : 'usd';
const normalizeProductType = value => String(value || 'service').toLowerCase() === 'template' ? 'template' : 'service';
const templateRegionFromType = value => {
  const text = String(value || '').toLowerCase();
  if (text.includes('canada')) return 'Canada';
  if (text.includes('usa') || text.includes('us ')) return 'USA';
  return 'General';
};
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
  attorney: 'green',
  support: 'orange',
  admin: 'red',
})[role] || 'gray';
const approvalLabel = role =>
  role === 'support' ? 'Customer support access'
  : role === 'attorney' ? 'Attorney panel access'
  : 'Consultant access';

// ── Premium section primitives ─────────────────────────────────────────────
const adminEyebrow = {
  color: C.textMuted, fontSize: '10px', letterSpacing: '0.18em',
  textTransform: 'uppercase', fontWeight: 800, marginBottom: '4px',
};
const adminPageTitle = {
  fontFamily: C.serif, fontSize: '30px', fontWeight: 500, color: C.text,
  letterSpacing: '-0.015em', margin: '0 0 6px',
};
const adminPageSub = { color: C.textMuted, fontSize: '13px', margin: 0, maxWidth: '640px', lineHeight: '1.5' };
const adminSectionHeading = {
  fontFamily: C.serif, fontSize: '18px', fontWeight: 500, color: C.text,
  letterSpacing: '-0.005em', margin: '0 0 10px',
};

function AdminApp({ onLogout }) {
  const [theme, applyTheme] = usePortalTheme()
  const [loggingOut, setLoggingOut] = React.useState(false);
  const handleLogout = () => {
    if (loggingOut) return;
    setLoggingOut(true);
    onLogout?.();
  };
  const [page, setPage] = React.useState('dashboard');
  const [userFilter, setUserFilter] = React.useState('all');
  const [orderFilter, setOrderFilter] = React.useState('all');
  const [selectedUser, setSelectedUser] = React.useState(null);
  const [selectedOrder, setSelectedOrder] = React.useState(null);
  const [inviteModal, setInviteModal] = React.useState(false);
  const [actionNotice, setActionNotice] = React.useState('');
  const [notifOpen, setNotifOpen] = React.useState(false);
  const [users, setUsers] = React.useState([]);
  const [attorneyApplications, setAttorneyApplications] = React.useState([]);
  const [attorneyAppFilter, setAttorneyAppFilter] = React.useState('pending');
  const [attorneyAppDecisionId, setAttorneyAppDecisionId] = React.useState(null);
  const [openApplicationId, setOpenApplicationId] = React.useState(null);
  const [pendingInvites, setPendingInvites] = React.useState([]);
  const [invitesLoaded, setInvitesLoaded] = React.useState(false);
  const [currentAdminId, setCurrentAdminId] = React.useState(null);
  const [orders, setOrders] = React.useState([]);
  const [services, setServices] = React.useState([]);
  const [alerts, setAlerts] = React.useState([]);
  const [platformName, setPlatformName] = React.useState('');
  const [supportEmail, setSupportEmail] = React.useState('');
  const [platformSettings, setPlatformSettings] = React.useState(DEFAULT_SETTINGS);
  const [consultantShare, setConsultantShare] = React.useState(DEFAULT_SETTINGS.consultant_fee_percent);
  const [attorneyPlatformFee, setAttorneyPlatformFee] = React.useState(DEFAULT_SETTINGS.attorney_platform_fee_percent);
  const [autoReleaseDays, setAutoReleaseDays] = React.useState(String(DEFAULT_SETTINGS.auto_release_days));
  const [allowForceRelease, setAllowForceRelease] = React.useState(DEFAULT_SETTINGS.allow_admin_force_release);
  const [primaryCurrency, setPrimaryCurrency] = React.useState(DEFAULT_SETTINGS.primary_currency);
  const [usdToCadRate, setUsdToCadRate] = React.useState(String(DEFAULT_SETTINGS.usd_to_cad_rate));
  const [connectByProfile, setConnectByProfile] = React.useState({});
  const [webhookSigningSecret, setWebhookSigningSecret] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState(null);
  const [gigs, setGigs] = React.useState([]);
  const [selectedGig, setSelectedGig] = React.useState(null);
  const [gigFilter, setGigFilter] = React.useState('all');
  const [searchQuery, setSearchQuery] = React.useState('');
  const [orderSearch, setOrderSearch] = React.useState('');

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
      product_type: normalizeProductType(s.product_type),
      slug: s.slug || '',
      title: s.title || '',
      category: s.category || 'General',
      short_description: s.short_description || '',
      full_description: s.full_description || '',
      region: s.region || templateRegionFromType(s.template_type || s.category),
      template_type: s.template_type || '',
      price: Number(s.price || 0),
      price_usd: Number(s.usd_price || s.price || 0),
      usd_price: Number(s.usd_price || 0),
      currency: s.currency || 'usd',
      currency_base: s.currency_base || 'USD',
      price_cad_display: s.price_cad_display ?? '',
      badge: s.badge || '',
      status: s.status || (s.is_active ? 'active' : 'draft'),
      delivery_type: s.delivery_type || (normalizeProductType(s.product_type) === 'template' ? 'Digital Template' : ''),
      file_path: s.file_path || '',
      product_id: '',
      price_id_usd: '',
      payment_link_usd: '',
      delivery_days: Number(s.delivery_days || 7),
      active: Boolean(s.is_active),
      orders: orderCountByService.get(s.id) || 0,
      vertical: s.vertical || 'study_abroad',
    }));
    setUsers(normalizedUsers);
    setOrders(normalizedOrders);
    setServices(normalizedServices);
    setConnectByProfile(data.connectByProfileId || {});
    setPlatformSettings(settings);
    setConsultantShare(consultantPercent);
    setAttorneyPlatformFee(Number(settings.attorney_platform_fee_percent || DEFAULT_SETTINGS.attorney_platform_fee_percent));
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

  const refreshAttorneyApplications = React.useCallback(() => {
    fetch('/api/admin/attorney-applications')
      .then(async r => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'Unable to load attorney applications');
        setAttorneyApplications(Array.isArray(data.applications) ? data.applications : []);
      })
      .catch(e => setLoadError(e.message));
  }, []);

  const refreshInvites = React.useCallback(() => {
    fetch('/api/admin/invite', { credentials: 'same-origin' })
      .then(async r => {
        const body = await r.json().catch(() => null);
        if (!r.ok) {
          const msg = body?.error?.message || (typeof body?.error === 'string' ? body.error : null) || `Request failed (${r.status})`;
          throw new Error(msg);
        }
        const payload = body?.data ?? body ?? {};
        setPendingInvites(Array.isArray(payload.invitations) ? payload.invitations : []);
        setInvitesLoaded(true);
      })
      .catch(e => { setInvitesLoaded(true); console.error('[admin] invites load failed', e?.message || e) });
  }, []);

  const refreshGigs = React.useCallback(() => {
    fetch('/api/admin/gigs', { credentials: 'same-origin' })
      .then(async r => {
        const body = await r.json().catch(() => null);
        if (!r.ok) {
          const msg = body?.error?.message || (typeof body?.error === 'string' ? body.error : null) || `Request failed (${r.status})`;
          throw new Error(msg);
        }
        const payload = body?.data ?? body ?? {};
        setGigs(Array.isArray(payload.gigs) ? payload.gigs : []);
      })
      .catch(e => console.error('[admin] gigs load failed', e?.message || e));
  }, []);

  const sendInvite = async (payload) => {
    const res = await fetch('/api/admin/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || 'Invitation failed.');
    setActionNotice(`Invitation sent to ${payload.email}.`);
    refreshInvites();
    refreshAdminData();
    return data;
  };

  const revokeInvite = async (id) => {
    if (!confirm('Revoke this invitation? The link will stop working immediately.')) return;
    try {
      const res = await fetch(`/api/admin/invite/${id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'Revoke failed.');
      setActionNotice('Invitation revoked.');
      refreshInvites();
    } catch (e) { setActionNotice(e.message) }
  };

  React.useEffect(() => {
    refreshAdminData();
    refreshAttorneyApplications();
    refreshInvites();
    refreshGigs();
  }, [refreshAdminData, refreshAttorneyApplications, refreshInvites, refreshGigs]);

  const decideAttorneyApplication = async (applicationId, action) => {
    if (attorneyAppDecisionId) return;
    setAttorneyAppDecisionId(applicationId);
    try {
      const res = await fetch(`/api/admin/attorney-applications/${applicationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Could not ${action} application`);
      setActionNotice(action === 'approve' ? 'Attorney application approved.' : 'Attorney application declined.');
      refreshAttorneyApplications();
      refreshAdminData();
    } catch (e) {
      setActionNotice(e.message);
    } finally {
      setAttorneyAppDecisionId(null);
    }
  };

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
    setAttorneyPlatformFee(Number(data.settings.attorney_platform_fee_percent || DEFAULT_SETTINGS.attorney_platform_fee_percent));
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
    if (!['consultant', 'support', 'attorney'].includes(user.role)) {
      setActionNotice('Only consultant, attorney and support staff accounts can be deleted here.');
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
  const pendingApprovals = users.filter(u => ['consultant', 'support', 'attorney'].includes(u.role) && u.status === 'pending');
  const totalAttorneys = users.filter(u => u.role === 'attorney').length;
  const pendingAttorneyApps = attorneyApplications.filter(a => a.status === 'pending');
  const filteredAttorneyApps = attorneyAppFilter === 'all' ? attorneyApplications : attorneyApplications.filter(a => a.status === attorneyAppFilter);
  const pendingOrders = orders.filter(o => o.status === 'new' || o.status === 'pending').length;
  const searchedUsers = searchQuery ? users.filter(u => u.name.toLowerCase().includes(searchQuery.toLowerCase()) || u.email.toLowerCase().includes(searchQuery.toLowerCase())) : users;
  const filteredUsers = userFilter === 'all' ? searchedUsers : userFilter === 'pending' ? searchedUsers.filter(u => u.status === 'pending' && ['consultant', 'support', 'attorney'].includes(u.role)) : searchedUsers.filter(u => u.role === userFilter);
  const searchedOrders = orderSearch ? orders.filter(o => o.id.toLowerCase().includes(orderSearch.toLowerCase()) || o.service.toLowerCase().includes(orderSearch.toLowerCase()) || o.student.toLowerCase().includes(orderSearch.toLowerCase()) || (o.consultant && o.consultant.toLowerCase().includes(orderSearch.toLowerCase()))) : orders;
  const filteredOrders = orderFilter === 'all' ? searchedOrders : searchedOrders.filter(o => o.status === orderFilter);
  const consultants = users.filter(u => u.role === 'consultant' && u.status === 'active');
  const consultantNames = consultants.map(u => u.name);

  // ── SIDEBAR ──
  const Sidebar = () => (
    <div className="yousafe-sidebar" style={{ width: '240px', flexShrink: 0, background: C.surface, borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', height: '100vh', position: 'sticky', top: 0 }}>
      <div style={{ padding: '20px 18px', borderBottom: `1px solid ${C.border}` }}>
        <a href="https://yousafeconsultancy.com" aria-label="Back to Yousafe Consultancy" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }}>
          <span style={{ width: '30px', height: '30px', borderRadius: '8px', background: `linear-gradient(135deg, ${C.cyan}, ${C.cyan}dd)`, color: '#fff', fontFamily: C.serif, fontWeight: 600, fontSize: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 6px rgba(60,59,110,0.25)' }}>Y</span>
          <div>
            <span style={{ fontFamily: C.serif, fontSize: '17px', color: C.text, letterSpacing: '0.005em', display: 'block', lineHeight: 1.2 }}>YouSafe</span>
            <span style={{ fontSize: '9px', color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.16em', fontWeight: 700 }}>Admin console</span>
          </div>
        </a>
      </div>
      <div className="yousafe-sidebar-nav" style={{ padding: '12px 8px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <NavItem icon="⬛" label="Dashboard" active={page === 'dashboard'} onClick={() => setPage('dashboard')} />
        <NavItem icon="👥" label="Users" active={page === 'users'} onClick={() => setPage('users')} badge={pendingApprovals.length || null} />
        <NavItem icon="⚖️" label="Attorney Applications" active={page === 'attorney-applications'} onClick={() => setPage('attorney-applications')} badge={pendingAttorneyApps.length || null} />
        <NavItem icon="📦" label="All Orders" active={page === 'orders'} onClick={() => setPage('orders')} badge={pendingOrders > 0 ? pendingOrders : null} />
        <NavItem icon="🗂️" label="Order Kanban" active={typeof window !== 'undefined' && window.location.pathname === '/dashboard/admin/orders'} onClick={() => { if (typeof window !== 'undefined') window.location.href = '/dashboard/admin/orders' }} />
        <NavItem icon="🎫" label="Support Tickets" active={typeof window !== 'undefined' && window.location.pathname === '/dashboard/admin/tickets'} onClick={() => { if (typeof window !== 'undefined') window.location.href = '/dashboard/admin/tickets' }} />
        <NavItem icon="📥" label="Inquiries" active={page === 'inquiries'} onClick={() => setPage('inquiries')} />
        <NavItem icon="🔒" label="Escrow" active={page === 'escrow'} onClick={() => setPage('escrow')} />
        <NavItem icon="💰" label="Payouts" active={page === 'payouts'} onClick={() => setPage('payouts')} />
        <NavItem icon="📊" label="Analytics" active={page === 'analytics'} onClick={() => setPage('analytics')} />
        <NavItem icon="💵" label="Financials" active={page === 'financials'} onClick={() => setPage('financials')} />
        <NavItem icon="⭐" label="Gigs" active={page === 'gigs'} onClick={() => setPage('gigs')} />
        <div style={{ height: '1px', background: C.border, margin: '8px 6px' }} />
        <NavItem icon="🛒" label="Catalogue" active={page === 'services'} onClick={() => setPage('services')} />
        <NavItem icon="⚙️" label="Settings" active={page === 'settings'} onClick={() => setPage('settings')} />
      </div>
      <div className="yousafe-sidebar-user" style={{ padding: '12px', borderTop: `1px solid ${C.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', borderRadius: '10px', background: C.surface2 }}>
          <Avatar name="Admin" size={32} color={C.red} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: C.text }}>Super Admin</div>
            <div style={{ fontSize: '11px', color: C.textMuted }}>admin@yousafe.com</div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            aria-label="Log out"
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
              whiteSpace: 'nowrap',
              opacity: loggingOut ? 0.6 : 1,
            }}
            title={loggingOut ? 'Signing out…' : 'Log out'}
          >
            <span style={{ fontSize: '14px', lineHeight: 1 }}>{loggingOut ? '⏳' : '⏻'}</span>
            <span>{loggingOut ? 'Signing out…' : 'Logout'}</span>
          </button>
        </div>
      </div>
    </div>
  );

  // ── TOPBAR ──
  const TopBar = ({ title }) => (
    <div className="yousafe-topbar" style={{ height: '60px', background: C.surface, borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px', position: 'sticky', top: 0, zIndex: 10 }}>
      <h1 style={{ fontSize: '16px', fontWeight: 700 }}>{title}</h1>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <GlobalLanguageBar />
        <Badge color="orange">{pendingApprovals.length} approvals</Badge>
        <Badge color="orange">{pendingOrders} orders</Badge>
        <div style={{ position: 'relative' }}>
          <button onClick={() => setNotifOpen(!notifOpen)} style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: '8px', padding: '7px 10px', cursor: 'pointer', color: C.textMuted, fontSize: '16px' }}>🔔</button>
          {alerts.length > 0 && <div style={{ position: 'absolute', top: '4px', right: '4px', width: '8px', height: '8px', background: C.red, borderRadius: '50%', border: `2px solid ${C.surface}` }} />}
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
        <div style={adminEyebrow}>Today</div>
        <h2 style={adminPageTitle}>Admin overview.</h2>
        <p style={adminPageSub}>Full platform visibility — every user, order, and dollar.</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '16px' }}>
        <StatCard label="Total Students" value={totalStudents} icon="🎓" color={C.cyan} delta="+3"
          onClick={() => { setUserFilter('student'); setPage('users'); }} />
        <StatCard label="Consultants" value={totalConsultants} icon="👤" color={C.purple}
          onClick={() => { setUserFilter('consultant'); setPage('users'); }} />
        <StatCard label="Support Team" value={totalSupport} icon="🎧" color={C.orange}
          onClick={() => { setUserFilter('support'); setPage('users'); }} />
        <StatCard label="Approvals" value={pendingApprovals.length} icon="✅" color={C.green}
          onClick={() => { setUserFilter('pending'); setPage('users'); }} />
        <StatCard label="In Escrow" value={formatPrimary(pendingEscrow)} icon="🔒" color={C.orange}
          onClick={() => setPage('escrow')} />
        <StatCard label="Admin Revenue" value={formatPrimary(totalRevenue)} icon="💰" color={C.green}
          onClick={() => setPage('analytics')} />
      </div>

      {/* Unified approvals */}
      <Card style={{ padding: '20px 22px' }}>
        <h3 style={{ ...adminSectionHeading, marginBottom: '14px' }}>Pending user approvals</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {pendingApprovals.length === 0 ? (
            <div style={{ color: C.textMuted, fontSize: '14px', padding: '16px', textAlign: 'center', background: C.surface2, borderRadius: '10px' }}>No consultant or support approvals waiting.</div>
          ) : pendingApprovals.map(user => (
            <div key={user.id} style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', padding: '14px 16px', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: '10px' }}>
              <Avatar name={user.name} size={38} color={user.role === 'support' ? C.orange : C.purple} />
              <div style={{ flex: 1, minWidth: '220px' }}>
                <div style={{ fontWeight: 700, fontSize: '14px' }}>{user.name}</div>
                <div style={{ color: C.textMuted, fontSize: '12px' }}>{user.email}</div>
              </div>
              <Badge color={roleBadgeColor(user.role)}>{approvalLabel(user.role)}</Badge>
              <Btn variant="success" size="sm" onClick={() => approveUser(user)}>Approve</Btn>
              <Btn variant="danger" size="sm" onClick={() => updateUser(user, { status: 'suspended' })}>Reject</Btn>
            </div>
          ))}
        </div>
      </Card>

      {/* Escrow alerts */}
      <Card style={{ padding: '20px 22px' }}>
        <h3 style={{ ...adminSectionHeading, marginBottom: '14px' }}>Pending Escrow Releases</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {orders.filter(o => o.status === 'completed' && o.escrow === 'held').length === 0 ? (
            <div style={{ color: C.textMuted, fontSize: '14px', padding: '16px', textAlign: 'center', background: C.surface2, borderRadius: '10px' }}>No pending escrow releases</div>
          ) : orders.filter(o => o.status === 'completed' && o.escrow === 'held').map(order => (
            <div key={order.id} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '14px 16px', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: '10px' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: '14px' }}>{order.service}</div>
                <div style={{ color: C.textMuted, fontSize: '12px' }}>{order.student} → {order.consultant}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 700, color: C.orange }}>{order.amount} held</div>
                <div style={{ fontSize: '12px', color: C.textMuted }}>{order.consultantPay} / {order.adminCut}</div>
              </div>
              <Btn variant="success" size="sm" onClick={() => releaseOrder(order.id)}>Release</Btn>
            </div>
          ))}
        </div>
      </Card>

      {/* Recent orders */}
      <Card style={{ padding: '20px 22px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <h3 style={{ ...adminSectionHeading, margin: 0 }}>Recent Orders</h3>
          <Btn variant="ghost" size="sm" onClick={() => setPage('orders')}>View all →</Btn>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {orders.slice(0, 5).length === 0 ? (
            <div style={{ color: C.textMuted, fontSize: '14px', padding: '16px', textAlign: 'center', background: C.surface2, borderRadius: '10px' }}>No orders yet.</div>
          ) : orders.slice(0, 5).map(order => (
            <div key={order.id} style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', padding: '12px 14px', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: '10px' }}>
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
          ))}
        </div>
      </Card>

      {/* Revenue split summary */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <Card>
          <div style={adminSectionHeading}>Revenue Split (all time)</div>
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
          <div style={adminSectionHeading}>Platform Health</div>
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
    const [sortCol, setSortCol] = React.useState('joined');
    const [sortDir, setSortDir] = React.useState('desc');
    const [statusFilter, setStatusFilter] = React.useState('all');
    const [countryFilter, setCountryFilter] = React.useState('all');
    const [selectedRows, setSelectedRows] = React.useState(new Set());
    const [tableHoverRow, setTableHoverRow] = React.useState(null);
    const [localPage, setLocalPage] = React.useState(1);
    const PER_PAGE = 15;

    const ROLE_COLORS = { student: '#0891B2', consultant: '#7C3AED', attorney: '#0F172A', support: '#D97706', admin: '#DC2626' };
    const ROLE_BG     = { student: '#EFF6FF', consultant: '#F5F3FF', attorney: '#EFF6FF', support: '#FFF7ED', admin: '#FEF2F2' };

    const countries = React.useMemo(() => {
      const set = new Set(filteredUsers.map(u => u.country).filter(Boolean));
      return ['all', ...Array.from(set).sort()];
    }, [filteredUsers]);

    const handleSort = col => {
      if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
      else { setSortCol(col); setSortDir('asc'); }
      setLocalPage(1);
    };

    const afterSort = React.useMemo(() => {
      return [...filteredUsers].sort((a, b) => {
        let av = a[sortCol] ?? '', bv = b[sortCol] ?? '';
        if (sortCol === 'orders') { av = Number(av) || 0; bv = Number(bv) || 0; }
        if (typeof av === 'string') av = av.toLowerCase();
        if (typeof bv === 'string') bv = bv.toLowerCase();
        if (av < bv) return sortDir === 'asc' ? -1 : 1;
        if (av > bv) return sortDir === 'asc' ? 1 : -1;
        return 0;
      });
    }, [filteredUsers, sortCol, sortDir]);

    const afterFilters = React.useMemo(() => {
      return afterSort
        .filter(u => statusFilter === 'all' || u.status === statusFilter)
        .filter(u => countryFilter === 'all' || u.country === countryFilter);
    }, [afterSort, statusFilter, countryFilter]);

    const totalPages = Math.max(1, Math.ceil(afterFilters.length / PER_PAGE));
    const pagedUsers = afterFilters.slice((localPage - 1) * PER_PAGE, localPage * PER_PAGE);
    const maxOrders  = Math.max(1, ...filteredUsers.map(u => Number(u.orders) || 0));

    // Role breakdown for the mini stacked bar
    const roleDist = ['student','consultant','attorney','support','admin'].map(r => ({
      role: r, count: filteredUsers.filter(u => u.role === r).length, color: ROLE_COLORS[r],
    })).filter(r => r.count > 0);
    const totalForDist = Math.max(1, roleDist.reduce((s, r) => s + r.count, 0));

    // Status breakdown
    const activeCt  = filteredUsers.filter(u => u.status === 'active').length;
    const pendingCt = filteredUsers.filter(u => u.status === 'pending').length;
    const suspCt    = filteredUsers.filter(u => u.status === 'suspended').length;

    const toggleRow = id => setSelectedRows(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    const toggleAll = () => setSelectedRows(prev =>
      prev.size === pagedUsers.length ? new Set() : new Set(pagedUsers.map(u => u.id))
    );
    const allSelected = pagedUsers.length > 0 && selectedRows.size === pagedUsers.length;

    const SortIcon = ({ col }) => {
      if (sortCol !== col) return <span style={{ opacity: 0.25, fontSize: '10px', marginLeft: '4px' }}>⇅</span>;
      return <span style={{ fontSize: '10px', marginLeft: '4px', color: '#C4A45A' }}>{sortDir === 'asc' ? '▲' : '▼'}</span>;
    };

    const thStyle = (col, extra = {}) => ({
      padding: '12px 14px', textAlign: 'left', fontSize: '11px', fontWeight: 700,
      color: sortCol === col ? '#C4A45A' : 'rgba(255,255,255,0.70)',
      background: '#0F172A', whiteSpace: 'nowrap', cursor: 'pointer',
      letterSpacing: '0.06em', textTransform: 'uppercase', userSelect: 'none',
      borderBottom: '2px solid rgba(255,255,255,0.08)',
      transition: 'color 0.12s', ...extra,
    });

    const tdStyle = (extra = {}) => ({
      padding: '11px 14px', fontSize: '13px', color: C.text,
      borderBottom: `1px solid ${C.border}`, verticalAlign: 'middle', ...extra,
    });

    return (
    <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Page header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={adminEyebrow}>Members</div>
          <h2 style={adminPageTitle}>Users</h2>
          <p style={adminPageSub}>{users.length} total · {totalStudents} students · {totalConsultants} consultants · {totalAttorneys} attorneys · {totalSupport} support</p>
        </div>
        <Btn variant="primary" size="sm" onClick={() => setInviteModal(true)}>+ Invite user</Btn>
      </div>

      {/* Summary strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
        {/* Role distribution bar */}
        <Card style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Role breakdown</div>
          <div style={{ display: 'flex', height: '10px', borderRadius: '5px', overflow: 'hidden', gap: '1px' }}>
            {roleDist.map(r => (
              <div key={r.role} title={`${r.role}: ${r.count}`} style={{ width: `${(r.count / totalForDist) * 100}%`, background: r.color, minWidth: r.count > 0 ? '4px' : '0' }} />
            ))}
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {roleDist.map(r => (
              <span key={r.role} style={{ fontSize: '11px', color: C.textMuted, display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: r.color, display: 'inline-block' }} />
                {r.role} <strong style={{ color: C.text }}>{r.count}</strong>
              </span>
            ))}
          </div>
        </Card>

        {/* Status distribution */}
        <Card style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Account status</div>
          {[{ label: 'Active', count: activeCt, color: C.green }, { label: 'Pending', count: pendingCt, color: C.orange }, { label: 'Suspended', count: suspCt, color: C.red }].map(s => (
            <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px', color: C.textMuted, width: '64px' }}>{s.label}</span>
              <div style={{ flex: 1, height: '6px', background: C.surface3, borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(s.count / Math.max(1, filteredUsers.length)) * 100}%`, background: s.color, borderRadius: '3px', transition: 'width 0.4s' }} />
              </div>
              <span style={{ fontSize: '12px', fontWeight: 700, color: C.text, minWidth: '20px', textAlign: 'right' }}>{s.count}</span>
            </div>
          ))}
        </Card>

        {/* Quick filters */}
        <Card style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Quick filters</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {['all', 'pending', 'student', 'consultant', 'attorney', 'support'].map(f => (
              <button key={f} onClick={() => { setUserFilter(f); setLocalPage(1); }} style={{
                padding: '4px 10px', borderRadius: '4px', fontSize: '12px', cursor: 'pointer',
                border: `1px solid ${userFilter === f ? '#0F172A' : C.border}`,
                background: userFilter === f ? '#0F172A' : C.surface2,
                color: userFilter === f ? '#fff' : C.textMuted,
                fontWeight: userFilter === f ? 600 : 400, fontFamily: 'inherit',
              }}>
                {f === 'all' ? 'All' : f === 'pending' ? `Pending (${pendingApprovals.length})` : f === 'student' ? `Students (${totalStudents})` : f === 'consultant' ? `Consultants (${totalConsultants})` : f === 'attorney' ? `Attorneys (${totalAttorneys})` : `Support (${totalSupport})`}
              </button>
            ))}
          </div>
        </Card>
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: '220px', maxWidth: '340px' }}>
          <SearchInput value={searchQuery} onChange={v => { setSearchQuery(v); setLocalPage(1); }} placeholder="Search name or email…" />
        </div>

        {/* Status sub-filter */}
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setLocalPage(1); }}
          style={{ padding: '8px 12px', borderRadius: '8px', border: `1px solid ${C.border}`, background: C.surface2, color: C.text, fontSize: '13px', fontFamily: 'inherit', cursor: 'pointer' }}>
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="pending">Pending</option>
          <option value="suspended">Suspended</option>
        </select>

        {/* Country filter */}
        <select value={countryFilter} onChange={e => { setCountryFilter(e.target.value); setLocalPage(1); }}
          style={{ padding: '8px 12px', borderRadius: '8px', border: `1px solid ${C.border}`, background: C.surface2, color: C.text, fontSize: '13px', fontFamily: 'inherit', cursor: 'pointer' }}>
          {countries.map(c => <option key={c} value={c}>{c === 'all' ? 'All countries' : c}</option>)}
        </select>

        {/* Results count */}
        <span style={{ fontSize: '12px', color: C.textMuted, marginLeft: 'auto' }}>
          {afterFilters.length} result{afterFilters.length !== 1 ? 's' : ''}
          {selectedRows.size > 0 && <span style={{ marginLeft: '8px', color: C.cyan, fontWeight: 700 }}>· {selectedRows.size} selected</span>}
        </span>
      </div>

      {/* Table */}
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '860px' }}>
            <thead>
              <tr>
                {/* Checkbox */}
                <th style={{ ...thStyle(''), width: '40px', cursor: 'default', padding: '12px 10px 12px 16px' }}>
                  <input type="checkbox" checked={allSelected} onChange={toggleAll}
                    style={{ width: '15px', height: '15px', cursor: 'pointer', accentColor: '#C4A45A' }} />
                </th>
                {[
                  { key: 'name',    label: 'User'       },
                  { key: 'role',    label: 'Role'       },
                  { key: 'country', label: 'Country'    },
                  { key: 'joined',  label: 'Joined'     },
                  { key: 'orders',  label: 'Orders'     },
                  { key: 'spend',   label: 'Financials' },
                  { key: 'status',  label: 'Status'     },
                ].map(({ key, label }) => (
                  <th key={key} style={thStyle(key)} onClick={() => handleSort(key)}>
                    {label}<SortIcon col={key} />
                  </th>
                ))}
                <th style={{ ...thStyle('', { cursor: 'default' }) }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pagedUsers.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ padding: '48px 24px', textAlign: 'center', color: C.textMuted, fontSize: '14px' }}>
                    No users match the current filters.
                  </td>
                </tr>
              ) : pagedUsers.map((u, i) => {
                const isSelected = selectedRows.has(u.id);
                const isHovered  = tableHoverRow === u.id;
                const roleColor  = ROLE_COLORS[u.role] || C.cyan;
                const roleBg     = ROLE_BG[u.role]    || '#EFF6FF';
                const orderPct   = Math.round(((Number(u.orders) || 0) / maxOrders) * 100);
                const rowBg = isSelected
                  ? 'rgba(196,164,90,0.08)'
                  : isHovered
                  ? C.surface2
                  : i % 2 === 0 ? '#FFFFFF' : C.surface;

                return (
                  <tr key={u.id}
                    onMouseEnter={() => setTableHoverRow(u.id)}
                    onMouseLeave={() => setTableHoverRow(null)}
                    style={{ background: rowBg, transition: 'background 100ms', cursor: 'default' }}>

                    {/* Checkbox */}
                    <td style={{ ...tdStyle({ padding: '11px 10px 11px 16px', width: '40px' }) }}>
                      <input type="checkbox" checked={isSelected} onChange={() => toggleRow(u.id)}
                        style={{ width: '15px', height: '15px', cursor: 'pointer', accentColor: '#C4A45A' }} />
                    </td>

                    {/* User */}
                    <td style={tdStyle()}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: roleBg, border: `1px solid ${roleColor}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 800, color: roleColor, flexShrink: 0 }}>
                          {(u.name || '?')[0].toUpperCase()}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: '13px', color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '180px' }}>{u.name}</div>
                          <div style={{ fontSize: '11px', color: C.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '180px' }}>{u.email}</div>
                        </div>
                      </div>
                    </td>

                    {/* Role chip */}
                    <td style={tdStyle()}>
                      <span style={{ display: 'inline-block', padding: '3px 9px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', background: roleBg, color: roleColor, border: `1px solid ${roleColor}25` }}>
                        {u.role}
                      </span>
                    </td>

                    {/* Country */}
                    <td style={tdStyle({ color: C.textMuted })}>{u.country || '—'}</td>

                    {/* Joined */}
                    <td style={tdStyle({ color: C.textMuted, whiteSpace: 'nowrap' })}>{u.joined}</td>

                    {/* Orders with mini bar */}
                    <td style={tdStyle()}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: 700, fontSize: '13px', minWidth: '20px' }}>{u.orders || 0}</span>
                        <div style={{ width: '52px', height: '6px', background: C.surface3, borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${orderPct}%`, background: orderPct >= 80 ? C.green : orderPct >= 40 ? C.cyan : C.border, borderRadius: '3px', transition: 'width 0.4s' }} />
                        </div>
                      </div>
                    </td>

                    {/* Financials */}
                    <td style={tdStyle({ fontWeight: 600, color: u.role === 'consultant' || u.role === 'attorney' ? C.green : C.text })}>
                      {u.spend || '—'}
                    </td>

                    {/* Status dot + label */}
                    <td style={tdStyle()}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
                        background: u.status === 'active' ? '#DCFCE7' : u.status === 'pending' ? '#FEF9C3' : '#FEE2E2',
                        color: u.status === 'active' ? '#166534' : u.status === 'pending' ? '#854D0E' : '#991B1B',
                      }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: u.status === 'active' ? '#22C55E' : u.status === 'pending' ? '#EAB308' : '#EF4444', display: 'inline-block' }} />
                        {u.status}
                      </span>
                    </td>

                    {/* Actions */}
                    <td style={tdStyle({ whiteSpace: 'nowrap' })}>
                      <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                        <Btn variant="ghost" size="sm" onClick={() => setSelectedUser(u)}>View</Btn>
                        {['consultant', 'support', 'attorney'].includes(u.role) && u.status === 'pending' && (
                          <Btn variant="success" size="sm" onClick={() => approveUser(u)}>Approve</Btn>
                        )}
                        {isCurrentAdmin(u) ? (
                          <span style={{ fontSize: '11px', fontWeight: 700, color: C.red, padding: '3px 8px', background: '#FEE2E2', borderRadius: '4px' }}>You</span>
                        ) : (
                          <Btn variant={u.status === 'active' ? 'danger' : 'success'} size="sm" onClick={() => updateUser(u, { status: u.status === 'active' ? 'suspended' : 'active' })}>
                            {u.status === 'active' ? 'Suspend' : 'Activate'}
                          </Btn>
                        )}
                        {['consultant', 'support'].includes(u.role) && !isCurrentAdmin(u) && (
                          <Btn variant="danger" size="sm" onClick={() => deleteUser(u)}>Delete</Btn>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>

            {/* Summary footer */}
            {pagedUsers.length > 0 && (
              <tfoot>
                <tr style={{ background: '#F8F7F4', borderTop: `2px solid ${C.border}` }}>
                  <td colSpan={5} style={{ padding: '10px 14px', fontSize: '12px', color: C.textMuted, fontWeight: 600 }}>
                    Showing {(localPage - 1) * PER_PAGE + 1}–{Math.min(localPage * PER_PAGE, afterFilters.length)} of {afterFilters.length} users
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: '12px', fontWeight: 700, color: C.green }}>
                    {afterFilters.filter(u => u.spend && u.spend !== '—').length} paying
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: '12px', fontWeight: 700, color: C.cyan }}>
                    {afterFilters.filter(u => u.status === 'active').length} active
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: `1px solid ${C.border}`, background: C.surface }}>
            <button onClick={() => setLocalPage(p => Math.max(1, p - 1))} disabled={localPage === 1}
              style={{ padding: '6px 14px', borderRadius: '6px', border: `1px solid ${C.border}`, background: localPage === 1 ? C.surface3 : C.surface2, color: localPage === 1 ? C.textDim : C.text, cursor: localPage === 1 ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: 600, fontFamily: 'inherit' }}>
              ← Prev
            </button>
            <div style={{ display: 'flex', gap: '4px' }}>
              {Array.from({ length: totalPages }, (_, i) => i + 1).filter(p => p === 1 || p === totalPages || Math.abs(p - localPage) <= 1).reduce((acc, p, idx, arr) => {
                if (idx > 0 && p - arr[idx - 1] > 1) acc.push('…');
                acc.push(p);
                return acc;
              }, []).map((p, i) => p === '…' ? (
                <span key={`ellipsis-${i}`} style={{ padding: '6px 4px', fontSize: '13px', color: C.textMuted }}>…</span>
              ) : (
                <button key={p} onClick={() => setLocalPage(p)} style={{ width: '32px', height: '32px', borderRadius: '6px', border: `1px solid ${p === localPage ? '#0F172A' : C.border}`, background: p === localPage ? '#0F172A' : C.surface2, color: p === localPage ? '#fff' : C.text, cursor: 'pointer', fontSize: '13px', fontWeight: p === localPage ? 700 : 400, fontFamily: 'inherit' }}>
                  {p}
                </button>
              ))}
            </div>
            <button onClick={() => setLocalPage(p => Math.min(totalPages, p + 1))} disabled={localPage === totalPages}
              style={{ padding: '6px 14px', borderRadius: '6px', border: `1px solid ${C.border}`, background: localPage === totalPages ? C.surface3 : C.surface2, color: localPage === totalPages ? C.textDim : C.text, cursor: localPage === totalPages ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: 600, fontFamily: 'inherit' }}>
              Next →
            </button>
          </div>
        )}
      </Card>
      {selectedUser && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }} onClick={() => setSelectedUser(null)}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '18px', padding: '28px', width: '100%', maxWidth: '520px' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <Avatar name={selectedUser.name} size={48} color={selectedUser.role === 'consultant' ? C.purple : selectedUser.role === 'support' ? C.orange : C.cyan} />
                <div>
                  <h3 style={{ fontSize: '18px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    {selectedUser.name}

                  </h3>
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
            {['consultant', 'attorney'].includes(selectedUser.role) && (
              <div style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: '12px', padding: '14px', marginBottom: '16px' }}>
                <div style={{ color: C.textMuted, fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Payout setup</div>
                <div style={{ color: C.text, fontSize: '13px', fontWeight: 700, marginTop: '4px' }}>
                  ✓ Eligible for manual payouts
                </div>
                <div style={{ color: C.textMuted, fontSize: '12px', marginTop: '4px', lineHeight: 1.5 }}>
                  {selectedUser.role === 'attorney' ? 'Attorney can send paid offers' : 'Consultant can be assigned paid orders'}. Payouts are processed manually by admin.
                </div>
              </div>
            )}
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
        <InviteModal
          onClose={() => setInviteModal(false)}
          onSend={async (payload) => {
            await sendInvite(payload);
            setInviteModal(false);
          }}
        />
      )}

      {pendingInvites.length > 0 && (
        <Card>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div style={{ fontWeight: 700, fontSize: '14px' }}>Pending invitations · {pendingInvites.length}</div>
              <span style={{ color: C.textMuted, fontSize: '12px' }}>Sent via Clerk · users complete sign-up via emailed link</span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: C.textMuted, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <th style={{ padding: '8px 10px', borderBottom: `1px solid ${C.border}` }}>Email</th>
                  <th style={{ padding: '8px 10px', borderBottom: `1px solid ${C.border}` }}>Role</th>
                  <th style={{ padding: '8px 10px', borderBottom: `1px solid ${C.border}` }}>Sent</th>
                  <th style={{ padding: '8px 10px', borderBottom: `1px solid ${C.border}`, textAlign: 'right' }}></th>
                </tr>
              </thead>
              <tbody>
                {pendingInvites.map(inv => (
                  <tr key={inv.id}>
                    <td style={{ padding: '10px', fontSize: '13px', color: C.text }}>{inv.email_address}</td>
                    <td style={{ padding: '10px', fontSize: '12px', color: C.textMuted }}>{inv.public_metadata?.invitedRole ?? '—'}</td>
                    <td style={{ padding: '10px', fontSize: '12px', color: C.textDim }}>{inv.created_at ? new Date(inv.created_at).toLocaleDateString() : '—'}</td>
                    <td style={{ padding: '10px', textAlign: 'right' }}>
                      <Btn variant="ghost" size="sm" onClick={() => revokeInvite(inv.id)}>Revoke</Btn>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
    );
  };

  // ── ALL ORDERS ──
  const Orders = () => {
    const [assignModal, setAssignModal] = React.useState(null);
    const CONSULTANTS = consultants;
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
        <div>
          <div style={adminEyebrow}>Engagements</div>
          <h2 style={adminPageTitle}>All orders.</h2>
          <p style={adminPageSub}>{orders.length} total orders across the platform.</p>
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: '200px', maxWidth: '320px' }}>
            <SearchInput value={orderSearch} onChange={setOrderSearch} placeholder="Search by ID, service, name..." />
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {['all','new','active','review','pending','completed','cancelled'].map(f => (
              <button key={f} onClick={() => setOrderFilter(f)} style={{ padding: '6px 16px', borderRadius: '20px', border: `1px solid ${orderFilter===f?C.cyan:C.border}`, background: orderFilter===f?`${C.cyan}18`:C.surface2, color: orderFilter===f?C.cyan:C.textMuted, fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: orderFilter===f?600:400, textTransform: 'capitalize', transition: 'all 0.15s' }}>{f}</button>
            ))}
          </div>
        </div>
        <Card style={{ padding: '0', overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ borderBottom: `1px solid ${C.border}` }}>{['Order','Service','Student','Consultant','Amount','Split','Escrow','Status','Actions'].map(h=><th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 700, color: C.textMuted, whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
            <tbody>
              {filteredOrders.length === 0 ? (
                <tr><td colSpan={9} style={{ padding: '32px', textAlign: 'center', color: C.textMuted, fontSize: '14px' }}>{orderSearch ? 'No orders match your search.' : 'No orders in this status.'}</td></tr>
              ) : filteredOrders.map((o, i) => (
                <tr key={o.id} className="yousafe-table-row" style={{ borderBottom: i < filteredOrders.length-1 ? `1px solid ${C.border}` : 'none', transition: 'background 120ms' }}>
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
          <div style={adminEyebrow}>Money in motion</div>
          <h2 style={adminPageTitle}>Escrow.</h2>
          <p style={{ color: C.textMuted, fontSize: '14px' }}>Payments held pending student approval. Released {consultantFeePercent}% to consultant, {platformFeePercent}% to platform.</p>
        </div>
        <div className="yousafe-mobile-stack" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
          <StatCard label="Total Held" value={formatPrimary(totalHeld)} icon="🔒" color={C.orange} />
          <StatCard label="Orders in Escrow" value={held.length} icon="📦" color={C.cyan} />
          <StatCard label="Released All Time" value={formatPrimary(released.reduce((a, o) => a + o.amountValue, 0))} icon="✅" color={C.green} />
        </div>
        <div>
          <h3 style={adminSectionHeading}>Held — Awaiting Student Approval</h3>
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
          <h3 style={adminSectionHeading}>Released</h3>
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
  const Payouts = () => {
    const releasedOrders = orders.filter(o => o.escrow === 'released');
    const heldOrders = orders.filter(o => o.escrow === 'held');
    const payoutByConsultant = React.useMemo(() => {
      const map = {};
      consultants.forEach(c => { map[c.id] = { name: c.name, paid: 0, pending: 0, orderCount: 0 }; });
      orders.forEach(o => {
        if (!o.consultantId) return;
        map[o.consultantId] = map[o.consultantId] || { name: o.consultant || 'Unknown', paid: 0, pending: 0, orderCount: 0 };
        map[o.consultantId].orderCount++;
        if (o.escrow === 'released') map[o.consultantId].paid += moneyValue(o.consultantPay);
        else map[o.consultantId].pending += moneyValue(o.consultantPay);
      });
      return Object.values(map).filter(c => c.orderCount > 0 || c.paid > 0 || c.pending > 0);
    }, [orders, consultants]);
    return (
      <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div>
          <div style={adminEyebrow}>Disbursements</div>
          <h2 style={adminPageTitle}>Payouts.</h2>
          <p style={{ color: C.textMuted, fontSize: '14px' }}>Per-consultant payout tracking.</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
          <StatCard label="Platform Revenue" value={formatPrimary(totalRevenue)} icon="💰" color={C.green} />
          <StatCard label="Paid to Consultants" value={formatPrimary(paidToConsultants)} icon="👤" color={C.cyan} />
          <StatCard label="Pending Payouts" value={formatPrimary(pendingEscrow)} icon="⏳" color={C.orange} />
          <StatCard label="Total Processed" value={formatPrimary(releasedOrders.reduce((a, o) => a + o.amountValue, 0))} icon="📊" color={C.purple} />
        </div>
        <Card>
          <div style={adminSectionHeading}>Consultant Payout Queue</div>
          {payoutByConsultant.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 80px', gap: '12px', padding: '10px 14px', fontSize: '11px', fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: `1px solid ${C.border}` }}>
                <span>Consultant</span><span style={{ textAlign: 'right' }}>Paid</span><span style={{ textAlign: 'right' }}>Pending</span><span style={{ textAlign: 'right' }}>Orders</span><span></span>
              </div>
              {payoutByConsultant.map(c => (
                <div key={c.name} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 80px', gap: '12px', padding: '12px 14px', alignItems: 'center', borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Avatar name={c.name} size={32} color={C.purple} />
                    <span style={{ fontWeight: 600, fontSize: '14px' }}>{c.name}</span>
                  </div>
                  <span style={{ fontWeight: 700, textAlign: 'right', color: c.paid > 0 ? C.green : C.textDim }}>{c.paid > 0 ? formatPrimary(c.paid) : '—'}</span>
                  <span style={{ fontWeight: 700, textAlign: 'right', color: c.pending > 0 ? C.orange : C.textDim }}>{c.pending > 0 ? formatPrimary(c.pending) : '—'}</span>
                  <span style={{ textAlign: 'right', fontSize: '14px', fontWeight: 600 }}>{c.orderCount}</span>
                  <Btn variant="ghost" size="sm" onClick={() => setActionNotice(`Payout review for ${c.name}.`)}>Review</Btn>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: '20px', color: C.textMuted, fontSize: '14px', textAlign: 'center' }}>No payout data available yet.</div>
          )}
        </Card>
      </div>
    );
  };

  // ── ANALYTICS ──
  const Analytics = () => {
    const monthlyData = React.useMemo(() => {
      const months = {};
      orders.forEach(o => {
        if (!o.createdAt) return;
        const m = o.createdAt.substring(0, 7);
        months[m] = months[m] || { platform: 0, consultant: 0, orders: 0 };
        months[m].orders++;
        months[m].platform += moneyValue(o.adminCut);
        months[m].consultant += moneyValue(o.consultantPay);
      });
      return Object.entries(months).sort().slice(-12).map(([m, d]) => ({
        month: m, label: new Date(m + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }), ...d,
      }));
    }, [orders]);
    const servicePerformance = React.useMemo(() => {
      const map = {};
      orders.forEach(o => { map[o.service] = map[o.service] || { name: o.service, orders: 0, revenue: 0 }; map[o.service].orders++; map[o.service].revenue += o.amountValue; });
      return Object.values(map).sort((a, b) => b.revenue - a.revenue).slice(0, 8);
    }, [orders]);
    const userGrowth = React.useMemo(() => {
      const months = {};
      users.forEach(u => { if (!u.createdAt) return; const m = u.createdAt.substring(0, 7); months[m] = months[m] || { total: 0 }; months[m].total++; });
      return Object.entries(months).sort().slice(-12).map(([m, d]) => ({ month: m, label: new Date(m + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }), ...d }));
    }, [users]);
    const maxRevenue = Math.max(...monthlyData.map(d => d.platform), 1);
    const maxOrders = Math.max(...monthlyData.map(d => d.orders), 1);
    const maxUsers = Math.max(...userGrowth.map(d => d.total), 1);
    const barH = 140;
    const completionRate = orders.length ? Math.round(orders.filter(o => o.status === 'completed').length / orders.length * 100) : 0;
    return (
      <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div>
          <div style={adminEyebrow}>Insight</div>
          <h2 style={adminPageTitle}>Analytics.</h2>
          <p style={{ color: C.textMuted, fontSize: '14px' }}>Derived from {orders.length} orders and {users.length} users.</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <Card>
            <div style={adminSectionHeading}>Revenue (monthly)</div>
            {monthlyData.length > 0 ? (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: `${barH + 24}px`, paddingTop: '8px' }}>
                {monthlyData.map(d => (
                  <div key={d.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                    <div style={{ fontSize: '9px', color: C.textMuted }}>{formatPrimary(d.platform)}</div>
                    <div style={{ width: '100%', height: `${Math.max(2, (d.platform / maxRevenue) * barH)}px`, background: C.green, borderRadius: '3px 3px 0 0', transition: 'height 0.3s' }} />
                    <div style={{ fontSize: '9px', color: C.textDim }}>{d.label}</div>
                  </div>
                ))}
              </div>
            ) : <div style={{ padding: '40px 0', textAlign: 'center', color: C.textMuted, fontSize: '14px' }}>No data yet.</div>}
          </Card>
          <Card>
            <div style={adminSectionHeading}>Order Volume</div>
            {monthlyData.length > 0 ? (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: `${barH + 24}px`, paddingTop: '8px' }}>
                {monthlyData.map(d => (
                  <div key={d.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                    <div style={{ fontSize: '9px', color: C.textMuted }}>{d.orders}</div>
                    <div style={{ width: '100%', height: `${Math.max(2, (d.orders / maxOrders) * barH)}px`, background: C.cyan, borderRadius: '3px 3px 0 0', transition: 'height 0.3s' }} />
                    <div style={{ fontSize: '9px', color: C.textDim }}>{d.label}</div>
                  </div>
                ))}
              </div>
            ) : <div style={{ padding: '40px 0', textAlign: 'center', color: C.textMuted, fontSize: '14px' }}>No data yet.</div>}
          </Card>
          <Card>
            <div style={adminSectionHeading}>User Growth</div>
            {userGrowth.length > 0 ? (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: `${barH + 24}px`, paddingTop: '8px' }}>
                {userGrowth.map(d => (
                  <div key={d.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                    <div style={{ fontSize: '9px', color: C.textMuted }}>{d.total}</div>
                    <div style={{ width: '100%', height: `${Math.max(2, (d.total / maxUsers) * barH)}px`, background: C.purple, borderRadius: '3px 3px 0 0', transition: 'height 0.3s' }} />
                    <div style={{ fontSize: '9px', color: C.textDim }}>{d.label}</div>
                  </div>
                ))}
              </div>
            ) : <div style={{ padding: '40px 0', textAlign: 'center', color: C.textMuted, fontSize: '14px' }}>No data yet.</div>}
          </Card>
          <Card>
            <div style={adminSectionHeading}>Key Metrics</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              {[
                { label: 'Total revenue', value: formatPrimary(orders.filter(o => o.escrow === 'released').reduce((a, o) => a + moneyValue(o.adminCut), 0)) },
                { label: 'Avg order', value: orders.length ? formatPrimary(orders.reduce((a, o) => a + o.amountValue, 0) / orders.length) : 'N/A' },
                { label: 'Completion rate', value: `${completionRate}%` },
                { label: 'Total orders', value: orders.length },
                { label: 'Active consultants', value: users.filter(u => u.role === 'consultant' && u.status === 'active').length },
                { label: 'Pending approvals', value: users.filter(u => ['consultant', 'support', 'attorney'].includes(u.role) && u.status === 'pending').length },
              ].map(m => (
                <div key={m.label} style={{ background: C.surface2, borderRadius: '10px', padding: '12px' }}>
                  <div style={{ fontSize: '10px', fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{m.label}</div>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: C.text, marginTop: '4px' }}>{m.value}</div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    );
  };

  // ── CATALOGUE MANAGEMENT ──
  const ServicesAdmin = () => {
    const [editing, setEditing] = React.useState(null);
    const [saving, setSaving] = React.useState(false);
    const [catalogueTab, setCatalogueTab] = React.useState('service');
    const blankService = { product_type: 'service', title: '', category: 'General', price: 0, delivery_days: 7, active: true, status: 'active', vertical: 'study_abroad' };
    const blankTemplate = {
      product_type: 'template',
      slug: '',
      title: '',
      category: 'Templates',
      short_description: '',
      full_description: '',
      region: 'General',
      template_type: 'General',
      price_usd: 0,
      currency_base: 'USD',
      price_cad_display: '',
      badge: '',
      status: 'active',
      active: true,
      delivery_type: 'Digital Template',
      file_path: '',
      delivery_days: 0,
      vertical: 'study_abroad',
    };
    const visibleItems = services.filter(s => normalizeProductType(s.product_type) === catalogueTab);
    const serviceItems = services.filter(s => normalizeProductType(s.product_type) === 'service');
    const templateItems = services.filter(s => normalizeProductType(s.product_type) === 'template');
    const statusLabel = s => normalizeProductType(s.product_type) === 'template' ? (s.status || (s.active ? 'active' : 'draft')) : (s.active ? 'active' : 'draft');
    const cadDisplay = value => Number(value || 0) > 0 ? Number(value || 0) : Number(value || 0);
    const saveService = async () => {
      setSaving(true);
      const productType = normalizeProductType(editing.product_type);
      const payload = {
        product_type: productType,
        slug: editing.slug,
        title: editing.title,
        category: productType === 'template' ? 'Templates' : editing.category,
        short_description: editing.short_description,
        full_description: editing.full_description,
        region: editing.region,
        template_type: editing.template_type,
        price: productType === 'template' ? Number(editing.price_usd || editing.price || 0) : Number(editing.price || 0),
        price_usd: productType === 'template' ? Number(editing.price_usd || editing.price || 0) : Number(editing.usd_price || editing.price || 0),
        usd_price: productType === 'template' ? Number(editing.price_usd || editing.price || 0) : Number(editing.usd_price || editing.price || 0),
        currency: productType === 'template' ? 'usd' : (editing.currency || primaryCurrency || 'usd'),
        currency_base: productType === 'template' ? 'USD' : String(editing.currency || primaryCurrency || 'usd').toUpperCase(),
        price_cad_display: editing.price_cad_display === '' ? null : Number(editing.price_cad_display || 0),
        badge: editing.badge,
        status: productType === 'template' ? editing.status : (editing.active ? 'active' : 'draft'),
        delivery_type: productType === 'template' ? (editing.delivery_type || 'Digital Template') : editing.delivery_type,
        file_path: editing.file_path,
        delivery_days: productType === 'template' ? 0 : Number(editing.delivery_days || 7),
        is_active: productType === 'template' ? editing.status === 'active' : Boolean(editing.active),
        vertical: editing.vertical || 'study_abroad',
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
      const productType = normalizeProductType(s.product_type);
      const nextActive = !s.active;
      const res = await fetch(`/api/admin/services/${s.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...s,
          product_type: productType,
          price: productType === 'template' ? Number(s.price_usd || s.price || 0) : s.price,
          price_usd: Number(s.price_usd || s.usd_price || s.price || 0),
          status: productType === 'template' ? (nextActive ? 'active' : 'archived') : (nextActive ? 'active' : 'draft'),
          is_active: nextActive,
          vertical: s.vertical || 'study_abroad',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Service update failed');
      refreshAdminData();
    };
    return (
      <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={adminEyebrow}>Catalogue</div>
            <h2 style={adminPageTitle}>Catalogue.</h2>
            <p style={{ color: C.textMuted, fontSize: '14px' }}>Manage bookable Services separately from instant-access digital Templates.</p>
          </div>
          <Btn variant="primary" size="sm" onClick={() => setEditing(catalogueTab === 'template' ? blankTemplate : blankService)}>
            + Add {catalogueTab === 'template' ? 'template' : 'service'}
          </Btn>
        </div>
        <div style={{ display: 'inline-flex', alignSelf: 'flex-start', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: '999px', padding: '4px', gap: '4px' }}>
          {[
            { value: 'service', label: `Services (${serviceItems.length})` },
            { value: 'template', label: `Templates (${templateItems.length})` },
          ].map(tab => (
            <button
              key={tab.value}
              onClick={() => setCatalogueTab(tab.value)}
              style={{
                border: 'none',
                borderRadius: '999px',
                padding: '8px 16px',
                background: catalogueTab === tab.value ? C.text : 'transparent',
                color: catalogueTab === tab.value ? '#fff' : C.textMuted,
                fontWeight: 700,
                fontSize: '13px',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <Card style={{ padding: '0', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {(catalogueTab === 'template'
                  ? ['Template', 'Type', 'Region', 'USD price', 'CAD estimate', 'Status', '']
                  : ['Service', 'Vertical', 'Category', 'Price', 'Consultant cut', 'Platform cut', 'Orders', 'Status', '']
                ).map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 700, color: C.textMuted, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleItems.length > 0 ? visibleItems.map((s, i) => (
                <tr key={s.id} className="yousafe-table-row" style={{ borderBottom: i < visibleItems.length - 1 ? `1px solid ${C.border}` : 'none', transition: 'background 120ms' }}>
                  <td style={{ padding: '14px 16px', fontWeight: 600, fontSize: '14px' }}>
                    <div>{s.title}</div>
                    <div style={{ color: C.textMuted, fontSize: '12px', marginTop: '3px' }}>
                      {catalogueTab === 'template' ? (s.delivery_type || 'Digital Template') : deliveryLabel(s.delivery_days)}
                    </div>
                  </td>
                  {catalogueTab === 'template' ? (
                    <>
                      <td style={{ padding: '14px 16px' }}><Badge color="gray">{s.template_type || 'General'}</Badge></td>
                      <td style={{ padding: '14px 16px' }}><Badge color={s.region === 'USA' ? 'cyan' : s.region === 'Canada' ? 'green' : 'purple'}>{s.region || 'General'}</Badge></td>
                      <td style={{ padding: '14px 16px', fontWeight: 700 }}>{formatMoney(s.price_usd || s.price, 'usd')}</td>
                      <td style={{ padding: '14px 16px', color: C.textMuted, fontSize: '13px' }}>
                        approx. {formatMoney(cadDisplay(s.price_cad_display) || Number(s.price_usd || s.price || 0) * Number(platformSettings.usd_to_cad_rate || 1.37), 'cad')}
                      </td>
                    </>
                  ) : (
                    <>
                      <td style={{ padding: '14px 16px' }}>
                        <Badge color={s.vertical === 'legal' ? 'purple' : 'cyan'}>
                          {s.vertical === 'legal' ? 'Legal' : 'Study Abroad'}
                        </Badge>
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
                    </>
                  )}
                  <td style={{ padding: '14px 16px' }}>
                    <button onClick={() => toggleService(s)} style={{
                      width: '40px', height: '22px', borderRadius: '99px', border: 'none', cursor: 'pointer',
                      background: s.active ? C.cyan : C.surface3, position: 'relative', transition: 'background 0.2s',
                    }}>
                      <div style={{ position: 'absolute', top: '3px', left: s.active ? '20px' : '3px', width: '16px', height: '16px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
                    </button>
                    <div style={{ fontSize: '11px', color: C.textMuted, marginTop: '4px' }}>{statusLabel(s)}</div>
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <Btn variant="ghost" size="sm" onClick={() => setEditing(s)}>Edit</Btn>
                    </div>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={catalogueTab === 'template' ? 7 : 9} style={{ padding: '24px 16px', textAlign: 'center', color: C.textMuted }}>
                    No {catalogueTab === 'template' ? 'templates' : 'services'} available yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
        {editing && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '680px', maxHeight: '90vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ fontSize: '17px', fontWeight: 800 }}>{editing.id ? 'Edit' : 'Add'} {normalizeProductType(editing.product_type) === 'template' ? 'template' : 'service'}</h3>
                <button onClick={() => setEditing(null)} style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: '18px' }}>✕</button>
              </div>
              <div style={{ display: 'grid', gap: '14px' }}>
                {normalizeProductType(editing.product_type) === 'template' ? (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <Input label="Template title" value={editing.title} onChange={v => setEditing(s => ({ ...s, title: v }))} />
                      <Input label="Slug" value={editing.slug} onChange={v => setEditing(s => ({ ...s, slug: v }))} placeholder="template-slug" />
                    </div>
                    <Input label="Short description" value={editing.short_description} onChange={v => setEditing(s => ({ ...s, short_description: v }))} />
                    <Input label="Full description" value={editing.full_description} onChange={v => setEditing(s => ({ ...s, full_description: v }))} />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <Select label="Category" value="Templates" onChange={() => {}} options={[{ value: 'Templates', label: 'Templates' }]} />
                      <Select
                        label="Region"
                        value={editing.region || 'General'}
                        onChange={v => setEditing(s => ({ ...s, region: v }))}
                        options={[
                          { value: 'USA', label: 'USA' },
                          { value: 'Canada', label: 'Canada' },
                          { value: 'General', label: 'General' },
                        ]}
                      />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <Input label="Template type" value={editing.template_type} onChange={v => setEditing(s => ({ ...s, template_type: v }))} placeholder="Study Permit, Visitor Visa, Bundle..." />
                      <Input label="Badge / label" value={editing.badge} onChange={v => setEditing(s => ({ ...s, badge: v }))} placeholder="USA, Canada, Bundle, Popular..." />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <Input label="Base price USD" type="number" value={editing.price_usd ?? editing.price} onChange={v => setEditing(s => ({ ...s, price_usd: v, price: v }))} placeholder="29" />
                      <Input label="Optional CAD display price" type="number" value={editing.price_cad_display} onChange={v => setEditing(s => ({ ...s, price_cad_display: v }))} placeholder={`Auto: ${(Number(editing.price_usd || editing.price || 0) * Number(platformSettings.usd_to_cad_rate || 1.37)).toFixed(2)}`} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <Select
                        label="Status"
                        value={editing.status || 'active'}
                        onChange={v => setEditing(s => ({ ...s, status: v, active: v === 'active' }))}
                        options={[
                          { value: 'active', label: 'Active' },
                          { value: 'draft', label: 'Draft' },
                          { value: 'archived', label: 'Archived' },
                        ]}
                      />
                      <Input label="Delivery type" value={editing.delivery_type || 'Digital Template'} onChange={v => setEditing(s => ({ ...s, delivery_type: v }))} />
                    </div>
                    <Input label="Download file path / asset reference" value={editing.file_path} onChange={v => setEditing(s => ({ ...s, file_path: v }))} placeholder="templates/usa/example/README.md" />
                    <div style={{ fontSize: '12px', color: C.textMuted, lineHeight: 1.55, padding: '12px', background: C.surface2, borderRadius: '10px' }}>
                      Templates are purchased with student wallet balance, priced in USD. CAD pricing is shown as a display estimate only.
                    </div>
                    <Btn variant="primary" onClick={saveService} disabled={saving}>{saving ? 'Saving…' : 'Save template'}</Btn>
                  </>
                ) : (
                  <>
                    <Input label="Service title" value={editing.title} onChange={v => setEditing(s => ({ ...s, title: v }))} />
                    <Select
                      label="Vertical"
                      value={editing.vertical || 'study_abroad'}
                      onChange={v => setEditing(s => ({ ...s, vertical: v }))}
                      options={[
                        { value: 'study_abroad', label: 'Study Abroad (yousafeconsultancy.com)' },
                        { value: 'legal', label: 'Legal (legal.yousafeconsultancy.com)' },
                      ]}
                    />
                    <Input label="Category" value={editing.category} onChange={v => setEditing(s => ({ ...s, category: v }))} />
                    <Input label={`Price (${String(editing.currency || primaryCurrency || 'usd').toUpperCase()})`} type="number" value={editing.price} onChange={v => setEditing(s => ({ ...s, price: v }))} placeholder="$" />
                    <Input label="Delivery days" type="number" value={editing.delivery_days} onChange={v => setEditing(s => ({ ...s, delivery_days: v }))} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: C.surface2, borderRadius: '10px' }}>
                      <span style={{ fontSize: '14px', fontWeight: 600 }}>Visible to students</span>
                      <button onClick={() => setEditing(s => ({ ...s, active: !s.active }))} style={{ width: '44px', height: '24px', borderRadius: '99px', border: 'none', cursor: 'pointer', background: editing.active ? C.cyan : C.surface3, position: 'relative' }}>
                        <div style={{ position: 'absolute', top: '3px', left: editing.active ? '22px' : '3px', width: '18px', height: '18px', borderRadius: '50%', background: '#fff' }} />
                      </button>
                    </div>
                    <Btn variant="primary" onClick={saveService} disabled={saving}>{saving ? 'Saving…' : 'Save service'}</Btn>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── GIGS MANAGEMENT ──
  const GigsManager = () => {
    const filteredGigs = gigFilter === 'all' ? gigs : gigs.filter(g => g.status === gigFilter);
    const updateGigStatus = async (gigId, status) => {
      try {
        const res = await fetch(`/api/admin/gigs/${gigId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, action_type: 'update_gig_status' }) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Update failed');
        setActionNotice(`Gig status updated to ${status}.`);
        refreshGigs();
      } catch (e) { setActionNotice(e.message); }
    };
    const statusCounts = { all: gigs.length, draft: gigs.filter(g => g.status === 'draft').length, active: gigs.filter(g => g.status === 'active').length, paused: gigs.filter(g => g.status === 'paused').length, archived: gigs.filter(g => g.status === 'archived').length };
    return (
      <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div>
          <div style={adminEyebrow}>Marketplace</div>
          <h2 style={adminPageTitle}>Gigs.</h2>
          <p style={{ color: C.textMuted, fontSize: '14px' }}>Manage marketplace service listings from all providers.</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {Object.entries(statusCounts).map(([key, count]) => (
            <button key={key} onClick={() => setGigFilter(key)} style={{ padding: '6px 16px', borderRadius: '20px', border: `1px solid ${gigFilter === key ? C.cyan : C.border}`, background: gigFilter === key ? `${C.cyan}18` : C.surface2, color: gigFilter === key ? C.cyan : C.textMuted, fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: gigFilter === key ? 600 : 400, textTransform: 'capitalize', transition: 'all 0.15s' }}>{key} ({count})</button>
          ))}
        </div>
        <Card style={{ padding: '0', overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {['Gig', 'Provider', 'Category', 'Price', 'Status', 'Rank', 'Tiers', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 700, color: C.textMuted, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredGigs.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: '32px', textAlign: 'center', color: C.textMuted, fontSize: '14px' }}>No gigs in this view.</td></tr>
              ) : filteredGigs.map((g, i) => {
                const minPrice = g.tiers?.length ? Math.min(...g.tiers.map(t => Number(t.price || 0))) : 0;
                return (
                  <tr key={g.id} className="yousafe-table-row" style={{ borderBottom: i < filteredGigs.length - 1 ? `1px solid ${C.border}` : 'none', transition: 'background 120ms' }}>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ fontWeight: 600, fontSize: '14px' }}>{g.title || 'Untitled'}</div>
                      <div style={{ color: C.textMuted, fontSize: '11px' }}>{g.slug}</div>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Avatar name={g.provider?.full_name || 'P'} size={24} color={C.cyan} />
                        <span style={{ fontSize: '13px' }}>{g.provider?.full_name || 'Unknown'}</span>
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px', fontSize: '13px', color: C.textMuted }}>{g.category || '—'}</td>
                    <td style={{ padding: '14px 16px', fontWeight: 700, fontSize: '14px' }}>{minPrice > 0 ? formatPrimary(minPrice) : '—'}</td>
                    <td style={{ padding: '14px 16px' }}><Badge color={g.status === 'active' ? 'green' : g.status === 'paused' ? 'orange' : g.status === 'draft' ? 'gray' : 'red'}>{g.status || 'draft'}</Badge></td>
                    <td style={{ padding: '14px 16px', fontSize: '13px', fontWeight: 600 }}>{g.rank_score ?? '—'}</td>
                    <td style={{ padding: '14px 16px', fontSize: '13px' }}>{g.tiers?.length || 0}</td>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        <Btn variant="ghost" size="sm" onClick={() => setSelectedGig(g)}>View</Btn>
                        {g.status === 'active' && <Btn variant="danger" size="sm" onClick={() => updateGigStatus(g.id, 'paused')}>Pause</Btn>}
                        {g.status === 'paused' && <Btn variant="success" size="sm" onClick={() => updateGigStatus(g.id, 'active')}>Activate</Btn>}
                        {g.status === 'draft' && <Btn variant="primary" size="sm" onClick={() => updateGigStatus(g.id, 'active')}>Publish</Btn>}
                        {g.status !== 'archived' && <Btn variant="danger" size="sm" onClick={() => updateGigStatus(g.id, 'archived')}>Archive</Btn>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
        {selectedGig && (
          <div onClick={() => setSelectedGig(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
            <div onClick={e => e.stopPropagation()} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '18px', padding: '28px', width: '100%', maxWidth: '600px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                <div>
                  <h3 style={{ fontSize: '18px', fontWeight: 800, margin: 0 }}>{selectedGig.title || 'Gig details'}</h3>
                  <div style={{ color: C.textMuted, fontSize: '13px', marginTop: '4px' }}>{selectedGig.slug}</div>
                </div>
                <button onClick={() => setSelectedGig(null)} style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: '20px', lineHeight: 1 }}>✕</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                {[
                  ['Provider', selectedGig.provider?.full_name || 'Unknown'],
                  ['Category', selectedGig.category || '—'],
                  ['Status', selectedGig.status || 'draft'],
                  ['Rank Score', selectedGig.rank_score ?? '—'],
                  ['Tiers', selectedGig.tiers?.length || 0],
                  ['Featured', selectedGig.featured_until ? new Date(selectedGig.featured_until).toLocaleDateString() : 'Not featured'],
                ].map(([label, value]) => (
                  <div key={label} style={{ background: C.surface2, borderRadius: '10px', padding: '12px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
                    <div style={{ fontSize: '14px', fontWeight: 700, marginTop: '4px' }}>{value}</div>
                  </div>
                ))}
              </div>
              {selectedGig.tiers?.length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '8px' }}>Tier Pricing</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {selectedGig.tiers.map(t => (
                      <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: C.surface2, borderRadius: '8px', fontSize: '13px' }}>
                        <span style={{ fontWeight: 600 }}>{t.title || 'Tier'}</span>
                        <span style={{ fontWeight: 700 }}>{formatPrimary(t.price || 0)}{t.delivery_days ? ` · ${t.delivery_days}d` : ''}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <Btn variant="ghost" size="sm" onClick={() => setSelectedGig(null)}>Close</Btn>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── SETTINGS ──
  const Settings = () => {
    const [tab, setTab] = React.useState('financial');
    const TABS = [
      { id: 'financial', label: 'Financial', icon: '💰' },
      { id: 'escrow',    label: 'Escrow & policy', icon: '🔒' },
      { id: 'platform',  label: 'Platform info', icon: '🏛' },
      { id: 'appearance', label: 'Appearance', icon: '🎨' },
    ];
    const MONO = `'SF Mono', Menlo, Consolas, monospace`;
    return (
    <div style={{ padding: '24px 28px 60px', display: 'flex', flexDirection: 'column', gap: 18, maxWidth: '880px' }}>
      <div>
        <div style={adminEyebrow}>Configuration</div>
        <h2 style={adminPageTitle}>Platform settings.</h2>
        <div style={{ fontSize: 13, color: C.textMuted, marginTop: 4 }}>
          Currency, fee splits, escrow rules, and payment configuration. Changes apply to new orders only — existing records keep their snapshot values.
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', borderBottom: `1px solid ${C.border}`, marginBottom: -2 }}>
        {TABS.map(t => {
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: '9px 16px', fontSize: 13, fontFamily: 'inherit', fontWeight: active ? 700 : 500,
              border: 'none', background: 'transparent',
              borderBottom: `2px solid ${active ? C.cyan : 'transparent'}`,
              color: active ? C.text : C.textMuted, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}><span>{t.icon}</span>{t.label}</button>
          );
        })}
      </div>

      {/* Financial tab */}
      {tab === 'financial' && (<>
      <Card>
        <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '8px' }}>Primary Currency</div>
        <div style={{ fontSize: '12px', color: C.textMuted, marginBottom: '16px', lineHeight: 1.6 }}>
          The default currency used for new services, the wallet, consultant
          payouts, and admin revenue summaries when no
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
            Note: Payout setup transfers are denominated in this currency.
            CAD payouts require your platform payment account to support CAD —
            verify in your payment dashboard before changing.
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
        <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '6px' }}>Consultant Revenue Split</div>
        <div style={{ fontSize: '12px', color: C.textMuted, marginBottom: '16px', lineHeight: 1.5 }}>
          Applies to study-abroad services billed at a fixed price (the client pays the listed price; the consultant takes a share, the platform keeps the rest).
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ fontSize: '13px', fontWeight: 600, color: C.textMuted, display: 'block', marginBottom: '8px' }}>Consultant share</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <input type="range" min="0" max="100" step="2.5" value={consultantShare} onChange={e => setConsultantShare(Number(e.target.value))} style={{ flex: 1, accentColor: C.cyan }} />
              <span style={{ fontSize: '16px', fontWeight: 800, color: C.cyan, width: '52px', textAlign: 'right' }}>{consultantShare}%</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: C.textDim, marginTop: '4px' }}>
              <span>0%</span><span>50%</span><span>100%</span>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', background: C.surface2, borderRadius: '10px', fontSize: '14px' }}>
            <span style={{ color: C.textMuted }}>Platform receives</span>
            <span style={{ fontWeight: 700, color: C.green }}>{100 - consultantShare}%</span>
          </div>
          <Btn variant="primary" size="sm" style={{ alignSelf: 'flex-start' }} onClick={async () => {
            try {
              await savePlatformSettings({ consultant_fee_percent: consultantShare, platform_fee_percent: 100 - consultantShare });
              setActionNotice(`Consultant split saved: ${consultantShare}% consultant / ${100 - consultantShare}% platform. Future payouts will use this split.`);
            } catch (e) {
              setActionNotice(e.message || 'Consultant split update failed.');
            }
          }}>Save consultant split</Btn>
        </div>
      </Card>
      <Card>
        <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '6px' }}>Attorney Platform Fee</div>
        <div style={{ fontSize: '12px', color: C.textMuted, marginBottom: '16px', lineHeight: 1.5 }}>
          Per ABA Rule 5.4 attorney fees are NOT split — the attorney is paid in full and the platform fee is added on top. The slider sets the percent that goes on top of every attorney offer. Existing offers keep their snapshot percent; future offers use the new value.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ fontSize: '13px', fontWeight: 600, color: C.textMuted, display: 'block', marginBottom: '8px' }}>Platform fee added on top of attorney fee</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <input type="range" min="0" max="50" step="1" value={attorneyPlatformFee} onChange={e => setAttorneyPlatformFee(Number(e.target.value))} style={{ flex: 1, accentColor: C.green }} />
              <span style={{ fontSize: '16px', fontWeight: 800, color: C.green, width: '52px', textAlign: 'right' }}>{attorneyPlatformFee}%</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: C.textDim, marginTop: '4px' }}>
              <span>0%</span><span>25%</span><span>50%</span>
            </div>
          </div>
          <div style={{ background: C.surface2, borderRadius: '10px', padding: '12px', fontSize: '13px', display: 'grid', gap: '4px' }}>
            <div style={{ color: C.textMuted, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>Example: $500 attorney fee</div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: C.text }}>Attorney receives</span>
              <span style={{ color: C.text }}>$500.00</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: C.text }}>Platform fee ({attorneyPlatformFee}%)</span>
              <span style={{ color: C.text }}>${(500 * attorneyPlatformFee / 100).toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: `1px solid ${C.border}`, paddingTop: '4px', marginTop: '2px' }}>
              <span style={{ color: C.text, fontWeight: 700 }}>Client pays</span>
              <span style={{ color: C.green, fontWeight: 700 }}>${(500 * (1 + attorneyPlatformFee / 100)).toFixed(2)}</span>
            </div>
          </div>
          <Btn variant="primary" size="sm" style={{ alignSelf: 'flex-start' }} onClick={async () => {
            try {
              await savePlatformSettings({ attorney_platform_fee_percent: attorneyPlatformFee });
              setActionNotice(`Attorney platform fee saved: ${attorneyPlatformFee}% added on top. New offers will use this value.`);
            } catch (e) {
              setActionNotice(e.message || 'Attorney platform fee update failed.');
            }
          }}>Save attorney fee</Btn>
        </div>
      </Card>
      </>)}

      {/* Escrow tab */}
      {tab === 'escrow' && (<>
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
      </>)}

      {/* Platform info tab */}
      {tab === 'platform' && (<>
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
      </>)}

      {/* Appearance tab */}
      {tab === 'appearance' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.5, marginBottom: 4 }}>
            Choose your view — your saved theme follows you on every device.
          </div>
          <ThemePicker currentTheme={theme} onChange={applyTheme} />
        </div>
      )}
    </div>
    );
  };

  const AttorneyApplications = () => (
    <div style={{ padding: '24px 28px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={adminEyebrow}>Panel</div>
          <h2 style={adminPageTitle}>Attorney applications.</h2>
          <div style={{ fontSize: '13px', color: C.textMuted }}>{pendingAttorneyApps.length} pending review · {attorneyApplications.length} total</div>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {['pending', 'approved', 'declined', 'all'].map(f => (
            <button
              key={f}
              type="button"
              onClick={() => setAttorneyAppFilter(f)}
              style={{
                background: attorneyAppFilter === f ? C.cyan : C.surface,
                color: attorneyAppFilter === f ? '#000' : C.text,
                border: `1px solid ${attorneyAppFilter === f ? C.cyan : C.border}`,
                borderRadius: '999px',
                padding: '6px 14px',
                fontSize: '12px',
                fontWeight: 700,
                textTransform: 'capitalize',
                cursor: 'pointer',
              }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {filteredAttorneyApps.length === 0 ? (
        <Card>
          <div style={{ padding: '24px', textAlign: 'center', color: C.textMuted, fontSize: '14px' }}>
            No applications in this view.
          </div>
        </Card>
      ) : (
        <div style={{ display: 'grid', gap: '12px' }}>
          {filteredAttorneyApps.map(app => {
            const isOpen = openApplicationId === app.id;
            const decisionPending = attorneyAppDecisionId === app.id;
            return (
              <Card key={app.id}>
                <div style={{ padding: '16px 20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontWeight: 700, color: C.text, fontSize: '15px' }}>{app.full_name}</div>
                      <div style={{ color: C.textMuted, fontSize: '13px' }}>{app.email}{app.phone ? ` · ${app.phone}` : ''}</div>
                      <div style={{ color: C.textDim, fontSize: '12px', marginTop: '4px' }}>
                        Submitted {app.created_at ? new Date(app.created_at).toLocaleString() : '—'}
                      </div>
                    </div>
                    <Badge color={app.status === 'approved' ? 'green' : app.status === 'declined' ? 'red' : 'orange'}>
                      {app.status}
                    </Badge>
                  </div>

                  <div style={{ marginTop: '12px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                    <ApplicationField label="Credential" value={app.credential_type} />
                    <ApplicationField label="Jurisdictions" value={app.jurisdictions} />
                    <ApplicationField label="Bar / roll number" value={app.bar_number} />
                    <ApplicationField label="Practice areas" value={app.practice_areas} />
                    <ApplicationField label="Capacity" value={app.capacity} />
                    <ApplicationField label="Profile URL" value={app.profile_url} link />
                  </div>

                  {isOpen && (
                    <div style={{ marginTop: '12px', display: 'grid', gap: '12px' }}>
                      <ApplicationField label="Malpractice / PI insurance" value={app.malpractice_insurance} />
                      {app.notes && <ApplicationField label="Notes" value={app.notes} multiline />}
                      {app.decision_notes && <ApplicationField label="Decision notes" value={app.decision_notes} multiline />}
                    </div>
                  )}

                  <div style={{ marginTop: '16px', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <button
                      type="button"
                      onClick={() => setOpenApplicationId(isOpen ? null : app.id)}
                      style={{ background: C.surface, color: C.text, border: `1px solid ${C.border}`, borderRadius: '8px', padding: '6px 12px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                    >
                      {isOpen ? 'Hide details' : 'Show full details'}
                    </button>
                    {app.status === 'pending' && (
                      <>
                        <Btn variant="primary" size="sm" disabled={decisionPending} onClick={() => decideAttorneyApplication(app.id, 'approve')}>
                          {decisionPending ? 'Saving...' : 'Approve'}
                        </Btn>
                        <Btn variant="danger" size="sm" disabled={decisionPending} onClick={() => decideAttorneyApplication(app.id, 'decline')}>
                          Decline
                        </Btn>
                      </>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );

  // ── INQUIRIES ──
  const Inquiries = () => {
    const [inquiries, setInquiries] = React.useState([])
    const [total, setTotal] = React.useState(0)
    const [page, setPage] = React.useState(1)
    const [loading, setLoading] = React.useState(true)
    const [error, setError] = React.useState('')
    const [statusFilter, setStatusFilter] = React.useState('all')
    const [archivedFilter, setArchivedFilter] = React.useState('all')
    const [searchQuery, setSearchQuery] = React.useState('')
    const [selectedInquiry, setSelectedInquiry] = React.useState(null)
    const [detailData, setDetailData] = React.useState(null)
    const [detailLoading, setDetailLoading] = React.useState(false)
    const PAGE_SIZE = 50

    const load = React.useCallback(async () => {
      setLoading(true); setError('')
      try {
        const p = new URLSearchParams()
        p.set('page', String(page))
        p.set('page_size', String(PAGE_SIZE))
        if (statusFilter !== 'all') p.set('status', statusFilter)
        if (archivedFilter !== 'all') p.set('archived', archivedFilter)
        if (searchQuery.trim()) p.set('q', searchQuery.trim())
        const r = await fetch(`/api/admin/inquiries?${p}`, { credentials: 'same-origin' })
        const d = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(d?.error || `Failed (${r.status})`)
        setInquiries(d.inquiries || [])
        setTotal(d.total || 0)
      } catch (e) {
        setError(e.message || 'Failed to load inquiries.')
      } finally {
        setLoading(false)
      }
    }, [page, statusFilter, archivedFilter, searchQuery])

    React.useEffect(() => { load() }, [load])

    const openDetail = async (inq) => {
      setSelectedInquiry(inq)
      setDetailLoading(true)
      try {
        const r = await fetch(`/api/admin/inquiries/${inq.id}`, { credentials: 'same-origin' })
        const d = await r.json().catch(() => ({}))
        if (r.ok) setDetailData(d)
        else setDetailData(null)
      } catch {
        setDetailData(null)
      } finally {
        setDetailLoading(false)
      }
    }

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

    const statusColor = (s) => {
      if (s === 'open') return C.cyan
      if (s === 'engaged') return C.purple
      if (s === 'converted') return C.green
      if (s === 'archived') return C.orange
      if (s === 'closed') return C.textDim
      if (s === 'cancelled') return C.red
      return C.textMuted
    }

    const fmtDate = (s) => s ? new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

    return (
      <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div>
          <div style={adminEyebrow}>Intake</div>
          <h2 style={adminPageTitle}>Inquiries.</h2>
          <p style={adminPageSub}>{total} total inquiries across the platform.</p>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: '200px', maxWidth: '320px' }}>
            <SearchInput value={searchQuery} onChange={v => { setSearchQuery(v); setPage(1) }} placeholder="Search by name, country, case type…" />
          </div>
          <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
            style={{ padding: '8px 12px', borderRadius: '8px', border: `1px solid ${C.border}`, background: C.surface2, color: C.text, fontSize: '13px', fontFamily: 'inherit', cursor: 'pointer' }}>
            <option value="all">All statuses</option>
            <option value="open">Open</option>
            <option value="engaged">Engaged</option>
            <option value="converted">Converted</option>
            <option value="archived">Archived</option>
            <option value="closed">Closed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select value={archivedFilter} onChange={e => { setArchivedFilter(e.target.value); setPage(1) }}
            style={{ padding: '8px 12px', borderRadius: '8px', border: `1px solid ${C.border}`, background: C.surface2, color: C.text, fontSize: '13px', fontFamily: 'inherit', cursor: 'pointer' }}>
            <option value="all">All</option>
            <option value="yes">Archived only</option>
            <option value="no">Not archived</option>
          </select>
          <span style={{ fontSize: '12px', color: C.textMuted, marginLeft: 'auto' }}>
            {total} result{total !== 1 ? 's' : ''}
          </span>
        </div>

        {error && (
          <div style={{ padding: '10px 14px', borderRadius: '8px', background: `${C.red}10`, color: C.red, fontSize: '13px', fontWeight: 600 }}>{error}</div>
        )}

        <Card style={{ padding: 0, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {['Submitted', 'Client', 'Country', 'Case type', 'Urgency', 'Status', 'Order', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 700, color: C.textMuted, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ padding: '32px', textAlign: 'center', color: C.textMuted, fontSize: '14px' }}>Loading…</td></tr>
              ) : inquiries.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: '32px', textAlign: 'center', color: C.textMuted, fontSize: '14px' }}>{searchQuery ? 'No inquiries match your search.' : 'No inquiries found.'}</td></tr>
              ) : inquiries.map((inq, i) => (
                <tr key={inq.id} className="yousafe-table-row" onClick={() => openDetail(inq)}
                  style={{ borderBottom: i < inquiries.length - 1 ? `1px solid ${C.border}` : 'none', transition: 'background 120ms', cursor: 'pointer' }}
                  onMouseEnter={e => { e.currentTarget.style.background = C.surface2 }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                  <td style={{ padding: '14px 16px', fontSize: '13px', color: C.textMuted, whiteSpace: 'nowrap' }}>{fmtDate(inq.created_at)}</td>
                  <td style={{ padding: '14px 16px', fontSize: '13px', fontWeight: 600 }}>{inq.full_name || inq.email || '—'}</td>
                  <td style={{ padding: '14px 16px', fontSize: '13px', color: C.textMuted }}>{inq.country || '—'}</td>
                  <td style={{ padding: '14px 16px', fontSize: '13px' }}>{inq.case_type_label || inq.case_type || '—'}</td>
                  <td style={{ padding: '14px 16px', fontSize: '13px' }}>
                    <span style={{ textTransform: 'uppercase', fontSize: '10px', fontWeight: 700, letterSpacing: '0.04em', color: statusColor(inq.urgency) }}>{inq.urgency || '—'}</span>
                  </td>
                  <td style={{ padding: '14px 16px', fontSize: '13px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', background: `${statusColor(inq.status)}18`, color: statusColor(inq.status) }}>
                      {inq.status}
                    </span>
                  </td>
                  <td style={{ padding: '14px 16px', fontSize: '13px', color: C.textMuted }}>{inq.order_id || inq.order_number || '—'}</td>
                  <td style={{ padding: '14px 16px', fontSize: '13px' }}>
                    <Btn variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); openDetail(inq); }}>View</Btn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderTop: `1px solid ${C.border}` }}>
            <span style={{ fontSize: '12px', color: C.textMuted }}>
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
            </span>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <Btn variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>← Prev</Btn>
              <span style={{ fontSize: '12px', color: C.text, padding: '4px 10px' }}>Page {page} / {totalPages}</span>
              <Btn variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next →</Btn>
            </div>
          </div>
        )}

        {selectedInquiry && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }} onClick={() => { setSelectedInquiry(null); setDetailData(null) }}>
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '18px', padding: '28px', width: '100%', maxWidth: '640px', maxHeight: '90vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                <div>
                  <h3 style={{ fontSize: '18px', fontWeight: 800 }}>Inquiry details</h3>
                  <div style={{ color: C.cyan, fontSize: '13px', fontWeight: 700, marginTop: '4px' }}>{selectedInquiry.id}</div>
                </div>
                <button onClick={() => { setSelectedInquiry(null); setDetailData(null) }} style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: '18px' }}>✕</button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                {[
                  ['Client', selectedInquiry.full_name || selectedInquiry.email || '—'],
                  ['Email', selectedInquiry.email || '—'],
                  ['Country', selectedInquiry.country || '—'],
                  ['Case type', selectedInquiry.case_type_label || selectedInquiry.case_type || '—'],
                  ['Urgency', selectedInquiry.urgency || '—'],
                  ['Status', selectedInquiry.status || '—'],
                  ['Submitted', fmtDate(selectedInquiry.created_at)],
                  ['Archived', selectedInquiry.archived_at ? fmtDate(selectedInquiry.archived_at) : '—'],
                ].map(([label, value]) => (
                  <div key={label} style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: '12px', padding: '12px' }}>
                    <div style={{ color: C.textMuted, fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>{label}</div>
                    <div style={{ color: C.text, fontSize: '14px', fontWeight: 700, marginTop: '4px' }}>{value}</div>
                  </div>
                ))}
              </div>

              {selectedInquiry.answers && Object.keys(selectedInquiry.answers).length > 0 && (
                <Card style={{ marginBottom: '16px' }}>
                  <div style={{ padding: '16px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: C.textMuted }}>Intake answers</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {Object.entries(selectedInquiry.answers).map(([key, value]) => (
                        <div key={key}>
                          <div style={{ fontSize: '11px', color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '2px' }}>{key}</div>
                          <div style={{ fontSize: '13px', color: C.text, whiteSpace: 'pre-wrap' }}>{typeof value === 'string' ? value : JSON.stringify(value)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </Card>
              )}

              {detailLoading && <div style={{ color: C.textMuted, fontSize: '13px', padding: '16px', textAlign: 'center' }}>Loading thread…</div>}

              {detailData && detailData.messages && detailData.messages.length > 0 && (
                <Card>
                  <div style={{ padding: '16px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: C.textMuted }}>Thread preview</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {detailData.messages.slice(0, 10).map((m) => (
                        <div key={m.id} style={{ padding: '10px 12px', background: C.surface2, borderRadius: '8px', border: `1px solid ${C.border}` }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                            <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: C.textDim }}>{m.sender_role}</span>
                            <span style={{ fontSize: '11px', color: C.textDim }}>{fmtDate(m.created_at)}</span>
                          </div>
                          <div style={{ fontSize: '13px', color: C.text, whiteSpace: 'pre-wrap' }}>{m.body}</div>
                        </div>
                      ))}
                      {detailData.messages.length > 10 && (
                        <div style={{ textAlign: 'center', fontSize: '12px', color: C.textMuted }}>+ {detailData.messages.length - 10} more messages</div>
                      )}
                    </div>
                  </div>
                </Card>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
                <Btn variant="ghost" size="sm" onClick={() => { setSelectedInquiry(null); setDetailData(null) }}>Close</Btn>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  const pages = { dashboard: 'Dashboard', users: 'Users', 'attorney-applications': 'Attorney Applications', orders: 'All Orders', inquiries: 'Inquiries', escrow: 'Escrow', payouts: 'Payouts', analytics: 'Analytics', gigs: 'Gigs', services: 'Catalogue', settings: 'Settings' };

  return (
    <div className="yousafe-dashboard-shell" style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: C.bg }}>
      <Sidebar />
      <div className="yousafe-dashboard-main" style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
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
          {page === 'dashboard' && <AdminDashboard onNav={setPage} />}
          {page === 'users' && <Users />}
          {page === 'attorney-applications' && <AdminAttorneyApplications />}
          {page === 'orders' && <AdminOrders consultants={consultants} formatPrimary={formatPrimary} refreshAdminData={refreshAdminData} />}
          {page === 'inquiries' && <Inquiries />}
          {page === 'escrow' && <AdminEscrow />}
          {page === 'payouts' && <AdminPayouts formatPrimary={formatPrimary} />}
          {page === 'analytics' && <AdminAnalyticsPro />}
          {page === 'financials' && <AdminFinancials orders={orders} users={users} settings={platformSettings} setPage={setPage} />}
          {page === 'gigs' && <AdminGigsManager formatPrimary={formatPrimary} />}
          {page === 'services' && <ServicesAdmin />}
          {page === 'settings' && <Settings />}
        </div>
      </div>
    </div>
  );
}

function InviteModal({ onClose, onSend }) {
  const [email, setEmail] = React.useState('');
  const [fullName, setFullName] = React.useState('');
  const [role, setRole] = React.useState('student');
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState('');

  async function submit() {
    if (submitting) return;
    setError('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError('A valid email is required.'); return; }
    setSubmitting(true);
    try {
      await onSend({ email: email.trim(), full_name: fullName.trim() || undefined, role });
    } catch (e) {
      setError(e.message || 'Could not send invitation.');
    } finally {
      setSubmitting(false);
    }
  }

  const ROLE_OPTIONS = [
    { value: 'student', label: 'Student / Client' },
    { value: 'consultant', label: 'Consultant' },
    { value: 'attorney', label: 'Attorney' },
    { value: 'support', label: 'Support staff' },
    { value: 'admin', label: 'Admin' },
  ];
  const roleHelp = {
    student: 'Active immediately on first sign-in.',
    consultant: 'Pending until you approve their application.',
    attorney: 'Pending until you approve their application + they complete Payout setup.',
    support: 'Pending until you approve.',
    admin: 'Active immediately. Use sparingly.',
  };

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,18,32,0.55)', zIndex: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '14px', padding: '28px', width: '100%', maxWidth: '460px' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div>
            <div style={{ color: C.textMuted, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.14em', fontWeight: 700, marginBottom: '4px' }}>Members</div>
            <h3 style={{ fontFamily: C.serif, fontSize: '24px', fontWeight: 500, margin: 0, color: C.text, letterSpacing: '-0.01em' }}>Invite a user</h3>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: '18px', lineHeight: 1 }}>×</button>
        </div>
        <p style={{ color: C.textMuted, fontSize: '13px', margin: '0 0 18px', lineHeight: 1.55 }}>
          Sends a Clerk invitation by email. The recipient sets their own password and lands on the right lane automatically.
        </p>
        <div style={{ display: 'grid', gap: '12px' }}>
          <Input label="Email address" value={email} onChange={setEmail} placeholder="name@example.com" />
          <Input label="Full name (optional)" value={fullName} onChange={setFullName} placeholder="Jane Doe" />
          <Select label="Role" value={role} onChange={setRole} options={ROLE_OPTIONS} />
          <div style={{ color: C.textMuted, fontSize: '12px', lineHeight: 1.4 }}>{roleHelp[role]}</div>
          {error && <div style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.20)', color: C.red, padding: '9px 12px', borderRadius: '8px', fontSize: '12px' }}>{error}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
            <Btn variant="ghost" size="sm" onClick={onClose}>Cancel</Btn>
            <Btn variant="primary" size="sm" onClick={submit} disabled={submitting}>{submitting ? 'Sending…' : 'Send invitation'}</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

function ApplicationField({ label, value, link, multiline }) {
  const display = value || '—';
  return (
    <div>
      <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em', color: C.textDim, marginBottom: '4px' }}>{label}</div>
      {link && value ? (
        <a href={value} target="_blank" rel="noreferrer" style={{ color: C.cyan, fontSize: '13px', wordBreak: 'break-all' }}>{display}</a>
      ) : (
        <div style={{ color: C.text, fontSize: '13px', whiteSpace: multiline ? 'pre-wrap' : 'normal', wordBreak: 'break-word' }}>{display}</div>
      )}
    </div>
  );
}

export default AdminApp;
