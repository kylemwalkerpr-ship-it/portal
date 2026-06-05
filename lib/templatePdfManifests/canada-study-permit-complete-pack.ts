import type { TemplatePdfManifest } from '@/lib/pdfGenerator'
import {
  clientIdentitySection,
  documentTrackerSection,
  proofOfFundsSection,
  sponsorLetterSection,
  studyPlanSection,
} from './_shared'

const manifest: TemplatePdfManifest = {
  slug: 'canada-study-permit-complete-pack',
  sections: [
    clientIdentitySection(),
    {
      title: 'IRCC File Identifiers',
      fields: [
        { id: 'loa_letter_of_acceptance_number', label: 'Letter of Acceptance (LOA) number', type: 'text', required: true },
        { id: 'dli_number', label: 'Designated Learning Institution (DLI) number', type: 'text', required: true },
        { id: 'pal_tal_number', label: 'PAL / TAL / CAQ reference', type: 'text' },
        { id: 'caq_quebec_required', label: 'CAQ required (Quebec)?', type: 'select', options: ['No', 'Yes', 'Not applicable'] },
        { id: 'biometrics_required', label: 'Biometrics required?', type: 'select', options: ['Yes', 'No', 'Unknown'] },
        { id: 'biometrics_appointment_date', label: 'Biometrics appointment date', type: 'date' },
      ],
    },
    studyPlanSection(),
    proofOfFundsSection(),
    sponsorLetterSection(),
    {
      title: 'Family Information Prep (IMM 5645)',
      intro: 'Inconsistent family info is the #1 study-permit refusal driver — fill carefully.',
      fields: [
        { id: 'father_full_name', label: 'Father full name', type: 'text' },
        { id: 'father_date_of_birth', label: 'Father date of birth', type: 'date' },
        { id: 'father_country', label: 'Father country of residence', type: 'text' },
        { id: 'mother_full_name', label: 'Mother full name', type: 'text' },
        { id: 'mother_date_of_birth', label: 'Mother date of birth', type: 'date' },
        { id: 'spouse_full_name', label: 'Spouse full name (if applicable)', type: 'text' },
        { id: 'children_summary', label: 'Children (full names + DOB)', type: 'multiline', rows: 4 },
        { id: 'siblings_summary', label: 'Siblings (full names + DOB)', type: 'multiline', rows: 4 },
      ],
    },
    documentTrackerSection(),
  ],
}

export default manifest
