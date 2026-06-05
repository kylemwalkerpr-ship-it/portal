import type { TemplatePdfManifest } from '@/lib/pdfGenerator'
import {
  clientIdentitySection,
  coverLetterSection,
  documentTrackerSection,
  travelHistorySection,
} from './_shared'

const manifest: TemplatePdfManifest = {
  slug: 'canada-work-permit-outside-canada-pack',
  sections: [
    clientIdentitySection(),
    {
      title: 'IMM 1295 Prep Worksheet',
      intro: 'Notes for the IRCC Application for Work Permit Made Outside of Canada.',
      fields: [
        { id: 'uci_number', label: 'UCI (if previously issued)', type: 'text' },
        { id: 'work_permit_type', label: 'Work permit type', type: 'select', options: ['LMIA-based', 'LMIA-exempt', 'Open work permit', 'IEC'] },
        { id: 'lmia_number', label: 'LMIA number (if applicable)', type: 'text' },
        { id: 'job_offer_employer', label: 'Job offer employer', type: 'text' },
        { id: 'job_offer_title', label: 'Job title (NOC)', type: 'text' },
        { id: 'job_offer_noc_code', label: 'NOC code', type: 'text' },
        { id: 'job_offer_wage', label: 'Offered wage', type: 'text' },
        { id: 'job_offer_start_date', label: 'Job start date', type: 'date' },
        { id: 'job_offer_end_date', label: 'Job end date', type: 'date' },
        { id: 'work_location', label: 'Work location (city, province)', type: 'text' },
      ],
    },
    {
      title: 'Employer / Job Offer Evidence Checklist',
      fields: [
        { id: 'evidence_job_offer_letter', label: 'Signed job offer letter', type: 'checkbox' },
        { id: 'evidence_lmia_copy', label: 'Copy of positive LMIA', type: 'checkbox' },
        { id: 'evidence_employer_business_number', label: 'Employer business number', type: 'checkbox' },
        { id: 'evidence_employer_website', label: 'Employer website / corporate info', type: 'checkbox' },
        { id: 'evidence_resume', label: 'Resume / CV up to date', type: 'checkbox' },
      ],
    },
    {
      title: 'Work History',
      intro: 'Mirror your resume — gaps must be explained.',
      fields: [
        { id: 'work1_employer', label: 'Role 1 — employer', type: 'text' },
        { id: 'work1_title', label: 'Role 1 — title', type: 'text' },
        { id: 'work1_start_date', label: 'Role 1 — start date', type: 'date' },
        { id: 'work1_end_date', label: 'Role 1 — end date', type: 'date' },
        { id: 'work1_responsibilities', label: 'Role 1 — key responsibilities', type: 'multiline', rows: 3 },
        { id: 'work2_employer', label: 'Role 2 — employer', type: 'text' },
        { id: 'work2_title', label: 'Role 2 — title', type: 'text' },
        { id: 'work2_start_date', label: 'Role 2 — start date', type: 'date' },
        { id: 'work2_end_date', label: 'Role 2 — end date', type: 'date' },
        { id: 'work3_employer', label: 'Role 3 — employer', type: 'text' },
        { id: 'work3_title', label: 'Role 3 — title', type: 'text' },
        { id: 'gaps_explanation', label: 'Employment gap explanation', type: 'multiline', rows: 3 },
      ],
    },
    travelHistorySection(),
    coverLetterSection(),
    documentTrackerSection(),
  ],
}

export default manifest
