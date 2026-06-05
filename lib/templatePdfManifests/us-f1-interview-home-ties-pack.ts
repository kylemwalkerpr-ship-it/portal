import type { TemplatePdfManifest } from '@/lib/pdfGenerator'
import {
  clientIdentitySection,
  coverLetterSection,
  refusalMatrixSection,
  travelHistorySection,
} from './_shared'

const manifest: TemplatePdfManifest = {
  slug: 'us-f1-interview-home-ties-pack',
  sections: [
    clientIdentitySection(),
    {
      title: 'Home Ties Evidence Planner',
      intro: 'Strong, specific ties beat generic claims. List what you can prove.',
      fields: [
        { id: 'home_country_family_ties', label: 'Family ties at home', type: 'multiline', rows: 3 },
        { id: 'home_country_property', label: 'Property / lease evidence', type: 'multiline', rows: 2 },
        { id: 'home_country_employment', label: 'Employment commitment at home', type: 'multiline', rows: 3 },
        { id: 'home_country_business', label: 'Business / financial commitments', type: 'multiline', rows: 2 },
        { id: 'home_country_social_ties', label: 'Social / community ties', type: 'multiline', rows: 2 },
      ],
    },
    {
      title: 'Interview Answer Worksheet',
      intro: 'Practise short, confident answers. Two sentences is enough.',
      fields: [
        { id: 'answer_why_this_program', label: 'Why this program?', type: 'multiline', rows: 3 },
        { id: 'answer_why_this_school', label: 'Why this school?', type: 'multiline', rows: 3 },
        { id: 'answer_why_us', label: 'Why the United States?', type: 'multiline', rows: 3 },
        { id: 'answer_who_is_funding', label: 'Who is funding you?', type: 'multiline', rows: 2 },
        { id: 'answer_post_study_plan', label: 'What will you do after graduation?', type: 'multiline', rows: 3 },
        { id: 'answer_ties_to_home', label: 'What will bring you back home?', type: 'multiline', rows: 3 },
      ],
    },
    {
      title: 'Sponsor Relationship Summary',
      fields: [
        { id: 'sponsor_name', label: 'Sponsor name', type: 'text' },
        { id: 'sponsor_relationship', label: 'Relationship', type: 'text' },
        { id: 'sponsor_income_summary', label: 'Sponsor income summary', type: 'text' },
        { id: 'sponsor_funding_commitment', label: 'Funding commitment', type: 'multiline', rows: 2 },
      ],
    },
    coverLetterSection(),
    travelHistorySection(),
    refusalMatrixSection(),
  ],
}

export default manifest
