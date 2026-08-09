'use client'
/**
 * GSC CONNECT MODAL — completes the Search Console connection without
 * leaving the Command Center.
 *
 * Two connect paths:
 *   1. OAuth (default) — Google forbids embedding the consent screen in an
 *      iframe (X-Frame-Options: DENY), so the consent URL opens in a small
 *      popup while this window polls /api/content-studio/gsc/connect until
 *      the connection lands, then fires `onConnected` (health + radar
 *      refresh) and auto-closes.
 *   2. Service account — teams without a Google OAuth client paste the SA
 *      JSON key + site URL; a POST to the same endpoint verifies access and
 *      stores the key. No popup, no polling.
 *
 * If the popup is blocked, a same-window link + manual re-check fallback
 * keeps the flow usable.
 */
import React from 'react'

const CONNECT_URL = '/api/admin/analytics/gsc/connect'
const STATUS_URL = '/api/content-studio/gsc/connect'
const POLL_MS = 2_000
const MAX_POLLS = 90 // 3 minutes of waiting before timeout

type Phase = 'ready' | 'waiting' | 'connected' | 'blocked' | 'timeout'
type ConnectTab = 'oauth' | 'sa'

const M = {
  surface: '#FFFFFF',
  border: 'rgba(0,0,0,0.08)',
  text: '#1F2937',
  textMuted: '#6B7280',
  textDim: '#9CA3AF',
  green: '#166534',
  greenSoft: '#ECFDF5',
  red: '#DC2626',
  gold: '#9A7B3B',
  goldBorder: '#FDE68A',
  goldSoft: '#FFFBEB',
  mono: "var(--portal-font-mono, 'SF Mono', 'Menlo', 'Monaco', 'Consolas', monospace)",
  serif: "var(--portal-font-display, 'Cormorant Garamond', 'Garamond', Georgia, 'Times New Roman', serif)",
  shadowLifted: '0 30px 80px rgba(15,23,42,0.40)',
}

