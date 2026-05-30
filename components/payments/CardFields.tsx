'use client'

/**
 * CardFields — gateway-agnostic card-collection component.
 *
 * Renders either NMI Collect.js iframe fields OR Authorize.net Accept.js
 * controlled inputs based on /api/payments/config. The parent calls
 * `ref.current.tokenize()` from its existing pay button; the component
 * fires `onToken` when tokenization succeeds.
 *
 * Field IDs are randomized so the same modal can mount multiple instances
 * without Collect.js cross-binding to the wrong selectors (e.g. the topup
 * dialog opening on top of an offer-pay modal).
 *
 * Why a ref handle instead of a self-contained button: every host modal
 * already has a "Pay $X" button. We want one click to both tokenize AND
 * submit — having the component own its own button creates a confusing
 * two-button UX (tokenize, then pay).
 */
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'

// Monotonic instance counter — gives us stable, simple IDs that don't depend
// on useId()'s colon-prefixed format. Collect.js querySelector + iframe
// mounting works reliably with `cf_n_number` but flakes with the underscored
// useId output (`cf__r3__number`).
let __cardFieldsInstanceCounter = 0

export interface CardFieldsHandle {
  /** Trigger tokenization. Parent calls this from its pay button. Returns a
   *  promise that resolves when onToken fires (or rejects on error). */
  tokenize: () => Promise<void>
  /** Has the SDK loaded + fields mounted (NMI) / inputs filled (authnet)? */
  ready: boolean
}

export interface CardTokenResult {
  token: string
  gateway: string
  brand?: string
  last4?: string
  expMonth?: string
  expYear?: string
}

export interface CardFieldsProps {
  /** Pin to a specific gateway. Omit to use platform default from /api/payments/config. */
  gateway?: string
  /** Fired after tokenization succeeds. Parent posts the result to its API. */
  onToken: (result: CardTokenResult) => void
  /** Fired on init / tokenization errors. */
  onError?: (msg: string) => void
  /** Optional styling for the field containers — both gateways use it. */
  fieldClassName?: string
  /** Optional inline-style override for field containers. */
  fieldStyle?: React.CSSProperties
}

interface PaymentConfig {
  provider: string
  scriptUrl: string
  tokenizationKey?: string
  publicKey?: string
  apiLoginId?: string
  variant?: 'lightbox' | 'inline'
  defaultGateway?: string
  availableGateways?: string[]
}

// Module-level: avoid loading the same SDK twice if multiple CardFields
// instances mount in the same page (e.g. the offer modal and the topup
// dialog). Indexed by scriptUrl.
const sdkLoadPromises = new Map<string, Promise<void>>()

function loadScript(scriptUrl: string, tokenizationKey?: string): Promise<void> {
  const existing = sdkLoadPromises.get(scriptUrl)
  if (existing) return existing
  const p = new Promise<void>((resolve, reject) => {
    if (typeof window === 'undefined') return reject(new Error('SSR'))
    if (document.querySelector(`script[src="${scriptUrl}"]`)) return resolve()
    const script = document.createElement('script')
    script.src = scriptUrl
    script.async = true
    if (tokenizationKey) script.dataset.tokenizationKey = tokenizationKey
    script.onload = () => resolve()
    script.onerror = () => reject(new Error(`Failed to load ${scriptUrl}`))
    document.body.appendChild(script)
  })
  sdkLoadPromises.set(scriptUrl, p)
  return p
}

