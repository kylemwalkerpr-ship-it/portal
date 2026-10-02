/**
 * POST /api/webhooks/clerk — Clerk user.created / user.updated / user.deleted.
 *
 * Feature-flagged by configuration: until CLERK_WEBHOOK_SECRET is set (wrangler
 * secret) this is a 200 no-op, so the endpoint can ship before the Clerk
 * dashboard webhook exists. Signatures are verified with svix via
 * @clerk/nextjs/webhooks. Logic lives in lib/auth/clerkWebhook.ts.
 */
import { verifyWebhook } from '@clerk/nextjs/webhooks'
import type { NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { handleClerkWebhookEvent } from '@/lib/auth/clerkWebhook'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const signingSecret = process.env.CLERK_WEBHOOK_SECRET
  if (!signingSecret) return Response.json({ ok: true, skipped: true, reason: 'CLERK_WEBHOOK_SECRET not configured' })

  let evt
  try {
    evt = await verifyWebhook(req, { signingSecret })
  } catch {
    return Response.json({ error: 'Invalid signature' }, { status: 400 })
  }

  try {
    const outcome = await handleClerkWebhookEvent(evt as any, createSupabaseAdminClient())
    return Response.json({ ok: true, type: evt.type, ...outcome })
  } catch (error) {
    console.error('[webhooks/clerk] handler failed', (error as Error)?.message)
    // 500 => Clerk/svix retries with backoff.
    return Response.json({ error: 'Sync failed' }, { status: 500 })
  }
}
