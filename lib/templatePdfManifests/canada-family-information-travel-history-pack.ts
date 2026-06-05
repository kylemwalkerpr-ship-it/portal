import type { TemplatePdfManifest } from '@/lib/pdfGenerator'
import {
  clientIdentitySection,
  documentTrackerSection,
  travelHistorySection,
} from './_shared'

const manifest: TemplatePdfManifest = {
  slug: 'canada-family-information-travel-history-pack',
  sections: [
    clientIdentitySection(),
    {
      title: 'Family Information (IMM 5645)',
      intro: 'Use the legal names and dates exactly as on passports / certificates.',
      fields: [
        { id: 'father_full_name', label: 'Father full name', type: 'text' },
        { id: 'father_date_of_birth', label: 'Father date of birth', type: 'date' },
        { id: 'father_country_of_birth', label: 'Father country of birth', type: 'text' },
        { id: 'father_present_address', label: 'Father present address', type: 'multiline', rows: 2 },
        { id: 'mother_full_name', label: 'Mother full name', type: 'text' },
        { id: 'mother_date_of_birth', label: 'Mother date of birth', type: 'date' },
        { id: 'mother_country_of_birth', label: 'Mother country of birth', type: 'text' },
        { id: 'mother_present_address', label: 'Mother present address', type: 'multiline', rows: 2 },
        { id: 'spouse_full_name', label: 'Spouse full name', type: 'text' },
        { id: 'spouse_date_of_birth', label: 'Spouse date of birth', type: 'date' },
        { id: 'children_summary', label: 'Children (full names, DOB, country)', type: 'multiline', rows: 5 },
        { id: 'siblings_summary', label: 'Siblings (full names, DOB, country)', type: 'multiline', rows: 5 },
      ],
    },
    travelHistorySection(),
    {
      title: 'Address History (last 10 years)',
      fields: [
        { id: 'address1_street', label: 'Address 1 — street', type: 'text' },
        { id: 'address1_city_country', label: 'Address 1 — city, country', type: 'text' },
        { id: 'address1_from', label: 'Address 1 — from', type: 'date' },
        { id: 'address1_to', label: 'Address 1 — to', type: 'date' },
        { id: 'address2_street', label: 'Address 2 — street', type: 'text' },
        { id: 'address2_city_country', label: 'Address 2 — city, country', type: 'text' },
        { id: 'address2_from', label: 'Address 2 — from', type: 'date' },
        { id: 'address2_to', label: 'Address 2 — to', type: 'date' },
        { id: 'address3_street', label: 'Address 3 — street', type: 'text' },
        { id: 'address3_city_country', label: 'Address 3 — city, country', type: 'text' },
        { id: 'address3_from', label: 'Address 3 — from', type: 'date' },
        { id: 'address3_to', label: 'Address 3 — to', type: 'date' },
      ],
    },
    {
      title: 'Employment / Education History (last 10 years)',
      fields: [
        { id: 'history1_activity', label: 'Activity 1 — role / program', type: 'text' },
        { id: 'history1_company', label: 'Activity 1 — employer / school', type: 'text' },
        { id: 'history1_city_country', label: 'Activity 1 — city, country', type: 'text' },
        { id: 'history1_from', label: 'Activity 1 — from', type: 'date' },
        { id: 'history1_to', label: 'Activity 1 — to', type: 'date' },
        { id: 'history2_activity', label: 'Activity 2 — role / program', type: 'text' },
        { id: 'history2_company', label: 'Activity 2 — employer / school', type: 'text' },
        { id: 'history2_from', label: 'Activity 2 — from', type: 'date' },
        { id: 'history2_to', label: 'Activity 2 — to', type: 'date' },
        { id: 'history3_activity', label: 'Activity 3 — role / program', type: 'text' },
        { id: 'history3_from', label: 'Activity 3 — from', type: 'date' },
        { id: 'history3_to', label: 'Activity 3 — to', type: 'date' },
        { id: 'gaps_explanation', label: 'Gap explanation', type: 'multiline', rows: 3 },
      ],
    },
    {
      title: 'Consistency Review',
      fields: [
        { id: 'consistency_imm5645_matches_passport', label: 'Family info matches passport / certificates', type: 'checkbox' },
        { id: 'consistency_addresses_no_overlap', label: 'Addresses do not overlap', type: 'checkbox' },
        { id: 'consistency_travel_matches_stamps', label: 'Travel history matches passport stamps', type: 'checkbox' },
        { id: 'consistency_work_matches_resume', label: 'Work history matches resume', type: 'checkbox' },
      ],
    },
    documentTrackerSection(),
  ],
}

export default manifest
