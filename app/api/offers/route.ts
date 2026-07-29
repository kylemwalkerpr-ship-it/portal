import { ok, fail, fieldFail } from '@/lib/apiEnvelope'
import { CPU_TIMEOUT_REGEX } from '@/lib/cpuTimeout'
import { computeNetPayoutCents, computePlatformFeeCents, getPaymentSettingsForApi, normalizeRevision, toCents } from '@/lib/fiverr'
import { requirePortalUser } from '@/lib/portalAuth'

const MAX_FILES = 5
const MAX_FILE_BYTES = 20 * 1024 * 1024

function text(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

async function bodyFromRequest(req: Request) {
  const contentType = req.headers.get('content-type') || ''
  if (!contentType.includes('multipart/form-data')) {
    return { body: await req.json().catch(() => ({})) as Record<string, any>, files: [] as File[] }
  }
  const form = await req.formData()
  const body: Record<string, any> = {}
  for (const [key, value] of form.entries()) {
    if (key !== 'files[]' && !(value instanceof File)) body[key] = value
  }
  return {
    body,
    files: form.getAll('files[]').filter((f): f is File => f instanceof File && f.size > 0),
  }
}

async function resolveProvider(auth: any) {
  if (auth.role === 'attorney') {
    const { data } = await auth.db
      .from('attorneys')
      .select('id')
      .eq('profile_id', auth.profileId)
      .maybeSingle()
    return data ? { type: 'attorney' as const, record: data } : null
  }

  if (auth.role === 'consultant') {
    const attempts = [
      ['profile_id', auth.profileId],
      ['user_id', auth.profileId],
      ['email', auth.profile.email],
    ].filter(([, value]) => value)
    for (const [column, value] of attempts) {
      const { data } = await auth.db
        .from('consultants')
        .select('id')
        .eq(column, value)
        .maybeSingle()
      if (data) return { type: 'consultant' as const, record: data }
    }
  }

  return null
}

async function resolveChat(auth: any, senderType: 'attorney' | 'consultant', providerId: string, chatId: string, recipientId?: string) {
  if (senderType === 'attorney') {
    const { data: chat } = await auth.db
      .from('inquiries')
      .select('id, client_profile_id, claimed_by_attorney_id, target_attorney_profile_id, status')
      .eq('id', chatId)
      .single()
    if (!chat) return { error: 'Chat not found.', status: 404 as const }
    if (chat.target_attorney_profile_id && chat.target_attorney_profile_id !== auth.profileId) {
      return { error: 'Forbidden.', status: 403 as const }
    }
    if (chat.claimed_by_attorney_id && chat.claimed_by_attorney_id !== providerId) {
      return { error: 'Forbidden.', status: 403 as const }
    }
    const resolvedRecipient = recipientId || chat.client_profile_id
    if (!resolvedRecipient) return { error: 'Recipient profile is required.', status: 422 as const }
    return { recipientId: resolvedRecipient }
  }

  const { data: order } = await auth.db
    .from('orders')
    .select('id, client_id, consultant_id, status')
    .eq('id', chatId)
    .single()
  if (!order) return { error: 'Chat not found.', status: 404 as const }
  if (order.consultant_id !== auth.profileId) return { error: 'Forbidden.', status: 403 as const }
  return { recipientId: recipientId || order.client_id }
}

export async function GET(req: Request) {
  // ── abort guard: client disconnect → fast 499 ──
  if (req.signal.aborted) {
    return Response.json({ error: 'Request cancelled by client' }, { status: 499 })
  }
  const abortHandler = () => { /* no-op */ }
  req.signal.addEventListener('abort', abortHandler)

  try {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)

  const { searchParams } = new URL(req.url)
  const statusFilter = searchParams.get('status') || ''

  let qb = auth.db
    .from('offers')
    .select('*')
    .eq('recipient_id', auth.profileId)
    .order('created_at', { ascending: false })

  if (statusFilter) {
    qb = qb.eq('status', statusFilter)
  }

  const { data: offers, error } = await qb

  if (error) return fail(error.message, 500)
  const status = 200
  return ok({ offers: offers ?? [] }, { status })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const isCpuTimeout = CPU_TIMEOUT_REGEX.test(message)
    return fail(message, isCpuTimeout ? 503 : 500)
  } finally {
    req.signal.removeEventListener('abort', abortHandler)
  }
}

