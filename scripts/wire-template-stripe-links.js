const fs = require('fs')

const outputPath = 'catalogue/stripe_payment_links_output.json'
const output = JSON.parse(fs.readFileSync(outputPath, 'utf8'))
const bySlug = new Map(output.map((row) => [row.slug, row]))

const jsonTargets = [
  'catalogue/yousafe_catalogue_products.json',
  '/Users/phantomdarne/Documents/GitHub/yousafe-consultancy/checkout/catalogue/yousafe_catalogue_products.json',
]

for (const target of jsonTargets) {
  if (!fs.existsSync(target)) continue
  const items = JSON.parse(fs.readFileSync(target, 'utf8'))
  const merged = items.map((item) => {
    const link = bySlug.get(item.slug)
    if (!link) return item
    return {
      ...item,
      product_type: 'template',
      stripe_product_id: link.stripe_product_id,
      stripe_price_id_usd: link.stripe_price_id_usd,
      stripe_payment_link_id: link.stripe_payment_link_id,
      stripe_payment_link_usd: link.stripe_payment_link_usd,
      stripe_price_id_cad: link.stripe_price_id_cad || '',
      stripe_payment_link_cad: link.stripe_payment_link_cad || '',
    }
  })
  fs.writeFileSync(target, `${JSON.stringify(merged, null, 2)}\n`)
  console.log(`updated json ${target} (${merged.length})`)
}

const htmlPath = 'catalogue/yousafe_catalogue_cards.html'
if (fs.existsSync(htmlPath)) {
  let html = fs.readFileSync(htmlPath, 'utf8')
  for (const row of output) {
    html = html.split(row.placeholder_label).join(row.stripe_payment_link_usd)
  }
  fs.writeFileSync(htmlPath, html)
  console.log(`updated html ${htmlPath}`)
}

const products = JSON.parse(fs.readFileSync('catalogue/yousafe_catalogue_products.json', 'utf8'))
const headers = [
  'slug',
  'name',
  'category',
  'badge',
  'price_usd',
  'placeholder_label',
  'short_description',
  'includes',
  'official_sources',
  'delivery_file',
  'stripe_product_id',
  'stripe_price_id_usd',
  'stripe_payment_link_id',
  'stripe_payment_link_usd',
  'stripe_price_id_cad',
  'stripe_payment_link_cad',
]

function csvEscape(value) {
  const text = Array.isArray(value) ? value.join(' | ') : String(value ?? '')
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

const csv = [
  headers.join(','),
  ...products.map((product) => headers.map((header) => csvEscape(product[header])).join(',')),
].join('\n')
fs.writeFileSync('catalogue/yousafe_catalogue_products.csv', `${csv}\n`)
console.log('updated csv catalogue/yousafe_catalogue_products.csv')

const sqlPath = 'supabase/templates_catalogue.sql'
let sql = fs.readFileSync(sqlPath, 'utf8')
const markerStart = '-- Stripe payment links generated from catalogue/stripe_payment_links_output.json.'
const markerEnd = '-- End generated Stripe payment links.'

function sqlValue(value) {
  if (value == null || value === '') return 'null'
  return `'${String(value).replace(/'/g, "''")}'`
}

const values = output
  .map((row) => {
    return `  (${[
      row.slug,
      row.stripe_product_id,
      row.stripe_price_id_usd,
      row.stripe_payment_link_usd,
      row.stripe_price_id_cad,
      row.stripe_payment_link_cad,
    ].map(sqlValue).join(', ')})`
  })
  .join(',\n')

const block = `${markerStart}
update services
set stripe_product_id = data.stripe_product_id,
    stripe_price_id_usd = data.stripe_price_id_usd,
    stripe_payment_link_usd = data.stripe_payment_link_usd,
    stripe_payment_link_url = data.stripe_payment_link_usd,
    stripe_price_id_cad = data.stripe_price_id_cad,
    stripe_payment_link_cad = data.stripe_payment_link_cad
from (
  values
${values}
) as data(slug, stripe_product_id, stripe_price_id_usd, stripe_payment_link_usd, stripe_price_id_cad, stripe_payment_link_cad)
where services.product_type = 'template'
  and services.slug = data.slug;
${markerEnd}
`

if (sql.includes(markerStart) && sql.includes(markerEnd)) {
  const before = sql.slice(0, sql.indexOf(markerStart))
  const after = sql.slice(sql.indexOf(markerEnd) + markerEnd.length).replace(/^\n?/, '')
  sql = before + block + after
} else {
  sql = `${sql.trimEnd()}\n\n${block}`
}

fs.writeFileSync(sqlPath, sql)
console.log(`updated sql ${sqlPath}`)
