import { sendEmail } from '@/lib/email'
import type { getSupabaseAdminClient } from '@/lib/supabase'

type Db = ReturnType<typeof getSupabaseAdminClient>

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)
}

function formatEt(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'long',
  }).format(date)
}

export async function sendPaymentSettingsAlert(args: {
  db: Db
  actorProfileId: string
  actorRole: string
  action: 'changed' | 'rejected'
  reason: string
  diff: unknown
  target?: string
  now?: Date
}): Promise<void> {
  const now = args.now ?? new Date()
  const subject = args.action === 'changed' ? 'Payment settings changed' : 'Payment settings change rejected'
  const actor = `${args.actorRole} (${args.actorProfileId})`
  const safeDiff = escapeHtml(JSON.stringify(args.diff, null, 2).slice(0, 10_000))
  const html = `<p>A payment settings change was ${args.action === 'changed' ? 'saved' : 'rejected'}.</p>
<p><strong>Actor:</strong> ${escapeHtml(actor)}<br><strong>Time (ET):</strong> ${escapeHtml(formatEt(now))}<br><strong>Target:</strong> ${escapeHtml(args.target || 'payment settings')}<br><strong>Reason:</strong> ${escapeHtml(args.reason || 'Not supplied')}</p>
<pre style="white-space:pre-wrap;font:13px ui-monospace,monospace">${safeDiff}</pre>`

  try {
    await sendEmail({ to: 'kylemwalker.pr@gmail.com', subject, html })
  } catch {
    try {
      const { error } = await args.db.from('payment_incidents').insert({
        profile_id: args.actorProfileId === '00000000-0000-0000-0000-000000000000' ? null : args.actorProfileId,
        kind: 'payment_settings_alert_failed',
        gateway: null,
        transaction_id: null,
        amount_cents: null,
        context: { action: args.action, target: args.target || 'payment settings', actor_role: args.actorRole, reason: args.reason },
      })
      if (error) console.error('[payment-settings] failed to record alert incident')
    } catch {
      console.error('[payment-settings] failed to record alert incident')
    }
  }
}

export async function sendNoPaymentMethodsAlert(args: {
  db: Db
  actorProfileId: string
  orderId: string
  amountCents: number
}): Promise<void> {
  const now = new Date()
  const html = `<p>A checkout requested an invoice because no online payment methods were available.</p>
<p><strong>Profile:</strong> ${escapeHtml(args.actorProfileId)}<br><strong>Order:</strong> ${escapeHtml(args.orderId)}<br><strong>USD amount:</strong> ${escapeHtml((args.amountCents / 100).toFixed(2))}<br><strong>Time (ET):</strong> ${escapeHtml(formatEt(now))}</p>`

  try {
    await sendEmail({ to: 'kylemwalker.pr@gmail.com', subject: 'No online payment methods available', html })
  } catch {
    try {
      const { error } = await args.db.from('payment_incidents').insert({
        profile_id: args.actorProfileId,
        kind: 'payment_settings_alert_failed',
        gateway: 'manual',
        transaction_id: args.orderId,
        amount_cents: args.amountCents,
        context: { action: 'payment_methods_unavailable_alert_failed', order_id: args.orderId },
      })
      if (error) console.error('[payment-settings] failed to record alert incident')
    } catch {
      console.error('[payment-settings] failed to record alert incident')
    }
  }
}
