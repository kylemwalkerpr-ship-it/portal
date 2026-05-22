# Kimi Brief 30 — Template Catalogue: Strip Stripe Residue

**Supervisor:** Claude. **Executor:** Kimi.
**Repo:** `yousafe-portal`.
**Prerequisites:** brief 28 (Stripe excision) merged. Read `00_HOUSE_STYLE.md`.

Small, mechanical, data-and-content only. No logic, no money path.
Execute exactly — zero research latitude.

---

## 0. WHY

The template-pack catalogue and its 16 README files were generated as a
**child of the old Stripe product setup** — every pack still carries
`stripe_product_id`, `stripe_payment_link_*`, and a
`{{stripe_payment_link_*}}` placeholder token.

The **charge path is already NMI** — `app/api/wallet/debit/route.ts`
resolves each pack's price server-side from `price_usd` via
`getTemplatePackPriceCents()` and debits the student wallet. There is
**no Stripe charge left to remove** — only dead Stripe *data*.

This brief deletes that dead data so the catalogue is NMI-native in its
representation. **Behaviour does not change.** `price_usd` stays the
canonical charge amount; the wallet-debit route is the charge mechanism.

---

## 1. DECISIONS (do not deviate)

- **Data and content only.** No `.ts`/`.tsx` logic changes except the
  one interface line in §2.A. Do not touch `app/api/wallet/debit/route.ts`,
  `app/api/payments/charge/route.ts`, any route, or any component.
- **Do not add new fields.** NMI has no per-item product/price object the
  way Stripe did — the charge spec for a pack is simply `price_usd` +
  `slug`. Nothing replaces the removed Stripe keys.
- **Keep every non-Stripe field byte-identical.** Do not reorder, reword,
  reprice, or reformat anything outside the explicit removals below.
- Do not touch `supabase/`, `wrangler.toml`, or any file not named here.

---

## 2. SCOPE

### 2.A — `lib/template-packs/index.ts` (one line)

The `TemplatePack` interface still declares `placeholder_label`. Remove
exactly that one line:

```
  placeholder_label: string
```

Leave the rest of the interface and both functions untouched. After this,
the interface is: `slug, name, category, badge, price_usd,
short_description, includes, official_sources, delivery_file,
product_type`.

### 2.B — `lib/template-packs/catalogue.json` (16 pack objects)

From **every** pack object, delete these 7 keys:

```
placeholder_label
stripe_product_id
stripe_price_id_usd
stripe_payment_link_id
stripe_payment_link_usd
stripe_price_id_cad
stripe_payment_link_cad
```

Keep, in order: `slug, name, category, badge, price_usd,
short_description, includes, official_sources, delivery_file,
product_type`.

**JSON validity is mandatory.** `product_type` becomes the last key in
each object — its line must end `"product_type": "template"` with **no
trailing comma**. The file must `JSON.parse()` clean (16-element array).

### 2.C — `templates/**/README.md` (16 files)

Each README header has exactly one Stripe line, e.g.:

```
**Stripe placeholder:** `{{stripe_payment_link_us_f1_student_visa_ds160_i20_pack}}`
```

Delete that whole line from all 16 READMEs. Delete nothing else — the
`**Category:**`, `**Suggested price:**`, `**Catalogue badge:**` lines and
all body content stay exactly as they are.

### 2.D — `templates/TEMPLATE_PACK_INDEX.md` (16 list lines)

Each list line ends with a trailing Stripe token, e.g.:

```
- **USA F-1 Student Visa DS-160 + I-20 Preparation Pack** — `templates/usa/us-f1-student-visa-ds160-i20-pack` — $29 USD — `{{stripe_payment_link_us_f1_student_visa_ds160_i20_pack}}`
```

On all 16 lines, remove the trailing ` — `{{stripe_payment_link_...}}``
segment (the ` — ` separator and the backtick-wrapped token). The line
keeps: name, path, price. Result:

```
- **USA F-1 Student Visa DS-160 + I-20 Preparation Pack** — `templates/usa/us-f1-student-visa-ds160-i20-pack` — $29 USD
```

---

## 3. SELF-CHECK

- `placeholder_label` removed from the `TemplatePack` interface.
- 0 `stripe`/`placeholder_label` keys remain in `catalogue.json`.
- `catalogue.json` is valid JSON, still a 16-element array, every other
  field unchanged.
- 0 Stripe lines remain in any `templates/**/README.md` or
  `TEMPLATE_PACK_INDEX.md`.
- No `.ts`/`.tsx` touched except the one `index.ts` line.
- Portal builds ×2, idempotent.

---

## 4. VERIFICATION

```bash
cd ~/Documents/GitHub/yousafe-portal
rm -f .next/lock
grep -rniE "stripe|placeholder_label" lib/template-packs/catalogue.json templates/ 2>/dev/null | wc -l | awk '{print "stripe/placeholder refs (expect 0):", $1}'
node -e "const c=require('./lib/template-packs/catalogue.json'); if(!Array.isArray(c)||c.length!==16) throw new Error('catalogue not a 16-element array'); console.log('catalogue.json valid, 16 packs')"
grep -nE "placeholder_label" lib/template-packs/index.ts | wc -l | awk '{print "placeholder_label in index.ts (expect 0):", $1}'
pnpm build >/dev/null 2>&1 && pnpm build >/dev/null 2>&1; echo "build: $?"
git status --porcelain | grep -v /.next/
```

Required: 0 stripe/placeholder refs; catalogue valid with 16 packs;
0 `placeholder_label` in `index.ts`; `build: 0`.

---

## 5. EDITORIAL GATE (Claude)

Reject if: `catalogue.json` is not valid JSON or not 16 packs; any
non-Stripe field changed, reworded, repriced, or reordered; any Stripe
ref survives in the catalogue or templates; any route/component touched;
build not idempotent.

---

## 6. HANDOFF

No zip. Report the §4 output. Do not commit or branch — Claude reviews
and commits.
