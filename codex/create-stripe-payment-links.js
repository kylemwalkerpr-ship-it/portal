/*
  YouSafe Catalogue Stripe Payment Link Generator

  Usage:
    npm install
    STRIPE_SECRET_KEY=sk_test_xxx node codex/create-stripe-payment-links.js catalogue/stripe_products_input.csv

  Outputs:
    catalogue/stripe_payment_links_output.json
    catalogue/stripe_payment_links_output.csv
*/

require('dotenv').config({ path: '.env.local' });
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const Stripe = require('stripe');

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
if (!stripeSecretKey) {
  throw new Error('Missing STRIPE_SECRET_KEY. Add it to .env or environment variables.');
}

const stripe = new Stripe(stripeSecretKey);
const inputPath = process.argv[2] || 'catalogue/stripe_products_input.csv';
const raw = fs.readFileSync(inputPath, 'utf8');
const rows = parseCsv(raw);

const runVersion = process.env.STRIPE_RUN_VERSION || '2026-05-11-v1';
const successBase = process.env.YOUSAFE_SUCCESS_URL_BASE || 'https://yousafeconsultancy.com/order-success';
const cancelUrl = process.env.YOUSAFE_CANCEL_URL || 'https://checkout.yousafeconsultancy.com/services';

function csvEscape(value) {
  const s = String(value ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function parseCsv(text) {
  const records = [];
  let row = [];
  let value = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        value += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        value += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(value);
      value = '';
    } else if (ch === '\n') {
      row.push(value);
      records.push(row);
      row = [];
      value = '';
    } else if (ch !== '\r') {
      value += ch;
    }
  }
  if (value || row.length) {
    row.push(value);
    records.push(row);
  }

  const [headers, ...body] = records.filter(r => r.some(cell => String(cell).trim() !== ''));
  if (!headers) return [];
  return body.map(record => Object.fromEntries(headers.map((header, index) => [header, record[index] ?? ''])));
}

async function main() {
  const output = [];

  for (const row of rows) {
    const slug = row.slug;
    const unitAmount = Number(row.unit_amount);
    if (!slug || !row.name || !row.currency || !Number.isInteger(unitAmount)) {
      throw new Error(`Invalid row for slug=${slug}: expected slug, name, currency, integer unit_amount.`);
    }

    const metadata = {
      slug,
      catalogue_product_type: row.product_type || 'template',
      category: row.metadata_category || row.category || 'Templates',
      delivery_file: row.metadata_delivery_file || '',
      business: 'YouSafe Consultancy',
      product_type: 'digital_template_pack',
      stripe_run_version: runVersion,
    };

    const product = await stripe.products.create({
      name: row.name,
      description: row.description,
      metadata,
    }, { idempotencyKey: `yousafe-product-${slug}-${runVersion}` });

    const price = await stripe.prices.create({
      product: product.id,
      currency: row.currency,
      unit_amount: unitAmount,
      metadata,
    }, { idempotencyKey: `yousafe-price-${slug}-${unitAmount}-${row.currency}-${runVersion}` });

    const paymentLink = await stripe.paymentLinks.create({
      line_items: [{ price: price.id, quantity: 1 }],
      metadata,
      after_completion: {
        type: 'redirect',
        redirect: {
          url: `${successBase}?product=${encodeURIComponent(slug)}&session_id={CHECKOUT_SESSION_ID}`,
        },
      },
      inactive_message: 'This YouSafe template pack is not currently available. Please contact support.',
    }, { idempotencyKey: `yousafe-payment-link-${slug}-${runVersion}` });

    output.push({
      slug,
      name: row.name,
      product_type: 'template',
      category: 'Templates',
      template_type: row.category,
      currency: row.currency,
      unit_amount: unitAmount,
      price_usd: row.price_usd,
      stripe_product_id: product.id,
      stripe_price_id: price.id,
      stripe_price_id_usd: row.currency === 'usd' ? price.id : '',
      stripe_price_id_cad: row.currency === 'cad' ? price.id : '',
      stripe_payment_link_id: paymentLink.id,
      stripe_payment_link_url: paymentLink.url,
      stripe_payment_link_usd: row.currency === 'usd' ? paymentLink.url : '',
      stripe_payment_link_cad: row.currency === 'cad' ? paymentLink.url : '',
      placeholder_label: `{{stripe_payment_link_${slug.replace(/-/g, '_')}}}`,
    });

    console.log(`Created: ${slug} -> ${paymentLink.url}`);
  }

  const outJsonPath = path.join('catalogue', 'stripe_payment_links_output.json');
  const outCsvPath = path.join('catalogue', 'stripe_payment_links_output.csv');
  fs.writeFileSync(outJsonPath, JSON.stringify(output, null, 2));

  const headers = Object.keys(output[0] || { slug: '', stripe_payment_link_url: '' });
  const csv = [headers.join(','), ...output.map(row => headers.map(h => csvEscape(row[h])).join(','))].join('\n');
  fs.writeFileSync(outCsvPath, csv);

  console.log(`\nSaved ${outJsonPath}`);
  console.log(`Saved ${outCsvPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
