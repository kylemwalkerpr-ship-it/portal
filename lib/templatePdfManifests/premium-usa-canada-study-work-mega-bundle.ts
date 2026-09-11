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
import { namespaceSectionFields } from './_utils'

// Supplementary all-in-one workbook for the Mega Bundle.
// The retail bundle itself ships the 15 named constituent product PDFs; this
// workbook is an additional consolidated planning file, not a substitute for
// those constituent products.
const manifest: TemplatePdfManifest = {
  slug: 'premium-usa-canada-study-work-mega-bundle',
  sections: [
    clientIdentitySection(),
    namespaceSectionFields(intakeFormSection(), 'intake'),
    namespaceSectionFields(ds160WorksheetSection(), 'ds160'),
    namespaceSectionFields(studyPlanSection(), 'study_plan'),
    namespaceSectionFields(proofOfFundsSection(), 'proof_of_funds'),
    namespaceSectionFields(sponsorLetterSection(), 'sponsor'),
    namespaceSectionFields(invitationLetterSection(), 'invitation'),
    namespaceSectionFields(travelHistorySection(), 'travel_history'),
    namespaceSectionFields(refusalMatrixSection(), 'refusal'),
    namespaceSectionFields(coverLetterSection(), 'cover_letter'),
    namespaceSectionFields(documentTrackerSection(), 'documents'),
  ],
}

export default manifest
