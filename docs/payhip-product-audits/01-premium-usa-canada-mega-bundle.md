# Product 01 — Premium USA + Canada Immigration Preparation Bundle

Payhip ID: `Ap382`  
Current price: `$79`  
Current public product: `https://payhip.com/b/Ap382`  
YouSafe shop: `https://market.yousafeconsultancy.com/shop/premium-usa-canada-study-work-mega-bundle`  
Audit state: **HOLD — REBUILD IN PROGRESS**

## Executive finding

The current commercial promise and the current Payhip artifact are not aligned strongly enough to send traffic to this product.

The live seller record currently exposes one approximately 8 KB ZIP. The repository shows that the legacy bundle directory is composed primarily of small Markdown authoring worksheets. Those files are useful as source material but are not an acceptable premium `$79` buyer experience when the storefront promises the complete USA and Canada preparation catalogue.

The existing integrated mega-workbook PDF manifest is also not sufficient by itself: it is a useful supplementary workbook, but it does not equal every constituent USA and Canada product promised by the listing.

The repaired product is therefore defined as a **15-pack buyer-facing bundle**, with every constituent pack rendered as its own maintained, fillable PDF and uploaded as an individual Payhip file after QA.

## Truthful bundle contract

Product 01 must contain these exact 15 products:

1. USA F-1 Student Visa DS-160 + I-20 Preparation Pack
2. USA F-1 Interview + Home Ties Evidence Pack
3. USA B-1/B-2 Visitor Visa DS-160 + Invitation Pack
4. USA F-1 OPT I-765 Application Preparation Pack
5. USA STEM OPT I-765 + I-983 Companion Pack
6. USA I-134 Financial Support Companion Pack
7. Canada Study Permit Complete Application Preparation Pack
8. Canada Proof of Funds + Sponsor Support Pack
9. Canada Study Plan + Letter of Explanation Pack
10. Canada Temporary Resident Visa Visitor Pack
11. Canada Work Permit Outside Canada Preparation Pack
12. Canada PGWP Post-Graduation Work Permit Pack
13. Canada Family Information + Travel History Organizer
14. USA/Canada Refusal Review + Reapplication Response Pack
15. Universal Immigration Client Intake + Document Review Kit

The source-of-truth mapping is implemented in `lib/payhipProductBundles.ts`.

## Delivery standard

Target Payhip delivery mode: **multiple individual PDF files**, not one opaque source ZIP.

Every component must pass all of the following before upload:

- explicit maintained PDF manifest exists;
- PDF generation succeeds in CI;
- generated PDF reopens successfully;
- document has at least one fillable field;
- official-source registry contains at least one relevant government source;
- all form field IDs are unique;
- every advertised feature is present;
- content is usable without opening a Markdown editor or understanding repository conventions;
- no placeholder/source-only instructions leak into the buyer artifact;
- PDF states clearly that it is an independent preparation resource, not an official form, legal advice, legal representation, or a guarantee of approval;
- current government requirements are rechecked before the live Payhip file is replaced.

`tests/payhip-product-pdf-generation.test.ts` enforces the first structural QA layer for all 15 constituent products.

## Current defect discovered by QA

The new generation test caught a duplicate `sponsor_full_name` AcroForm field in the USA I-134 product. That defect would prevent a valid buyer PDF from generating. The manifest has been repaired by separating sponsor identity fields from a uniquely named support-explanation planner rather than weakening the QA test.

This is the intended role of the audit: find defects before they reach paying customers.

## Listing position after rebuild

### Recommended title

**USA + Canada Immigration Preparation Bundle — 15 Fillable Visa, Study & Work Permit Packs**

Reasoning:
- says what the buyer actually gets;
- leads with the two jurisdictions;
- captures commercial language around `immigration preparation bundle`, `fillable`, `visa`, `study`, and `work permit`;
- removes the vague `Mega Bundle` phrasing from the primary search title while the page can still use `Complete Bundle` as merchandising language.

### Recommended short promise

A 15-pack digital preparation library for organizing U.S. and Canadian student, visitor, work-after-study, work-permit, financial-support, refusal-response, and intake information before using the official government filing process.

### Mandatory scope boundary

This product must never be described as:
- an official government form set;
- legal advice or representation;
- a filing service;
- an approval strategy that guarantees or predicts an outcome;
- a substitute for current Department of State, DHS, USCIS, or IRCC instructions.

### Recommended value framing

