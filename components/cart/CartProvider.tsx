'use client'

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'

export interface CartItem {
  slug: string
  name: string
  priceUsdCents: number
  quantity: number
}

interface CartContextValue {
  items: CartItem[]
  addItem: (item: Omit<CartItem, 'quantity'> & { quantity?: number }) => void
  removeItem: (slug: string) => void
  setQuantity: (slug: string, quantity: number) => void
  clear: () => void
  itemCount: number
  subtotalCents: number
}

const CartContext = createContext<CartContextValue | null>(null)

const STORAGE_KEY = 'yousafe_cart'

function loadCart(): CartItem[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed
  } catch {}
  return []
}

function saveCart(items: CartItem[]) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  } catch {}
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  // Start with an empty cart on both server and first client render so the
  // markup matches and React doesn't trigger hydration error #419/#418.
  // Real cart contents are hydrated from localStorage in the effect below,
  // which only runs client-side after the first commit.
  const [items, setItems] = useState<CartItem[]>([])
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    const stored = loadCart()
    if (stored.length) setItems(stored)
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (hydrated) saveCart(items)
  }, [items, hydrated])

  const addItem = useCallback(
    (item: Omit<CartItem, 'quantity'> & { quantity?: number }) => {
      setItems((prev) => {
        const existing = prev.find((i) => i.slug === item.slug)
        const qty = Math.max(1, item.quantity ?? 1)
        if (existing) {
          return prev.map((i) =>
            i.slug === item.slug ? { ...i, quantity: i.quantity + qty } : i
          )
        }
        return [...prev, { slug: item.slug, name: item.name, priceUsdCents: item.priceUsdCents, quantity: qty }]
      })
    },
    []
  )

  const removeItem = useCallback((slug: string) => {
    setItems((prev) => prev.filter((i) => i.slug !== slug))
  }, [])

  const setQuantity = useCallback((slug: string, quantity: number) => {
    if (quantity < 1) {
      setItems((prev) => prev.filter((i) => i.slug !== slug))
      return
    }
    setItems((prev) => prev.map((i) => (i.slug === slug ? { ...i, quantity } : i)))
  }, [])

  const clear = useCallback(() => setItems([]), [])

  const itemCount = useMemo(
    () => items.reduce((sum, i) => sum + i.quantity, 0),
    [items]
  )

  const subtotalCents = useMemo(
    () => items.reduce((sum, i) => sum + i.priceUsdCents * i.quantity, 0),
    [items]
  )

  return (
    <CartContext.Provider
      value={{ items, addItem, removeItem, setQuantity, clear, itemCount, subtotalCents }}
    >
      {children}
    </CartContext.Provider>
  )
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used within a CartProvider')
  return ctx
}
