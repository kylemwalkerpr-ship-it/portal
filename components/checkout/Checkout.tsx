'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useId } from 'react'
import type { ReactNode } from 'react'
import CardFields, { type CardFieldsHandle, type CardTokenResult } from '@/components/payments/CardFields'
import type { CheckoutState, AvailablePaymentMethod } from './useCheckout'
import { useCheckout } from './useCheckout'
import styles from './checkout.module.css'

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
  const [email, setEmail] = useState(customer?.email || '')
  const [name, setName] = useState(customer?.name || '')
  const cardFieldsRef = useRef<CardFieldsHandle>(null)
  const lastTokenRef = useRef<CardTokenResult | null>(null)
  const dialogRef = useRef<HTMLElement>(null)
  const checkoutId = useId()
  const idempotencyKeyRef = useRef<string | null>(null)

  const choices = useMemo(() => choicesFromMethods(
    excludeInvoice ? methods.filter((method) => method.id !== 'invoice') : methods,
    savedCards,
  ), [excludeInvoice, methods, savedCards])
  const selected = choices.find((choice) => choice.key === selectedKey)
    || choices.find((choice) => choice.method.isDefault)
    || choices[0]
  const visibleState = previewState || state
  const busy = visibleState === 'submitting' || visibleState === 'redirecting'
  const walletAvailable = walletBalanceCents !== null && walletBalanceCents >= amountUsdCents
  const ratesAvailable = ['GBP', 'CAD', 'AUD'].filter((currency) => Number.isFinite(rates[currency]) && rates[currency] > 0)

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
    setError(message)
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
        if (mobile) {
          setState('redirecting')
          window.location.assign(data.redirectUrl)
          return
        }
        setHostedUrl(String(data.redirectUrl))
        setState('pending')
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
        setState('redirecting')
        window.location.assign(result.url)
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
        <div><span>Total</span><strong>{formatMoney(amountUsdCents, 'USD')} USD</strong></div>
        <p>Prices are based on USD. Local currency amounts are estimates.</p>
        {ratesAvailable.length > 0 && (
          <ul className={styles.estimates} aria-label="Estimated local prices">
            {ratesAvailable.map((code) => (
              <li key={code}>≈ {currencyGlyph(code)}{((amountUsdCents / 100) * rates[code]).toFixed(2)} {code}</li>
            ))}
          </ul>
        )}
      </div>

      {summaryDetails && <div className={styles.description}>{summaryDetails}</div>}
      {description && <p className={styles.description}>{description}</p>}

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
          <p>Keep this page open while the payment provider finishes. We’ll show a receipt after the server confirms it.</p>
          <button type="button" className={styles.secondary} onClick={cancelHosted}>Close checkout</button>
        </div>
      ) : visibleState === 'redirecting' ? (
        <div className={styles.state} role="status" aria-live="polite"><h3>Opening secure checkout</h3><p>You’re being redirected to complete your payment.</p></div>
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
                      : choice.method.label
                const detail = choice.kind === 'wallet'
                  ? walletBalanceCents === null ? 'Balance unavailable' : `${formatMoney(walletBalanceCents)} available${disabled ? ' · not enough to cover this total' : ''}`
                  : choice.kind === 'saved_card'
                    ? `${choice.method.label} · ${choice.card?.gateway || choice.method.provider}`
                    : choice.kind === 'new_card'
                      ? 'Card details stay with the secure payment fields'
                      : choice.method.provider === 'pesapal'
                        ? 'Continue to a secure hosted payment page'
                        : choice.method.label
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
                    <img src={choice.method.logoAsset} alt="" width="28" height="28" />
                    <span className={styles.methodCopy}><strong>{label}</strong><small>{detail}</small></span>
                    <span className={styles.radioMark} aria-hidden="true" />
                  </button>
                )
              })}
            </div>
          )}

          {selected?.method.mode === 'hosted-redirect' && !customer?.email && (
            <div className={styles.cardFields}>
              <label>Email address<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
            </div>
          )}

          {selected?.kind === 'new_card' && selected.method.mode === 'inline-token' && (
            <div className={styles.cardFields}>
              {!customer?.name && <label>Name<input type="text" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} /></label>}
              {previewState ? (
                <div className={styles.mockFields} aria-label="Mock card fields">
                  <span>Card number ·•••• •••• ••••</span><span>Expiry · MM / YY</span><span>Security code · CVV</span>
                  <small>Preview only · no card details are collected</small>
                </div>
              ) : (
                <CardFields
                  ref={cardFieldsRef}
                  gateway={selected.method.provider}
                  onError={setError}
                  onToken={(token) => { lastTokenRef.current = token; setError(null) }}
                />
              )}
            </div>
          )}

          {(methodsError || error || visibleState === 'failed' || visibleState === 'method_unavailable') && (
            <div className={styles.error} role="alert" aria-live="assertive">{error || methodsError || previewMessage || 'Payment could not be completed.'}</div>
          )}

          {visibleState === 'method_unavailable' && <p className={styles.repick}>Available methods have been refreshed. Choose another option to continue.</p>}

          <button type="button" className={styles.primary} onClick={submit} disabled={busy || methodsLoading || !selected}>
            {visibleState === 'submitting' ? 'Processing…' : selected?.kind === 'wallet' ? `Pay ${formatMoney(amountUsdCents)} from wallet` : selected?.kind === 'saved_card' ? `Pay with ${selected.card?.brand || 'saved card'} ending ${selected.card?.last4}` : selected?.kind === 'invoice' ? 'Request an invoice' : selected?.method.mode === 'hosted-redirect' ? 'Continue to secure checkout' : `Pay ${formatMoney(amountUsdCents)} USD`}
          </button>
          {onClose && <button type="button" className={styles.cancel} onClick={onClose} disabled={busy}>Cancel</button>}
        </>
      )}

      {hostedUrl && (
        <div className={styles.sheetBackdrop} role="dialog" aria-modal="true" aria-label="Secure hosted checkout">
          <div className={styles.sheet}>
            <div className={styles.sheetHeader}><strong>Secure payment</strong><button type="button" onClick={cancelHosted} aria-label="Close hosted checkout">×</button></div>
            <div className={styles.frameShell}><iframe src={hostedUrl} title="Pesapal secure checkout" allow="payment *" referrerPolicy="strict-origin-when-cross-origin" /></div>
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