Position the `$79` offer around **one organized preparation system replacing 15 separate purchases**, not around “secret” visa knowledge. The value is:
- consistent fact collection;
- document organization;
- fillable working copies;
- cross-form consistency checking;
- official-source links;
- reusable trackers;
- one purchase for both U.S. and Canadian preparation workflows.

Do not use artificial urgency or outcome-based claims.

## Product-page information architecture

1. **Hero** — exact 15-pack promise, price, instant digital access, one primary CTA.
2. **What you receive** — 15 named PDFs, grouped into USA / Canada / cross-border preparation.
3. **Who it is for** — self-directed applicants, students, sponsors, and people organizing a file before seeking professional review.
4. **What it helps organize** — forms data, timelines, evidence, funds, travel history, interview notes, refusal gaps.
5. **What it does not do** — no legal advice, no official filing, no approval guarantee.
6. **Preview gallery** — real screenshots of generated PDF pages; never generic mockups that overstate the file.
7. **Official sources** — concise links to the relevant government authorities and a last-reviewed date.
8. **How to use it** — download, choose the relevant pack, complete the working fields, compare against current official instructions, then transfer information to the appropriate official process.
9. **Related individual packs** — enable buyers who do not need the full bundle to purchase one pack instead.
10. **Professional-review escalation** — link to the relevant YouSafe Marketplace specialist category without suggesting the digital product itself includes representation.
11. **FAQ** — file format, fillability, printing, software compatibility, updates, refund policy, privacy, official-form boundary.

## Cover and preview requirements

The cover must sell the real deliverable rather than an abstract immigration graphic.

Required visual system:
- one premium master cover showing `15 fillable preparation packs`;
- visible USA + Canada jurisdiction cue without imitating government seals;
- small real-page thumbnails from 4–6 constituent PDFs;
- clear `$79 one-time purchase` value cue only where Payhip's design permits;
- no passport/visa stamp imagery that implies government affiliation;
- consistent YouSafe brand and high-contrast typography;
- alt text describing the actual digital bundle.

Preview gallery should include at minimum:
- F-1 DS-160/I-20 worksheet page;
- Canada Study Permit organizer page;
- Proof of Funds organizer page;
- OPT/STEM OPT timeline page;
- Refusal-response matrix page;
- bundle contents overview.

## Payhip discovery configuration

### Category strategy

Use the most specific current Payhip marketplace category available for education, immigration/travel preparation, professional templates, or digital documents. Do **not** force an irrelevant high-volume category. The exact live taxonomy must be confirmed in the authenticated Payhip Category & Tags UI before publishing.

### Tag cluster

Use a restrained set of buyer-language tags rather than stuffing variants. Candidate cluster to validate against the live Payhip tag system:

- F1 visa checklist
- DS-160 worksheet
- Canada study permit
- visa document organizer
- proof of funds template
- OPT checklist
- STEM OPT
- PGWP checklist
- visitor visa preparation
- immigration document checklist
- visa refusal reapplication
- fillable PDF

Tags should reflect actual included files. Do not use tags for jurisdictions or products not included.

## Research-led SEO intent split

### What the SERPs tell us

Broad terms such as `F-1 visa checklist` and `Canada study permit documents` are dominated by government, university, and informational authorities. Competing with them using a thin Payhip article would be poor use of the Payhip domain.

Commercial marketplaces, however, repeatedly expose buyer language such as:
- visa checklist;
- proof of funds template;
- student visa sponsorship bundle;
- visa document organizer;
- digital download;
- editable template.

That supports a deliberate two-layer architecture.

### Payhip blog role — commercial / product-adjacent intent

Payhip posts should answer the *working-tool* question and then lead directly to the exact product.

Initial Product 01 cluster:

1. **What Should an F-1 Visa Preparation Organizer Include? A Fillable Checklist for DS-160, I-20 and SEVIS**
   - Primary intent: `F1 visa checklist template`, `DS-160 worksheet`, `visa document organizer`
   - CTA: individual F-1 pack + Product 01 bundle
   - Authority link: Apex F-1 guide / official State Department page

2. **Canada Study Permit Document Organizer: How to Track PAL/TAL, Funds, Study Plan and Uploads**
   - Primary intent: `Canada study permit checklist template`, `study permit document organizer`
   - CTA: Canada complete pack + Product 01 bundle
   - Authority link: Apex study-permit guide + IRCC

3. **Proof of Funds Organizer for Canada Study Permits: What to Track Before You File**
   - Primary intent: `proof of funds template Canada study permit`
   - CTA: proof-of-funds pack + Product 01 bundle
   - Authority link: Apex financial-support guide + current IRCC financial-support page

