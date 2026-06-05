import type { TemplatePdfManifest } from '@/lib/pdfGenerator'
import {
  clientIdentitySection,
  documentTrackerSection,
  proofOfFundsSection,
  sponsorLetterSection,
} from './_shared'

const manifest: TemplatePdfManifest = {
  slug: 'us-i134-financial-support-companion-pack',
  sections: [
    clientIdentitySection(),
    {
      title: 'Sponsor (I-134 Declarant) Details',
      intro: 'These fields mirror Part 1 of the I-134.',
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
    sponsorLetterSection(),
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
