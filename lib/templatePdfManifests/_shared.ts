// Reusable section builders derived from the actual markdown worksheets
// shipped in /templates/<slug>/*.md. Each builder returns a ManifestSection
// shaped to the slug-specific worksheet that exists on disk.
//
// IMPORTANT: do not invent fields. If a slug doesn't ship a worksheet we
// fall back to the catalogue includes[] in the slug manifest itself.

import type { ManifestField, ManifestSection } from '@/lib/pdfGenerator'

// ---- Identity / context blocks reused on most packs ----

export const clientIdentitySection = (): ManifestSection => ({
  title: 'Client Identity',
  intro: 'These details auto-fill from your YouSafe account where available.',
  fields: [
    { id: 'client_full_name', label: 'Full name (as on passport)', type: 'text', required: true },
    { id: 'client_email', label: 'Email', type: 'text' },
    { id: 'client_phone', label: 'Phone or WhatsApp', type: 'text' },
    { id: 'country_of_citizenship', label: 'Country of citizenship', type: 'text' },
    { id: 'current_country_of_residence', label: 'Current country of residence', type: 'text' },
    { id: 'date_of_birth', label: 'Date of birth (YYYY-MM-DD)', type: 'date' },
    { id: 'passport_number', label: 'Passport number', type: 'text' },
    { id: 'passport_expiry_date', label: 'Passport expiry date (YYYY-MM-DD)', type: 'date' },
  ],
})

// ---- Worksheet builders, one per markdown variant ----

export const ds160WorksheetSection = (): ManifestSection => ({
  title: 'DS-160 Pre-Fill Worksheet',
  intro: 'Use these notes BEFORE filling the official DS-160 online. Do not submit this worksheet to the government.',
  fields: [
    { id: 'other_names_used', label: 'Other names used', type: 'text' },
    { id: 'national_id_number', label: 'National ID number (if applicable)', type: 'text' },
    { id: 'visa_category', label: 'Visa category', type: 'text', placeholder: 'F-1, B-1/B-2, ...' },
    { id: 'primary_trip_purpose', label: 'Primary purpose of trip', type: 'multiline', rows: 2 },
    { id: 'expected_arrival_date', label: 'Expected arrival date', type: 'date' },
    { id: 'expected_length_of_stay', label: 'Expected length of stay', type: 'text' },
    { id: 'us_address_or_school_address', label: 'U.S. address (or school address)', type: 'multiline', rows: 2 },
    { id: 'current_occupation', label: 'Current occupation / status', type: 'text' },
    { id: 'employer_or_school', label: 'Employer or school', type: 'text' },
    { id: 'previous_us_travel_details', label: 'Previous U.S. travel', type: 'multiline', rows: 3 },
    { id: 'countries_visited', label: 'Countries visited in last 5 years', type: 'multiline', rows: 3 },
    { id: 'ds160_purpose_matches_docs', label: 'DS-160 purpose matches supporting documents', type: 'select', options: ['Yes', 'No', 'Needs review'] },
    { id: 'ds160_dates_match_docs', label: 'Intended stay matches school/job/travel dates', type: 'select', options: ['Yes', 'No', 'Needs review'] },
    { id: 'ds160_names_dates_exact', label: 'Passport names and dates copied exactly', type: 'select', options: ['Yes', 'No', 'Needs review'] },
  ],
})

export const ds160VisitorWorksheetSection = (): ManifestSection => ({
  title: 'DS-160 Visitor Prep Worksheet',
  intro: 'Visitor-specific DS-160 prep for B-1 / B-2 applications.',
  fields: [
    { id: 'trip_purpose_summary', label: 'Trip purpose (one paragraph)', type: 'multiline', rows: 3 },
    { id: 'us_contact_name', label: 'U.S. contact / host name', type: 'text' },
    { id: 'us_contact_address', label: 'U.S. contact / host address', type: 'multiline', rows: 2 },
    { id: 'us_contact_relationship', label: 'Relationship to U.S. contact', type: 'text' },
    { id: 'expected_arrival_date', label: 'Expected arrival date', type: 'date' },
    { id: 'expected_return_date', label: 'Expected return date', type: 'date' },
    { id: 'funding_source', label: 'Who is paying for the trip', type: 'text' },
    { id: 'home_country_ties', label: 'Strong ties to home country', type: 'multiline', rows: 3 },
  ],
})

