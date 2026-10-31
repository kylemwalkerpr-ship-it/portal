import { verifyToken } from '@clerk/nextjs/server'
import { createLinkRuntime } from '@/lib/q02/runtime/link-runtime.mjs'
import { handleLinkRequest } from '@/lib/q02/runtime/link-api.mjs'
import { boundedLinkJson, linkResponse } from '@/lib/q02/runtime/link-wire.mjs'

async function handle(req: Request) {
  try {
    const runtime = createLinkRuntime({ site: 'portal', env: process.env, verifyToken })
    if (req.method === 'GET') return handleLinkRequest(req, 'review', runtime)
    if (req.method !== 'POST') return linkResponse({ error: 'Method not allowed' }, 405)
    // Validate fixed origin before reading/rebuilding the bounded body.
    if (req.headers.get('origin') !== runtime.origin || ![null, 'same-origin'].includes(req.headers.get('sec-fetch-site'))) return linkResponse({ error: 'Forbidden' }, 403)
    const input = await boundedLinkJson(req)
    if (!input || typeof input.action !== 'string') return linkResponse({ error: 'Invalid operation' }, 400)
    const { action, ...body } = input
    // The existing UI explicitly chooses an operation; the shared handler checks
    // its exact schema. No identities/configuration are accepted in this body.
    const next = new Request(req.url, { method: 'POST', headers: req.headers, body: JSON.stringify(body) })
    return handleLinkRequest(next, action, runtime)
  } catch { return linkResponse({ error: 'Privacy dependencies unavailable', derivedUse: false }, 503) }
}
export const GET = handle
export const POST = handle
