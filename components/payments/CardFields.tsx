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
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'

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
  const instanceId = useId().replace(/:/g, '_')
  const [cfg, setCfg] = useState<PaymentConfig | null>(null)
  const [sdkReady, setSdkReady] = useState(false)
  const [error, setErrorState] = useState<string | null>(null)
  const onTokenRef = useRef(onToken)
  const onErrorRef = useRef(onError)
  onTokenRef.current = onToken
  onErrorRef.current = onError

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
        CollectJS.configure({
          variant: 'inline',
          fields: {
            ccnumber: { placeholder: 'Card number', selector: `#${fieldIds.number}` },
            ccexp: { placeholder: 'MM / YY', selector: `#${fieldIds.exp}` },
            cvv: { placeholder: 'CVV', selector: `#${fieldIds.cvv}` },
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
              const msg = response?.message || 'Card tokenization failed'
              reportError(msg)
            }
          },
        })
        setSdkReady(true)
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
                  // apiLoginID is intentionally NOT sent from the server —
                  // Accept.js will refuse without it, so we rely on the
                  // Authorize.net account's "Hosted Form API only" config
                  // where dispatch reads it from the publicClientKey-bound
                  // merchant. If your account requires it explicitly, set
                  // NEXT_PUBLIC_AUTHORIZENET_LOGIN_ID and we'll pass it.
                  apiLoginID: process.env.NEXT_PUBLIC_AUTHORIZENET_LOGIN_ID,
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