export const coverLetterSection = (): ManifestSection => ({
  title: 'Application Cover Letter',
  intro: 'Drafted as a one-page covering letter to attach to the application.',
  fields: [
    { id: 'application_type', label: 'Application type', type: 'text', placeholder: 'F-1 student visa, study permit, ...' },
    { id: 'date_prepared', label: 'Date prepared (YYYY-MM-DD)', type: 'date' },
    { id: 'application_purpose', label: 'Why are you applying?', type: 'multiline', rows: 3 },
    { id: 'destination_country', label: 'Destination country', type: 'text' },
    { id: 'intended_dates', label: 'Intended dates', type: 'text' },
    { id: 'school_employer_host', label: 'School / employer / host', type: 'text' },
    { id: 'funding_source', label: 'Funding source', type: 'text' },
    { id: 'primary_evidence', label: 'Primary supporting evidence', type: 'multiline', rows: 2 },
    { id: 'document_index', label: 'Document index (one per line)', type: 'multiline', rows: 5 },
  ],
})

export const documentTrackerSection = (): ManifestSection => ({
  title: 'Document Upload Tracker',
  intro: 'Use this section to track every supporting document. Recommended file name: [LASTNAME]_[APPTYPE]_[DOC]_[YYYYMMDD].pdf',
  fields: [
    { id: 'doc1_name', label: 'Document 1 — name', type: 'text', placeholder: 'Passport bio page' },
    { id: 'doc1_source', label: 'Document 1 — source', type: 'text' },
    { id: 'doc1_file_name', label: 'Document 1 — file name', type: 'text' },
    { id: 'doc1_date_issued', label: 'Document 1 — date issued', type: 'date' },
    { id: 'doc1_translation_needed', label: 'Document 1 — translation needed', type: 'select', options: ['No', 'Yes', 'Not applicable'] },
    { id: 'doc1_uploaded', label: 'Document 1 — uploaded', type: 'checkbox' },
    { id: 'doc2_name', label: 'Document 2 — name', type: 'text' },
    { id: 'doc2_source', label: 'Document 2 — source', type: 'text' },
    { id: 'doc2_file_name', label: 'Document 2 — file name', type: 'text' },
    { id: 'doc2_date_issued', label: 'Document 2 — date issued', type: 'date' },
    { id: 'doc2_translation_needed', label: 'Document 2 — translation needed', type: 'select', options: ['No', 'Yes', 'Not applicable'] },
    { id: 'doc2_uploaded', label: 'Document 2 — uploaded', type: 'checkbox' },
    { id: 'doc3_name', label: 'Document 3 — name', type: 'text' },
    { id: 'doc3_source', label: 'Document 3 — source', type: 'text' },
    { id: 'doc3_file_name', label: 'Document 3 — file name', type: 'text' },
    { id: 'doc3_date_issued', label: 'Document 3 — date issued', type: 'date' },
    { id: 'doc3_uploaded', label: 'Document 3 — uploaded', type: 'checkbox' },
    { id: 'doc4_name', label: 'Document 4 — name', type: 'text' },
    { id: 'doc4_source', label: 'Document 4 — source', type: 'text' },
    { id: 'doc4_file_name', label: 'Document 4 — file name', type: 'text' },
    { id: 'doc4_uploaded', label: 'Document 4 — uploaded', type: 'checkbox' },
    { id: 'final_filenames_consistent', label: 'File names are clear and consistent', type: 'checkbox' },
    { id: 'final_docs_readable', label: 'Documents are readable and complete', type: 'checkbox' },
    { id: 'final_dates_match', label: 'Dates and names match across all documents', type: 'checkbox' },
    { id: 'final_official_instructions_checked', label: 'Official instructions checked on submission day', type: 'checkbox' },
  ],
})