export async function POST(req: Request) {
  // ── abort guard: client disconnect → fast 499 ──
  if (req.signal.aborted) {
    return Response.json({ error: 'Request cancelled by client' }, { status: 499 })
  }
  const postAbortHandler = () => { /* no-op */ }
  req.signal.addEventListener('abort', postAbortHandler)

  try {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  if (!['attorney', 'consultant'].includes(auth.role)) return fail('Only attorneys and consultants can create offers.', 403)

  const { body, files } = await bodyFromRequest(req)
  const provider = await resolveProvider(auth)
  if (!provider) return fail('Provider record not found.', 404)

  const settings = await getPaymentSettingsForApi()
  const fields: Record<string, string> = {}
  const title = text(body.title, 120)
  const description = text(body.description, 1200)
  const price = toCents(body.price)
  const discountedPrice = body.discounted_price === undefined || body.discounted_price === ''
    ? null
    : toCents(body.discounted_price)
  const deliveryDays = Number(body.delivery_days)
  const revisions = normalizeRevision(body.revisions ?? body.revision_count ?? 1)
  const chatId = text(body.chat_id, 80)
  const recipientId = text(body.recipient_id, 80)
  const gigId = text(body.gig_id, 80) || null
  const expiresAt = new Date(String(body.expires_at || ''))

  if (title.length < 10) fields.title = 'Title must be at least 10 characters.'
  if (description.length < 30) fields.description = 'Description must be at least 30 characters.'
  if (!Number.isInteger(price) || price < settings.minimum_offer_amount_cents) fields.price = `Price must be at least ${settings.minimum_offer_amount_cents} cents.`
  if (Number.isInteger(price) && price > settings.maximum_offer_amount_cents) fields.price = `Price cannot exceed ${settings.maximum_offer_amount_cents} cents.`
  if (discountedPrice !== null && (!Number.isInteger(discountedPrice) || discountedPrice >= price || discountedPrice < settings.minimum_offer_amount_cents)) {
    fields.discounted_price = 'Discounted price must be lower than price and within admin limits.'
  }
  if (!Number.isInteger(deliveryDays) || deliveryDays < 1) fields.delivery_days = 'Delivery days must be a positive integer.'
  if (!Number.isInteger(revisions) || revisions < 0) fields.revisions = 'Revisions must be zero or more.'
  if (!chatId) fields.chat_id = 'Chat id is required.'
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) fields.expires_at = 'Expiry must be a future UTC timestamp.'
  if (files.length > MAX_FILES) fields.files = 'Maximum 5 files.'
  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) fields.files = 'Each file must be 20 MB or less.'
  }
  if (Object.keys(fields).length) return fieldFail(fields)

  const chat = await resolveChat(auth, provider.type, provider.record.id, chatId, recipientId)
  if ('error' in chat) return fail(chat.error, chat.status)

  const effectivePrice = discountedPrice ?? price
  const platformFee = computePlatformFeeCents(effectivePrice, provider.type, settings)
  const netPayout = computeNetPayoutCents(effectivePrice, provider.type, settings)

  const { data: offer, error } = await auth.db
    .from('offers')
    .insert({
      chat_id: chatId,
      sender_id: auth.profileId,
      sender_type: provider.type,
      recipient_id: chat.recipientId,
      title,
      description,
      price,
      discounted_price: discountedPrice,
      currency: settings.primary_currency,
      delivery_days: deliveryDays,
      revisions,
      expires_at: expiresAt.toISOString(),
      gig_id: gigId,
    })
    .select('*')
    .single()

  if (error || !offer) return fail(error?.message || 'Could not create offer.', 500)

  const fileRows = []
  for (const file of files) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._ -]+/g, '').trim().slice(0, 120) || 'attachment'
    const path = `${auth.profileId}/${offer.id}/${crypto.randomUUID()}-${safeName}`
    const upload = await auth.db.storage.from('offer-attachments').upload(path, await file.arrayBuffer(), {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    })
    if (!upload.error) {
      fileRows.push({ offer_id: offer.id, file_url: path, file_name: safeName, file_size: file.size, mime_type: file.type || null })
    }
  }
  const urls = Array.isArray(body.file_urls) ? body.file_urls : typeof body.file_urls === 'string' ? [body.file_urls] : []
  for (const url of urls) {
    if (typeof url === 'string' && url.trim()) {
      fileRows.push({ offer_id: offer.id, file_url: url.trim(), file_name: url.split('/').pop() || 'attachment', file_size: 0 })
    }
  }
  if (fileRows.length) await auth.db.from('offer_files').insert(fileRows)

  const messageBody = `Custom offer: ${title}`
  if (provider.type === 'attorney') {
    await auth.db.from('inquiry_messages').insert({ inquiry_id: chatId, sender_role: 'system', sender_profile_id: auth.profileId, body: messageBody })
  } else {
    await auth.db.from('order_messages').insert({ order_id: chatId, sender_id: auth.profileId, sender_role: 'system', body: messageBody })
  }

  return ok(
    {
      offer_id: offer.id,
      status: offer.status,
      offer_card_html_or_json: {
        ...offer,
        platform_fee: platformFee,
        net_payout: netPayout,
        recipient_id: chat.recipientId,
      },
    },
    { status: 201 },
  )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const isCpuTimeout = CPU_TIMEOUT_REGEX.test(message)
    return fail(message, isCpuTimeout ? 503 : 500)
  } finally {
    req.signal.removeEventListener('abort', postAbortHandler)
  }
}
