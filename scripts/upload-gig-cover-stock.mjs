#!/usr/bin/env node
/**
 * Upload the committed stock gig covers (data/gig-cover-stock/<date>/) to the
 * public `gig-gallery` Storage bucket, at the same object layout the gig
 * builder uses: <provider_id>/<gig_id>/<uuid>-<name>.webp.
 *
 * STORAGE ONLY. This script never writes the gigs table; the gallery_images
 * update is a separate, reviewed DB change. Idempotent (upsert) and verified:
 * each object must be publicly fetchable as image/webp with the exact size.
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = 'data/gig-cover-stock'
const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_JWT || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
if (!supabaseUrl || !serviceKey) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or Supabase service key')

const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
const UUIDISH = /^[0-9a-f-]{36}$/

let failures = 0
for (const dir of readdirSync(ROOT).sort()) {
  const manifest = JSON.parse(readFileSync(join(ROOT, dir, 'manifest.json'), 'utf8'))
  const bucket = manifest.bucket
  if (bucket !== 'gig-gallery') throw new Error(`${dir}: unexpected bucket ${bucket}`)
  for (const c of manifest.covers) {
    const expectedPath = `${c.provider_id}/${c.gig_id}/${c.file}`
    if (!UUIDISH.test(c.provider_id) || !UUIDISH.test(c.gig_id) || c.path !== expectedPath || !/^[0-9a-f-]{36}-stock-cover\.webp$/.test(c.file)) {
      throw new Error(`${dir}: bad manifest entry for ${c.slug}`)
    }
    const buf = readFileSync(join(ROOT, dir, c.file))
    if (buf.length !== c.size || buf.length > 160_000) throw new Error(`${c.slug}: size mismatch or too large (${buf.length})`)
    const up = await sb.storage.from(bucket).upload(c.path, buf, {
      contentType: 'image/webp',
      cacheControl: '31536000',
      upsert: true,
    })
    if (up.error) {
      failures++
      console.error(`FAIL upload ${c.slug}: ${up.error.message}`)
      continue
    }
    const publicUrl = `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/${bucket}/${c.path}`
    const res = await fetch(publicUrl, { cache: 'no-store' })
    const body = Buffer.from(await res.arrayBuffer())
    const ok = res.ok && /image\/webp/.test(res.headers.get('content-type') || '') && body.length === c.size
    if (!ok) failures++
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${c.slug} ${res.status} ${res.headers.get('content-type')} ${body.length}B ${publicUrl}`)
  }
}
if (failures) {
  console.error(`${failures} cover(s) failed`)
  process.exit(1)
}
