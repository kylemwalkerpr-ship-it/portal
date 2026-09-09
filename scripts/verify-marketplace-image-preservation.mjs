import { createClient } from '@supabase/supabase-js'

const EXPECTED_GIGS = 217
const PRE_GIG_TAG = 'Pre-Fiverr-grade marketplace copy rewrite snapshot 2026-09-09'

const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_JWT || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()

if (!supabaseUrl || !serviceKey) {
  throw new Error('Missing Supabase production credentials for Marketplace image verification')
}

const db = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]))
  }
  return value
}

function sameJson(a, b) {
  return JSON.stringify(stable(a ?? [])) === JSON.stringify(stable(b ?? []))
}

const { data: gigs, error: gigError } = await db
  .from('gigs')
  .select('id,slug,gallery_images')
  .eq('status', 'active')
  .order('id')
if (gigError) throw gigError

const { data: snapshots, error: snapshotError } = await db
  .from('gig_version_history')
  .select('gig_id,snapshot')
  .eq('change_summary', PRE_GIG_TAG)
if (snapshotError) throw snapshotError

if ((gigs || []).length !== EXPECTED_GIGS) {
  throw new Error(`Image gate expected ${EXPECTED_GIGS} active gigs, got ${(gigs || []).length}`)
}
if ((snapshots || []).length !== EXPECTED_GIGS) {
  throw new Error(`Image gate expected ${EXPECTED_GIGS} pre-rewrite snapshots, got ${(snapshots || []).length}`)
}

const snapshotByGig = new Map((snapshots || []).map((row) => [row.gig_id, row.snapshot || {}]))
const problems = []
let imageCount = 0

for (const gig of gigs || []) {
  const before = snapshotByGig.get(gig.id)
  if (!before) {
    problems.push(`${gig.id}:missing snapshot`)
    continue
  }
  const currentImages = Array.isArray(gig.gallery_images) ? gig.gallery_images : []
  const snapshotImages = Array.isArray(before.gallery_images) ? before.gallery_images : []
  imageCount += currentImages.length
  if (!currentImages.length) problems.push(`${gig.id}:no current image`)
  if (!snapshotImages.length) problems.push(`${gig.id}:snapshot had no image`)
  if (!sameJson(currentImages, snapshotImages)) problems.push(`${gig.id}:gallery_images changed`)
}

if (problems.length) {
  throw new Error(`Marketplace image preservation failed (${problems.length}): ${problems.slice(0, 20).join(' | ')}`)
}

console.log('[marketplace-copy] IMAGE PRESERVATION PASS', {
  active_gigs: gigs.length,
  gigs_with_preserved_images: gigs.length,
  total_gallery_images: imageCount,
  image_mismatches: 0,
})
