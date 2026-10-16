'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useId } from 'react'
import type { ReactNode } from 'react'
import CardFields, { type CardFieldsHandle, type CardTokenResult } from '@/components/payments/CardFields'
import type { CheckoutState, AvailablePaymentMethod } from './useCheckout'
import { useCheckout } from './useCheckout'
import styles from './checkout.module.css'
import CardBrandIcons from './CardBrandIcons'
import { supportedBrandsByProvider } from '@/lib/payments/registry'
import type { DetectedCardBrand } from '@/lib/payments/inputMask'

export interface CheckoutSavedCard {
  id: string
  gateway?: string
  brand?: string | null
  last4: string
  exp_month?: number | null
  exp_year?: number | null
  is_default?: boolean
}

export interface CheckoutSelection {
  method: AvailablePaymentMethod
  paymentMethod: 'wallet' | 'saved_card' | 'new_card' | 'hosted' | 'invoice'
  paymentMethodId?: string
  token?: string
  gateway?: string
  customer?: { email: string; name?: string }
}

export interface CheckoutResult {
  orderId?: string
  url?: string
  status?: number
  code?: string
  message?: string
  payload?: unknown
}

export interface CheckoutProps {
  title: string
  amountUsdCents: number
  purpose?: string
  description?: string
  summaryDetails?: ReactNode
  source?: { sourceType: string; sourceId?: string; tierId?: string; items?: Array<{ slug?: string; serviceId?: string; quantity: number }> }
  customer?: { email: string; name?: string; phone?: string }
  savedCards?: CheckoutSavedCard[]
  walletBalanceCents?: number | null
  excludeInvoice?: boolean
  previewMethods?: AvailablePaymentMethod[]
  previewState?: CheckoutState
  previewMessage?: string
  variant?: 'page' | 'modal' | 'offer' | 'gig' | 'cart'
  onSubmit?: (selection: CheckoutSelection) => Promise<CheckoutResult | void>
  onComplete?: (result: CheckoutResult) => void
  onClose?: () => void
  onCancel?: () => void
}

type Choice = {
  key: string
  method: AvailablePaymentMethod
  kind: CheckoutSelection['paymentMethod']
  card?: CheckoutSavedCard
}

function formatMoney(cents: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100)
}

function buyerSafeMessage(message: string) {
  return /pesapal|\bnmi\b|payhip/i.test(message) ? 'We could not complete this payment. Please contact support before trying again.' : message
}

function currencyGlyph(currency: string) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).formatToParts(1).find((part) => part.type === 'currency')?.value || currency
}

function isMobileViewport() {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches
}

function choicesFromMethods(methods: AvailablePaymentMethod[], cards: CheckoutSavedCard[]): Choice[] {
  return methods.flatMap<Choice>((method): Choice[] => {
    if (method.mode === 'hosted-redirect') return [{ key: method.methodKey, method, kind: 'hosted' as const }]
    if (method.id === 'card') {
      const saved = method.supportsVault
        ? cards.filter((card) => String(card.gateway || '').toLowerCase() === method.provider.toLowerCase())
        : []
      return [
        ...saved.map((card) => ({ key: `${method.methodKey}:saved:${card.id}`, method, kind: 'saved_card' as const, card })),
        { key: `${method.methodKey}:new`, method, kind: 'new_card' as const },
      ]
    }
    if (method.id === 'wallet') return [{ key: method.methodKey, method, kind: 'wallet' as const }]
    if (method.id === 'invoice') return [{ key: method.methodKey, method, kind: 'invoice' as const }]
    return [{ key: method.methodKey, method, kind: 'hosted' as const }]
  })
}

