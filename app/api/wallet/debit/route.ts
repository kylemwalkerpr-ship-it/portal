/**
 * POST /api/wallet/debit
 * Purchase catalogue items by debiting wallet balance.
 *
 * Body:
 *   { items: [{ slug?, serviceId?, quantity }], saveToAccount?: boolean }
 *
 * Server resolves prices from authoritative sources (template catalogue or
 * services table). Never trusts client-supplied prices.
 *
 * FIXED: Wallet is now debited AFTER all DB writes succeed, not before.
 * Previously the debit happened first, so if an order insert or PDF
 * generation failed, the user's money was taken with no order record.
 */
import { getCurrentStudent } from '@/lib/student'
import { debit, getOrCreateWallet } from '@/lib/wallet'
import { getTemplatePack, getTemplatePackPriceCents } from '@/lib/template-packs'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { randomUUID } from 'crypto'
import { generateTemplatePdf, buildPrefill } from '@/lib/pdfGenerator'
import { getManifest } from '@/lib/templatePdfManifests'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: Request) {
  const auth = await getCurrentStudent()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  // Capture raw body for diagnostic logging on 400 errors
  let body: Record<string, unknown>
  let rawBodyText = ''
  try {
    // Clone so we can read for logging if parsing succeeds
    const cloned = req.clone ? req.clone() : req
    rawBodyText = await cloned.text()
    body = JSON.parse(rawBodyText)
  } catch {
    console.error('[wallet/debit/400] Invalid JSON body', {
      raw: rawBodyText.slice(0, 2000),
      userAgent: req.headers.get('user-agent')?.slice(0, 120),
      referer: req.headers.get('referer')?.slice(0, 200),
    })
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const rawItems = Array.isArray(body.items) ? body.items : []
  if (rawItems.length === 0) {
    console.error('[wallet/debit/400] Empty cart', {
      body: rawBodyText.slice(0, 2000),
      allKeys: Object.keys(body),
      profileId: 'error' in auth ? 'unauth' : auth.profile.id,
      userAgent: req.headers.get('user-agent')?.slice(0, 120),
      referer: req.headers.get('referer')?.slice(0, 200),
    })
    return Response.json({ error: 'Cart is empty' }, { status: 400 })
  }

  // ── 1. Resolve and validate every item server-side ─────────────────
  const db = createSupabaseAdminClient()
  let totalCents = 0
  const templateItems: { slug: string; name: string; quantity: number; unitCents: number }[] = []
  const serviceItems: { serviceId: string; name: string; quantity: number; unitCents: number }[] = []
  const deferredServiceIds: string[] = []

  for (const raw of rawItems) {
    const qty = Math.max(1, Math.floor(Number(raw?.quantity) || 1))

    // Try template pack first. The client sends `slug: cart.slug || cart.id`,
    // so this may be a services-row UUID when the row's slug was blank — resolve
    // it back to the catalogue slug before giving up.
    let slug = typeof raw?.slug === 'string' ? raw.slug : ''
    if (slug && !getTemplatePack(slug) && UUID_RE.test(slug)) {
      const { data: svcRow } = await db.from('services').select('slug').eq('id', slug).maybeSingle()
      if (svcRow?.slug && getTemplatePack(svcRow.slug)) slug = svcRow.slug
    }
    if (slug) {
      const pack = getTemplatePack(slug)
      if (pack) {
        const unitCents = getTemplatePackPriceCents(slug)!
        totalCents += unitCents * qty
        templateItems.push({ slug, name: pack.name, quantity: qty, unitCents })
        continue
      }
    }

    // Try service
    const serviceId = typeof raw?.serviceId === 'string' ? raw.serviceId : ''
    if (serviceId) {
      deferredServiceIds.push(serviceId)
      serviceItems.push({ serviceId, name: '', quantity: qty, unitCents: 0 })
      continue
    }

    console.error('[wallet/debit/400] Invalid item', {
      raw: typeof raw === 'object' && raw !== null ? JSON.stringify(raw).slice(0, 500) : String(raw).slice(0, 200),
      body: rawBodyText.slice(0, 2000),
      profileId: auth.profile.id,
      referer: req.headers.get('referer')?.slice(0, 200),
    })
    return Response.json({ error: 'Invalid cart item: missing slug or serviceId' }, { status: 400 })
  }

  // Batch-resolve deferred services
  if (deferredServiceIds.length > 0) {
    const { data: services, error: svcErr } = await db
      .from('services')
      .select('id, title, price, usd_price')
      .in('id', deferredServiceIds)
      .eq('is_active', true)

    if (svcErr) {
      return Response.json({ error: `Service lookup failed: ${svcErr.message}` }, { status: 500 })
    }

    const serviceMap = new Map((services ?? []).map((s: any) => [s.id, s]))

    for (const item of serviceItems) {
      const svc = serviceMap.get(item.serviceId)
      if (!svc) {
        console.error('[wallet/debit/400] Unknown service', {
          serviceId: item.serviceId,
          knownIds: Array.from(serviceMap.keys()),
          body: rawBodyText.slice(0, 2000),
          profileId: auth.profile.id,
        })
        return Response.json({ error: `Unknown or inactive service: ${item.serviceId}` }, { status: 400 })
      }
      const priceUsd = Number(svc.usd_price ?? svc.price ?? 0)
      item.name = svc.title
      item.unitCents = Math.round(priceUsd * 100)
      totalCents += item.unitCents * item.quantity
    }
  }

  if (totalCents <= 0) {
    console.error('[wallet/debit/400] Zero total', {
      totalCents,
      templateItems: templateItems.map(i => ({ slug: i.slug, name: i.name, qty: i.quantity, unitCents: i.unitCents })),
      serviceItems: serviceItems.map(i => ({ serviceId: i.serviceId, qty: i.quantity })),
      body: rawBodyText.slice(0, 2000),
      profileId: auth.profile.id,
    })
    return Response.json({ error: 'Total must be greater than zero' }, { status: 400 })
  }

  const profile = auth.profile

  try {
    // ── 2. Check wallet balance (but do NOT debit yet) ────────────────
    const wallet = await getOrCreateWallet(profile.id)
    if (wallet.balance_cents < totalCents) {
      return Response.json(
        {
          error: 'Insufficient wallet balance',
          balanceCents: wallet.balance_cents,
          requiredCents: totalCents,
        },
        { status: 402 }
      )
    }

    // ── 3. Record template orders FIRST (before debit) ────────────────
    const pdfWarnings: string[] = []
    let templateOrderId: string | null = null
    if (templateItems.length > 0) {
      templateOrderId = randomUUID()
      const { error: tplErr } = await db.from('template_orders').insert({
        id: templateOrderId,
        email: profile.email || '',
        name: profile.full_name || '',
        slugs: templateItems.map((v) => v.slug),
        amount_cents: templateItems.reduce((sum, i) => sum + i.unitCents * i.quantity, 0),
        status: 'pending', // Will be updated to 'paid' after debit
        transaction_id: null,
      })
      if (tplErr) {
        return Response.json({ error: `Failed to record template order: ${tplErr.message}` }, { status: 500 })
      }
    }

    // ── 4. Record service orders (before debit) ──────────────────────
    let serviceOrderId: string | null = null
    if (serviceItems.length > 0) {
      serviceOrderId = `svc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      const { error: orderErr } = await db.from('orders').insert({
        id: serviceOrderId,
        client_id: profile.id,
        status: 'pending',
        total_cents: serviceItems.reduce((sum, i) => sum + i.unitCents * i.quantity, 0),
        currency: 'usd',
        payment_method: 'wallet',
        transaction_id: null,
        created_at: new Date().toISOString(),
      })
      if (orderErr) {
        // Roll back template order if service order fails
        if (templateOrderId) {
          await db.from('template_orders').delete().eq('id', templateOrderId)
        }
        return Response.json({ error: `Failed to record service order: ${orderErr.message}` }, { status: 500 })
      }

      if (serviceItems.length > 0) {
        const orderItemRows = serviceItems.map((i) => ({
          order_id: serviceOrderId!,
          service_id: i.serviceId,
          quantity: i.quantity,
          unit_price: i.unitCents,
        }))
        const { error: itemsErr } = await db.from('order_items').insert(orderItemRows)
        if (itemsErr) {
          // Roll back
          await db.from('orders').delete().eq('id', serviceOrderId!)
          if (templateOrderId) {
            await db.from('template_orders').delete().eq('id', templateOrderId)
          }
          return Response.json({ error: `Failed to record order items: ${itemsErr.message}` }, { status: 500 })
        }
      }
    }

    // ── 5. DEBIT WALLET — this is the LAST step ──────────────────────
    const allNames = [
      ...templateItems.map((v) => v.name),
      ...serviceItems.map((v) => v.name),
    ]
    const tx = await debit(
      profile.id,
      totalCents,
      `Purchase: ${allNames.join(', ')}`,
      undefined,
      {
        slugs: templateItems.map((v) => v.slug),
        serviceIds: serviceItems.map((v) => v.serviceId),
        templateItems,
        serviceItems,
      }
    )

    // ── 6. Update orders with transaction ID + status ────────────────
    if (templateOrderId) {
      await db.from('template_orders').update({
        status: 'paid',
        transaction_id: tx.id,
      }).eq('id', templateOrderId)
    }
    if (serviceOrderId) {
      await db.from('orders').update({
        transaction_id: tx.id,
      }).eq('id', serviceOrderId)
    }

    // ── 7. Best-effort: generate filled PDFs (non-fatal if fails) ────
    if (templateOrderId && templateItems.length > 0) {
      for (const item of templateItems) {
        try {
          const manifest = getManifest(item.slug)
          if (!manifest) {
            pdfWarnings.push(`No manifest for ${item.slug}`)
            continue
          }
          const pack = getTemplatePack(item.slug)
          const prefill = buildPrefill({
            userFullName: profile.full_name || '',
            userEmail: profile.email || '',
            orderId: templateOrderId,
            templateName: pack?.name || item.name,
            templateBadge: pack?.badge || '',
          })
          const pdfBytes = await generateTemplatePdf({
            manifest,
            prefillValues: prefill,
            meta: {
              templateName: pack?.name || item.name,
              templateBadge: pack?.badge,
              templateDescription: pack?.short_description,
              keywords: pack?.includes,
              userFullName: profile.full_name || '',
              userEmail: profile.email || '',
              orderId: templateOrderId,
              generationDate: new Date(),
            },
          })
          const storagePath = `templates-generated/${profile.id}/${item.slug}/${templateOrderId}.pdf`
          const { error: upErr } = await db.storage
            .from('templates')
            .upload(storagePath, pdfBytes, {
              contentType: 'application/pdf',
              upsert: true,
            })
          if (upErr) {
            pdfWarnings.push(`Upload failed for ${item.slug}: ${upErr.message}`)
            continue
          }
          const { error: renderErr } = await db.from('template_pdf_renders').insert({
            id: randomUUID(),
            profile_id: profile.id,
            slug: item.slug,
            order_id: templateOrderId,
            transaction_id: tx.id,
            storage_bucket: 'templates',
            storage_path: storagePath,
            size_bytes: pdfBytes.byteLength,
          })
          if (renderErr) {
            pdfWarnings.push(`Render row failed for ${item.slug}: ${renderErr.message}`)
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'PDF generation failed'
          pdfWarnings.push(`PDF for ${item.slug}: ${msg}`)
          console.error('[wallet/debit] pdf gen', item.slug, msg)
        }
      }
    }

    return Response.json({
      ok: true,
      orderId: templateOrderId ?? serviceOrderId ?? randomUUID(),
      status: 'paid',
      totalCents,
      balanceCents: tx.balance_after_cents,
      ledgerId: tx.id,
      pdfWarnings: pdfWarnings.length ? pdfWarnings : undefined,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Debit failed'
    console.error('[wallet/debit]', msg)
    return Response.json({ error: msg }, { status: 500 })
  }
}
