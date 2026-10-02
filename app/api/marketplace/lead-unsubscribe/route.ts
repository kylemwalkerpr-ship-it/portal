/**
 * GET /api/marketplace/lead-unsubscribe?id=<inquiry id>&t=<access token>
 *
 * One-click opt-out from the /get-matched follow-up reminders
 * (lib/leadFollowups.ts). The per-inquiry access token proves the link came
 * from our email. Opting out stops reminders for every request from that email.
 */
import { createSupabaseAdminClient } from '@/lib/supabase'

function page(message: string, status = 200) {
  return new Response(
    `<!doctype html><html><head><meta name="robots" content="noindex"><meta name="viewport" content="width=device-width,initial-scale=1"><title>YouSafe reminders</title></head><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111;max-width:520px;margin:64px auto;padding:0 20px;line-height:1.6"><p>${message}</p><p><a href="https://market.yousafeconsultancy.com/">Back to the YouSafe Marketplace</a></p></body></html>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8', 'x-robots-tag': 'noindex' } },
  )
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const id = url.searchParams.get('id') || ''
  const token = url.searchParams.get('t') || ''
  if (!/^[0-9a-f-]{36}$/i.test(id) || !/^[0-9a-f]{16,64}$/i.test(token)) {
    return page('This link is not valid.', 400)
  }

  const db = createSupabaseAdminClient()
  const { data: lead } = await db.from('inquiries').select('id, email, access_token').eq('id', id).maybeSingle()
  if (!lead || lead.access_token !== token) return page('This link is not valid.', 404)

  const at = new Date().toISOString()
  const { data: rows } = await db.from('inquiries').select('id, meta').eq('email', lead.email)
  for (const row of rows ?? []) {
    const meta = (row.meta && typeof row.meta === 'object' ? row.meta : {}) as Record<string, unknown>
    const followups = (meta.followups && typeof meta.followups === 'object' ? meta.followups : {}) as Record<string, unknown>
    if (followups.opted_out) continue
    await db.from('inquiries').update({ meta: { ...meta, followups: { ...followups, opted_out: at } } }).eq('id', row.id)
  }

  return page("You're unsubscribed. We won't send any more reminders about your case request.")
}
