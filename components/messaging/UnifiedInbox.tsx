'use client'
import React from 'react'
import './messenger-tokens.css'
import OfferComposerInline from './OfferComposerInline'
import { MessageOfferCard } from '../marketplace/MessageOfferCard'
import { OfferPaymentModal } from './OfferPaymentModal'
import ChatScreen from './ChatScreen'
import MessageBubble from './MessageBubble'
import InquiryBubble from './InquiryBubble'
import OfferRequestCard from './OfferRequestCard'
import AutoGrowInput from './AutoGrowInput'
import StatusRing from './StatusRing'
import StatusViewer from './StatusViewer'
import MessengerSettings from './MessengerSettings'
import ArchivedView from './ArchivedView'
import StarredView from './StarredView'
import InquiryComposer from './InquiryComposer'
import ProfilePreviewDrawer from './ProfilePreviewDrawer'
import { fmtRelative, fmtFullTime, sameDay, dateLabel, initials } from '@/lib/messaging/format'
import { subscribeToTable } from '@/lib/supabaseRealtime'

/**
 * UnifiedInbox
 *
 * Single inbox component used by student + attorney + consultant
 * dashboards. Backed by the unified conversation_messages table via
 * /api/messages/conversations.
 */

const PAGE_SIZE = 50

const FILTER_TABS = [
  { id: 'all',      label: 'All' },
  { id: 'unread',   label: 'Unread' },
]

const CTX_LABEL = {
  general: 'Direct',
  order:   'Order',
  inquiry: 'Inquiry',
  gig:     'Gig',
}