export default function GscConnectModal({
  initialStatus,
  reconnect = false,
  onConnected,
  onClose,
}: {
  initialStatus?: Record<string, unknown> | null
  /** True when re-running consent to replace a failing token. */
  reconnect?: boolean
  onConnected?: () => void
  onClose: () => void
}) {
  const [tab, setTab] = React.useState<ConnectTab>('oauth')
  const [phase, setPhase] = React.useState<Phase>('ready')
  const [statusError, setStatusError] = React.useState<string | null>(null)
  const [lastStatus, setLastStatus] = React.useState<Record<string, unknown> | null>(initialStatus ?? null)
  // Service-account form state
  const [saKey, setSaKey] = React.useState('')
  const [saSiteUrl, setSaSiteUrl] = React.useState(
    initialStatus?.siteUrl ? String(initialStatus.siteUrl) : '',
  )
  const [saBusy, setSaBusy] = React.useState(false)
  const [saError, setSaError] = React.useState<string | null>(null)
  const popupRef = React.useRef<Window | null>(null)
  const firedRef = React.useRef(false)
  // Keep the latest onConnected in a ref so the poll effect can depend on
  // `[phase]` only — otherwise an inline-arrow prop recreated on every parent
  // render would restart the interval and reset the timeout counter.
  const onConnectedRef = React.useRef(onConnected)
  onConnectedRef.current = onConnected

  const alreadyConnected = Boolean(initialStatus?.connected && !reconnect)

  // Start in the connected state if the property is already wired up.
  React.useEffect(() => {
    if (alreadyConnected) {
      firedRef.current = true
      setPhase('connected')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const closePopup = () => {
    try {
      if (popupRef.current && !popupRef.current.closed) popupRef.current.close()
    } catch {
      /* cross-origin — popup already navigated away; nothing to close */
    }
  }

  const startFlow = () => {
    setPhase('waiting')
    setStatusError(null)
    try {
      popupRef.current = window.open(CONNECT_URL, 'gsc_oauth_connect', 'width=520,height=680')
    } catch {
      popupRef.current = null
    }
    if (!popupRef.current) setPhase('blocked')
  }

  const recheck = React.useCallback(async () => {
    try {
      const res = await fetch(STATUS_URL, { credentials: 'same-origin' })
      const data = await res.json()
      setLastStatus(data)
      if (data?.connected) {
        if (!firedRef.current) {
          firedRef.current = true
          onConnectedRef.current?.()
        }
        closePopup()
        setPhase('connected')
      } else {
        setStatusError(data?.error ? `Still not connected — ${data.error}` : 'Still not connected')
      }
    } catch {
      setStatusError('Status check failed — is the server reachable?')
    }
  }, [])

  // While waiting for Google consent, poll until the connection lands.
  // Deps are `[phase]` only — onConnected lives in a ref, so parent re-renders
  // can't restart the interval and reset the timeout counter.
  React.useEffect(() => {
    if (phase !== 'waiting') return
    let polls = 0
    const id = setInterval(async () => {
      polls++
      try {
        const res = await fetch(STATUS_URL, { credentials: 'same-origin' })
        const data = await res.json()
        setLastStatus(data)
        if (data?.connected) {
          clearInterval(id)
          if (!firedRef.current) {
            firedRef.current = true
            onConnectedRef.current?.()
          }
          closePopup()
          setPhase('connected')
          return
        }
        if (polls >= MAX_POLLS) {
          clearInterval(id)
          setPhase('timeout')
        }
      } catch {
        if (polls >= MAX_POLLS) {
          clearInterval(id)
          setPhase('timeout')
        }
      }
    }, POLL_MS)
    return () => clearInterval(id)
  }, [phase])

  // Auto-close briefly after a successful connect so the green state is seen.
  React.useEffect(() => {
    if (phase !== 'connected') return
    const id = setTimeout(onClose, 2_200)
    return () => clearTimeout(id)
  }, [phase, onClose])

  // Cleanup: never leave the popup or a stale timer behind.
  React.useEffect(() => {
    return () => closePopup()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * Service-account connect: paste the SA JSON + site URL, POST to the same
   * endpoint (it verifies access with a live Search Analytics query, then
   * persists the key server-side). No popup, no polling — a single exchange.
   */
  const connectServiceAccount = async () => {
    setSaError(null)
    const key = saKey.trim()
    const siteUrl = saSiteUrl.trim()
    if (!key) {
      setSaError('Paste the service account JSON key first.')
      return
    }
    if (!siteUrl) {
      setSaError('Enter the property URL (e.g. https://yousafeconsultancy.com/ or sc-domain:yousafeconsultancy.com).')
      return
    }
    setSaBusy(true)
    try {
      const res = await fetch(STATUS_URL, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteUrl, serviceAccountKey: key }),
      })
      const data = await res.json()
      if (!res.ok || !data?.connected) {
        setSaError(data?.error ? String(data.error) : `Connect failed (${res.status})`)
        return
      }
      setLastStatus({ ...(data as Record<string, unknown>), mode: 'service_account' })
      if (!firedRef.current) {
        firedRef.current = true
        onConnectedRef.current?.()
      }
      setPhase('connected')
    } catch (e) {
      setSaError(e instanceof Error ? e.message : 'Connect failed — is the server reachable?')
    } finally {
      setSaBusy(false)
    }
  }

  const missing: string[] = Array.isArray(initialStatus?.missing)
    ? (initialStatus?.missing as string[])
    : []
  const missingSecret = missing.includes('client_secret') || missing.includes('client_id')

  // Switching tabs mid-OAuth-flow must tear down the popup + poll, otherwise
  // a landing connection would yank the service-account form to CONNECTED
  // behind the user's back.
  const switchTab = (next: ConnectTab) => {
    if (next === tab) return
    if (phase === 'waiting' || phase === 'blocked' || phase === 'timeout') {
      closePopup()
      setPhase('ready')
      setStatusError(null)
    }
    setTab(next)
  }

  const tabBtn = (t: ConnectTab, label: string): React.CSSProperties => ({
    padding: '7px 14px',
    borderRadius: 999,
    border: `1px solid ${tab === t ? M.gold : M.border}`,
    background: tab === t ? M.goldSoft : M.surface,
    color: tab === t ? M.gold : M.textMuted,
    fontSize: 11.5,
    fontWeight: tab === t ? 800 : 600,
    cursor: 'pointer',
  })

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      }}
      onClick={() => phase !== 'waiting' && !saBusy && onClose()}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: M.surface, borderRadius: 12, padding: 20, width: 'min(520px, 94vw)',
          boxShadow: M.shadowLifted, border: `1px solid ${M.border}`, maxHeight: '90vh', overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div>
            <div style={{ fontFamily: M.mono, fontSize: 10, color: M.gold, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 800 }}>
              🔗 Google Search Console
            </div>
            <h3 style={{ margin: '4px 0 4px', fontFamily: M.serif, fontSize: 20, color: M.text }}>Connect Search Console</h3>
            <div style={{ fontSize: 11, color: M.textMuted, fontFamily: M.mono }}>
              {initialStatus?.siteUrl ? String(initialStatus.siteUrl) : 'No property configured yet'}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={phase === 'waiting' || saBusy}
            style={{ padding: '6px 12px', borderRadius: 6, border: `1px solid ${M.border}`, background: M.surface, color: M.textMuted, fontSize: 11, fontFamily: M.mono, cursor: phase === 'waiting' || saBusy ? 'not-allowed' : 'pointer' }}
          >
            ✕ Close
          </button>
        </div>

        {/* Tab switcher — only meaningful before a connection is made */}
        {phase !== 'connected' && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <button type="button" onClick={() => switchTab('oauth')} style={tabBtn('oauth', 'OAuth (Google consent)')}>
              OAuth (Google consent)
            </button>
            <button type="button" onClick={() => switchTab('sa')} style={tabBtn('sa', 'Service account')}>
              Service account
            </button>
          </div>
        )}

        {phase === 'connected' && (
          <div style={{ padding: '22px 0 10px', textAlign: 'center' }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: M.greenSoft, color: M.green, fontSize: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', fontWeight: 800 }}>
              ✓
            </div>
            <div style={{ fontSize: 14, fontWeight: 800, color: M.green, fontFamily: M.mono }}>
              CONNECTED · {String(lastStatus?.mode || initialStatus?.mode || '').toUpperCase() || 'LIVE'}
            </div>
            <div style={{ fontSize: 11.5, color: M.textMuted, marginTop: 6 }}>
              {alreadyConnected
                ? 'This property was already connected.'
                : 'Refreshing health and the radar — closing…'}
            </div>
          </div>
        )}

        {phase !== 'connected' && tab === 'oauth' && (
          <>
            {phase === 'ready' && (
              <div style={{ fontSize: 12, color: M.textMuted, lineHeight: 1.6 }}>
                <p style={{ margin: '0 0 10px' }}>
                  {reconnect ? (
                    <>
                      The stored token can't mint an access token ({String(initialStatus?.error || 'unknown reason')}).
                      Re-authorize below — Google will issue a <strong style={{ color: M.text }}>fresh token</strong> even though you've
                      approved before.
                    </>
                  ) : (
                    <>
                      This authorizes the estate to read live Search Console data — the radar, opportunity scores
                      and GSC overview then run on <strong style={{ color: M.text }}>real queries and clicks</strong> instead of the committed snapshot.
                    </>
                  )}
                </p>
                <p style={{ margin: '0 0 12px' }}>
                  Google blocks embedding the consent screen, so it opens in a small popup. This window stays open,
                  watches for the connection, and refreshes the studio automatically.
                </p>
                {missingSecret && (
                  <div style={{ padding: '9px 12px', borderRadius: 8, background: M.goldSoft, border: `1px solid ${M.goldBorder}`, color: '#92400E', fontSize: 11, marginBottom: 12, fontFamily: M.mono }}>
                    ⚠ Setup note: {missing.includes('client_secret') ? 'GOOGLE_CLIENT_SECRET' : 'the OAuth client'} is not configured in the deployment env yet — the consent step will fail until it is. The client id is already registered.
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={startFlow}
                    style={{ padding: '9px 18px', borderRadius: 999, border: 'none', cursor: 'pointer', background: M.gold, color: '#fff', fontSize: 12, fontWeight: 800 }}
                  >
                    {reconnect ? 'Re-authorize →' : 'Continue to Google →'}
                  </button>
                  <button type="button" onClick={onClose} style={{ padding: '9px 14px', borderRadius: 999, border: `1px solid ${M.border}`, background: M.surface, color: M.textMuted, fontSize: 12, cursor: 'pointer' }}>
                    Not now
                  </button>
                </div>
              </div>
            )}

            {phase === 'waiting' && (
              <div style={{ padding: '18px 0 6px', textAlign: 'center' }}>
                <div style={{ width: 22, height: 22, border: '3px solid rgba(154,123,59,0.25)', borderTopColor: M.gold, borderRadius: '50%', animation: 'spin 0.7s linear infinite', margin: '0 auto 14px' }} />
                <div style={{ fontSize: 13, fontWeight: 700, color: M.text }}>Waiting for Google consent…</div>
                <div style={{ fontSize: 11.5, color: M.textMuted, marginTop: 6, lineHeight: 1.6 }}>
                  Complete the sign-in in the popup. The moment the connection saves,
                  this window refreshes health and the radar automatically.
                </div>
                {statusError && (
                  <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 8, background: '#FEE2E2', color: M.red, fontSize: 11, fontFamily: M.mono }}>
                    {statusError}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 14, flexWrap: 'wrap' }}>
                  <button type="button" onClick={recheck} style={{ padding: '7px 14px', borderRadius: 999, border: `1px solid ${M.border}`, background: M.surface, color: M.textMuted, fontSize: 11.5, cursor: 'pointer' }}>
                    I've finished — re-check
                  </button>
                  <button type="button" onClick={() => { closePopup(); onClose() }} style={{ padding: '7px 14px', borderRadius: 999, border: 'none', background: M.surface, color: M.textDim, fontSize: 11.5, cursor: 'pointer' }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {phase === 'blocked' && (
              <div style={{ padding: '6px 0' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: M.text }}>Pop-up blocked</div>
                <p style={{ fontSize: 11.5, color: M.textMuted, lineHeight: 1.6, margin: '6px 0 12px' }}>
                  Allow pop-ups for this site, then retry — or open the consent screen in a new tab and return here
                  when you've approved (this window detects the connection automatically).
                </p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" onClick={startFlow} style={{ padding: '8px 14px', borderRadius: 999, border: 'none', cursor: 'pointer', background: M.gold, color: '#fff', fontSize: 11.5, fontWeight: 800 }}>
                    ↻ Retry popup
                  </button>
                  <a href={CONNECT_URL} target="_blank" rel="noreferrer" style={{ padding: '8px 14px', borderRadius: 999, border: `1px solid ${M.border}`, background: M.surface, color: M.textMuted, fontSize: 11.5, textDecoration: 'none' }}>
                    Open in new tab ↗
                  </a>
                  <button type="button" onClick={recheck} style={{ padding: '8px 14px', borderRadius: 999, border: 'none', background: M.surface, color: M.textDim, fontSize: 11.5, cursor: 'pointer' }}>
                    I've finished — re-check
                  </button>
                </div>
              </div>
            )}

            {phase === 'timeout' && (
              <div style={{ padding: '6px 0' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: M.red }}>Timed out</div>
                <p style={{ fontSize: 11.5, color: M.textMuted, lineHeight: 1.6, margin: '6px 0 12px' }}>
                  No connection after 3 minutes. If you approved access in the popup, hit re-check below — the
                  connection may have saved but the status poll lagged.
                </p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" onClick={recheck} style={{ padding: '8px 14px', borderRadius: 999, border: 'none', cursor: 'pointer', background: M.gold, color: '#fff', fontSize: 11.5, fontWeight: 800 }}>
                    ↻ Re-check now
                  </button>
                  <button type="button" onClick={startFlow} style={{ padding: '8px 14px', borderRadius: 999, border: `1px solid ${M.border}`, background: M.surface, color: M.textMuted, fontSize: 11.5, cursor: 'pointer' }}>
                    Start over
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {phase !== 'connected' && tab === 'sa' && (
          <div style={{ fontSize: 12, color: M.textMuted, lineHeight: 1.6 }}>
            <p style={{ margin: '0 0 10px' }}>
              {reconnect ? (
                <>
                  The stored service-account key can't mint an access token ({String(initialStatus?.error || 'unknown reason')}).
                  Paste a <strong style={{ color: M.text }}>replacement key</strong> below to swap it.
                </>
              ) : (
                <>
                  No Google OAuth client needed — a <strong style={{ color: M.text }}>service account</strong> reads Search Console
                  server-to-server. Paste the JSON key, enter the property, and the studio verifies access instantly.
                </>
              )}
            </p>
            <p style={{ margin: '0 0 12px' }}>
              The key is stored server-side and never sent back to the browser after this dialog. Add the
              service-account email as a <strong style={{ color: M.text }}>user</strong> in Search Console → Settings → Users for the
              property first.
            </p>

            <label style={{ display: 'block', fontSize: 10.5, fontWeight: 800, letterSpacing: '0.05em', color: M.textMuted, textTransform: 'uppercase', margin: '0 0 4px', fontFamily: M.mono }}>
              Service account JSON key
            </label>
            <textarea
              value={saKey}
              onChange={(e) => setSaKey(e.target.value)}
              placeholder='{"type":"service_account","project_id":"…","private_key":"-----BEGIN PRIVATE KEY-----…","client_email":"gsc-reader@…iam.gserviceaccount.com",…}'
              spellCheck={false}
              style={{
                width: '100%', minHeight: 96, boxSizing: 'border-box', padding: 10, borderRadius: 8,
                border: `1px solid ${M.border}`, background: '#FBFBFA', fontFamily: M.mono, fontSize: 10.5,
                color: M.text, resize: 'vertical', outline: 'none',
              }}
            />

            <label style={{ display: 'block', fontSize: 10.5, fontWeight: 800, letterSpacing: '0.05em', color: M.textMuted, textTransform: 'uppercase', margin: '12px 0 4px', fontFamily: M.mono }}>
              Property URL
            </label>
            <input
              value={saSiteUrl}
              onChange={(e) => setSaSiteUrl(e.target.value)}
              placeholder="https://yousafeconsultancy.com/ or sc-domain:yousafeconsultancy.com"
              spellCheck={false}
              style={{
                width: '100%', boxSizing: 'border-box', padding: '9px 10px', borderRadius: 8,
                border: `1px solid ${M.border}`, background: '#FBFBFA', fontFamily: M.mono, fontSize: 11,
                color: M.text, outline: 'none',
              }}
            />

            {saError && (
              <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 8, background: '#FEE2E2', color: M.red, fontSize: 11, fontFamily: M.mono }}>
                ⚠ {saError}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 14 }}>
              <button
                type="button"
                onClick={connectServiceAccount}
                disabled={saBusy}
                style={{ padding: '9px 18px', borderRadius: 999, border: 'none', cursor: saBusy ? 'not-allowed' : 'pointer', background: M.gold, color: '#fff', fontSize: 12, fontWeight: 800, opacity: saBusy ? 0.7 : 1 }}
              >
                {saBusy ? 'Verifying access…' : 'Connect service account →'}
              </button>
              <button type="button" onClick={onClose} style={{ padding: '9px 14px', borderRadius: 999, border: `1px solid ${M.border}`, background: M.surface, color: M.textMuted, fontSize: 12, cursor: 'pointer' }}>
                Not now
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