export const travelHistorySection = (): ManifestSection => ({
  title: 'Travel History',
  intro: 'List trips outside your home country in the last 5 years (most recent first).',
  fields: [
    { id: 'trip1_country', label: 'Trip 1 — country', type: 'text' },
    { id: 'trip1_city', label: 'Trip 1 — city / region', type: 'text' },
    { id: 'trip1_entry_date', label: 'Trip 1 — entry date', type: 'date' },
    { id: 'trip1_exit_date', label: 'Trip 1 — exit date', type: 'date' },
    { id: 'trip1_purpose', label: 'Trip 1 — purpose', type: 'text' },
    { id: 'trip1_visa_type', label: 'Trip 1 — visa / permit type', type: 'text' },
    { id: 'trip1_evidence', label: 'Trip 1 — evidence available', type: 'text', placeholder: 'Stamp / ticket / visa' },
    { id: 'trip1_notes', label: 'Trip 1 — notes', type: 'multiline', rows: 2 },
    { id: 'trip2_country', label: 'Trip 2 — country', type: 'text' },
    { id: 'trip2_city', label: 'Trip 2 — city / region', type: 'text' },
    { id: 'trip2_entry_date', label: 'Trip 2 — entry date', type: 'date' },
    { id: 'trip2_exit_date', label: 'Trip 2 — exit date', type: 'date' },
    { id: 'trip2_purpose', label: 'Trip 2 — purpose', type: 'text' },
    { id: 'trip2_notes', label: 'Trip 2 — notes', type: 'multiline', rows: 2 },
    { id: 'trip3_country', label: 'Trip 3 — country', type: 'text' },
    { id: 'trip3_entry_date', label: 'Trip 3 — entry date', type: 'date' },
    { id: 'trip3_exit_date', label: 'Trip 3 — exit date', type: 'date' },
    { id: 'trip3_purpose', label: 'Trip 3 — purpose', type: 'text' },
    { id: 'consistency_stamps_match', label: 'Passport stamps match listed dates', type: 'checkbox' },
    { id: 'consistency_refusals_disclosed', label: 'Previous refusals disclosed where required', type: 'checkbox' },
    { id: 'consistency_no_conflict', label: 'Travel dates do not conflict with education/work history', type: 'checkbox' },
  ],
})

export const proofOfFundsSection = (): ManifestSection => ({
  title: 'Proof of Funds Organizer',
  intro: 'Itemise every cost and the funding source backing it.',
  fields: [
    { id: 'funds_tuition_amount', label: 'Tuition paid / deposit — amount', type: 'text' },
    { id: 'funds_tuition_currency', label: 'Tuition paid / deposit — currency', type: 'text' },
    { id: 'funds_tuition_source', label: 'Tuition paid / deposit — source', type: 'text' },
    { id: 'funds_tuition_evidence', label: 'Tuition — evidence document', type: 'text' },
    { id: 'funds_remaining_tuition_amount', label: 'Remaining tuition — amount', type: 'text' },
    { id: 'funds_remaining_tuition_source', label: 'Remaining tuition — source', type: 'text' },
    { id: 'funds_living_amount', label: 'Living expenses — amount', type: 'text' },
    { id: 'funds_living_source', label: 'Living expenses — source', type: 'text' },
    { id: 'funds_travel_amount', label: 'Travel costs — amount', type: 'text' },
    { id: 'funds_travel_source', label: 'Travel costs — source', type: 'text' },
    { id: 'funds_emergency_amount', label: 'Emergency / extra funds — amount', type: 'text' },
    { id: 'funds_emergency_source', label: 'Emergency / extra funds — source', type: 'text' },
    { id: 'source_of_funds_explanation', label: 'Source of funds explanation', type: 'multiline', rows: 4 },
    { id: 'summary_of_evidence', label: 'Summary of evidence', type: 'multiline', rows: 3 },
    { id: 'red_flag_large_deposits', label: 'Large recent deposits explained', type: 'select', options: ['Yes', 'No', 'Not applicable'] },
    { id: 'red_flag_sponsor_documented', label: 'Sponsor relationship documented', type: 'select', options: ['Yes', 'No', 'Not applicable'] },
    { id: 'red_flag_income_documented', label: 'Income source documented', type: 'select', options: ['Yes', 'No', 'Not applicable'] },
    { id: 'red_flag_tuition_evidence', label: 'Tuition payment evidence included', type: 'select', options: ['Yes', 'No', 'Not applicable'] },
  ],
})

