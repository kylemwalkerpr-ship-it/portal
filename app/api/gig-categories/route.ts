import { ok } from '@/lib/apiEnvelope'

const CATEGORIES = [
  'Immigration consultation',
  'Document review',
  'Study permits',
  'University admissions',
  'Settlement planning',
  'Career mentorship',
  'Legal forms review',
  'Business immigration',
]

export async function GET() {
  return ok({ categories: CATEGORIES })
}
