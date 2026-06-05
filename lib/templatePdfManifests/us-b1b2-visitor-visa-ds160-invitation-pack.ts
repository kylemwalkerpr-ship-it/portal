import type { TemplatePdfManifest } from '@/lib/pdfGenerator'
import {
  clientIdentitySection,
  ds160VisitorWorksheetSection,
  documentTrackerSection,
  invitationLetterSection,
  travelHistorySection,
} from './_shared'

const manifest: TemplatePdfManifest = {
  slug: 'us-b1b2-visitor-visa-ds160-invitation-pack',
  sections: [
    clientIdentitySection(),
    ds160VisitorWorksheetSection(),
    invitationLetterSection(),
    {
      title: 'Travel Itinerary',
      intro: 'Day-by-day itinerary increases credibility for visitor visas.',
      fields: [
        { id: 'itinerary_arrival_city', label: 'Arrival city', type: 'text' },
        { id: 'itinerary_arrival_date', label: 'Arrival date', type: 'date' },
        { id: 'itinerary_departure_city', label: 'Departure city', type: 'text' },
        { id: 'itinerary_departure_date', label: 'Departure date', type: 'date' },
        { id: 'itinerary_day_by_day', label: 'Day-by-day plan', type: 'multiline', rows: 8 },
        { id: 'itinerary_accommodation_summary', label: 'Accommodation summary', type: 'multiline', rows: 3 },
      ],
    },
    travelHistorySection(),
    documentTrackerSection(),
  ],
}

export default manifest
