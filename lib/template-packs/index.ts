import catalogue from './catalogue.json'

export interface TemplatePack {
  slug: string
  name: string
  category: string
  badge: string
  price_usd: number
  placeholder_label: string
  short_description: string
  includes: string[]
  official_sources: string[]
  delivery_file: string
  product_type: string
}

export const TEMPLATE_PACKS: TemplatePack[] = catalogue as TemplatePack[]

export function getTemplatePack(slug: string): TemplatePack | undefined {
  return TEMPLATE_PACKS.find((p) => p.slug === slug)
}

export function getTemplatePackPriceCents(slug: string): number | undefined {
  const pack = getTemplatePack(slug)
  if (!pack) return undefined
  return Math.round(pack.price_usd * 100)
}
