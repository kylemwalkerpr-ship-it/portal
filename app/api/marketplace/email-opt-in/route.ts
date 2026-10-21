import { NextResponse } from 'next/server'

type Body = {
  email?: string
  consent?: boolean
  consentText?: string
  source?: string
  company_website?: string
}

function kv(): KVNamespace | undefined {
  try {
    const { getCloudflareContext } = require('@opennextjs/cloudflare') as {
      getCloudflareContext: () => { env?: { PAGE_CACHE?: KVNamespace } }
    }
    return getCloudflareContext()?.env?.PAGE_CACHE
  } catch {
    return undefined
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Body | null
  if (!body) return NextResponse.json({ error: 'invalid' }, { status: 400 })
  if (body.company_website) return NextResponse.json({ ok: true })
  if (body.consent !== true) return NextResponse.json({ error: 'consent required' }, { status: 400 })
  const email = String(body.email || '').trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: 'email required' }, { status: 400 })
  }
  const store = kv()
  if (!store) return NextResponse.json({ error: 'storage unavailable' }, { status: 503 })
  const record = {
    email,
    source: String(body.source || '').slice(0, 200),
    consentText: String(body.consentText || '').slice(0, 500),
    at: new Date().toISOString(),
    doubleOptIn: false,
  }
  await store.put(`email-opt-in:${email}`, JSON.stringify(record))
  return NextResponse.json({ ok: true, doubleOptIn: false })
}
