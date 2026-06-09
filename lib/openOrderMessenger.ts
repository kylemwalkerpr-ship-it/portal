'use client'
/**
 * Resolve (or create) the unified-inbox conversation for an order and open it
 * in the WhatsApp-style messenger. Used by the order-detail views (attorney,
 * consultant, student) so ALL order communication happens in one place — the
 * messenger — rather than a separate inline panel.
 *
 * Dispatches a `yousafe-open-messages` window event with the resolved thread
 * id; each role dashboard listens for it, sets `?thread=<id>`, and switches to
 * its Messages page (where UnifiedInbox reads the thread on mount).
 */
export async function openOrderInMessenger(opts: { orderId: string; counterpartId?: string }): Promise<void> {
  if (!opts.orderId) throw new Error('Missing order.')
  const res = await fetch('/api/messages/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({
      // Counterpart is optional — the server resolves it from the order when
      // omitted (client ↔ provider).
      ...(opts.counterpartId ? { counterpart_profile_id: opts.counterpartId } : {}),
      context_kind: 'order',
      context_id: opts.orderId,
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data?.conversation_id) {
    throw new Error(data?.error || 'Could not open the conversation.')
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('yousafe-open-messages', { detail: { threadId: data.conversation_id } }))
  }
}
