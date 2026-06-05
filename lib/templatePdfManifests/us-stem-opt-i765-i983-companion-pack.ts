import type { TemplatePdfManifest } from '@/lib/pdfGenerator'
import {
  clientIdentitySection,
  coverLetterSection,
  documentTrackerSection,
} from './_shared'

const manifest: TemplatePdfManifest = {
  slug: 'us-stem-opt-i765-i983-companion-pack',
  sections: [
    clientIdentitySection(),
    {
      title: 'STEM OPT Timeline Tracker',
      intro: 'STEM OPT must be filed before the current OPT expires AND within 60 days of the I-20 STEM recommendation.',
      fields: [
        { id: 'current_opt_end_date', label: 'Current OPT EAD end date', type: 'date', required: true },
        { id: 'stem_request_date', label: 'STEM extension request date', type: 'date' },
        { id: 'i20_stem_recommendation_date', label: 'I-20 STEM recommendation date', type: 'date' },
        { id: 'i765_filing_target_date', label: 'I-765 filing target date', type: 'date' },
        { id: 'stem_24_month_end_date', label: 'STEM extension end (24 months out)', type: 'date' },
      ],
    },
    {
      title: 'Employer / E-Verify Worksheet',
      fields: [
        { id: 'employer_legal_name', label: 'Employer legal name', type: 'text', required: true },
        { id: 'employer_address', label: 'Employer address', type: 'multiline', rows: 2 },
        { id: 'employer_ein', label: 'Employer EIN', type: 'text' },
        { id: 'everify_company_id', label: 'E-Verify company ID', type: 'text', required: true },
        { id: 'employer_naics_code', label: 'NAICS code', type: 'text' },
        { id: 'employer_size', label: 'Employer size (employees)', type: 'text' },
        { id: 'job_title', label: 'Job title', type: 'text' },
        { id: 'job_hours_per_week', label: 'Hours per week', type: 'text' },
        { id: 'wage', label: 'Wage (annual or hourly)', type: 'text' },
      ],
    },
    {
      title: 'I-983 Training Plan Notes',
      fields: [
        { id: 'i983_goals', label: 'Training goals', type: 'multiline', rows: 4 },
        { id: 'i983_skills', label: 'Skills you will acquire', type: 'multiline', rows: 4 },
        { id: 'i983_supervision', label: 'Supervision plan', type: 'multiline', rows: 3 },
        { id: 'i983_measurement', label: 'How will progress be measured?', type: 'multiline', rows: 3 },
        { id: 'i983_relation_to_stem', label: 'Relation to STEM degree', type: 'multiline', rows: 3 },
      ],
    },
    {
      title: 'I-765 Evidence Checklist',
      fields: [
        { id: 'evidence_passport', label: 'Passport ID page', type: 'checkbox' },
        { id: 'evidence_i94', label: 'I-94 record', type: 'checkbox' },
        { id: 'evidence_prior_ead', label: 'Prior EAD', type: 'checkbox' },
        { id: 'evidence_stem_diploma', label: 'STEM degree diploma / transcript', type: 'checkbox' },
        { id: 'evidence_i20_stem', label: 'I-20 with STEM recommendation', type: 'checkbox' },
        { id: 'evidence_signed_i983', label: 'Signed I-983', type: 'checkbox' },
      ],
    },
    {
      title: 'Reporting Calendar',
      intro: 'STEM OPT reporting is mandatory — missed reports terminate status.',
      fields: [
        { id: 'reporting_6_month_check_due', label: '6-month check due', type: 'date' },
        { id: 'reporting_12_month_evaluation_due', label: '12-month evaluation due', type: 'date' },
        { id: 'reporting_18_month_check_due', label: '18-month check due', type: 'date' },
        { id: 'reporting_24_month_final_evaluation_due', label: '24-month final evaluation due', type: 'date' },
      ],
    },
    coverLetterSection(),
    documentTrackerSection(),
  ],
}

export default manifest