4. **OPT and STEM OPT Application Organizer: I-765, I-20 and I-983 Preparation Checklist**
   - Primary intent: `OPT checklist`, `STEM OPT checklist`, `I-765 organizer`, `I-983 checklist`
   - CTA: OPT / STEM OPT packs + Product 01 bundle
   - Authority link: Apex OPT authority content + USCIS

5. **Visa Refusal Reapplication Organizer: Turn Refusal Reasons Into an Evidence-Gap Checklist**
   - Primary intent: `visa refusal reapplication checklist`, `refusal response template`
   - CTA: refusal pack + Product 01 bundle
   - Authority link: relevant Apex refusal guide and official government sources

Each Payhip article should link laterally to one or two genuinely related Payhip posts, not every article in the store.

### Apex / YouSafe role — authority and informational intent

Apex/legal content should continue to own the deeper questions:
- eligibility and rule explanations;
- current filing windows;
- policy changes;
- government forms and official requirements;
- refusal analysis concepts;
- current proof-of-funds amounts;
- detailed F-1 interview guidance;
- OPT/STEM OPT regulatory guidance.

Known existing pages that must be considered before commissioning new Apex content include:
- `https://legal.yousafeconsultancy.com/us/student-visas/f1-interview-questions-2026/`
- `https://legal.yousafeconsultancy.com/ca/study-permit-document-checklist/`
- `https://legal.yousafeconsultancy.com/us/student-visas/opt-90-day-unemployment-cap/`

Do not create near-duplicate Apex articles where a strong canonical authority page already exists. Upgrade/interlink the existing page instead.

## Interlink funnel

Target path:

`Search` → `Apex authority article OR Payhip working-tool article` → `YouSafe shop product page` → `Payhip checkout` → `related individual/bundle product` → `relevant professional Marketplace service when human review is needed`

Linking rules:
- Apex authority article links to the exact YouSafe shop landing page, not blindly to Payhip checkout, when education/trust is still needed.
- Payhip blog can link directly to the exact Payhip product CTA **and** to the deeper Apex authority article.
- YouSafe shop landing page links to Payhip for purchase and to official sources for verification.
- Product 01 links to relevant individual packs for lower-intent/lower-budget buyers.
- Individual packs should cross-sell Product 01 only when the buyer is likely to need more than one jurisdiction/workflow.
- Avoid circular anchor-text spam; each link must have a reader purpose.

## Conversion instrumentation requirements

Before declaring the funnel complete:
- define UTMs for Apex → shop, Payhip blog → product, Payhip → YouSafe authority, and shop → Payhip where Payhip permits;
- preserve canonical ownership between Payhip and Apex articles;
- track product-page CTA clicks separately from article clicks;
- track bundle vs individual-pack conversion;
- track professional-service escalation without presenting it as required to use the download.

## Current 2026 rule-sensitivity notes

The Canada side is especially time-sensitive. Current 2026 search results from IRCC and universities show active PAL/TAL rules and new proof-of-funds thresholds taking effect in 2026. Therefore monetary thresholds and exemption rules should **not be hard-coded into evergreen sales copy** unless they are paired with a review date and updated operationally. The product should instead link to the current IRCC source and provide fields for the buyer to record the current applicable amount/status.

The U.S. side similarly needs official-source-first treatment for DS-160, I-20, SEVIS, I-765, OPT/STEM OPT, and I-134 requirements.

## Definition of READY

Product 01 remains **HOLD** until all of these are true:

- [ ] all 15 component PDFs generate and reopen in CI;
- [ ] every PDF is visually inspected page by page;
- [ ] every form field is usable and uniquely named;
- [ ] official-source links are current;
- [ ] content is checked against current 2026 official requirements;
- [ ] all 15 final files are exported from maintained manifests;
- [ ] real cover + preview images are created from those final files;
- [ ] Payhip listing promise is rewritten to match the 15 files;
- [ ] Payhip category and tags are selected from the live taxonomy;
- [ ] live Payhip artifact is replaced;
- [ ] post-upload buyer download is re-tested;
- [ ] YouSafe shop page reflects 15 packs rather than an abstract 5-resource count;
- [ ] commercial Payhip blog cluster is written and internally linked;
- [ ] existing Apex authority pages are upgraded/interlinked rather than duplicated;
- [ ] analytics/UTM path is validated;
- [ ] only then is deliberate organic/paid traffic switched toward the product.
