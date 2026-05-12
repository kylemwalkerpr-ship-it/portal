require('dotenv').config({ path: '.env.local' })
require('dotenv').config()

const fs = require('fs')
const { createClient } = require('@supabase/supabase-js')

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceRoleKey) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
}

const db = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const rows = JSON.parse(fs.readFileSync('catalogue/stripe_payment_links_output.json', 'utf8'))

async function main() {
  const results = []
  for (const row of rows) {
    const payload = {
      stripe_product_id: row.stripe_product_id || null,
      stripe_price_id_usd: row.stripe_price_id_usd || null,
      stripe_payment_link_usd: row.stripe_payment_link_usd || null,
      stripe_payment_link_url: row.stripe_payment_link_usd || null,
      stripe_price_id_cad: row.stripe_price_id_cad || null,
      stripe_payment_link_cad: row.stripe_payment_link_cad || null,
    }

    const { data, error } = await db
      .from('services')
      .update(payload)
      .eq('product_type', 'template')
      .eq('slug', row.slug)
      .select('slug, stripe_payment_link_usd')
      .single()

    if (error) {
      results.push({ slug: row.slug, ok: false, error: error.message })
    } else {
      results.push({ slug: data.slug, ok: true })
    }
  }

  const failed = results.filter((result) => !result.ok)
  console.log(JSON.stringify({
    updated: results.length - failed.length,
    failed: failed.length,
    failures: failed,
  }, null, 2))

  if (failed.length) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