export const sponsorLetterSection = (): ManifestSection => ({
  title: 'Sponsor Support Letter',
  intro: 'Captures the sponsor narrative used in the formal support letter.',
  fields: [
    { id: 'sponsor_full_name', label: 'Sponsor full name', type: 'text', required: true },
    { id: 'relationship', label: 'Relationship to applicant', type: 'text' },
    { id: 'purpose_of_support', label: 'Purpose of support', type: 'text' },
    { id: 'sponsor_occupation_or_business', label: 'Sponsor occupation / business', type: 'text' },
    { id: 'sponsor_employer_or_business', label: 'Sponsor employer / business name', type: 'text' },
    { id: 'sponsor_income', label: 'Sponsor monthly or annual income', type: 'text' },
    { id: 'relationship_details', label: 'Relationship details', type: 'multiline', rows: 2 },
    { id: 'tuition_support_amount', label: 'Tuition or program fees — amount', type: 'text' },
    { id: 'living_expense_support_amount', label: 'Living expenses — amount', type: 'text' },
    { id: 'travel_support_amount', label: 'Travel and settlement costs — amount', type: 'text' },
    { id: 'other_support_amount', label: 'Other costs — amount', type: 'text' },
    { id: 'sponsor_id_document', label: 'Sponsor identification document', type: 'text' },
    { id: 'bank_statement_period', label: 'Bank statement period (months)', type: 'text' },
    { id: 'income_evidence', label: 'Income / employment evidence', type: 'text' },
    { id: 'relationship_evidence', label: 'Relationship evidence', type: 'text' },
    { id: 'sponsor_phone', label: 'Sponsor phone', type: 'text' },
    { id: 'sponsor_email', label: 'Sponsor email', type: 'text' },
  ],
})

export const studyPlanSection = (): ManifestSection => ({
  title: 'Study Plan / Letter of Explanation',
  intro: 'Long-form, narrative section. Use clear paragraphs; the officer will scan, not read every word.',
  fields: [
    { id: 'program_name', label: 'Program name', type: 'text', required: true },
    { id: 'school_name', label: 'Institution name', type: 'text', required: true },
    { id: 'destination_country', label: 'Destination country', type: 'text' },
    { id: 'application_type', label: 'Application type', type: 'text' },
    { id: 'previous_qualification', label: 'Previous qualification', type: 'text' },
    { id: 'previous_institution', label: 'Previous institution', type: 'text' },
    { id: 'year_completed', label: 'Year completed', type: 'text' },
    { id: 'relevant_background', label: 'Strongest academic / professional areas', type: 'multiline', rows: 3 },
    { id: 'program_reason', label: 'Why this program?', type: 'multiline', rows: 4 },
    { id: 'career_alignment', label: 'How does it align with your career?', type: 'multiline', rows: 4 },
    { id: 'school_reason', label: 'Why this institution?', type: 'multiline', rows: 3 },
    { id: 'program_features', label: 'Important program features', type: 'multiline', rows: 2 },
    { id: 'total_cost', label: 'Estimated total first-year cost', type: 'text' },
    { id: 'funding_sources', label: 'Funding sources', type: 'multiline', rows: 2 },
    { id: 'financial_documents_list', label: 'Supporting financial documents', type: 'multiline', rows: 3 },
    { id: 'post_study_plan', label: 'Post-study plan', type: 'multiline', rows: 4 },
    { id: 'career_role_or_business_goal', label: 'Target career role or business goal', type: 'text' },
    { id: 'home_country_or_target_market', label: 'Home country or target market', type: 'text' },
  ],
})

export const invitationLetterSection = (): ManifestSection => ({
  title: 'Invitation Letter',
  intro: 'Captures the data points used in the host invitation letter.',
  fields: [
    { id: 'host_full_name', label: 'Host full name', type: 'text', required: true },
    { id: 'host_address', label: 'Host address', type: 'multiline', rows: 2 },
    { id: 'relationship_to_visitor', label: 'Relationship to visitor', type: 'text' },
    { id: 'destination_city_country', label: 'Destination city and country', type: 'text' },
    { id: 'visit_start_date', label: 'Visit start date', type: 'date' },
    { id: 'visit_end_date', label: 'Visit end date', type: 'date' },
    { id: 'visit_purpose', label: 'Purpose of visit', type: 'multiline', rows: 2 },
    { id: 'main_activities', label: 'Main activities during visit', type: 'multiline', rows: 2 },
    { id: 'accommodation_address', label: 'Accommodation address', type: 'multiline', rows: 2 },
    { id: 'host_support_details', label: 'Host support details', type: 'multiline', rows: 2 },
    { id: 'host_status', label: 'Host legal status / citizenship / residence', type: 'text' },
    { id: 'host_occupation', label: 'Host occupation', type: 'text' },
    { id: 'host_phone', label: 'Host phone', type: 'text' },
    { id: 'host_email', label: 'Host email', type: 'text' },
    { id: 'home_country', label: 'Visitor home country', type: 'text' },
    { id: 'return_date', label: 'Return date', type: 'date' },
    { id: 'return_reason', label: 'Why the visitor will return', type: 'multiline', rows: 2 },
  ],
})

