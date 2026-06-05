import type { TemplatePdfManifest } from '@/lib/pdfGenerator'
import {
  clientIdentitySection,
  documentTrackerSection,
  proofOfFundsSection,
  sponsorLetterSection,
} from './_shared'

const manifest: TemplatePdfManifest = {
  slug: 'canada-proof-of-funds-sponsor-pack',
  sections: [
    clientIdentitySection(),
    proofOfFundsSection(),
    sponsorLetterSection(),
    {
      title: 'Bank Statement Checklist',
      fields: [
        { id: 'bank_statement_account_holder', label: 'Account holder', type: 'text' },
        { id: 'bank_statement_bank_name', label: 'Bank name', type: 'text' },
        { id: 'bank_statement_period_months', label: 'Period covered (months)', type: 'text' },
        { id: 'bank_statement_average_balance', label: 'Average balance', type: 'text' },
        { id: 'bank_statement_currency', label: 'Currency', type: 'text' },
        { id: 'bank_statement_includes_logo', label: 'Statement includes official bank logo / stamp', type: 'checkbox' },
        { id: 'bank_statement_no_redactions', label: 'No redactions', type: 'checkbox' },
        { id: 'gic_purchased', label: 'GIC purchased (SDS / SPP)', type: 'checkbox' },
        { id: 'gic_provider', label: 'GIC provider', type: 'text' },
        { id: 'gic_amount_cad', label: 'GIC amount (CAD)', type: 'text' },
      ],
    },
    {
      title: 'Tuition and Living Cost Tracker',
      fields: [
        { id: 'tuition_total', label: 'Total tuition (first year)', type: 'text' },
        { id: 'tuition_paid_to_date', label: 'Tuition paid to date', type: 'text' },
        { id: 'living_costs_self_estimate', label: 'Living cost self-estimate', type: 'text' },
        { id: 'travel_costs_estimate', label: 'Travel cost estimate', type: 'text' },
        { id: 'all_costs_currency', label: 'Currency used above', type: 'text' },
      ],
    },
    documentTrackerSection(),
  ],
}

export default manifest
