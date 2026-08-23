import { verifyMobileBearer } from './mobileAuth'
import { createSupabaseAdminClient } from './supabase'
import { getTemplatePack, getTemplatePackPriceCents, TEMPLATE_PACKS } from './template-packs'
import { userOwnsSlug } from './templateEntitlements'
import { randomUUID } from 'crypto'

// ── Auth ────────────────────────────────────────────────────

export type MobileUserResult =
  | { status: 'authenticated'; db: ReturnType<typeof createSupabaseAdminClient>; profile: { id: string; role: string; status: string; email: string | null; full_name: string | null } }
  | { status: 'unauthenticated'; reason: 'missing' | 'invalid' }
  | { status: 'forbidden'; message: string; httpStatus: 403 | 404 }

export async function resolveMobileUser(authHeader: string | null | undefined): Promise<MobileUserResult> {
  const auth = await verifyMobileBearer(authHeader)
  if (auth.status !== 'authenticated') return { status: 'unauthenticated', reason: auth.reason }
  const db = createSupabaseAdminClient()
  const { data: profile, error } = await db.from('profiles').select('id, role, status, email, full_name').eq('clerk_user_id', auth.userId).single()
  if (error || !profile) return { status: 'forbidden', message: 'Profile not found.', httpStatus: 404 }
  if (profile.status === 'suspended') return { status: 'forbidden', message: 'Account suspended', httpStatus: 403 }
  return { status: 'authenticated', db, profile }
}

export function unauthorizedRes(reason: 'missing' | 'invalid') {
  return Response.json({ error: { message: reason === 'missing' ? 'Missing session token.' : 'Invalid session token.' }, signInRequired: true }, { status: 401 })
}

// ── IAP verify ──────────────────────────────────────────────

/**
 * Whether StoreKit local-testing JWS tokens (environment=LocalTesting/Xcode)
 * can be accepted without a live Apple verification call.
 *
 * LocalTesting acceptance is gated behind:
 *   1. NODE_ENV must NOT be 'production'
 *   2. ALLOW_STOREKIT_LOCAL_TESTING must be 'true' (opt-in safety net)
 *
 * In production, LocalTesting JWS tokens are treated the same as Production
 * tokens — they go through verifyWithApple(). If Apple verification is not
 * configured, the handler returns 503. No paid row is ever inserted.
 */
function allowStoreKitLocalTesting(): boolean {
  const allowed = process.env.ALLOW_STOREKIT_LOCAL_TESTING === 'true'
  if (!allowed) return false
  // Only test or development are explicitly local. Production, unset,
  // empty, or any other value → fail closed (treat as Production).
  const nodeEnv = process.env.NODE_ENV
  return nodeEnv === 'test' || nodeEnv === 'development'
}

const APPLE_VERIFY_URL = 'https://api.storekit.itunes.apple.com/inApps/v1/transactions/'

/**
 * Verify a StoreKit 2 JWS with Apple's production server.
 * Returns the parsed payload on success, or null.
 *
 * Requires APPLE_IAP_SHARED_SECRET and APPLE_ISSUER_ID / APPLE_KEY_ID /
 * APPLE_PRIVATE_KEY env vars. If not configured, returns null (503 path).
 */
async function verifyWithApple(jws: string): Promise<{ transactionId: string; productId: string; environment: string } | null> {
  const sharedSecret = process.env.APPLE_IAP_SHARED_SECRET
  const issuerId = process.env.APPLE_IAP_ISSUER_ID
  const keyId = process.env.APPLE_IAP_KEY_ID
  const privateKey = process.env.APPLE_IAP_PRIVATE_KEY

  if (!sharedSecret || !issuerId || !keyId || !privateKey) {
    return null // not configured — graceful 503
  }

  let transactionId: string
  try {
    const parts = jws.split('.')
    if (parts.length < 2) return null
    const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'))
    transactionId = payload.transactionId || payload.originalTransactionId
    if (!transactionId) return null
  } catch {
    return null
  }

  // Apple API call not yet wired (human-gated credentials)
  return null
}

