import type { TemplatePdfManifest } from '@/lib/pdfGenerator'
import {
  clientIdentitySection,
  ds160WorksheetSection,
  coverLetterSection,
  documentTrackerSection,
} from './_shared'

const manifest: TemplatePdfManifest = {
  slug: 'us-f1-student-visa-ds160-i20-pack',
  sections: [
    clientIdentitySection(),
    ds160WorksheetSection(),
    {
      title: 'I-20 / SEVIS Tracker',
      intro: 'Pull these straight off your I-20 — names and SEVIS ID must match the DS-160 exactly.',
      fields: [
        { id: 'sevis_id', label: 'SEVIS ID (N00...)', type: 'text', required: true },
        { id: 'school_name', label: 'School name (as on I-20)', type: 'text', required: true },
        { id: 'school_code', label: 'School code', type: 'text' },
        { id: 'program_name', label: 'Program name', type: 'text' },
        { id: 'program_start_date', label: 'Program start date', type: 'date' },
        { id: 'program_end_date', label: 'Program end date', type: 'date' },
        { id: 'dso_name', label: 'DSO name', type: 'text' },
        { id: 'sevis_i901_paid', label: 'SEVIS I-901 fee paid', type: 'checkbox' },
        { id: 'sevis_i901_receipt_number', label: 'SEVIS I-901 receipt number', type: 'text' },
        { id: 'sevis_i901_paid_date', label: 'SEVIS I-901 paid date', type: 'date' },
      ],
    },
    coverLetterSection(),
    documentTrackerSection(),
  ],
}

export default manifest