export default function UnifiedInbox({ defaultThreadId, onThreadChange, canSendOffer = false }) {
  const [tab, setTab] = React.useState('all')
  const [page, setPage] = React.useState(1)
  const [searchInput, setSearchInput] = React.useState('')
  const [debouncedQ, setDebouncedQ] = React.useState('')

  const [conversations, setConversations] = React.useState<any[]>([])
  const [counts, setCounts] = React.useState<{
    all?: number
    unread?: number
    favourites?: number
    groups?: number
    archived?: number
    totalUnread?: number
  }>({})
  const [hasMore, setHasMore] = React.useState(false)
  const [listLoading, setListLoading] = React.useState(true)
  const [listError, setListError] = React.useState('')

  const [activeId, setActiveId] = React.useState(defaultThreadId || null)
  const [activeMsgs, setActiveMsgs] = React.useState([])
  const [activeConv, setActiveConv] = React.useState(null)
  const [activeSidebar, setActiveSidebar] = React.useState({ orders: [], offers: [] })
  const [activeParticipant, setActiveParticipant] = React.useState(null)
  const [threadLoading, setThreadLoading] = React.useState(false)
  const [threadError, setThreadError] = React.useState('')
  const [draft, setDraft] = React.useState('')
  const [sending, setSending] = React.useState(false)
  const [showOfferComposer, setShowOfferComposer] = React.useState(false)
  const [offerBusyId, setOfferBusyId] = React.useState(null)
  const [payingOfferId, setPayingOfferId] = React.useState(null)
  const [mobileShowChat, setMobileShowChat] = React.useState(false)
  const [menuFor, setMenuFor] = React.useState(null)
  const [menuPos, setMenuPos] = React.useState({ x: 0, y: 0 })

  // Reply quoting state
  const [replyingTo, setReplyingTo] = React.useState<{ id: string; senderName: string; snippet: string } | null>(null)

  // Archived + Starred modal state (phase 2.2)
  const [showArchived, setShowArchived] = React.useState(false)
  const [showStarred, setShowStarred] = React.useState(false)

  // In-chat search + call-request UI state (wired by the chrome buttons in
  // the conversation header).
  const [inChatSearchOpen, setInChatSearchOpen] = React.useState(false)
  const [inChatSearchQ, setInChatSearchQ] = React.useState('')
  const [callRequestKind, setCallRequestKind] = React.useState<'video' | 'voice' | null>(null)
  const [callRequestTime, setCallRequestTime] = React.useState('')
  const [callRequestSubmitting, setCallRequestSubmitting] = React.useState(false)
  const [starredMsgs, setStarredMsgs] = React.useState<any[]>([])

  // Status broadcasts (24h ring)
  const [statuses, setStatuses] = React.useState([])
  const [statusViewerOpen, setStatusViewerOpen] = React.useState(false)
  const [statusViewerPersonId, setStatusViewerPersonId] = React.useState(null)

  // Role + profile detection
  const [role, setRole] = React.useState<string | null>(null)
  const [myProfileId, setMyProfileId] = React.useState<string | null>(null)

  // Settings panel
  const [showSettings, setShowSettings] = React.useState(false)
  const [theme, setTheme] = React.useState('light')
  const [density, setDensity] = React.useState('comfortable')
  const [wallpaper, setWallpaper] = React.useState('default')
  const [wallpaperUrl, setWallpaperUrl] = React.useState('')
  const [globalMute, setGlobalMute] = React.useState(false)

  // Inquiry composer modal
  const [showInquiryComposer, setShowInquiryComposer] = React.useState(false)

  // Profile preview drawer
  const [previewSellerId, setPreviewSellerId] = React.useState<string | null>(null)

  // Brief 47 §6.2: realtime delete tracking
  const [deletedInquiryId, setDeletedInquiryId] = React.useState<string | null>(null)
  const [deletedConvId, setDeletedConvId] = React.useState<string | null>(null)

  // Brief 47 §6.3: status delete menu
  const [statusMenuFor, setStatusMenuFor] = React.useState<string | null>(null)
  const [statusMenuPos, setStatusMenuPos] = React.useState({ x: 0, y: 0 })

  // Mount: read role, persisted settings from localStorage and apply to DOM
  React.useLayoutEffect(() => {
    // Fetch role
    fetch('/api/profile', { credentials: 'same-origin' })
      .then(r => r.json().catch(() => ({})))
      .then(d => {
        setRole(d?.profile?.role || null)
        setMyProfileId(d?.profile?.id || null)
      })
      .catch(() => { setRole(null) })

    const root = document.querySelector('.yousafe-messenger') as HTMLElement | null
    if (!root) return

    const storedTheme = localStorage.getItem('yousafe.messenger.theme') || 'light'
    const storedDensity = localStorage.getItem('yousafe.messenger.density') || 'comfortable'
    const storedWallpaper = localStorage.getItem('yousafe.messenger.wallpaper') || 'default'
    const storedWallpaperUrl = localStorage.getItem('yousafe.messenger.wallpaper_url') || ''
    const storedMute = localStorage.getItem('yousafe.messenger.globalMute') === 'true'

    setTheme(storedTheme)
    setDensity(storedDensity)
    setWallpaper(storedWallpaper)
    setWallpaperUrl(storedWallpaperUrl)
    setGlobalMute(storedMute)

    const resolveTheme = (t: string) => {
      if (t === 'system') {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
      }
      return t
    }

    const resolved = resolveTheme(storedTheme)
    if (resolved === 'light') {
      root.removeAttribute('data-theme')
    } else {
      root.setAttribute('data-theme', resolved)
    }
    root.setAttribute('data-density', storedDensity === 'comfortable' ? '' : storedDensity)
    root.setAttribute('data-wallpaper', storedWallpaper === 'default' ? '' : storedWallpaper)
    if (storedWallpaper === 'custom' && storedWallpaperUrl) {
      root.style.setProperty('--chat-bg-image', `url("${storedWallpaperUrl}")`)
    }
  }, [])

  // Watch system theme changes when theme is set to 'system'
  React.useEffect(() => {
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      const root = document.querySelector('.yousafe-messenger') as HTMLElement | null
      if (root) root.setAttribute('data-theme', mq.matches ? 'dark' : 'light')
    }
    mq.addEventListener?.('change', onChange)
    return () => mq.removeEventListener?.('change', onChange)
  }, [theme])

  // Close menu on outside click
  React.useEffect(() => {
    if (!menuFor) return
    const onDoc = (e: MouseEvent) => {
      if (!(e.target as HTMLElement)?.closest?.('[data-rowmenu]')) {
        setMenuFor(null)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [menuFor])

  // Notify parent when thread changes
  React.useEffect(() => { onThreadChange?.(activeId) }, [activeId, onThreadChange])

  // Fetch status broadcasts for 24h ring
  React.useEffect(() => {
    let cancelled = false
    fetch('/api/statuses', { credentials: 'same-origin' })
      .then(r => r.json().catch(() => ({})))
      .then(d => {
        if (cancelled) return
        setStatuses(Array.isArray(d?.statuses) ? d.statuses : [])
      })
      .catch(() => { if (!cancelled) setStatuses([]) })
    return () => { cancelled = true }
  }, [])

  // Debounce search
  React.useEffect(() => {
    const t = setTimeout(() => { setDebouncedQ(searchInput); setPage(1) }, 250)
    return () => clearTimeout(t)
  }, [searchInput])

  const loadList = React.useCallback(async (silent = false) => {
    if (!silent) setListLoading(true)
    setListError('')
    try {
      const p = new URLSearchParams()
      p.set('filter', tab)
      if (debouncedQ) p.set('q', debouncedQ)
      p.set('page', String(page))
      p.set('page_size', String(PAGE_SIZE))
      const r = await fetch(`/api/messages/conversations?${p}`, { credentials: 'same-origin' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d?.error?.message || `Failed (${r.status})`)
      setConversations(d.conversations || [])
      setCounts(d.counts || {})
      setHasMore(!!d.has_more)
      if (!activeId && (d.conversations || []).length > 0) {
        setActiveId(d.conversations[0].id)
      }
    } catch (e) {
      setListError(e.message || 'Failed to load conversations.')
    } finally {
      if (!silent) setListLoading(false)
    }
  }, [tab, debouncedQ, page, activeId])

  React.useEffect(() => { loadList(false) }, [loadList])

  // Soft poll every 12s
  React.useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') loadList(true)
    }, 12_000)
    return () => clearInterval(id)
  }, [loadList])

  // Load active thread
  const loadThread = React.useCallback(async (silent = false) => {
    if (!activeId) {
      setActiveMsgs([]); setActiveConv(null); setActiveSidebar({ orders: [], offers: [] })
      return
    }
    // Brief 47 §6.2: if this conversation's inquiry was deleted, preserve placeholder
    if (deletedConvId === activeId) {
      if (!silent) setThreadLoading(false)
      return
    }
    if (!silent) setThreadLoading(true)
    setThreadError('')
    try {
      const r = await fetch(`/api/messages/conversations/${activeId}`, { credentials: 'same-origin' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d?.error?.message || `Failed (${r.status})`)
      setActiveConv(d.conversation || null)
      setActiveMsgs(d.messages || [])
      setActiveSidebar(d.sidebar || { orders: [], offers: [] })
      setActiveParticipant(d.participant || null)
      fetch(`/api/messages/conversations/${activeId}`, {
        method: 'PATCH', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ read: true }),
      }).catch(() => null)
    } catch (e) {
      setThreadError(e.message)
    } finally {
      if (!silent) setThreadLoading(false)
    }
  }, [activeId, deletedConvId])

  React.useEffect(() => { loadThread(false) }, [loadThread])

  // Soft poll active thread every 8s
  React.useEffect(() => {
    if (!activeId) return
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') loadThread(true)
    }, 8_000)
    return () => clearInterval(id)
  }, [activeId, loadThread])

  // Brief 47 §6.2: realtime subscribe to inquiries DELETE
  React.useEffect(() => {
    const off = subscribeToTable('inquiries', 'public', (payload) => {
      if (payload.eventType !== 'DELETE' || !payload.old?.id) return
      const inqId = payload.old.id as string
      // Find conversation(s) tied to this inquiry
      setConversations(prev => {
        const toRemove = prev.filter(c => c.context_kind === 'inquiry' && c.context_id === inqId)
        if (toRemove.length > 0) {
          const removedConvId = toRemove[0].id
          setDeletedInquiryId(inqId)
          setDeletedConvId(removedConvId)
          // If the deleted inquiry's chat is open, show placeholder and keep for 30s
          if (activeId === removedConvId) {
            setActiveConv((prevConv: any) => prevConv ? { ...prevConv, _deleted: true } : null)
          }
          // Unmount after ~30 seconds
          setTimeout(() => {
            setDeletedInquiryId(prev => prev === inqId ? null : prev)
            setDeletedConvId(prev => prev === removedConvId ? null : prev)
            if (activeId === removedConvId) {
              setActiveId(null)
              setActiveMsgs([])
              setActiveConv(null)
            }
          }, 30_000)
        }
        return prev.filter(c => !(c.context_kind === 'inquiry' && c.context_id === inqId))
      })
    })
    return () => off()
  }, [activeId])

  const loadStarred = React.useCallback(async () => {
    try {
      const r = await fetch('/api/messages/starred', { credentials: 'same-origin' })
      const d = await r.json().catch(() => ({}))
      if (r.ok) setStarredMsgs(d.messages || [])
    } catch {
      // silent
    }
  }, [])

  const handleOfferAccept = React.useCallback((offerId) => {
    if (!offerId || offerBusyId) return
    setThreadError('')
    setPayingOfferId(offerId)
  }, [offerBusyId])

  const handleOfferDecline = React.useCallback(async (offerId) => {
    if (!offerId || offerBusyId) return
    setOfferBusyId(offerId); setThreadError('')
    try {
      const r = await fetch(`/api/offers/${offerId}/decline`, {
        method: 'PATCH', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d?.error?.message || `Failed (${r.status})`)
      await loadThread(true); await loadList(true)
    } catch (e) {
      setThreadError(e.message || 'Could not decline offer.')
    } finally {
      setOfferBusyId(null)
    }
  }, [offerBusyId, loadThread, loadList])

  const handleOfferWithdraw = React.useCallback(async (offerId) => {
    if (!offerId || offerBusyId) return
    setOfferBusyId(offerId); setThreadError('')
    try {
      const r = await fetch(`/api/offers/${offerId}/withdraw`, {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d?.error?.message || `Failed (${r.status})`)
      await loadThread(true); await loadList(true)
    } catch (e) {
      setThreadError(e.message || 'Could not withdraw offer.')
    } finally {
      setOfferBusyId(null)
    }
  }, [offerBusyId, loadThread, loadList])

  const send = async () => {
    const text = draft.trim()
    if (!text || sending || !activeId) return
    setSending(true); setThreadError('')
    try {
      const payload: any = { body: text }
      if (replyingTo) payload.reply_to_id = replyingTo.id
      const r = await fetch(`/api/messages/conversations/${activeId}`, {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d?.error?.message || 'Send failed')
      setDraft('')
      setReplyingTo(null)
      await loadThread(true)
      await loadList(true)
    } catch (e: any) { setThreadError(e.message) }
    finally { setSending(false) }
  }

  // Post a call request as a normal text message so it surfaces in the
  // counterpart's inbox and email digest. We deliberately don't add a new
  // message type for this — keeping it as plain text means the existing
  // safety guard, search index, and notification pipeline all work without
  // any extra wiring. The composed string is structured enough that we can
  // upgrade the bubble to a richer UI later if needed.
  const sendCallRequest = async (kind: 'video' | 'voice', whenIso: string) => {
    if (!activeId || callRequestSubmitting) return
    setCallRequestSubmitting(true)
    setThreadError('')
    try {
      const dt = whenIso ? new Date(whenIso) : null
      const whenLabel = dt && !Number.isNaN(dt.getTime())
        ? dt.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
        : 'a time that works for you'
      const verb = kind === 'video' ? 'video call' : 'phone call'
      const text = `📞 ${verb.replace(/^./, c => c.toUpperCase())} request — proposed for ${whenLabel}. Reply with a time that works and I'll confirm the link before we connect.`
      const r = await fetch(`/api/messages/conversations/${activeId}`, {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: text }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d?.error?.message || 'Could not send call request')
      setCallRequestKind(null)
      setCallRequestTime('')
      await loadThread(true)
      await loadList(true)
    } catch (e: any) {
      setThreadError(e.message)
    } finally {
      setCallRequestSubmitting(false)
    }
  }

  const handleReact = async (msgId: string, emoji: string) => {
    if (!activeId) return
    // Optimistic
    setActiveMsgs((prev: any[]) => prev.map((m: any) => {
      if (m.id !== msgId) return m
      const existing: any[] = m.reactions || []
      const idx = existing.findIndex((r: any) => r.emoji === emoji)
      let next: any[]
      if (idx >= 0) {
        const r = existing[idx]
        if (r.mine) {
          next = r.count <= 1
            ? existing.filter((_, i) => i !== idx)
            : existing.map((x, i) => i === idx ? { ...x, count: x.count - 1, mine: false } : x)
        } else {
          next = existing.map((x, i) => i === idx ? { ...x, count: x.count + 1, mine: true } : x)
        }
      } else {
        next = [...existing, { emoji, count: 1, mine: true }]
      }
      return { ...m, reactions: next }
    }))
    try {
      const r = await fetch(`/api/messages/conversations/${activeId}/messages/${msgId}/react`, {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emoji }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'React failed')
      setActiveMsgs((prev: any[]) => prev.map((m: any) =>
        m.id === msgId ? { ...m, reactions: d.reactions || m.reactions } : m
      ))
    } catch {
      loadThread(true)
    }
  }

  const handleReplyStart = (msgId: string, snippet: string, senderName: string) => {
    setReplyingTo({ id: msgId, snippet, senderName })
  }

  const handleReplyClick = (msgId: string) => {
    const el = document.querySelector(`[data-msgid="${msgId}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const applySetting = (key: string, value: string) => {
    const root = document.querySelector('.yousafe-messenger') as HTMLElement | null
    if (!root) return
    if (key === 'theme') {
      const resolved = value === 'system'
        ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
        : value
      if (resolved === 'light') {
        root.removeAttribute('data-theme')
      } else {
        root.setAttribute('data-theme', resolved)
      }
    }
    if (key === 'density') {
      root.setAttribute('data-density', value === 'comfortable' ? '' : value)
    }
    if (key === 'wallpaper') {
      root.setAttribute('data-wallpaper', value === 'default' ? '' : value)
      if (value !== 'custom') {
        root.style.removeProperty('--chat-bg-image')
      }
    }
  }

  const handleChangeTheme = (t: string) => {
    setTheme(t)
    localStorage.setItem('yousafe.messenger.theme', t)
    applySetting('theme', t)
  }

  const handleChangeDensity = (d: string) => {
    setDensity(d)
    localStorage.setItem('yousafe.messenger.density', d)
    applySetting('density', d)
  }

  const handleChangeWallpaper = (w: string) => {
    setWallpaper(w)
    localStorage.setItem('yousafe.messenger.wallpaper', w)
    applySetting('wallpaper', w)
  }

  const handleChangeWallpaperUrl = (url: string) => {
    setWallpaperUrl(url)
    if (url) {
      localStorage.setItem('yousafe.messenger.wallpaper_url', url)
      const root = document.querySelector('.yousafe-messenger') as HTMLElement | null
      if (root) root.style.setProperty('--chat-bg-image', `url("${url}")`)
    } else {
      localStorage.removeItem('yousafe.messenger.wallpaper_url')
      const root = document.querySelector('.yousafe-messenger') as HTMLElement | null
      if (root) root.style.removeProperty('--chat-bg-image')
    }
  }

  const handleToggleGlobalMute = async (muted: boolean) => {
    setGlobalMute(muted)
    localStorage.setItem('yousafe.messenger.globalMute', String(muted))
    const farFuture = '2099-01-01T00:00:00.000Z'
    const payload = JSON.stringify({ muted_until: muted ? farFuture : null })
    await Promise.all(
      conversations.map((c: any) =>
        fetch(`/api/messages/conversations/${c.id}/mute`, {
          method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
        }).catch(() => null)
      )
    )
    await loadList(true)
  }

  const handleSelectConversation = (id) => {
    setActiveId(id)
    setMobileShowChat(true)
  }

  const archivedCount = counts.archived || 0

  const togglePin = async (convId) => {
    const conv = conversations.find(c => c.id === convId)
    const next = !conv?.pinned_at
    setConversations(prev => prev.map(c => c.id === convId ? { ...c, pinned_at: next ? new Date().toISOString() : null } : c))
    try {
      await fetch(`/api/messages/conversations/${convId}/pin`, {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinned: next }),
      })
      await loadList(true)
    } catch {
      /* rollback on error */
      setConversations(prev => prev.map(c => c.id === convId ? { ...c, pinned_at: conv?.pinned_at ?? null } : c))
    }
  }

  const toggleArchive = async (convId) => {
    const conv = conversations.find(c => c.id === convId)
    const next = !conv?.archived_at
    setConversations(prev => prev.map(c => c.id === convId ? { ...c, archived_at: next ? new Date().toISOString() : null } : c))
    try {
      await fetch(`/api/messages/conversations/${convId}/archive`, {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: next }),
      })
      await loadList(true)
    } catch {
      setConversations(prev => prev.map(c => c.id === convId ? { ...c, archived_at: conv?.archived_at ?? null } : c))
    }
  }

  const setMute = async (convId, until) => {
    const conv = conversations.find(c => c.id === convId)
    setConversations(prev => prev.map(c => c.id === convId ? { ...c, muted_until: until } : c))
    try {
      await fetch(`/api/messages/conversations/${convId}/mute`, {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ muted_until: until }),
      })
      await loadList(true)
    } catch {
      setConversations(prev => prev.map(c => c.id === convId ? { ...c, muted_until: conv?.muted_until ?? null } : c))
    }
  }

  const deleteConversation = async (convId) => {
    setConversations(prev => prev.filter(c => c.id !== convId))
    if (activeId === convId) setActiveId(null)
    try {
      await fetch(`/api/messages/conversations/${convId}`, {
        method: 'DELETE', credentials: 'same-origin',
      })
      await loadList(true)
    } catch {
      await loadList(false)
    }
  }

  const handleStarMessage = async (msgId: string, starred: boolean) => {
    if (!activeId) return
    // Optimistic
    const prev = activeParticipant?.starred_message_ids || []
    const next = starred
      ? [...prev, msgId]
      : prev.filter((x: string) => x !== msgId)
    setActiveParticipant((p: any) => p ? { ...p, starred_message_ids: next } : p)
    try {
      await fetch(`/api/messages/conversations/${activeId}/messages/${msgId}`, {
        method: 'POST', credentials: 'same-origin',
      })
      // Refresh starred list cache
      loadStarred()
    } catch {
      // Revert
      setActiveParticipant((p: any) => p ? { ...p, starred_message_ids: prev } : p)
    }
  }

  // ── Message action menu handlers ────────────────────────────────────
  const handleDeleteMessage = async (msgId: string) => {
    if (!activeId) return
    try {
      const res = await fetch(`/api/messages/conversations/${activeId}/messages/${msgId}`, {
        method: 'DELETE', credentials: 'same-origin',
      })
      if (!res.ok) {
        const data: any = await res.json().catch(() => ({}))
        const msg = data?.error?.message || data?.error || 'Could not delete message.'
        window.alert(typeof msg === 'string' ? msg : 'Could not delete message.')
        return
      }
      loadThread(true)
      loadList(true)
    } catch (e: any) {
      window.alert(e?.message || 'Network error deleting message.')
    }
  }

  const handleForwardMessage = (msgId: string) => {
    // Stage the message body as a pre-filled draft for the next
    // conversation the user picks. Stored in localStorage so the next
    // inbox mount can pick it up, and we prompt the user to choose a
    // conversation from the left list. Minimal viable forward — full
    // multi-recipient picker can come later.
    const m = activeMsgs.find((x: any) => x.id === msgId)
    if (!m) return
    const body = m.body || (m.attachment_name ? `📎 ${m.attachment_name}` : '')
    if (!body && !m.attachment_url) {
      window.alert('Nothing to forward.')
      return
    }
    const forwardText = `Forwarded message:\n${body}`
    try {
      window.localStorage.setItem('yousafe.forward.pending', JSON.stringify({
        body: forwardText,
        attachment_url: m.attachment_url || null,
        attachment_name: m.attachment_name || null,
        ts: Date.now(),
      }))
    } catch { /* localStorage unavailable, fall through */ }
    setDraft(forwardText)
    window.alert('Forward staged. Select another conversation from the left and the message will be pre-filled in the composer.')
  }

  const handleShowMessageInfo = (msgId: string) => {
    const m = activeMsgs.find((x: any) => x.id === msgId)
    if (!m) return
    const sentAt = new Date(m.created_at).toLocaleString()
    const delivered = m.delivered_at ? new Date(m.delivered_at).toLocaleString() : '—'
    const read = m.read_at ? new Date(m.read_at).toLocaleString() : '—'
    const sender = m.sender_id === activeConv?.counterpart?.id ? (activeConv?.counterpart?.full_name || 'Them') : 'You'
    window.alert(
      `Message info\n\nSender: ${sender}\nSent: ${sentAt}\nDelivered: ${delivered}\nRead: ${read}`,
    )
  }

  // On conversation switch: if a forward is staged, drop it into the
  // composer of the newly-selected conversation.
  React.useEffect(() => {
    if (!activeId) return
    try {
      const raw = window.localStorage.getItem('yousafe.forward.pending')
      if (!raw) return
      const staged = JSON.parse(raw)
      if (staged?.ts && Date.now() - staged.ts < 60_000) {
        setDraft(staged.body || '')
      }
      window.localStorage.removeItem('yousafe.forward.pending')
    } catch { /* ignore */ }
  }, [activeId])

  const openMenu = (convId, e) => {
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    const x = Math.min(window.innerWidth - 240, rect.right - 16)
    const y = rect.bottom + 6
    setMenuPos({ x, y })
    setMenuFor(convId)
  }

  // ── Left rail (ChatList chrome) ─────────────────────────────────────
  const sidebar = (
    <div className="cl">
      <div className="cl-head">
        <div className="cl-title">
          <div className="cl-title-l">
            <div className="cl-avatar" style={{ background: '#3C3B6E' }}>
              {activeConv?.counterpart?.name ? initials(activeConv.counterpart.name) : 'Y'}
            </div>
            <div>
              <div className="cl-title-name">Chats</div>
              <div className="cl-title-sub">{counts.totalUnread ? `${counts.totalUnread} unread` : 'All caught up'}</div>
            </div>
          </div>
          <div className="cl-title-r">
            <button className="iconbtn" title="Settings" onClick={() => setShowSettings(true)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          </div>
        </div>

        {role === 'client' && (
          <button
            type="button"
            className="cl-pill on"
            onClick={() => setShowInquiryComposer(true)}
            style={{
              marginBottom: 10,
              background: 'var(--indigo)',
              color: '#fff',
              borderColor: 'var(--indigo)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontWeight: 600,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Inquiry
          </button>
        )}

        {(role === 'attorney' || role === 'consultant') && (
          <a
            href="https://portal.yousafeconsultancy.com/dashboard?page=mine"
            className="cl-pill"
            style={{
              marginBottom: 10,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            <span>📥</span>
            Inquiries
          </a>
        )}

        <div className="cl-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            placeholder="Search or start new chat"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
          />
          {searchInput && (
            <button className="cl-search-x" onClick={() => setSearchInput('')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>

        <div className="cl-filters">
          {[
            { id: 'all',        label: 'All',        count: counts.all },
            { id: 'unread',     label: 'Unread',     count: counts.unread },
            { id: 'favourites', label: 'Favourites', count: counts.favourites },
            { id: 'groups',     label: 'Groups',     count: counts.groups },
          ].map(f => (
            <button
              key={f.id}
              className={`cl-pill ${tab === f.id ? 'on' : ''}`}
              onClick={() => { setTab(f.id); setPage(1) }}
            >
              {f.label}{typeof f.count === 'number' && f.count > 0 && <span className="cl-pill-count">{f.count.toLocaleString()}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="cl-scroll">
        {/* Brief 47 §6.3: Student's own status tile with delete broadcast control */}
        {role === 'client' && statuses.filter(s => s.person_id === myProfileId).length > 0 && (
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-soft)', marginBottom: 8 }}>My status</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {statuses.filter(s => s.person_id === myProfileId).map(s => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, position: 'relative' }}>
                  <div
                    style={{ cursor: 'pointer', flexShrink: 0 }}
                    onClick={() => {
                      setStatusViewerPersonId(s.person_id)
                      setStatusViewerOpen(true)
                    }}
                  >
                    <StatusRing hasStatus={true} viewed={!!s.viewed} size={40}>
                      <div className="row-avatar" style={{ background: '#3C3B6E', width: 40, height: 40, fontSize: 14 }}>
                        {initials(s.person_name || 'You')}
                      </div>
                    </StatusRing>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{s.payload?.case_type_label || 'Inquiry'}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-soft)' }}>{fmtRelative(s.created_at)} · {s.payload?.country_flag || '🌍'}</div>
                  </div>
                  <button
                    className="iconbtn"
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect()
                      setStatusMenuPos({ x: rect.left - 140, y: rect.bottom + 4 })
                      setStatusMenuFor(s.id)
                    }}
                    style={{ flexShrink: 0 }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="5" r="1" />
                      <circle cx="12" cy="12" r="1" />
                      <circle cx="12" cy="19" r="1" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Archived row — always render if count > 0, stub click */}
        {archivedCount > 0 && (
          <button className="cl-archived" onClick={() => setShowArchived(true)}>
            <div className="cl-archived-l">
              <div className="cl-archived-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="21 8 21 21 3 21 3 8" />
                  <rect x="1" y="3" width="22" height="5" />
                  <line x1="10" y1="12" x2="14" y2="12" />
                </svg>
              </div>
              <span>Archived</span>
            </div>
            <div className="cl-archived-r">
              <span className="cl-archived-count">{archivedCount}</span>
            </div>
          </button>
        )}

        {listLoading && conversations.length === 0 && (
          <div className="cl-empty">Loading…</div>
        )}
        {listError && (
          <div className="cl-empty">
            {listError} · <button onClick={() => loadList(false)} style={{ background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer' }}>retry</button>
          </div>
        )}
        {!listLoading && !listError && conversations.length === 0 && (
          <div className="cl-empty">
            {tab === 'unread' ? 'No unread conversations.' : 'No conversations yet. Open a seller profile or place an order to start one.'}
          </div>
        )}

        {/* Build status lookup map once per render */}
        {(() => {
          const statusMap = new Map()
          for (const s of statuses) {
            const existing = statusMap.get(s.person_id)
            if (!existing || s.created_at > existing.created_at) {
              statusMap.set(s.person_id, s)
            }
          }

          return conversations.map(c => {
            const isActive = activeId === c.id
            const unread = c.unread > 0
            const counterStatus = statusMap.get(c.counterpart?.id)

            return (
              <button
                key={c.id}
                type="button"
                className={`row ${isActive ? 'on' : ''} ${unread ? 'unread' : ''}`}
                onClick={() => handleSelectConversation(c.id)}
              >
                <div
                  onClick={e => {
                    if (!counterStatus) return
                    e.stopPropagation()
                    setStatusViewerPersonId(c.counterpart?.id)
                    setStatusViewerOpen(true)
                  }}
                  style={{ cursor: counterStatus ? 'pointer' : 'default' }}
                >
                  <StatusRing hasStatus={!!counterStatus} viewed={!!counterStatus?.viewed} size={48}>
                    <div className="row-avatar" style={{ background: c.counterpart?.avatar_color || '#3C3B6E' }}>
                      {c.counterpart?.avatar_url
                        ? <img src={c.counterpart.avatar_url} alt={c.counterpart?.name || ''} style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover' }} />
                        : initials(c.counterpart?.name || '?')}
                    </div>
                  </StatusRing>
                </div>
              <div className="row-body">
                <div className="row-line1">
                  <span className="row-name">{c.counterpart?.name || 'Conversation'}</span>
                  {c.last_message_at && (
                    <span className={`row-time ${unread ? 'on' : ''}`}>{fmtRelative(c.last_message_at)}</span>
                  )}
                </div>
                <div className="row-line2">
                  <span className="row-snippet">
                    {c.last_from_me && <span className="you">You: </span>}
                    {c.last_message || 'New conversation'}
                  </span>
                  <span className="row-icons">
                    {c.pinned_at && <span style={{ opacity: 0.55, fontSize: 11 }}>📌</span>}
                    {c.muted_until && new Date(c.muted_until) > new Date() && <span style={{ opacity: 0.55, fontSize: 11 }}>🔕</span>}
                    {unread && <span className="row-unread">{c.unread > 99 ? '99+' : c.unread}</span>}
                    <span className="row-chev" onClick={e => { e.stopPropagation(); openMenu(c.id, e) }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </span>
                  </span>
                </div>
                {c.context_kind && (
                  <div className="row-ctx">{CTX_LABEL[c.context_kind] || c.context_kind}</div>
                )}
              </div>
            </button>
          )
        })})()}
      </div>

      {(page > 1 || hasMore) && (
        <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)', background: 'var(--panel-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))} style={pagerBtn(page <= 1)}>← Prev</button>
          <span style={{ fontFamily: 'var(--font-plex-mono), monospace', fontSize: 11, color: 'var(--text-soft)' }}>Page {page}</span>
          <button disabled={!hasMore} onClick={() => setPage(p => p + 1)} style={pagerBtn(!hasMore)}>Next →</button>
        </div>
      )}

      {menuFor && (
        <RowMenu
          conv={conversations.find(c => c.id === menuFor)}
          x={menuPos.x}
          y={menuPos.y}
          onPin={() => { togglePin(menuFor); setMenuFor(null) }}
          onArchive={() => { toggleArchive(menuFor); setMenuFor(null) }}
          onMute={(mins) => { setMute(menuFor, mins ? new Date(Date.now() + mins * 60_000).toISOString() : null); setMenuFor(null) }}
          onDelete={() => { deleteConversation(menuFor); setMenuFor(null) }}
          onClose={() => setMenuFor(null)}
        />
      )}

      {statusMenuFor && (
        <div
          data-rowmenu
          className="ctxmenu"
          style={{ left: statusMenuPos.x, top: statusMenuPos.y }}
        >
          <button
            className="ctxmenu-item danger"
            onClick={async () => {
              const status = statuses.find(s => s.id === statusMenuFor)
              if (status?.inquiry_id) {
                try {
                  const r = await fetch(`/api/client/inquiries/${status.inquiry_id}/status`, {
                    method: 'DELETE',
                    credentials: 'same-origin',
                  })
                  if (r.ok) {
                    setStatuses(prev => prev.filter(s => s.id !== statusMenuFor))
                  }
                } catch {
                  // silent
                }
              }
              setStatusMenuFor(null)
            }}
          >
            <span>🗑</span> Delete broadcast
          </button>
          <div className="ctxmenu-sep" />
          <button className="ctxmenu-item" onClick={() => setStatusMenuFor(null)}>
            <span>✕</span> Cancel
          </button>
        </div>
      )}
    </div>
  )

  // ── Right-pane header (ChatView header chrome) ──────────────────────
  const header = activeId ? (
    <div className="cv-head">
      {mobileShowChat && (
        <button
          className="iconbtn"
          onClick={() => setMobileShowChat(false)}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      )}
      <div
        className="cv-head-info"
        role="button"
        onClick={() => setPreviewSellerId(activeConv?.counterpart?.id)}
        style={{ cursor: 'pointer' }}
      >
        <div className="cv-head-avatar" style={{ background: activeConv?.counterpart?.avatar_color || '#3C3B6E' }}>
          {activeConv?.counterpart?.avatar_url
            ? <img src={activeConv.counterpart.avatar_url} alt={activeConv.counterpart?.full_name || ''} style={{ width: 42, height: 42, borderRadius: '50%', objectFit: 'cover' }} />
            : initials(activeConv?.counterpart?.full_name || '?')}
        </div>
        <div className="cv-head-text">
          <div className="cv-head-name">{activeConv?.counterpart?.full_name || 'Conversation'}</div>
          <div className="cv-head-status">
            {activeConv?.counterpart?.email || ''}
          </div>
        </div>
      </div>

      {activeConv?.context_kind && activeConv.context_kind !== 'general' && (
        <span className="cv-head-ctx">{CTX_LABEL[activeConv.context_kind]}</span>
      )}

      {canSendOffer && (
        <button
          className="cv-head-offer-cta"
          onClick={() => setShowOfferComposer(v => !v)}
        >
          + Send offer
        </button>
      )}

      <div className="cv-head-actions">
        <button
          className="iconbtn"
          title="Search in chat"
          aria-pressed={inChatSearchOpen}
          style={inChatSearchOpen ? { background: 'var(--accent-soft)', color: 'var(--accent)' } : undefined}
          onClick={() => {
            setInChatSearchOpen(v => {
              const next = !v
              if (!next) setInChatSearchQ('')
              return next
            })
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </button>
        <button
          className="iconbtn"
          title="Request a video call"
          onClick={() => { setCallRequestKind('video'); setCallRequestTime('') }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="23 7 16 12 23 17 23 7" />
            <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
          </svg>
        </button>
        <button
          className="iconbtn"
          title="Request a voice call"
          onClick={() => { setCallRequestKind('voice'); setCallRequestTime('') }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
          </svg>
        </button>
        {/* Star icon now toggles favourite on the ACTIVE conversation.
            Filled gold star = favourited; outlined = not. Reuses the
            existing togglePin handler so the list's Favourites tab,
            row-level "📌" indicator, and this header all stay in sync.
            Alt-click opens the starred-messages modal for power users. */}
        <button
          className="iconbtn"
          title={activeConv?.pinned_at ? 'Remove from favourites (Alt-click for starred messages)' : 'Add to favourites (Alt-click for starred messages)'}
          onClick={(e) => {
            if (!activeId) return
            if ((e as any).altKey) {
              setShowStarred(true)
              loadStarred()
            } else {
              togglePin(activeId)
            }
          }}
          aria-pressed={!!activeConv?.pinned_at}
        >
          <svg
            width="18" height="18" viewBox="0 0 24 24"
            fill={activeConv?.pinned_at ? '#C4A45A' : 'none'}
            stroke={activeConv?.pinned_at ? '#C4A45A' : 'currentColor'}
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          >
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        </button>
        <button className="iconbtn" title="Settings" onClick={() => setShowSettings(true)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>
    </div>
  ) : (
    <div className="cv-head">
      <div className="cv-head-name">Messages</div>
    </div>
  )

  // ── Archive / delete flags ──────────────────────────────────────────
  const isArchived = !!activeConv?.source_inquiry_archived_at
  const isDeleted = deletedConvId === activeId

  // ── Banner (archived inquiry) ───────────────────────────────────────
  const banner = (isArchived && !isDeleted) ? (
    <div style={{
      padding: '8px 14px',
      background: 'var(--panel-2)',
      color: 'var(--text-soft)',
      fontSize: 12,
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      gap: 6,
    }}>
      <span>⏸</span>
      <span>This inquiry was archived {fmtRelative(activeConv.source_inquiry_archived_at)}. Existing messages are read-only.</span>
    </div>
  ) : null

  // ── Composer ────────────────────────────────────────────────────────
  const composer = activeId && (
    <div className="comp">
      {canSendOffer && showOfferComposer && !isArchived && !isDeleted && (
        <div style={{ padding: '10px 14px 0', background: 'var(--panel-2)' }}>
          <OfferComposerInline
            conversationId={activeId}
            onSent={() => { loadThread(true); loadList(true) }}
            onClose={() => setShowOfferComposer(false)}
          />
        </div>
      )}
      <AutoGrowInput
        value={draft}
        onChange={setDraft}
        onSubmit={send}
        disabled={sending || isArchived || isDeleted}
        placeholder={isDeleted ? 'This inquiry was deleted by the client. No further actions are possible.' : isArchived ? 'Inquiry archived — cannot send new messages.' : 'Type a message…'}
        replyTo={replyingTo}
        onCancelReply={() => setReplyingTo(null)}
        conversationId={activeId}
        onAttachmentSent={() => { loadThread(true); loadList(true) }}
      />
    </div>
  )

  // ── Messages area ───────────────────────────────────────────────────
  const messages = !activeId ? (
    <div className="cv-empty-full" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
      <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.25 }}>💬</div>
      <h2 style={{ fontFamily: 'var(--font-lora), Georgia, serif', fontWeight: 500, fontSize: 24, color: 'var(--text)', margin: '0 0 8px' }}>Yousafe Messaging</h2>
      <p style={{ maxWidth: '36ch', color: 'var(--text-soft)', lineHeight: 1.6, fontSize: 13, margin: 0 }}>
        Pick a conversation from the left, or start a new one.
      </p>
    </div>
  ) : isDeleted ? (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
      <div style={{ textAlign: 'center', maxWidth: '40ch', padding: '0 24px' }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>🗑</div>
        <div style={{ fontFamily: 'var(--font-lora), Georgia, serif', fontSize: 17, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>This inquiry was deleted by the client.</div>
        <div style={{ fontSize: 12, color: 'var(--text-soft)' }}>No further actions are possible.</div>
      </div>
    </div>
  ) : (
    <>
      {threadError && <div style={{ padding: '8px 18px', background: 'color-mix(in oklab, var(--brick) 10%, transparent)', color: 'var(--brick)', fontSize: 12 }}>{threadError}</div>}
      {inChatSearchOpen && (
        <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)', background: 'var(--panel-2)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-soft)', flexShrink: 0 }}>
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            autoFocus
            value={inChatSearchQ}
            onChange={(e) => setInChatSearchQ(e.target.value)}
            placeholder="Search this conversation…"
            style={{ flex: 1, border: 0, outline: 'none', background: 'transparent', fontSize: 13, color: 'var(--text)' }}
          />
          <span style={{ fontSize: 11, color: 'var(--text-soft)' }}>
            {(() => {
              if (!inChatSearchQ.trim()) return `${activeMsgs.length} message${activeMsgs.length === 1 ? '' : 's'}`
              const q = inChatSearchQ.trim().toLowerCase()
              const n = activeMsgs.filter((m: any) => String(m?.body || '').toLowerCase().includes(q)).length
              return `${n} match${n === 1 ? '' : 'es'}`
            })()}
          </span>
          <button
            className="iconbtn"
            title="Close search"
            onClick={() => { setInChatSearchOpen(false); setInChatSearchQ('') }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}
      {threadLoading && activeMsgs.length === 0 && <div className="cv-empty">Loading thread…</div>}
      {!threadLoading && activeMsgs.length === 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>💬</div>
            <div style={{ fontFamily: 'var(--font-lora), Georgia, serif', fontSize: 17, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>No messages yet</div>
            <div style={{ fontSize: 12, color: 'var(--text-soft)' }}>Type below to start the conversation.</div>
          </div>
        </div>
      )}
      {(() => {
        // When the in-chat search bar is open and has a query, narrow the
        // visible thread to bubbles whose body matches. We keep grouping
        // logic intact by computing on the filtered array — grouping is a
        // visual nicety inside the active view and doesn't need to mirror
        // the underlying message order across a filter.
        const visibleMsgs = inChatSearchOpen && inChatSearchQ.trim()
          ? activeMsgs.filter((m: any) => String(m?.body || '').toLowerCase().includes(inChatSearchQ.trim().toLowerCase()))
          : activeMsgs
        return visibleMsgs.map((m: any, i: number) => {
          const prev = visibleMsgs[i - 1]
          const next = visibleMsgs[i + 1]
        const mine = m.sender_id !== activeConv?.counterpart?.id
        const prevMine = prev ? prev.sender_id !== activeConv?.counterpart?.id : null
        const nextMine = next ? next.sender_id !== activeConv?.counterpart?.id : null
        const isFirstInGroup = prevMine !== mine
        const isLastInGroup = nextMine !== mine
        const showDate = !prev || !sameDay(m.created_at, prev.created_at)
        return (
          <React.Fragment key={m.id}>
            {showDate && (
              <div className="cv-divider">
                <span>{dateLabel(m.created_at)}</span>
              </div>
            )}
            <div data-msgid={m.id}>
              <ThreadMessage
                m={m}
                counterpartId={activeConv?.counterpart?.id}
                counterpartName={activeConv?.counterpart?.full_name || 'Them'}
                counterpartAvatarUrl={activeConv?.counterpart?.avatar_url}
                counterpartAvatarColor={activeConv?.counterpart?.avatar_color}
                offerBusy={offerBusyId === m.offer?.id}
                onAccept={handleOfferAccept}
                onDecline={handleOfferDecline}
                onWithdraw={handleOfferWithdraw}
                isFirstInGroup={isFirstInGroup}
                isLastInGroup={isLastInGroup}
                starred={(activeParticipant?.starred_message_ids || []).includes(m.id)}
                onStar={handleStarMessage}
                reactions={m.reactions}
                onReact={handleReact}
                onReplyStart={handleReplyStart}
                onReplyClick={handleReplyClick}
                onOpenProfile={(id) => setPreviewSellerId(id)}
                onDelete={handleDeleteMessage}
                onForward={handleForwardMessage}
                onShowInfo={handleShowMessageInfo}
                viewerRole={role}
              />
            </div>
          </React.Fragment>
        )
      })
      })()}
    </>
  )

  return (
    <div className="yousafe-messenger" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <ChatScreen
          mode="split"
          sidebar={sidebar}
          header={header}
          banner={banner}
          messages={messages}
          composer={composer}
          mobileShowChat={mobileShowChat && !!activeId}
        />
      </div>
      <OfferPaymentModal
        offerId={payingOfferId || ''}
        open={!!payingOfferId}
        onClose={() => setPayingOfferId(null)}
        onPaid={() => { loadThread(true); loadList(true) }}
      />
      <ArchivedView
        open={showArchived}
        onClose={() => setShowArchived(false)}
        conversations={conversations.filter((c) => !!c.archived_at)}
        onUnarchive={async (convId) => {
          setConversations((prev) => prev.map((c) => c.id === convId ? { ...c, archived_at: null } : c))
          try {
            await fetch(`/api/messages/conversations/${convId}/archive`, {
              method: 'POST', credentials: 'same-origin',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ archived: false }),
            })
            await loadList(true)
          } catch {
            await loadList(false)
          }
        }}
      />
      <StarredView
        open={showStarred}
        onClose={() => setShowStarred(false)}
        messages={starredMsgs}
        onJump={(msgId, convId) => {
          setShowStarred(false)
          setActiveId(convId)
          // Scroll to message after thread loads — deferred to keep simple
          setTimeout(() => {
            const el = document.querySelector(`[data-msgid="${msgId}"]`)
            el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }, 600)
        }}
      />
      {statusViewerOpen && statusViewerPersonId && (
        <StatusViewer
          statuses={statuses.filter(s => s.person_id === statusViewerPersonId)}
          onClose={() => { setStatusViewerOpen(false); setStatusViewerPersonId(null) }}
          viewerId={myProfileId}
          viewerRole={role}
          onRespond={async (statusId) => {
            try {
              const r = await fetch(`/api/statuses/${statusId}/respond`, {
                method: 'POST',
                credentials: 'same-origin',
              })
              const d = await r.json().catch(() => ({}))
              if (!r.ok) {
                setThreadError(d?.error?.message || 'Could not respond.')
                return
              }
              const convId = d?.data?.conversation_id
              if (convId) {
                setStatusViewerOpen(false)
                setStatusViewerPersonId(null)
                setActiveId(convId)
                await loadThread(true)
                await loadList(true)
              }
            } catch {
              setThreadError('Network error. Please try again.')
            }
          }}
          onOpenProfile={(id) => setPreviewSellerId(id)}
          onDeleteBroadcast={async (statusId, inquiryId) => {
            try {
              const r = await fetch(`/api/client/inquiries/${inquiryId}/status`, {
                method: 'DELETE',
                credentials: 'same-origin',
              })
              if (r.ok) {
                setStatuses(prev => prev.filter(s => s.id !== statusId))
                setStatusViewerOpen(false)
                setStatusViewerPersonId(null)
              }
            } catch {
              // silent
            }
          }}
        />
      )}
      <MessengerSettings
        open={showSettings}
        onClose={() => setShowSettings(false)}
        theme={theme}
        density={density}
        wallpaper={wallpaper}
        wallpaperUrl={wallpaperUrl}
        globalMute={globalMute}
        onChangeTheme={handleChangeTheme}
        onChangeDensity={handleChangeDensity}
        onChangeWallpaper={handleChangeWallpaper}
        onChangeWallpaperUrl={handleChangeWallpaperUrl}
        onToggleGlobalMute={handleToggleGlobalMute}
      />
      {showInquiryComposer && (
        <InquiryComposer
          onClose={() => setShowInquiryComposer(false)}
          onSubmit={() => {
            setShowInquiryComposer(false)
            // Refresh statuses so the new one appears in the ring
            fetch('/api/statuses', { credentials: 'same-origin' })
              .then(r => r.json().catch(() => ({})))
              .then(d => { setStatuses(Array.isArray(d?.statuses) ? d.statuses : []) })
              .catch(() => {})
          }}
        />
      )}
      <ProfilePreviewDrawer
        sellerId={previewSellerId}
        viewerId={myProfileId}
        open={!!previewSellerId}
        onClose={() => setPreviewSellerId(null)}
      />
      {callRequestKind && (
        <div
          onClick={() => { if (!callRequestSubmitting) setCallRequestKind(null) }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--panel)', borderRadius: 12, padding: 20,
              maxWidth: 420, width: '100%', boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
              border: '1px solid var(--border)',
            }}
          >
            <div style={{ fontFamily: 'var(--font-lora), Georgia, serif', fontSize: 18, fontWeight: 600, marginBottom: 6, color: 'var(--text)' }}>
              Request a {callRequestKind === 'video' ? 'video' : 'voice'} call
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-soft)', lineHeight: 1.5, marginBottom: 14 }}>
              Suggest a time and we'll post a call request to the conversation.
              You can swap to a meeting link once both sides confirm.
            </div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
              Proposed time
            </label>
            <input
              type="datetime-local"
              value={callRequestTime}
              onChange={(e) => setCallRequestTime(e.target.value)}
              disabled={callRequestSubmitting}
              style={{
                width: '100%', padding: '8px 10px', borderRadius: 8,
                border: '1px solid var(--border)', fontSize: 14,
                background: 'var(--panel-2)', color: 'var(--text)', boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button
                onClick={() => setCallRequestKind(null)}
                disabled={callRequestSubmitting}
                style={{
                  padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)',
                  background: 'var(--panel-2)', color: 'var(--text)', fontSize: 13, cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => sendCallRequest(callRequestKind, callRequestTime)}
                disabled={callRequestSubmitting}
                style={{
                  padding: '8px 14px', borderRadius: 8, border: 'none',
                  background: callRequestSubmitting ? '#94A3B8' : '#0F172A',
                  color: '#FFF', fontSize: 13, fontWeight: 600,
                  cursor: callRequestSubmitting ? 'not-allowed' : 'pointer',
                }}
              >
                {callRequestSubmitting ? 'Sending…' : 'Send request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Decide what the message bubble's body should look like based on the
// row's `type` + attachment fields. Voice notes render an inline audio
// player; image attachments render a clickable thumbnail; other files
// render a download chip. Text-only messages fall through to the plain
// string body. Keeps MessageBubble dumb — it accepts a ReactNode body
// and we hand it the right element here.
function renderMessageBody(m: any): React.ReactNode {
  const url = m.attachment_url
  const name = m.attachment_name || 'Attachment'
  const mime = m.metadata?.mime as string | undefined
  const isVoice = m.type === 'voice' || (mime && mime.startsWith('audio/')) || m.metadata?.is_voice
  const isImage = (mime && mime.startsWith('image/')) || /\.(jpe?g|png|webp|gif)$/i.test(name)

  if (url && isVoice) {
    return (
      <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 4, minWidth: 220 }}>
        <span style={{ fontSize: 11, opacity: 0.7, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          🎙 Voice message
        </span>
        <audio controls preload="metadata" src={url} style={{ width: '100%', maxWidth: 280 }} />
      </span>
    )
  }
  if (url && isImage) {
    return (
      <span style={{ display: 'inline-block' }}>
        <a href={url} target="_blank" rel="noopener noreferrer">
          <img
            src={url}
            alt={name}
            style={{ maxWidth: 260, maxHeight: 260, borderRadius: 8, display: 'block' }}
          />
        </a>
        {m.body && m.body !== `📎 ${name}` && (
          <span style={{ display: 'block', marginTop: 6 }}>{m.body}</span>
        )}
      </span>
    )
  }
  if (url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        download={name}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '8px 12px', borderRadius: 8,
          background: 'rgba(15,23,42,0.04)', border: '1px solid rgba(15,23,42,0.08)',
          textDecoration: 'none', color: 'inherit', fontSize: 13, fontWeight: 500,
          maxWidth: 280,
        }}
      >
        <span aria-hidden style={{ fontSize: 18 }}>📎</span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
      </a>
    )
  }
  return m.body || '(message)'
}

function ThreadMessage({
  m,
  counterpartId,
  counterpartName,
  counterpartAvatarUrl,
  counterpartAvatarColor,
  offerBusy,
  onAccept,
  onDecline,
  onWithdraw,
  isFirstInGroup,
  isLastInGroup,
  starred,
  onStar,
  reactions,
  onReact,
  onReplyStart,
  onReplyClick,
  onOpenProfile,
  onDelete,
  onForward,
  onShowInfo,
  viewerRole,
}) {
  const mine = m.sender_id !== counterpartId
  const isOffer = m.type === 'offer' && m.offer && m.offer.id

  if (isOffer) {
    const viewerRole = mine ? 'seller' : 'buyer'
    return (
      <div className={`bubrow ${mine ? 'mine' : 'theirs'} ${isLastInGroup ? 'last' : ''}`}>
        <div className="bub" style={{ maxWidth: '75%', padding: 0, background: 'var(--panel)' }}>
          <div style={{ opacity: offerBusy ? 0.6 : 1, pointerEvents: offerBusy ? 'none' : 'auto' }}>
            <MessageOfferCard
              offer={m.offer}
              viewerRole={viewerRole}
              onAccept={onAccept}
              onDecline={onDecline}
              onWithdraw={onWithdraw}
              onOpenOrder={(orderId) => {
                if (typeof window !== 'undefined') {
                  window.dispatchEvent(new CustomEvent('yousafe-open-order', { detail: { orderId } }))
                }
              }}
            />
          </div>
          <div className="bub-foot" style={{ padding: '4px 8px' }}>
            <span>{fmtFullTime(m.created_at)}</span>
          </div>
        </div>
      </div>
    )
  }

  if (m.type === 'inquiry') {
    return (
      <div className={`bubrow ${mine ? 'mine' : 'theirs'} ${isLastInGroup ? 'last' : ''}`}>
        <div className="bub" style={{ maxWidth: '75%', padding: 0, background: 'var(--panel)' }}>
          <InquiryBubble message={m} viewerRole={viewerRole} />
          <div className="bub-foot" style={{ padding: '4px 8px' }}>
            <span>{fmtFullTime(m.created_at)}</span>
          </div>
        </div>
      </div>
    )
  }

  if (m.type === 'offer_request') {
    return (
      <div className={`bubrow ${mine ? 'mine' : 'theirs'} ${isLastInGroup ? 'last' : ''}`}>
        <div className="bub" style={{ maxWidth: '75%', padding: 0, background: 'var(--panel)' }}>
          <OfferRequestCard message={m} canRespond={!mine} />
          <div className="bub-foot" style={{ padding: '4px 8px' }}>
            <span>{fmtFullTime(m.created_at)}</span>
          </div>
        </div>
      </div>
    )
  }

  const replyTo = m.reply_preview
    ? {
        id: m.reply_preview.id,
        senderName: m.reply_preview.sender_id !== counterpartId ? 'You' : (counterpartName || 'Them'),
        snippet: m.reply_preview.snippet,
      }
    : null

  return (
    <MessageBubble
      id={m.id}
      mine={mine}
      isFirstInGroup={isFirstInGroup}
      isLastInGroup={isLastInGroup}
      timestamp={m.created_at}
      readAt={m.read_at}
      deliveredAt={m.delivered_at}
      reactions={reactions}
      onReact={onReact}
      replyTo={replyTo}
      onReplyClick={onReplyClick}
      onReplyStart={(msgId, snippet, senderName) => {
        const name = senderName === 'Them' ? (counterpartName || 'Them') : senderName
        onReplyStart?.(msgId, snippet, name)
      }}
      avatarUrl={!mine ? counterpartAvatarUrl : undefined}
      avatarColor={!mine ? counterpartAvatarColor || '#3C3B6E' : undefined}
      avatarName={!mine ? counterpartName : undefined}
      onAvatarClick={!mine && isFirstInGroup ? () => onOpenProfile?.(m.sender_id) : undefined}
      body={renderMessageBody(m)}
      rawBody={m.body || ''}
      starred={starred}
      onStar={onStar ? (msgId, next) => onStar(msgId, next) : undefined}
      onDelete={mine && onDelete ? (msgId) => onDelete(msgId) : undefined}
      onForward={onForward ? (msgId) => onForward(msgId) : undefined}
      onShowInfo={onShowInfo ? (msgId) => onShowInfo(msgId) : undefined}
    />
  )
}

function RowMenu({ conv, x, y, onPin, onArchive, onMute, onDelete, onClose }) {
  const [muteSubmenu, setMuteSubmenu] = React.useState(false)
  if (!conv) return null
  const pinned = !!conv.pinned_at
  const archived = !!conv.archived_at
  const muted = conv.muted_until && new Date(conv.muted_until) > new Date()

  if (muteSubmenu) {
    return (
      <div data-rowmenu className="ctxmenu" style={{ left: x, top: y }}>
        <div className="ctxmenu-head">Mute notifications</div>
        <button className="ctxmenu-item" onClick={() => { onMute(8 * 60); setMuteSubmenu(false) }}>
          <span>🕐</span> 8 hours
        </button>
        <button className="ctxmenu-item" onClick={() => { onMute(7 * 24 * 60); setMuteSubmenu(false) }}>
          <span>📅</span> 1 week
        </button>
        <button className="ctxmenu-item" onClick={() => { onMute(0); setMuteSubmenu(false) }}>
          <span>🔕</span> Always
        </button>
        <div className="ctxmenu-sep" />
        <button className="ctxmenu-item" onClick={() => setMuteSubmenu(false)}>
          <span>←</span> Back
        </button>
      </div>
    )
  }

  return (
    <div data-rowmenu className="ctxmenu" style={{ left: x, top: y }}>
      <button className="ctxmenu-item" onClick={onPin}>
        <span>📌</span> {pinned ? 'Unpin chat' : 'Pin chat'}
      </button>
      {muted
        ? <button className="ctxmenu-item" onClick={() => onMute(null)}><span>🔔</span> Unmute notifications</button>
        : <button className="ctxmenu-item" onClick={() => setMuteSubmenu(true)}><span>🔕</span> Mute notifications <span className="ctxmenu-chev">›</span></button>}
      <button className="ctxmenu-item" onClick={onArchive}>
        <span>📦</span> {archived ? 'Unarchive' : 'Archive chat'}
      </button>
      <div className="ctxmenu-sep" />
      <button className="ctxmenu-item danger" onClick={onDelete}>
        <span>🗑</span> Delete chat
      </button>
    </div>
  )
}

const pagerBtn = (disabled) => ({
  padding: '4px 10px', fontSize: 11, fontWeight: 700,
  background: 'transparent', color: disabled ? 'var(--dim)' : 'var(--text)',
  border: '1px solid var(--border)', borderRadius: 5,
  cursor: disabled ? 'not-allowed' : 'pointer',
})
