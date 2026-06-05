import type { TemplatePdfManifest } from '@/lib/pdfGenerator'
import {
  clientIdentitySection,
  coverLetterSection,
  documentTrackerSection,
} from './_shared'

const manifest: TemplatePdfManifest = {
  slug: 'us-opt-i765-application-prep-pack',
  sections: [
    clientIdentitySection(),
    {
      title: 'I-765 OPT Prep Worksheet',
      intro: 'Plan the I-765 before you file. Mistakes in name/SEVIS/category waste months.',
      fields: [
        { id: 'opt_category', label: 'OPT category code', type: 'select', options: ['(c)(3)(A) Pre-completion', '(c)(3)(B) Post-completion', '(c)(3)(C) 24-month STEM extension'] },
        { id: 'sevis_id', label: 'SEVIS ID', type: 'text', required: true },
        { id: 'school_name', label: 'School name', type: 'text', required: true },
        { id: 'program_end_date', label: 'Program end date', type: 'date' },
        { id: 'requested_start_date', label: 'Requested OPT start date', type: 'date' },
        { id: 'requested_end_date', label: 'Requested OPT end date', type: 'date' },
        { id: 'a_number', label: 'A-number (if any)', type: 'text' },
        { id: 'uscis_account_number', label: 'USCIS online account number', type: 'text' },
        { id: 'us_mailing_address', label: 'U.S. mailing address', type: 'multiline', rows: 2 },
      ],
    },
    {
      title: 'OPT Timing Tracker',
      fields: [
        { id: 'dso_opt_request_date', label: 'DSO OPT recommendation requested', type: 'date' },
        { id: 'i20_opt_endorsement_date', label: 'I-20 OPT endorsement received', type: 'date' },
        { id: 'i20_opt_endorsement_within_30_days', label: 'I-765 filed within 30 days of endorsement', type: 'checkbox' },
        { id: 'earliest_filing_window_start', label: 'Earliest filing window start', type: 'date' },
        { id: 'latest_filing_deadline', label: 'Latest filing deadline', type: 'date' },
      ],
    },
    {
      title: 'Evidence Upload Checklist',
      fields: [
        { id: 'evidence_passport_id_page', label: 'Passport ID page', type: 'checkbox' },
        { id: 'evidence_i94_record', label: 'Most recent I-94 record', type: 'checkbox' },
        { id: 'evidence_i20_signed', label: 'I-20 with OPT recommendation', type: 'checkbox' },
        { id: 'evidence_prior_ead', label: 'Prior EAD (if any)', type: 'checkbox' },
        { id: 'evidence_photo_2x2', label: 'Two passport-style photos / digital upload', type: 'checkbox' },
        { id: 'evidence_filing_fee', label: 'Filing fee proof', type: 'checkbox' },
      ],
    },
    coverLetterSection(),
    documentTrackerSection(),
  ],
}

export default manifest
