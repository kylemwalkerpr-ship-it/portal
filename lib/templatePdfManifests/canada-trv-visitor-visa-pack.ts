import type { TemplatePdfManifest } from '@/lib/pdfGenerator'
import {
  clientIdentitySection,
  coverLetterSection,
  documentTrackerSection,
  invitationLetterSection,
  travelHistorySection,
} from './_shared'

const manifest: TemplatePdfManifest = {
  slug: 'canada-trv-visitor-visa-pack',
  sections: [
    clientIdentitySection(),
    {
      title: 'IMM 5257 Prep Worksheet',
      intro: 'Notes-only sheet for the IRCC Application for Temporary Resident Visa form.',
      fields: [
        { id: 'uci_number', label: 'UCI (if previously issued)', type: 'text' },
        { id: 'application_type', label: 'Application type', type: 'select', options: ['Single entry', 'Multiple entry', 'Super Visa'] },
        { id: 'planned_arrival_date', label: 'Planned arrival date', type: 'date' },
        { id: 'planned_departure_date', label: 'Planned departure date', type: 'date' },
        { id: 'destination_cities', label: 'Cities you will visit in Canada', type: 'multiline', rows: 2 },
        { id: 'funds_available_cad', label: 'Funds available for trip (CAD)', type: 'text' },
        { id: 'who_is_paying', label: 'Who is paying for the trip', type: 'text' },
      ],
    },
    invitationLetterSection(),
    {
      title: 'Host Support Statement',
      fields: [
        { id: 'host_canadian_status', label: 'Host Canadian status', type: 'select', options: ['Citizen', 'Permanent resident', 'Worker', 'Student', 'Other'] },
        { id: 'host_proof_of_status', label: 'Proof of host status document', type: 'text' },
        { id: 'host_address_proof', label: 'Proof of host address', type: 'text' },
        { id: 'host_financial_capacity', label: 'Host financial capacity summary', type: 'multiline', rows: 3 },
      ],
    },
    {
      title: 'Travel Itinerary',
      fields: [
        { id: 'itinerary_day_by_day', label: 'Day-by-day plan', type: 'multiline', rows: 8 },
        { id: 'itinerary_return_flight_booked', label: 'Return flight booked?', type: 'select', options: ['Yes', 'Tentative', 'No'] },
      ],
    },
    travelHistorySection(),
    coverLetterSection(),
    documentTrackerSection(),
  ],
}

export default manifest
