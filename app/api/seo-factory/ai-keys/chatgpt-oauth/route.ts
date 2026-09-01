import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import {
  disconnectChatgpt,
  getChatgptStatus,
  pollChatgptDeviceLogin,
  startChatgptDeviceLogin,
} from '@/lib/chatgptOAuth'

/**
 * ChatGPT Plus subscription login for Content Studio.
 *
 * POST { action: 'start' | 'poll' | 'status' | 'disconnect' }
 */

export async function GET() {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }
    const status = await getChatgptStatus()
    return NextResponse.json({ ok: true, ...status })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'ChatGPT status failed' },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }
    const body = await request.json().catch(() => ({}))
    const action = String(body.action || 'status').trim().toLowerCase()
    const updatedBy = 'profileId' in auth ? String(auth.profileId || 'admin') : 'admin'

    if (action === 'start') {
      const started = await startChatgptDeviceLogin(updatedBy)
      return NextResponse.json({ ok: true, pending: true, connected: false, ...started })
    }
    if (action === 'poll') {
      const polled = await pollChatgptDeviceLogin(updatedBy)
      const status = await getChatgptStatus()
      return NextResponse.json({ ok: true, ...status, ...polled })
    }
    if (action === 'disconnect') {
      await disconnectChatgpt()
      const status = await getChatgptStatus()
      return NextResponse.json({ ok: true, ...status })
    }
    if (action === 'status') {
      const status = await getChatgptStatus()
      return NextResponse.json({ ok: true, ...status })
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'ChatGPT OAuth failed' },
      { status: 500 },
    )
  }
}