const CardFields = forwardRef<CardFieldsHandle, CardFieldsProps>(function CardFields(
  { gateway, onToken, onError, fieldClassName, fieldStyle },
  ref,
) {
  // Stable per-instance id allocated once on mount. Re-used by all 3 field
  // selectors so the same Collect.js configure() call can find them.
  const instanceIdRef = useRef<number | null>(null)
  if (instanceIdRef.current === null) instanceIdRef.current = ++__cardFieldsInstanceCounter
  const instanceId = `n${instanceIdRef.current}`
  const [cfg, setCfg] = useState<PaymentConfig | null>(null)
  const [sdkReady, setSdkReady] = useState(false)
  const [error, setErrorState] = useState<string | null>(null)
  const onTokenRef = useRef(onToken)
  const onErrorRef = useRef(onError)
  onTokenRef.current = onToken
  onErrorRef.current = onError

  // NMI Collect.js: track per-field validity from validationCallback so we can
  // reject tokenize() with a friendly message when the user clicks Pay before
  // filling fields. Without this, Collect.js validates synchronously, skips
  // its main callback, and leaks an unhandled "e.token" rejection.
  const nmiFieldValidityRef = useRef<{ ccnumber: boolean; ccexp: boolean; cvv: boolean }>({
    ccnumber: false,
    ccexp: false,
    cvv: false,
  })
  const nmiLastValidationMsgRef = useRef<string | null>(null)

  // Authorize.net controlled state — unused for NMI but cheap to maintain.
  const [cardNumber, setCardNumber] = useState('')
  const [exp, setExp] = useState('') // "MM / YY"
  const [cvv, setCvv] = useState('')

  // Pending tokenize promise — resolved by the SDK callback.
  const pendingResolveRef = useRef<{ resolve: () => void; reject: (e: Error) => void } | null>(null)

  const reportError = useCallback((msg: string) => {
    setErrorState(msg)
    onErrorRef.current?.(msg)
    const pending = pendingResolveRef.current
    if (pending) {
      pendingResolveRef.current = null
      pending.reject(new Error(msg))
    }
  }, [])

  // Load /api/payments/config once on mount.
  useEffect(() => {
    let cancelled = false
    const url = gateway ? `/api/payments/config?gateway=${encodeURIComponent(gateway)}` : '/api/payments/config'
    fetch(url, { cache: 'no-store' })
      .then((r) => r.json())
      .then((c) => {
        if (cancelled) return
        if (!c?.scriptUrl) {
          reportError(c?.error || 'Payment config unavailable')
          return
        }
        setCfg(c)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        reportError(e instanceof Error ? e.message : 'Payment config unavailable')
      })
    return () => { cancelled = true }
  }, [gateway, reportError])

  // Stable ids — Collect.js needs DOM selectors, and a long lifecycle (e.g.
  // the topup dialog opening and closing repeatedly) can rebind to the wrong
  // node if every render produces a fresh id.
  const fieldIds = useMemo(
    () => ({
      number: `cf_${instanceId}_number`,
      exp: `cf_${instanceId}_expiry`,
      cvv: `cf_${instanceId}_cvv`,
    }),
    [instanceId],
  )

  // ── NMI Collect.js init ───────────────────────────────────────────────────
  useEffect(() => {
    if (!cfg) return
    if (cfg.provider !== 'nmi') return
    let cancelled = false
    loadScript(cfg.scriptUrl, cfg.tokenizationKey)
      .then(() => {
        if (cancelled) return
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const CollectJS = (window as any).CollectJS
        if (!CollectJS) {
          reportError('Collect.js loaded but global missing')
          return
        }
        // Verify our 3 field divs are actually in the DOM before configure.
        // Collect.js silently no-ops on missing selectors → empty placeholders.
        const slots = [fieldIds.number, fieldIds.exp, fieldIds.cvv].map((id) => document.getElementById(id))
        if (slots.some((el) => !el)) {
          reportError('Card field containers not mounted yet')
          return
        }
        CollectJS.configure({
          variant: 'inline',
          fields: {
            ccnumber: { placeholder: 'Card number', selector: `#${fieldIds.number}` },
            ccexp: { placeholder: 'MM / YY', selector: `#${fieldIds.exp}` },
            cvv: { placeholder: 'CVV', selector: `#${fieldIds.cvv}` },
          },
          // Per-field validity callback. Collect.js fires this on blur /
          // input change. We mirror the state into a ref so tokenize() can
          // gate startPaymentRequest before the SDK throws internally.
          validationCallback: (fieldName: string, valid: boolean, message: string) => {
            if (fieldName === 'ccnumber' || fieldName === 'ccexp' || fieldName === 'cvv') {
              nmiFieldValidityRef.current[fieldName] = valid
            }
            if (!valid && message) nmiLastValidationMsgRef.current = message
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          callback: (response: any) => {
            const pending = pendingResolveRef.current
            if (response?.token) {
              const result: CardTokenResult = {
                token: response.token,
                gateway: 'nmi',
                brand: response.card?.type,
                last4: response.card?.number?.replace(/[^0-9]/g, '').slice(-4),
                expMonth: response.card?.exp?.slice(0, 2),
                expYear: response.card?.exp?.slice(2, 4),
              }
              onTokenRef.current(result)
              if (pending) {
                pendingResolveRef.current = null
                pending.resolve()
              }
            } else {
              const msg = response?.message || nmiLastValidationMsgRef.current || 'Card tokenization failed'
              reportError(msg)
            }
          },
        })
        // Verify Collect.js actually mounted iframes into our placeholders.
        // The script's configure() is fire-and-forget — if anything goes
        // wrong (selectors changed, prior configure left stale state) it
        // silently does nothing and the user sees empty boxes. Re-configure
        // once after a short delay if no iframes appeared.
        const verifyAndMaybeRetry = (attempt: number) => {
          if (cancelled) return
          const mounted = slots.every((el) => el && el.querySelector('iframe'))
          if (mounted) {
            setSdkReady(true)
            return
          }
          if (attempt >= 2) {
            reportError('Card fields failed to mount. Reload the page and try again.')
            return
          }
          try { CollectJS.configure({ variant: 'inline', fields: {
            ccnumber: { placeholder: 'Card number', selector: `#${fieldIds.number}` },
            ccexp: { placeholder: 'MM / YY', selector: `#${fieldIds.exp}` },
            cvv: { placeholder: 'CVV', selector: `#${fieldIds.cvv}` },
          } }) } catch { /* swallow — handled by retry */ }
          setTimeout(() => verifyAndMaybeRetry(attempt + 1), 600)
        }
        setTimeout(() => verifyAndMaybeRetry(0), 250)
      })
      .catch((e) => reportError(e instanceof Error ? e.message : 'Failed to load Collect.js'))
    return () => { cancelled = true }
  }, [cfg, fieldIds, reportError])

  // ── Authorize.net Accept.js init ──────────────────────────────────────────
  useEffect(() => {
    if (!cfg) return
    if (cfg.provider !== 'authorizenet') return
    let cancelled = false
    loadScript(cfg.scriptUrl)
      .then(() => {
        if (cancelled) return
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (!(window as any).Accept) {
          reportError('Accept.js loaded but global missing')
          return
        }
        setSdkReady(true)
      })
      .catch((e) => reportError(e instanceof Error ? e.message : 'Failed to load Accept.js'))
    return () => { cancelled = true }
  }, [cfg, reportError])

  useImperativeHandle(
    ref,
    () => ({
      ready: sdkReady,
      tokenize: () => {
        return new Promise<void>((resolve, reject) => {
          if (!cfg) return reject(new Error('Payment fields not ready'))
          if (!sdkReady) return reject(new Error('Payment fields not ready'))
          if (pendingResolveRef.current) return reject(new Error('Tokenization already in progress'))
          setErrorState(null)
          pendingResolveRef.current = { resolve, reject }

          if (cfg.provider === 'nmi') {
            // Pre-flight: Collect.js's startPaymentRequest silently bails
            // (no callback) on invalid fields and leaks an unhandled "e.token"
            // rejection from its own promise chain. Validate here so the user
            // sees a friendly message instead of a frozen "Processing..."
            // button.
            const validity = nmiFieldValidityRef.current
            if (!validity.ccnumber || !validity.ccexp || !validity.cvv) {
              pendingResolveRef.current = null
              const missing: string[] = []
              if (!validity.ccnumber) missing.push('card number')
              if (!validity.ccexp) missing.push('expiry')
              if (!validity.cvv) missing.push('CVV')
              const m = nmiLastValidationMsgRef.current || `Enter your ${missing.join(', ')}`
              reportError(m)
              return reject(new Error(m))
            }
            // Swallow Collect.js's internal unhandled rejection
            // ("e.token") if the SDK still bails after our preflight (e.g.
            // browser refused to read the iframe at the last moment).
            const onUnhandled = (ev: PromiseRejectionEvent) => {
              const msg = String(ev.reason?.message || ev.reason || '')
              if (msg.includes("'e.token'") || msg.includes('e.token')) ev.preventDefault()
            }
            window.addEventListener('unhandledrejection', onUnhandled, { once: true })
            setTimeout(() => window.removeEventListener('unhandledrejection', onUnhandled), 5000)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ;(window as any).CollectJS?.startPaymentRequest()
            return
          }

          if (cfg.provider === 'authorizenet') {
            const digits = cardNumber.replace(/\D/g, '')
            const expMatch = exp.replace(/\s+/g, '').match(/^(\d{1,2})\/?(\d{2,4})?$/)
            if (digits.length < 13) {
              pendingResolveRef.current = null
              const m = 'Enter a valid card number'
              reportError(m)
              return reject(new Error(m))
            }
            if (!expMatch || !expMatch[1] || !expMatch[2]) {
              pendingResolveRef.current = null
              const m = 'Enter expiry as MM/YY'
              reportError(m)
              return reject(new Error(m))
            }
            const month = expMatch[1].padStart(2, '0')
            const year = expMatch[2].length === 4 ? expMatch[2].slice(-2) : expMatch[2]
            if (cvv.length < 3) {
              pendingResolveRef.current = null
              const m = 'Enter the card CVV'
              reportError(m)
              return reject(new Error(m))
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const Accept = (window as any).Accept
            Accept.dispatchData(
              {
                authData: {
                  clientKey: cfg.publicKey || cfg.tokenizationKey,
                  apiLoginID: cfg.apiLoginId,
                },
                cardData: { cardNumber: digits, month, year, cardCode: cvv },
              },
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (response: any) => {
                const pending = pendingResolveRef.current
                if (response?.messages?.resultCode === 'Ok' && response.opaqueData) {
                  const result: CardTokenResult = {
                    token: JSON.stringify({
                      dataDescriptor: response.opaqueData.dataDescriptor,
                      dataValue: response.opaqueData.dataValue,
                    }),
                    gateway: 'authorizenet',
                    last4: digits.slice(-4),
                    expMonth: month,
                    expYear: year,
                  }
                  onTokenRef.current(result)
                  if (pending) {
                    pendingResolveRef.current = null
                    pending.resolve()
                  }
                } else {
                  const msg = response?.messages?.message?.[0]?.text || 'Tokenization failed'
                  reportError(msg)
                }
              },
            )
            return
          }

          pendingResolveRef.current = null
          reject(new Error(`Unsupported gateway: ${cfg.provider}`))
        })
      },
    }),
    [cfg, sdkReady, cardNumber, exp, cvv, reportError],
  )

  if (!cfg) {
    return <div style={{ fontSize: 13, color: '#666', padding: '8px 0' }}>{error || 'Loading payment fields…'}</div>
  }

  const containerStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 14px',
    background: '#ffffff',
    borderRadius: 8,
    border: '1px solid #d1d5db',
    minHeight: 42,
    fontSize: 14,
    boxSizing: 'border-box',
    ...fieldStyle,
  }

  if (cfg.provider === 'nmi') {
    return (
      <div>
        {error && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#EF4444', marginBottom: 10 }}>
            {error}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div id={fieldIds.number} className={fieldClassName} style={containerStyle} />
          <div style={{ display: 'flex', gap: 10 }}>
            <div id={fieldIds.exp} className={fieldClassName} style={{ ...containerStyle, flex: 1 }} />
            <div id={fieldIds.cvv} className={fieldClassName} style={{ ...containerStyle, flex: 1 }} />
          </div>
        </div>
      </div>
    )
  }

  if (cfg.provider === 'authorizenet') {
    return (
      <div>
        {error && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#EF4444', marginBottom: 10 }}>
            {error}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input
            id={fieldIds.number}
            className={fieldClassName}
            style={containerStyle}
            inputMode="numeric"
            autoComplete="cc-number"
            placeholder="Card number"
            value={cardNumber}
            onChange={(e) => setCardNumber(e.target.value)}
          />
          <div style={{ display: 'flex', gap: 10 }}>
            <input
              id={fieldIds.exp}
              className={fieldClassName}
              style={{ ...containerStyle, flex: 1 }}
              autoComplete="cc-exp"
              placeholder="MM / YY"
              value={exp}
              onChange={(e) => setExp(e.target.value)}
            />
            <input
              id={fieldIds.cvv}
              className={fieldClassName}
              style={{ ...containerStyle, flex: 1 }}
              inputMode="numeric"
              autoComplete="cc-csc"
              placeholder="CVV"
              value={cvv}
              onChange={(e) => setCvv(e.target.value)}
            />
          </div>
        </div>
      </div>
    )
  }

  return <div style={{ fontSize: 13, color: '#666' }}>Unsupported payment gateway: {cfg.provider}</div>
})

export default CardFields
