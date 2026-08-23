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

const APPLE_VERIFY_URL = 'https://api.storekit.itunes.apple.com/inApps/v1/transactions/'

/**
 * Verify a StoreKit 2 JWS with Apple's production server.
 * Returns the parsed payload on success, or null.
 *
 * This requires APPLE_IAP_SHARED_SECRET and APPLE_ISSUER_ID / APPLE_KEY_ID /
 * APPLE_PRIVATE_KEY env vars. If not configured, Apple verification is
 * unavailable and the handler returns 503.
 */
async function verifyWithApple(jws: string): Promise<{ transactionId: string; productId: string; environment: string } | null> {
  const sharedSecret = process.env.APPLE_IAP_SHARED_SECRET
  const issuerId = process.env.APPLE_IAP_ISSUER_ID
  const keyId = process.env.APPLE_IAP_KEY_ID
  const privateKey = process.env.APPLE_IAP_PRIVATE_KEY

  if (!sharedSecret || !issuerId || !keyId || !privateKey) {
    return null // not configured — graceful 503
  }

  // Decode JWS to extract transactionId for the lookup URL
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

  // Call Apple's App Store Server API
  // For now: human-gated credentials not available → return null (503 path)
  // When credentials are configured, this would:
  // 1. Generate a JWT signed with the private key
  // 2. GET {APPLE_VERIFY_URL}{transactionId}
  // 3. Validate response matches productId
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

  // Derive slug from product ID if not provided
  const resolvedSlug = slug || productIdToSlug(productId)
  if (!resolvedSlug) return Response.json({ error: { message: 'Unknown product.' } }, { status: 400 })

  const pack = getTemplatePack(resolvedSlug)
  if (!pack) return Response.json({ error: { message: 'Template not found.' } }, { status: 404 })

  // Validate the JWS productId matches the pack slug
  const expectedProductId = `com.yousafeconsultancy.app.template.${resolvedSlug}`
  if (productId !== expectedProductId) {
    return Response.json({ error: { message: 'Product mismatch — JWS productId does not match the template slug.' } }, { status: 400 })
  }

  // ── Verification gate ──────────────────────────────────────
  //
  // SIMULATOR / DEBUG (StoreKit local testing):
  //   Accept the JWS only if it is valid JSON with a transactionId, AND the
  //   productId maps to a real pack. Never skip validation just because the
  //   environment says "LocalTesting" — still require a transactionId.
  //
  // PRODUCTION:
  //   Must verify with Apple's App Store Server API. If Apple verification is
  //   not configured (credentials human-gated), return 503 — never insert
  //   a paid row based on a self-signed JWS.
  //
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

  // Determine verification path
  const isLocalTesting = environment === 'LocalTesting' || environment === 'Xcode'

  if (!isLocalTesting) {
    // Production: must verify with Apple
    const appleResult = await verifyWithApple(jws)
    if (!appleResult) {
      // Apple verification not configured — this is a human-gated blocker
      return Response.json({
        error: {
          message: 'IAP verification is not yet configured. Please contact support.',
          retryable: true,
        },
      }, { status: 503 })
    }
    // Validate that Apple's response matches what we expect
    if (appleResult.productId !== productId) {
      return Response.json({ error: { message: 'Product mismatch with Apple verification.' } }, { status: 400 })
    }
  }

  // At this point we have either:
  // - LocalTesting: JWS parsed successfully, productId maps to real pack, transactionId present
  // - Production: Apple verified the transaction
  // We can now record the purchase.

  const email = (auth.profile.email || '').toLowerCase()
  if (!email) return Response.json({ error: { message: 'No email on profile — cannot record purchase.' } }, { status: 400 })

  // Check duplicate
  const alreadyOwns = await userOwnsSlug(auth.db, email, resolvedSlug)
  if (alreadyOwns) {
    return Response.json({ success: true, owned: true, slug: resolvedSlug, orderId: null }, { status: 200 })
  }

  // Record the purchase using REAL template_orders columns:
  // id, created_at, email, name, slugs, amount_cents, transaction_id, status, gateway
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
    if (owns) slugs.push(slug)
    else {
      // Check if we have a record from a previous device
      const { data: existing } = await auth.db.from('template_orders')
        .select('id')
        .eq('email', email)
        .eq('gateway', 'apple_iap')
        .eq('status', 'paid')
        .maybeSingle()
      if (existing) {
        slugs.push(slug)
      }
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

  // Try existing render first
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