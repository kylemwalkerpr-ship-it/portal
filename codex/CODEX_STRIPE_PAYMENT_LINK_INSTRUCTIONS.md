# Codex Task: Generate Stripe Payment Links for YouSafe Catalogue

## Goal

Use the CSV at `catalogue/stripe_products_input.csv` to create Stripe Products, Prices, and Payment Links for all YouSafe digital template packs. Then output a JSON and CSV mapping each product slug to its Stripe product ID, price ID, and payment link URL.

## Constraints

1. Use Stripe **test mode first**.
2. Do not hardcode secret keys. Read `STRIPE_SECRET_KEY` from `.env` or environment variables.
3. Use `usd` as the first catalogue currency unless the business decides otherwise.
4. Add metadata to every Product, Price, and Payment Link:
   - `slug`
   - `category`
   - `delivery_file`
   - `business=YouSafe Consultancy`
   - `product_type=digital_template_pack`
5. Use a success URL pattern:
   - `https://yousafeconsultancy.com/order-success?product=<slug>&session_id={CHECKOUT_SESSION_ID}`
6. Use a cancel URL:
   - `https://checkout.yousafeconsultancy.com/services`
7. Save output files to:
   - `catalogue/stripe_payment_links_output.json`
   - `catalogue/stripe_payment_links_output.csv`
8. After links are generated, replace placeholders in `catalogue/yousafe_catalogue_cards.html`, for example:
   - `{{stripe_payment_link_canada_study_permit_complete_pack}}` → actual Stripe URL.

## Terminal commands

```bash
cd <repo-or-unzipped-package-root>
npm install
cp codex/.env.example .env
# Edit .env or .env.local and add STRIPE_SECRET_KEY.
# Use a test key first, then switch to live mode when ready.
node codex/create-stripe-payment-links.js catalogue/stripe_products_input.csv
```

## Recommended website implementation

- Add `catalogue/yousafe_catalogue_cards.html` to the checkout catalogue page.
- Replace placeholder links using the generated output JSON/CSV.
- Do not publish secret keys to the frontend.
- Protect actual digital downloads behind a paid-order verification flow if possible.
- At minimum, redirect successful buyers to a download/instructions page and manually reconcile initial orders in Stripe Dashboard.

## Important Stripe notes

- Payment Links are reusable hosted checkout URLs.
- Each payment link line item must point to a Price and quantity.
- Stripe uses minor units: `$29.00` becomes `2900` for USD.
