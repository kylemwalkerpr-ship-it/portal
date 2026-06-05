import type { TemplatePdfManifest } from '@/lib/pdfGenerator'
import {
  clientIdentitySection,
  coverLetterSection,
  documentTrackerSection,
  travelHistorySection,
} from './_shared'

const manifest: TemplatePdfManifest = {
  slug: 'canada-pgwp-application-pack',
  sections: [
    clientIdentitySection(),
    {
      title: 'PGWP Timeline Tracker',
      intro: 'PGWP must be filed within 180 days of receiving the program completion letter.',
      fields: [
        { id: 'program_completion_date', label: 'Program completion date', type: 'date', required: true },
        { id: 'completion_letter_date', label: 'Completion letter received on', type: 'date' },
        { id: 'transcript_received_date', label: 'Final transcript received on', type: 'date' },
        { id: 'pgwp_filing_deadline', label: 'PGWP filing deadline (180 days)', type: 'date' },
        { id: 'study_permit_expiry', label: 'Study permit expiry date', type: 'date' },
        { id: 'status_currently_held', label: 'Status currently held', type: 'select', options: ['Study permit valid', 'Implied status', 'Visitor record', 'Expired - restoration needed'] },
      ],
    },
    {
      title: 'Graduation Proof Checklist',
      fields: [
        { id: 'evidence_completion_letter', label: 'Official letter confirming completion', type: 'checkbox' },
        { id: 'evidence_final_transcript', label: 'Final transcript', type: 'checkbox' },
        { id: 'evidence_diploma_or_degree', label: 'Diploma or degree certificate', type: 'checkbox' },
        { id: 'evidence_passport', label: 'Passport bio page', type: 'checkbox' },
        { id: 'evidence_prior_permit', label: 'Prior study permit copy', type: 'checkbox' },
      ],
    },
    {
      title: 'Status Restoration Notes',
      intro: 'Only complete if status has lapsed.',
      fields: [
        { id: 'restoration_reason', label: 'Reason for lapse', type: 'multiline', rows: 3 },
        { id: 'restoration_days_since_expiry', label: 'Days since expiry', type: 'text' },
        { id: 'restoration_within_90_days', label: 'Within 90-day restoration window', type: 'checkbox' },
      ],
    },
    travelHistorySection(),
    coverLetterSection(),
    documentTrackerSection(),
  ],
}

export default manifest
