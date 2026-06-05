import type { TemplatePdfManifest } from '@/lib/pdfGenerator'
import {
  clientIdentitySection,
  documentTrackerSection,
  intakeFormSection,
  travelHistorySection,
} from './_shared'

const manifest: TemplatePdfManifest = {
  slug: 'universal-client-intake-document-review-kit',
  sections: [
    clientIdentitySection(),
    intakeFormSection(),
    travelHistorySection(),
    {
      title: 'Document Review Checklist',
      fields: [
        { id: 'review_passport_valid_six_months', label: 'Passport valid 6+ months past intended return', type: 'checkbox' },
        { id: 'review_names_consistent', label: 'Names consistent across all documents', type: 'checkbox' },
        { id: 'review_dates_consistent', label: 'Dates consistent across all documents', type: 'checkbox' },
        { id: 'review_funds_documented', label: 'Funds source documented', type: 'checkbox' },
        { id: 'review_acceptance_or_invitation', label: 'Acceptance letter or invitation in hand', type: 'checkbox' },
        { id: 'review_disclosures_complete', label: 'All required disclosures complete', type: 'checkbox' },
      ],
    },
    {
      title: 'Consultation Notes',
      fields: [
        { id: 'risk_summary', label: 'Risk summary', type: 'multiline', rows: 4 },
        { id: 'missing_documents', label: 'Missing documents', type: 'multiline', rows: 4 },
        { id: 'next_steps', label: 'Next steps with client', type: 'multiline', rows: 4 },
        { id: 'client_declaration_acknowledged', label: 'Client declaration acknowledged', type: 'checkbox' },
      ],
    },
    documentTrackerSection(),
  ],
}

export default manifest
