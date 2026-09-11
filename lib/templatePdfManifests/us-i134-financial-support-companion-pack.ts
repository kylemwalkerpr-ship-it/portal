import type { TemplatePdfManifest } from '@/lib/pdfGenerator'
import {
  clientIdentitySection,
  documentTrackerSection,
  proofOfFundsSection,
} from './_shared'

const manifest: TemplatePdfManifest = {
  slug: 'us-i134-financial-support-companion-pack',
  sections: [
    clientIdentitySection(),
    {
      title: 'Sponsor (I-134 Declarant) Details',
      intro: 'Use this section to organize sponsor identity and contact details before referring to the current official Form I-134 instructions.',
      fields: [
        { id: 'sponsor_full_name', label: 'Sponsor full name', type: 'text', required: true },
        { id: 'sponsor_date_of_birth', label: 'Sponsor date of birth', type: 'date' },
        { id: 'sponsor_us_status', label: 'Sponsor U.S. status', type: 'select', options: ['U.S. citizen', 'Lawful permanent resident', 'Lawful nonimmigrant', 'Other'] },
        { id: 'sponsor_a_number', label: 'Sponsor A-Number (if any)', type: 'text' },
        { id: 'sponsor_address', label: 'Sponsor U.S. address', type: 'multiline', rows: 2 },
        { id: 'sponsor_phone', label: 'Sponsor phone', type: 'text' },
        { id: 'sponsor_email', label: 'Sponsor email', type: 'text' },
        { id: 'beneficiary_relationship', label: 'Relationship to beneficiary', type: 'text' },
      ],
    },
    {
      title: 'Support Explanation Planner',
      intro: 'Use the sponsor details above and these prompts to organize a factual support explanation. This is a planning worksheet, not an official form or pre-written legal statement.',
      fields: [
        { id: 'support_purpose', label: 'Purpose of the proposed support', type: 'multiline', rows: 2 },
        { id: 'support_relationship_details', label: 'Relationship background and relevant context', type: 'multiline', rows: 3 },
        { id: 'support_employment_or_business', label: 'Sponsor employment or business', type: 'text' },
        { id: 'support_income_summary', label: 'Income and available-funds summary', type: 'multiline', rows: 3 },
        { id: 'support_commitment_summary', label: 'What support will be provided, for how long, and for which expenses?', type: 'multiline', rows: 4 },
        { id: 'support_evidence_summary', label: 'Evidence that supports the statements above', type: 'multiline', rows: 4 },
      ],
    },
    proofOfFundsSection(),
    {
      title: 'Relationship Evidence Planner',
      fields: [
        { id: 'relationship_evidence_summary', label: 'How will you prove the relationship?', type: 'multiline', rows: 4 },
        { id: 'relationship_documents', label: 'Documents you will attach', type: 'multiline', rows: 4 },
      ],
    },
    documentTrackerSection(),
  ],
}

export default manifest
