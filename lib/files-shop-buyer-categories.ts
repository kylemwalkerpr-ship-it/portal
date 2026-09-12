import { IMMIGRATION_SHOP_PRODUCTS } from '@/lib/immigration-shop-products'

export type FileShopBuyerCategory =
  | 'immigration'
  | 'business'
  | 'marketing'
  | 'planning'
  | 'career'
  | 'weddings-creative'

export interface FileShopBuyerCategoryDefinition {
  id: FileShopBuyerCategory
  label: string
  description: string
}

export const FILE_SHOP_BUYER_CATEGORIES: readonly FileShopBuyerCategoryDefinition[] = [
  {
    id: 'immigration',
    label: 'Immigration Packs',
    description: 'USA & Canada visa, study, work and document-preparation packs.',
  },
  {
    id: 'business',
    label: 'Business & Freelance',
    description: 'Client, pricing, startup, cash-flow, property and pitch tools.',
  },
  {
    id: 'marketing',
    label: 'Marketing & Content',
    description: 'Content planning, social templates and practical AI prompt guides.',
  },
  {
    id: 'planning',
    label: 'Personal Planning',
    description: 'Budget, meal, habit, reflection and digital planning tools.',
  },
  {
    id: 'career',
    label: 'Career & Job Search',
    description: 'ATS-friendly resume and cover-letter resources.',
  },
  {
    id: 'weddings-creative',
    label: 'Weddings & Creative',
    description: 'Wedding planning, stationery, printable art and SVG cut files.',
  },
]

const IMMIGRATION_PRODUCT_IDS = new Set(IMMIGRATION_SHOP_PRODUCTS.map((product) => product.slug))

const BASE_PRODUCT_BUYER_CATEGORY: Record<string, FileShopBuyerCategory> = {
  'consultant-toolkit': 'business',
  'ai-prompts-business': 'business',
  'rate-calculator': 'business',
  'budget-debt-planner': 'planning',
  'wedding-budget-planner': 'weddings-creative',
  'content-calendar': 'marketing',
  'rental-tracker': 'business',
  'ai-prompts-creators': 'marketing',
  'habit-tracker': 'planning',
  'startup-checklist': 'business',
  'meal-planner': 'planning',
  'resume-template': 'career',
  'wedding-stationery': 'weddings-creative',
  'welcome-packet': 'business',
  'pitch-deck': 'business',
  'social-templates': 'marketing',
  'digital-planner': 'planning',
  'wall-art': 'weddings-creative',
  'svg-bundle': 'weddings-creative',
  'reflection-journal': 'planning',
}

export function getFileShopBuyerCategory(productId: string): FileShopBuyerCategory | null {
  if (IMMIGRATION_PRODUCT_IDS.has(productId)) return 'immigration'
  return BASE_PRODUCT_BUYER_CATEGORY[productId] ?? null
}