export async function handleIapVerify(req: Request, auth: Extract<MobileUserResult, { status: 'authenticated' }>) {
  const body = await req.json().catch(() => ({}))
  const jws = typeof body.receipt === 'string' ? body.receipt : typeof body.jws === 'string' ? body.jws : ''
  const productId = typeof body.productId === 'string' ? body.productId : ''
  const slug = typeof body.slug === 'string' ? body.slug : ''

  if (!jws || !productId) {
    return Response.json({ error: { message: 'Missing receipt (JWS) or productId.' } }, { status: 400 })
  }

  const resolvedSlug = slug || productIdToSlug(productId)
  if (!resolvedSlug) return Response.json({ error: { message: 'Unknown product.' } }, { status: 400 })

  const pack = getTemplatePack(resolvedSlug)
  if (!pack) return Response.json({ error: { message: 'Template not found.' } }, { status: 404 })

  const expectedProductId = `com.yousafeconsultancy.app.template.${resolvedSlug}`
  if (productId !== expectedProductId) {
    return Response.json({ error: { message: 'Product mismatch — JWS productId does not match the template slug.' } }, { status: 400 })
  }

  // ── Parse JWS ──────────────────────────────────────────────
  let transactionId = ''
  let environment = 'Production'

  try {
    const parts = jws.split('.')
    if (parts.length < 2) {
      return Response.json({ error: { message: 'Invalid JWS format.' } }, { status: 400 })
    }
    const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'))
    transactionId = payload.transactionId || payload.originalTransactionId || ''
    environment = payload.environment || 'Production'
  } catch {
    return Response.json({ error: { message: 'Could not parse JWS payload.' } }, { status: 400 })
  }

  if (!transactionId) {
    return Response.json({ error: { message: 'No transactionId in JWS — cannot verify.' } }, { status: 400 })
  }

  // ── Verification gate ──────────────────────────────────────
  //
  // LocalTesting / Xcode environments:
  //   Accepted only if ALLOW_STOREKIT_LOCAL_TESTING is true AND
  //   NODE_ENV is not production. Otherwise → same as Production.
  //
  // Production environment:
  //   MUST verify with Apple's App Store Server API. If Apple
  //   verification returns null (credentials human-gated), return
  //   503. NEVER insert a paid row based on an unverified JWS.
  //
  const isLocalTesting = environment === 'LocalTesting' || environment === 'Xcode'

  if (isLocalTesting && allowStoreKitLocalTesting()) {
    // Simulator/DEBUG — JWS parsed, product maps to real pack,
    // transactionId present. Accept.
  } else {
    // Production (or LocalTesting in production NODE_ENV):
    // must verify with Apple.
    const appleResult = await verifyWithApple(jws)
    if (!appleResult) {
      return Response.json({
        error: {
          message: 'IAP verification is not yet configured. Please contact support.',
          retryable: true,
        },
      }, { status: 503 })
    }
    if (appleResult.productId !== productId) {
      return Response.json({ error: { message: 'Product mismatch with Apple verification.' } }, { status: 400 })
    }
  }

  // ── Record purchase ────────────────────────────────────────
  const email = (auth.profile.email || '').toLowerCase()
  if (!email) return Response.json({ error: { message: 'No email on profile — cannot record purchase.' } }, { status: 400 })

  const alreadyOwns = await userOwnsSlug(auth.db, email, resolvedSlug)
  if (alreadyOwns) {
    return Response.json({ success: true, owned: true, slug: resolvedSlug, orderId: null }, { status: 200 })
  }

  const orderId = randomUUID()
  const priceCents = getTemplatePackPriceCents(resolvedSlug) || Math.round(pack.price_usd * 100)

  const { error: insertErr } = await auth.db.from('template_orders').insert({
    id: orderId,
    email,
    name: auth.profile.full_name || null,
    slugs: [resolvedSlug],
    amount_cents: priceCents,
    transaction_id: transactionId,
    status: 'paid',
    gateway: 'apple_iap',
  })

  if (insertErr) {
    console.error('[mobile/iap/verify] insert failed:', insertErr.message)
    return Response.json({ error: { message: 'Failed to record purchase.' } }, { status: 500 })
  }

  return Response.json({ success: true, owned: true, slug: resolvedSlug, orderId }, { status: 201 })
}

// ── IAP restore ─────────────────────────────────────────────

export async function handleIapRestore(req: Request, auth: Extract<MobileUserResult, { status: 'authenticated' }>) {
  const body = await req.json().catch(() => ({}))
  const productIds: string[] = Array.isArray(body.productIds) ? body.productIds : []

  const email = (auth.profile.email || '').toLowerCase()
  if (!email) return Response.json({ slugs: [] })

  const slugs: string[] = []
  for (const pid of productIds) {
    const slug = productIdToSlug(pid)
    if (!slug) continue
    const pack = getTemplatePack(slug)
    if (!pack) continue

    const owns = await userOwnsSlug(auth.db, email, slug)
    if (owns) {
      slugs.push(slug)
      continue
    }

    // Check if there is a paid apple_iap row whose slugs array contains
    // THIS specific slug. Owning pack A must not restore pack B.
    const { data: existing } = await auth.db.from('template_orders')
      .select('id')
      .eq('email', email)
      .eq('gateway', 'apple_iap')
      .eq('status', 'paid')
      .contains('slugs', [slug])
      .maybeSingle()

    if (existing) {
      slugs.push(slug)
    }
  }

  return Response.json({ slugs })
}

// ── Template download (Bearer) ──────────────────────────────

export async function handleMobileTemplateDownload(req: Request, auth: Extract<MobileUserResult, { status: 'authenticated' }>, slug: string) {
  const pack = getTemplatePack(slug)
  if (!pack) return Response.json({ error: { message: 'Template not found.' } }, { status: 404 })

  const email = (auth.profile.email || '').toLowerCase()
  if (!email) return Response.json({ error: { message: 'No email on profile.' } }, { status: 403 })

  const admin = createSupabaseAdminClient()

  const isOwner = auth.profile.role === 'admin' || await userOwnsSlug(auth.db, email, slug)
  if (!isOwner) return Response.json({ error: { message: 'You have not purchased this template.' } }, { status: 403 })

  const { data: render } = await admin.from('template_pdf_renders').select('storage_path, storage_bucket').eq('profile_id', auth.profile.id).eq('slug', slug).order('created_at', { ascending: false }).limit(1).maybeSingle()

  const objectPath = render?.storage_path || `${slug}/pack.zip`
  const bucket = render?.storage_bucket || 'templates'

  const { data: signed, error: signErr } = await admin.storage.from(bucket).createSignedUrl(objectPath, 60, { download: true })
  if (signErr || !signed?.signedUrl) {
    return Response.json({ error: { message: 'Download link unavailable.' } }, { status: 500 })
  }

  return Response.json({ url: signed.signedUrl, ttl: 60 })
}

// ── Helpers ─────────────────────────────────────────────────

function productIdToSlug(productId: string): string | null {
  const match = productId.match(/^com\.yousafeconsultancy\.app\.template\.(.+)$/)
  return match ? match[1] : null
}

/** Public catalogue for the app — no auth needed, same data as lib/template-packs */
export function getTemplateCatalogue() {
  return TEMPLATE_PACKS.map(p => ({
    slug: p.slug,
    name: p.name,
    category: p.category,
    badge: p.badge,
    price_usd: p.price_usd,
    short_description: p.short_description,
    includes: p.includes,
  }))
}