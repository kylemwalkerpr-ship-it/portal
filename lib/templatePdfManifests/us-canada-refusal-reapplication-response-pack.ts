import type { TemplatePdfManifest } from '@/lib/pdfGenerator'
import {
  clientIdentitySection,
  coverLetterSection,
  documentTrackerSection,
  refusalMatrixSection,
} from './_shared'

const manifest: TemplatePdfManifest = {
  slug: 'us-canada-refusal-reapplication-response-pack',
  sections: [
    clientIdentitySection(),
    {
      title: 'Prior Refusal Snapshot',
      intro: 'One paragraph per refusal — keep facts neutral, no emotional language.',
      fields: [
        { id: 'refusal_country', label: 'Refusal country', type: 'select', options: ['United States', 'Canada', 'Other'] },
        { id: 'refusal_program', label: 'Visa / permit type refused', type: 'text' },
        { id: 'refusal_date', label: 'Refusal date', type: 'date' },
        { id: 'refusal_file_number', label: 'File / case number', type: 'text' },
        { id: 'refusal_grounds_summary', label: 'Refusal grounds (summary)', type: 'multiline', rows: 4 },
        { id: 'refusal_letter_attached', label: 'Refusal letter attached to reapplication', type: 'checkbox' },
      ],
    },
    refusalMatrixSection(),
    {
      title: 'Evidence Gap Tracker',
      fields: [
        { id: 'gap1_issue', label: 'Gap 1 — issue', type: 'text' },
        { id: 'gap1_new_evidence', label: 'Gap 1 — new evidence to add', type: 'multiline', rows: 2 },
        { id: 'gap1_status', label: 'Gap 1 — status', type: 'select', options: ['Open', 'In progress', 'Ready'] },
        { id: 'gap2_issue', label: 'Gap 2 — issue', type: 'text' },
        { id: 'gap2_new_evidence', label: 'Gap 2 — new evidence to add', type: 'multiline', rows: 2 },
        { id: 'gap2_status', label: 'Gap 2 — status', type: 'select', options: ['Open', 'In progress', 'Ready'] },
        { id: 'gap3_issue', label: 'Gap 3 — issue', type: 'text' },
        { id: 'gap3_new_evidence', label: 'Gap 3 — new evidence to add', type: 'multiline', rows: 2 },
        { id: 'gap3_status', label: 'Gap 3 — status', type: 'select', options: ['Open', 'In progress', 'Ready'] },
      ],
    },
    {
      title: 'Changed Circumstances Statement',
      fields: [
        { id: 'changes_since_refusal', label: 'What has materially changed since the refusal?', type: 'multiline', rows: 6 },
        { id: 'changes_evidence_summary', label: 'Evidence supporting those changes', type: 'multiline', rows: 4 },
      ],
    },
    coverLetterSection(),
    documentTrackerSection(),
  ],
}

export default manifest
