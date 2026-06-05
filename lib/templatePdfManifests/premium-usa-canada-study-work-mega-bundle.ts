import type { TemplatePdfManifest } from '@/lib/pdfGenerator'
import {
  clientIdentitySection,
  coverLetterSection,
  documentTrackerSection,
  ds160WorksheetSection,
  intakeFormSection,
  invitationLetterSection,
  proofOfFundsSection,
  refusalMatrixSection,
  sponsorLetterSection,
  studyPlanSection,
  travelHistorySection,
} from './_shared'

// Mega bundle ships every worksheet that exists on disk for this slug.
// The PDF is long by design — it covers F-1, study permit, work permit,
// visitor, refusal-response and intake in a single fillable document.
const manifest: TemplatePdfManifest = {
  slug: 'premium-usa-canada-study-work-mega-bundle',
  sections: [
    clientIdentitySection(),
    intakeFormSection(),
    ds160WorksheetSection(),
    studyPlanSection(),
    proofOfFundsSection(),
    sponsorLetterSection(),
    invitationLetterSection(),
    travelHistorySection(),
    refusalMatrixSection(),
    coverLetterSection(),
    documentTrackerSection(),
  ],
}

export default manifest
