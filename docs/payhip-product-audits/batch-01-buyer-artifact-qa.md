# Payhip Batch 01 — Buyer Artifact QA

Status: **buyer files verified; live Payhip replacement still required**.

## Exact CI artifact

Workflow: `Payhip Batch 1 Buyer Artifacts`

The release artifact is generated from the same maintained PDF manifests covered by the repository tests. The release shape is deliberately fail-closed:

- 8 standalone Batch 1 fillable PDF workbooks
- 1 Mega Bundle ZIP containing exactly 15 separately named PDF workbooks
- 1 `qa-manifest.json`

No Markdown, source files, placeholder ZIPs, or repository authoring assets are part of the buyer release.

## Automated validation

Every one of the 15 Mega Bundle constituent PDFs must:

- exceed the minimum non-placeholder byte threshold
- contain at least 3 pages
- contain fillable form fields
- contain at least one registered official government source
- reopen successfully with `pdf-lib`
- preserve page count and field count after reopening
- contain document title metadata
- identify YouSafe Consultancy as author

The Batch 1 release additionally requires exactly eight standalone PDFs plus one 15-PDF Mega ZIP.

## Content scan

Text was extracted from all 15 generated buyer PDFs. The QA scan found:

- no `TODO`, `TBD`, `PLACEHOLDER`, `LOREM`, `undefined`, or `null` authoring remnants
- no raw Markdown syntax or unresolved template tokens
- product-specific headings and worksheet labels in every file
- the preparation-only / not-a-government-form boundary
- official-source guidance in every file

`PAYHIP-MASTER` is intentional generation metadata, not unresolved buyer copy.

## Visual QA

All 15 PDFs were rendered for visual review at three representative points: cover, official-source/guidance page, and an interior worksheet page.

Observed result:

- cover titles wrap without collision
- guidance/disclaimer text remains inside the content area
- official-source blocks are legible and do not overlap
- worksheet rows and section headings align consistently
- no sampled page showed clipped text, overlapping fields, broken rules, or blank-content failures
- design is deliberately restrained and form-like so the workbook remains practical when printed or filled digitally

## Release contract

- Mega Bundle: 15 separately named fillable PDF preparation workbooks in one ZIP.
- Products 2–9: one fillable PDF workbook each, containing the guided sections named in the listing.

The live Payhip listing must not be changed to claim this release is shipped until the old attachment is replaced, a customer-facing download is performed from Payhip, and the downloaded bytes are reopened successfully.

## Migration assessment

No database/schema migration is required for Batch 1. The commercial catalogue, PDF manifests, shop presentation, funnel metadata, and Apex editorial pages are source-controlled application/content changes. The external Payhip seller changes are listing/file mutations, not database migrations in the YouSafe repositories.
