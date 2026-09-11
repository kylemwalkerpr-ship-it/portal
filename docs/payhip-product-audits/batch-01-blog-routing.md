# Batch 01 blog + interlink routing

The Payhip post is transactional/use-intent. The Apex article is workflow/how-to intent. Existing authority/legal articles retain rule/eligibility intent. This split is deliberate to avoid cannibalization.

| Product | Payhip blog slug | Apex product-led slug | Authority target(s) |
|---|---|---|---|
| Mega Bundle | `usa-canada-immigration-preparation-bundle` | `shop-usa-canada-immigration-preparation-bundle` | CaseWorks F-1 + Canada study permit checklists |
| Universal Intake | `immigration-intake-document-review-checklist` | `shop-immigration-client-intake-document-review` | YouSafe legal library / Canada hub |
| Refusal/Reapplication | `visa-refusal-reapplication-evidence-gap-plan` | `shop-visa-refusal-reapplication-organizer` | Existing F-1 refusal article + Canada checklist |
| Family/Travel | `canada-family-travel-history-organizer` | `shop-canada-family-travel-history-organizer` | IRCC IMM 5645 + Canada legal hub |
| PGWP | `pgwp-document-timeline-organizer` | `shop-pgwp-application-organizer` | Existing `pgwp-canada-2026` + IRCC PGWP |
| Work Permit | `canada-work-permit-outside-imm1295-checklist` | `shop-canada-work-permit-application-organizer` | IRCC outside-Canada work permit docs |
| TRV | `canada-trv-visitor-visa-document-organizer` | `shop-canada-visitor-visa-organizer` | IRCC IMM 5257 + Canada legal hub |
| Study Plan/LOE | `canada-study-plan-letter-of-explanation-workbook` | `shop-canada-study-plan-loe-template` | Existing `canadian-study-permit-2026` + IRCC docs |
| Proof of Funds | `canada-proof-of-funds-sponsor-support-organizer` | `shop-canada-proof-of-funds-organizer` | Existing `canada-study-permit-financial-proof` + IRCC financial-support page |

## Link rules

- Payhip product → matching Payhip blog where supported, plus matching Apex guide.
- Payhip blog → exact product + matching Apex guide + one official/current source where useful.
- Apex product-led article → exact Payhip product + Marketplace detail page + authority article(s) + situational cross-sells.
- Authority article → relevant product-led Apex article or exact product CTA only where contextually useful; do not turn every regulatory paragraph into a sales block.
- Mega Bundle does not cross-sell its constituent products.
