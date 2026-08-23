import { getTemplateCatalogue } from '@/lib/mobileIap'

export async function GET() {
  return Response.json({ packs: getTemplateCatalogue() })
}