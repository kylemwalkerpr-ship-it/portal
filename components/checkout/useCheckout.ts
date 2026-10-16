'use client'

import { useCallback, useEffect, useState } from 'react'

export type CheckoutState = 'idle' | 'submitting' | 'redirecting' | 'pending' | 'failed' | 'cancelled' | 'method_unavailable' | 'receipt'

export interface AvailablePaymentMethod {
  methodKey: string
  provider: string
  id: string
  label: string
  logoAsset: string
  mode: 'inline-token' | 'hosted-redirect' | 'manual-invoice'
  displayCurrency: string
  chargeCurrency: string
  currencies: string[]
  priority: number
  isDefault: boolean
  supportsVault: boolean
}

export interface CheckoutRateResponse {
  rates?: Record<string, number>
  fetchedAt?: string
  source?: string
}

export function useCheckout(args: {
  amountUsdCents: number
  currency?: string
  purpose?: string
  previewMethods?: AvailablePaymentMethod[]
}) {
  const { amountUsdCents, currency = 'USD', purpose = 'order', previewMethods } = args
  const [methods, setMethods] = useState<AvailablePaymentMethod[]>(previewMethods || [])
  const [rates, setRates] = useState<Record<string, number>>({})
  const [methodsLoading, setMethodsLoading] = useState(!previewMethods)
  const [methodsError, setMethodsError] = useState<string | null>(null)

  const refreshMethods = useCallback(async () => {
    if (previewMethods) {
      setMethods(previewMethods)
      setMethodsLoading(false)
      return previewMethods
    }
    setMethodsLoading(true)
    setMethodsError(null)
    try {
      const params = new URLSearchParams({
        amountUsd: (amountUsdCents / 100).toFixed(2),
        currency: currency.toUpperCase(),
        purpose,
      })
      const response = await fetch(`/api/payments/methods?${params}`, { cache: 'no-store', credentials: 'same-origin' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Payment methods are unavailable.')
      const next = Array.isArray(data.methods) ? data.methods as AvailablePaymentMethod[] : []
      setMethods(next)
      return next
    } catch (error) {
      setMethodsError(error instanceof Error ? error.message : 'Payment methods are unavailable.')
      setMethods([])
      return []
    } finally {
      setMethodsLoading(false)
    }
  }, [amountUsdCents, currency, previewMethods, purpose])

  useEffect(() => { void refreshMethods() }, [refreshMethods])

  useEffect(() => {
    if (previewMethods) return
    const controller = new AbortController()
    fetch('/api/payments/fx', { cache: 'no-store', credentials: 'same-origin', signal: controller.signal })
      .then(async (response) => response.ok ? response.json() as Promise<CheckoutRateResponse> : null)
      .then((data) => setRates(data?.rates || {}))
      .catch(() => setRates({}))
    return () => controller.abort()
  }, [previewMethods])

  return { methods, rates, methodsLoading, methodsError, refreshMethods }
}