export const refusalMatrixSection = (): ManifestSection => ({
  title: 'Refusal Review & Reapplication Matrix',
  intro: 'Map each refusal concern to fresh evidence. Not a guarantee of approval.',
  fields: [
    { id: 'concern1_label', label: 'Concern 1 — area', type: 'text', placeholder: 'Purpose of visit / study' },
    { id: 'concern1_quote', label: 'Concern 1 — wording from refusal letter', type: 'multiline', rows: 2 },
    { id: 'concern1_gap', label: 'Concern 1 — evidence missing', type: 'multiline', rows: 2 },
    { id: 'concern1_new_evidence', label: 'Concern 1 — new evidence', type: 'multiline', rows: 2 },
    { id: 'concern1_explanation', label: 'Concern 1 — explanation', type: 'multiline', rows: 2 },
    { id: 'concern1_status', label: 'Concern 1 — status', type: 'select', options: ['Open', 'In progress', 'Ready'] },
    { id: 'concern2_label', label: 'Concern 2 — area', type: 'text' },
    { id: 'concern2_quote', label: 'Concern 2 — wording from refusal letter', type: 'multiline', rows: 2 },
    { id: 'concern2_new_evidence', label: 'Concern 2 — new evidence', type: 'multiline', rows: 2 },
    { id: 'concern2_status', label: 'Concern 2 — status', type: 'select', options: ['Open', 'In progress', 'Ready'] },
    { id: 'concern3_label', label: 'Concern 3 — area', type: 'text' },
    { id: 'concern3_new_evidence', label: 'Concern 3 — new evidence', type: 'multiline', rows: 2 },
    { id: 'concern3_status', label: 'Concern 3 — status', type: 'select', options: ['Open', 'In progress', 'Ready'] },
    { id: 'reapplication_statement', label: 'Reapplication statement (draft)', type: 'multiline', rows: 8 },
  ],
})

export const intakeFormSection = (): ManifestSection => ({
  title: 'Client Intake',
  intro: 'Bridges the consultant intake conversation into a single document.',
  fields: [
    { id: 'target_country', label: 'Destination country', type: 'text' },
    { id: 'application_type', label: 'Application type', type: 'text' },
    { id: 'intended_start_date', label: 'Intended start / travel date', type: 'date' },
    { id: 'school_employer_host', label: 'School / employer / host', type: 'text' },
    { id: 'previous_refusals', label: 'Previous visa refusals', type: 'multiline', rows: 3 },
    { id: 'previous_travel_to_destination', label: 'Previous travel to destination', type: 'multiline', rows: 2 },
    { id: 'admissibility_issues', label: 'Criminal / medical / admissibility issues disclosed', type: 'multiline', rows: 3 },
    { id: 'current_immigration_status', label: 'Current immigration status (if applicable)', type: 'text' },
    { id: 'doc_passport_status', label: 'Passport status', type: 'select', options: ['Ready', 'Missing', 'Expires soon'] },
    { id: 'doc_admission_status', label: 'Admission letter / job offer / invitation', type: 'select', options: ['Ready', 'Missing'] },
    { id: 'doc_financials_status', label: 'Financial evidence', type: 'select', options: ['Ready', 'Missing', 'Needs review'] },
    { id: 'doc_transcripts_status', label: 'Transcripts / certificates', type: 'select', options: ['Ready', 'Missing'] },
    { id: 'doc_employment_status', label: 'Employment / business evidence', type: 'select', options: ['Ready', 'Missing'] },
    { id: 'consultant_notes', label: 'Consultant notes', type: 'multiline', rows: 6 },
  ],
})

// ---- Catalogue-includes fallback ----

export function includesFallbackSections(includes: string[]): ManifestSection[] {
  // TODO: refine from worksheet — used when no on-disk worksheet maps
  // cleanly to a real field set. Produces one multiline note per include.
  return includes.map((title) => ({
    title,
    fields: [
      {
        id: `note_${title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40)}`,
        label: 'Notes',
        type: 'multiline' as const,
        rows: 5,
        help: 'Capture the planning notes for this section here.',
      } satisfies ManifestField,
    ],
  }))
}