export default function Checkout({
  title,
  amountUsdCents,
  purpose = 'order',
  description,
  summaryDetails,
  source,
  customer,
  savedCards = [],
  walletBalanceCents = null,
  excludeInvoice = false,
  previewMethods,
  previewState,
  previewMessage,
  variant = 'page',
  onSubmit,
  onComplete,
  onClose,
  onCancel = onClose || (() => {}),
}: CheckoutProps) {
  const { methods, rates, methodsLoading, methodsError, refreshMethods } = useCheckout({
    amountUsdCents,
    currency: 'USD',
    purpose,
    previewMethods,
  })
  const [selectedKey, setSelectedKey] = useState('')
  const [state, setState] = useState<CheckoutState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<CheckoutResult | null>(null)
  const [hostedUrl, setHostedUrl] = useState<string | null>(null)
  const [detectedBrand, setDetectedBrand] = useState<DetectedCardBrand>('unknown')
  const [handoffUrl, setHandoffUrl] = useState<string | null>(null)
  const [email, setEmail] = useState(customer?.email || '')
  const [name, setName] = useState(customer?.name || '')
  const cardFieldsRef = useRef<CardFieldsHandle>(null)
  const lastTokenRef = useRef<CardTokenResult | null>(null)
  const dialogRef = useRef<HTMLElement>(null)
  const checkoutId = useId()
  const idempotencyKeyRef = useRef<string | null>(null)

  const choices = useMemo(() => choicesFromMethods(
    methods.filter((method) => method.id !== 'invoice'),
    savedCards,
  ), [methods, savedCards])
  const selected = choices.find((choice) => choice.key === selectedKey)
    || choices.find((choice) => choice.method.isDefault)
    || choices[0]
  const visibleState = previewState || state
  const busy = visibleState === 'submitting' || visibleState === 'redirecting'
  const walletAvailable = walletBalanceCents !== null && walletBalanceCents >= amountUsdCents
  const ratesAvailable = ['GBP', 'CAD', 'AUD'].filter((currency) => Number.isFinite(rates[currency]) && rates[currency] > 0)

  useEffect(() => {
    if (previewState && selected?.kind === 'new_card' && selected.method.mode === 'inline-token') setDetectedBrand('visa')
  }, [previewState, selected?.key, selected?.kind, selected?.method.mode])

  useEffect(() => {
    if (!['modal', 'gig'].includes(variant)) return
    const root = dialogRef.current
    if (!root) return
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const focusables = () => Array.from(root.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), iframe, a[href], [tabindex]:not([tabindex="-1"])'))
    focusables()[0]?.focus()
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const nodes = focusables()
      if (!nodes.length) { event.preventDefault(); root.focus(); return }
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    root.addEventListener('keydown', trap)
    return () => { root.removeEventListener('keydown', trap); previousFocus?.focus() }
  }, [variant])

  const finishWithError = async (message: string, status?: number, code?: string) => {
    if (status === 409 && code === 'method_unavailable') {
      setState('method_unavailable')
      setError('That payment method just became unavailable. Choose another option to continue.')
      const next = await refreshMethods()
      const nextChoices = choicesFromMethods(next, savedCards)
      setSelectedKey(nextChoices.find((choice) => choice.method.isDefault)?.key || nextChoices[0]?.key || '')
      return
    }
    setError(buyerSafeMessage(message))
    setState('failed')
  }

  const submit = async () => {
    if (!selected || busy) return
    setError(null)
    if (selected.method.mode === 'hosted-redirect' && !email.trim() && !customer?.email) {
      setError('Enter your email address to continue.')
      setState('failed')
      return
    }
    setState('submitting')

    try {
      if (selected.method.mode === 'hosted-redirect' || selected.kind === 'hosted') {
        if (!source) throw new Error('This purchase can’t open hosted checkout yet.')
        const mobile = isMobileViewport()
        idempotencyKeyRef.current ||= crypto.randomUUID()
        const response = await fetch('/api/checkout/pesapal/session', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            ...source,
            idempotencyKey: idempotencyKeyRef.current,
            methodKey: selected.method.methodKey,
            customer: { email: email || customer?.email || '', name: name || customer?.name || '', phone: customer?.phone },
            redirectMode: mobile ? 'TOP_WINDOW' : 'PARENT_WINDOW',
          }),
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) {
          await finishWithError(data?.error?.message || data?.error || 'Could not open hosted checkout.', response.status, data?.error?.code || data?.code)
          return
        }
        setHandoffUrl(String(data.redirectUrl))
        setState('redirecting')
        return
      }

      let token: CardTokenResult | undefined
      if (selected.kind === 'new_card' && selected.method.mode === 'inline-token') {
        if (!cardFieldsRef.current) throw new Error('Card details are still loading.')
        lastTokenRef.current = null
        await cardFieldsRef.current.tokenize()
        token = lastTokenRef.current || undefined
        if (!token) throw new Error('Card tokenization did not return a token.')
      }
      if (!onSubmit) throw new Error('Checkout submission is not configured.')
      const submitResult = await onSubmit({
        method: selected.method,
        paymentMethod: selected.kind,
        ...(selected.card ? { paymentMethodId: selected.card.id } : {}),
        ...(token ? { token: token.token, gateway: token.gateway } : {}),
        customer: { email: email || customer?.email || '', name: name || customer?.name || '' },
      })
      const result: CheckoutResult = submitResult || {}
      if (result.status === 409 && result.code === 'method_unavailable') {
        await finishWithError(result.message || 'Choose another payment method.', result.status, result.code)
        return
      }
      if (result?.status && result.status >= 400) throw new Error(result.message || 'Payment could not be completed.')
      if (result.url) {
        setHandoffUrl(result.url)
        setState('redirecting')
        return
      }
      setReceipt(result || {})
      setState('receipt')
      idempotencyKeyRef.current = null
      onComplete?.(result || {})
    } catch (submitError) {
      const err = submitError as Error & { status?: number; code?: string }
      await finishWithError(err.message || 'Payment failed. Please try again.', err.status, err.code)
    }
  }

  const cancelHosted = () => {
    setHostedUrl(null)
    setState('cancelled')
    setError('You closed hosted checkout. If you approved a payment, wait for confirmation before trying again.')
  }

  useEffect(() => {
    if (!handoffUrl || previewState) return
    const timer = window.setTimeout(() => window.location.assign(handoffUrl), 1800)
    return () => window.clearTimeout(timer)
  }, [handoffUrl, previewState])

  const content = (
    <section
      ref={dialogRef}
      className={[styles.checkout, styles[variant]].filter(Boolean).join(' ')}
      aria-labelledby={`${checkoutId}-title`}
      aria-modal={variant === 'modal' || variant === 'gig' ? true : undefined}
      role={variant === 'modal' || variant === 'gig' ? 'dialog' : undefined}
      tabIndex={-1}
    >
      <header className={styles.header}>
        <div>
          <h2 id={`${checkoutId}-title`}>{title}</h2>
          <p>Review the total and choose how you’d like to pay.</p>
        </div>
        {onClose && <button className={styles.close} type="button" onClick={onClose} disabled={busy} aria-label="Close checkout">×</button>}
      </header>

      <div className={styles.summary}>
        <div className={styles.summaryTitle}><span>Order summary</span><span>USD</span></div>
        {!summaryDetails && <div className={styles.summaryLine}><span>{title}</span><strong>{formatMoney(amountUsdCents, 'USD')}</strong></div>}
        {description && <p className={styles.summaryDescription}>{description}</p>}
        {summaryDetails && <div className={styles.summaryDetails}>{summaryDetails}</div>}
        <div className={styles.summaryTotal}><span>Total due</span><strong>{formatMoney(amountUsdCents, 'USD')}</strong></div>
        <p>Prices are based on USD. Local currency amounts are estimates.</p>
        {ratesAvailable.length > 0 && (
          <ul className={styles.estimates} aria-label="Estimated local prices">
            {ratesAvailable.map((code) => (
              <li key={code}>≈ {currencyGlyph(code)}{((amountUsdCents / 100) * rates[code]).toFixed(2)} {code}</li>
            ))}
          </ul>
        )}
      </div>

      <div className={styles.trustRow}><span className={styles.lockMark} aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M7 10V7a5 5 0 0 1 10 0v3"/><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M12 14v3"/></svg></span><span><strong>Secured by YouSafe</strong><small>Your payment details are protected throughout checkout.</small></span></div>

      {visibleState === 'receipt' ? (
        <div className={styles.state} role="status">
          <h3>Order received</h3>
          <p>Your order has been recorded{receipt?.orderId ? ` as ${receipt.orderId}` : ''} for {formatMoney(amountUsdCents, 'USD')} USD.</p>
          {receipt?.url && <a className={styles.receiptLink} href={receipt.url}>View order</a>}
          {onClose && <button type="button" className={styles.primary} onClick={onClose}>Continue</button>}
        </div>
      ) : visibleState === 'pending' ? (
        <div className={styles.state} role="status" aria-live="polite">
          <h3>Confirming your payment</h3>
          <p>Keep this page open while we confirm your payment. We’ll show a receipt as soon as it’s ready.</p>
          <button type="button" className={styles.secondary} onClick={cancelHosted}>Close checkout</button>
        </div>
      ) : visibleState === 'redirecting' ? (
        <div className={styles.handoff} role="status" aria-live="polite">
          <div className={styles.handoffBrand}><img src="/logo.svg" width="128" height="32" alt="YouSafe" /><span className={styles.handoffLock} aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M7 10V7a5 5 0 0 1 10 0v3"/><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M12 14v3"/></svg></span></div>
          <h3>Finishing securely</h3><strong className={styles.handoffAmount}>{formatMoney(amountUsdCents, 'USD')}</strong>
          <p>Your secure payment page is ready. We’ll continue automatically in a moment.</p>
          <a href={handoffUrl || '#checkout-preview'} onClick={handoffUrl ? undefined : (event) => event.preventDefault()} className={styles.manualContinue}>Continue now</a>
        </div>
      ) : visibleState === 'cancelled' ? (
        <div className={styles.state} role="status"><h3>Checkout closed</h3><p>{error || previewMessage || 'You can choose a payment method to try again.'}</p><button type="button" className={styles.secondary} onClick={() => { setState('idle'); setError(null) }}>Return to payment methods</button></div>
      ) : (
        <>
          <div className={styles.methodsHeading}>
            <h3>Payment method</h3>
            <span>Choose one option</span>
          </div>
          {methodsLoading ? (
            <div className={styles.methodSkeleton} aria-label="Loading payment methods"><span /><span /><span /><span /></div>
          ) : choices.length === 0 ? (
            <div className={styles.state} role="status"><h3>Online payment is unavailable</h3><p>{methodsError || 'No payment methods are available right now. Please try again later.'}</p><button type="button" className={styles.secondary} onClick={() => void refreshMethods()}>Try again</button></div>
          ) : (
            <div className={styles.methods} role="radiogroup" aria-label="Choose payment method">
              {choices.map((choice) => {
                const isSelected = selected?.key === choice.key
                const disabled = choice.kind === 'wallet' && !walletAvailable
                const label = choice.kind === 'saved_card'
                  ? `${(choice.card?.brand || 'Card').toUpperCase()} ending in ${choice.card?.last4 || ''}`
                  : choice.kind === 'new_card'
                    ? `${choice.method.label} · new card`
                    : choice.kind === 'wallet'
                      ? 'Pay from wallet'
                    : buyerSafeMessage(choice.method.label)
                const detail = choice.kind === 'wallet'
                  ? walletBalanceCents === null ? 'Balance unavailable' : `${formatMoney(walletBalanceCents)} available${disabled ? ' · not enough to cover this total' : ''}`
                    : choice.kind === 'saved_card'
                    ? `${buyerSafeMessage(choice.method.label)} · saved securely`
                    : choice.kind === 'new_card'
                      ? 'Card details stay with the secure payment fields'
                      : choice.method.mode === 'hosted-redirect'
                        ? 'You’ll finish securely on our payment page'
                        : buyerSafeMessage(choice.method.label)
                return (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    aria-disabled={disabled}
                    key={choice.key}
                    className={`${styles.method} ${isSelected ? styles.selected : ''}`}
                    disabled={disabled}
                    onClick={() => { setSelectedKey(choice.key); setError(null); setState('idle') }}
                  >
                    {choice.method.id === 'card' ? <span className={styles.methodBrands}><CardBrandIcons brands={choice.method.supportedBrands || supportedBrandsByProvider[choice.method.provider] || []} activeBrand={detectedBrand} /></span> : <span className={styles.methodGlyph} aria-hidden="true">{choice.method.id === 'wallet' ? '◈' : '↗'}</span>}
                    <span className={styles.methodCopy}><strong>{label}</strong><small>{detail}</small></span>
                    <span className={styles.radioMark} aria-hidden="true" />
                  </button>
                )
              })}
            </div>
          )}

          {selected?.method.mode === 'hosted-redirect' && !customer?.email && (
            <div className={styles.cardFields}>
                <label>Email address<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required aria-invalid={Boolean(error && !email.trim())} aria-describedby={`${checkoutId}-email-help`} /><small id={`${checkoutId}-email-help`}>We’ll send your payment receipt here.</small></label>
            </div>
          )}

          {selected?.kind === 'new_card' && selected.method.mode === 'inline-token' && (
            <div className={styles.cardFields}>
              {!customer?.name && <label>Name on card<input type="text" autoComplete="cc-name" value={name} onChange={(event) => setName(event.target.value)} aria-describedby={`${checkoutId}-name-help`} /><small id={`${checkoutId}-name-help`}>Enter the name shown on your card.</small></label>}
              <p className={styles.fieldHelp}>Your card details are encrypted and handled securely.</p>
              {previewState ? (
                <div className={styles.mockFields} aria-label="Mock card fields">
                  <label>Card number<input value="4242 4242 4242 4242" readOnly /><small>16 digits on the front of your card (Amex 15).</small></label><label>Expiry<input value="12 / 29" readOnly aria-describedby={`${checkoutId}-expiry-help`} /><small id={`${checkoutId}-expiry-help`}>MM/YY as printed on your card.</small></label><label>Security code<input value="•••" readOnly /><small>The 3 digits on the back of your card (Amex: the 4 digits on the front).</small></label>
                  <small>Preview only · sample Visa number, no card details are collected</small>
                </div>
              ) : (
                <CardFields
                  ref={cardFieldsRef}
                  gateway={selected.method.provider}
                  onError={setError}
                  onBrandDetected={setDetectedBrand}
                  onToken={(token) => { lastTokenRef.current = token; setError(null) }}
                />
              )}
            </div>
          )}

          {(methodsError || error || visibleState === 'failed' || visibleState === 'method_unavailable') && (
            <div className={styles.error} role="alert" aria-live="assertive">{buyerSafeMessage(error || methodsError || previewMessage || 'Payment could not be completed.')}</div>
          )}

          {visibleState === 'method_unavailable' && <p className={styles.repick}>Available methods have been refreshed. Choose another option to continue.</p>}

          <div className={styles.actions}>
          <button type="button" className={styles.cancel} onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="button" className={styles.primary} onClick={submit} disabled={busy || methodsLoading || !selected}>
            {visibleState === 'submitting' ? 'Processing…' : selected?.kind === 'wallet' ? `Pay ${formatMoney(amountUsdCents)} from wallet` : selected?.kind === 'saved_card' ? `Pay with ${selected.card?.brand || 'saved card'} ending ${selected.card?.last4}` : selected?.kind === 'invoice' ? 'Request an invoice' : selected?.method.mode === 'hosted-redirect' ? 'Continue to secure checkout' : `Pay ${formatMoney(amountUsdCents)} USD`}
          </button>
          </div>
        </>
      )}

      {hostedUrl && (
        <div className={styles.sheetBackdrop} role="dialog" aria-modal="true" aria-label="Secure hosted checkout">
          <div className={styles.sheet}>
            <div className={styles.sheetHeader}><strong>Secure payment</strong><button type="button" onClick={cancelHosted} aria-label="Close hosted checkout">×</button></div>
            <div className={styles.frameShell}><iframe src={hostedUrl} title="YouSafe secure payment page" allow="payment *" referrerPolicy="strict-origin-when-cross-origin" /></div>
          </div>
        </div>
      )}

      {previewState && previewState !== 'idle' && previewState !== 'receipt' && (
        <div className={styles.previewState} aria-live="polite">Preview state: {previewState}{previewMessage ? ` · ${previewMessage}` : ''}</div>
      )}
    </section>
  )

  return (variant === 'modal' || variant === 'gig') && !previewState
    ? <div className={styles.overlay} onMouseDown={(event) => { if (!busy && event.target === event.currentTarget) onClose?.() }}>{content}</div>
    : content
}
