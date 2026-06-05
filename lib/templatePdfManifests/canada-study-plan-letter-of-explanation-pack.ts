import type { TemplatePdfManifest } from '@/lib/pdfGenerator'
import {
  clientIdentitySection,
  coverLetterSection,
  refusalMatrixSection,
  studyPlanSection,
} from './_shared'

const manifest: TemplatePdfManifest = {
  slug: 'canada-study-plan-letter-of-explanation-pack',
  sections: [
    clientIdentitySection(),
    studyPlanSection(),
    {
      title: 'Program Fit Worksheet',
      intro: 'Map each program element to your background and your post-study plan.',
      fields: [
        { id: 'program_core_modules', label: 'Core modules / courses', type: 'multiline', rows: 4 },
        { id: 'program_fit_background', label: 'Why these courses fit your background', type: 'multiline', rows: 4 },
        { id: 'program_fit_goals', label: 'Why these courses fit your goals', type: 'multiline', rows: 4 },
      ],
    },
    {
      title: 'Career Plan',
      fields: [
        { id: 'short_term_role', label: 'Target role 0-2 years after graduation', type: 'text' },
        { id: 'medium_term_role', label: 'Target role 3-5 years after graduation', type: 'text' },
        { id: 'career_country', label: 'Country where you intend to build the career', type: 'text' },
        { id: 'career_evidence', label: 'Evidence of demand for this career path', type: 'multiline', rows: 4 },
      ],
    },
    refusalMatrixSection(),
    coverLetterSection(),
  ],
}

export default manifest
