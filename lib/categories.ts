/**
 * Marketplace Category System
 *
 * This file defines the normalized category hierarchy for the YouSafe marketplace.
 * Categories are organized by parent categories and subcategories, with support for
 * multiple verticals (study-abroad, legal, business, etc.).
 *
 * Categories are derived from existing services, gigs, intake questions, and other
 * platform structures to ensure consistency across the marketplace.
 */

export type CategoryId = string
export type SubcategoryId = string
export type Vertical = 'study-abroad' | 'legal' | 'business' | 'career' | 'settlement' | 'general'

export interface Category {
  id: CategoryId
  name: string
  description: string
  icon: string
  vertical: Vertical
  subcategories: Subcategory[]
  popular: boolean
  order: number
  sourceLabels?: string[]
  sourceCount?: number
}

export interface Subcategory {
  id: SubcategoryId
  name: string
  description: string
  keywords: string[]
  popular: boolean
  order: number
}

/**
 * Parent Categories
 * These are the top-level categories that appear in the marketplace navigation.
 */
export const CATEGORIES: Category[] = [
  {
    id: 'immigration',
    name: 'Immigration Services',
    description: 'Visa applications, permits, and immigration support',
    icon: '🛂',
    vertical: 'study-abroad',
    popular: true,
    order: 1,
    subcategories: [
      {
        id: 'study-permits',
        name: 'Study Permits',
        description: 'F-1, student visas, and study permit applications',
        keywords: ['f1', 'f-1', 'student visa', 'study permit', 'cas', 'dli'],
        popular: true,
        order: 1,
      },
      {
        id: 'work-permits',
        name: 'Work Permits',
        description: 'OPT, CPT, H-1B, LMIA, and work authorization',
        keywords: ['opt', 'cpt', 'h1b', 'h-1b', 'lmi', 'work permit', 'tn', 'e3'],
        popular: true,
        order: 2,
      },
      {
        id: 'pr-immigration',
        name: 'PR & Immigration',
        description: 'Express Entry, PNP, green cards, and permanent residency',
        keywords: ['express entry', 'pnp', 'green card', 'permanent residency', 'pr', 'ilr'],
        popular: true,
        order: 3,
      },
      {
        id: 'family-sponsorship',
        name: 'Family Sponsorship',
        description: 'Spousal, parent, and family-based immigration',
        keywords: ['spouse', 'partner', 'family', 'sponsorship', 'k1', 'fiance'],
        popular: false,
        order: 4,
      },
      {
        id: 'visitor-visas',
        name: 'Visitor Visas',
        description: 'B-1/B-2, tourist visas, and temporary resident visas',
        keywords: ['b1', 'b2', 'visitor', 'tourist', 'trv', 'temporary resident'],
        popular: false,
        order: 5,
      },
      {
        id: 'citizenship',
        name: 'Citizenship',
        description: 'Naturalization, citizenship tests, and applications',
        keywords: ['citizenship', 'naturalization', 'test', 'oath'],
        popular: false,
        order: 6,
      },
    ],
  },
  {
    id: 'education',
    name: 'Education & Admissions',
    description: 'University applications, admissions, and academic support',
    icon: '🎓',
    vertical: 'study-abroad',
    popular: true,
    order: 2,
    subcategories: [
      {
        id: 'university-admissions',
        name: 'University Admissions',
        description: 'College applications, essays, and admissions consulting',
        keywords: ['university', 'college', 'admissions', 'application', 'essay', 'personal statement'],
        popular: true,
        order: 1,
      },
      {
        id: 'graduate-school',
        name: 'Graduate School',
        description: 'Master\'s, PhD, and graduate program applications',
        keywords: ['masters', 'phd', 'graduate', 'research', 'thesis'],
        popular: false,
        order: 2,
      },
      {
        id: 'scholarships',
        name: 'Scholarships & Funding',
        description: 'Scholarship applications, financial aid, and funding',
        keywords: ['scholarship', 'funding', 'financial aid', 'grant', 'fellowship'],
        popular: false,
        order: 3,
      },
      {
        id: 'test-prep',
        name: 'Test Preparation',
        description: 'IELTS, TOEFL, GRE, GMAT, and other test prep',
        keywords: ['ielts', 'toefl', 'gre', 'gmat', 'sat', 'act', 'test prep'],
        popular: false,
        order: 4,
      },
      {
        id: 'academic-mentoring',
        name: 'Academic Mentoring',
        description: 'Study skills, academic coaching, and tutoring',
        keywords: ['tutoring', 'mentoring', 'study skills', 'academic coaching'],
        popular: false,
        order: 5,
      },
    ],
  },
  {
    id: 'legal',
    name: 'Legal Services',
    description: 'Document preparation, legal review, and attorney services',
    icon: '⚖️',
    vertical: 'legal',
    popular: true,
    order: 3,
    subcategories: [
      {
        id: 'document-prep',
        name: 'Document Preparation',
        description: 'Form preparation, document organization, and filing support',
        keywords: ['document prep', 'forms', 'filing', 'preparation'],
        popular: true,
        order: 1,
      },
      {
        id: 'attorney-review',
        name: 'Attorney Review',
        description: 'Legal document review and attorney consultation',
        keywords: ['attorney', 'lawyer', 'legal review', 'consultation'],
        popular: true,
        order: 2,
      },
      {
        id: 'legal-consultation',
        name: 'Legal Consultation',
        description: 'Legal advice, strategy sessions, and case evaluation',
        keywords: ['legal advice', 'consultation', 'strategy', 'case evaluation'],
        popular: false,
        order: 3,
      },
      {
        id: 'business-formation',
        name: 'Business Formation',
        description: 'LLC formation, incorporation, and business setup',
        keywords: ['llc', 'incorporation', 'business formation', 'startup'],
        popular: false,
        order: 4,
      },
      {
        id: 'compliance',
        name: 'Compliance',
        description: 'Regulatory compliance, filings, and reporting',
        keywords: ['compliance', 'regulatory', 'filings', 'reporting'],
        popular: false,
        order: 5,
      },
    ],
  },
  {
    id: 'settlement',
    name: 'Settlement & Integration',
    description: 'Housing, banking, and settlement support',
    icon: '🏠',
    vertical: 'settlement',
    popular: true,
    order: 4,
    subcategories: [
      {
        id: 'housing',
        name: 'Housing',
        description: 'Rental applications, tenancy issues, and housing support',
        keywords: ['housing', 'rental', 'tenancy', 'apartment', 'lease'],
        popular: true,
        order: 1,
      },
      {
        id: 'banking-finance',
        name: 'Banking & Finance',
        description: 'Bank accounts, credit cards, and financial setup',
        keywords: ['banking', 'credit', 'finance', 'bank account'],
        popular: false,
        order: 2,
      },
      {
        id: 'healthcare',
        name: 'Healthcare',
        description: 'Health insurance, medical setup, and healthcare navigation',
        keywords: ['healthcare', 'health insurance', 'medical', 'doctor'],
        popular: false,
        order: 3,
      },
      {
        id: 'daily-life',
        name: 'Daily Life Setup',
        description: 'Phone, internet, transportation, and daily essentials',
        keywords: ['phone', 'internet', 'transportation', 'essentials'],
        popular: false,
        order: 4,
      },
      {
        id: 'cultural-integration',
        name: 'Cultural Integration',
        description: 'Cultural orientation, language support, and community',
        keywords: ['cultural', 'orientation', 'language', 'community'],
        popular: false,
        order: 5,
      },
    ],
  },
  {
    id: 'career',
    name: 'Career Development',
    description: 'Resume, LinkedIn, job search, and career coaching',
    icon: '💼',
    vertical: 'career',
    popular: true,
    order: 5,
    subcategories: [
      {
        id: 'resume-cv',
        name: 'Resume & CV',
        description: 'Resume writing, CV optimization, and document review',
        keywords: ['resume', 'cv', 'curriculum vitae', 'document review'],
        popular: true,
        order: 1,
      },
      {
        id: 'linkedin',
        name: 'LinkedIn & Personal Branding',
        description: 'LinkedIn optimization, personal branding, and online presence',
        keywords: ['linkedin', 'personal branding', 'online presence', 'profile'],
        popular: true,
        order: 2,
      },
      {
        id: 'job-search',
        name: 'Job Search',
        description: 'Job search strategy, applications, and interview prep',
        keywords: ['job search', 'applications', 'interview', 'networking'],
        popular: false,
        order: 3,
      },
      {
        id: 'career-coaching',
        name: 'Career Coaching',
        description: 'Career planning, transitions, and professional development',
        keywords: ['career coaching', 'planning', 'transition', 'development'],
        popular: false,
        order: 4,
      },
      {
        id: 'internships',
        name: 'Internships & Co-ops',
        description: 'Internship search, applications, and placement support',
        keywords: ['internship', 'co-op', 'placement', 'experience'],
        popular: false,
        order: 5,
      },
    ],
  },
  {
    id: 'business',
    name: 'Business Services',
    description: 'Business consulting, strategy, and professional services',
    icon: '📊',
    vertical: 'business',
    popular: false,
    order: 6,
    subcategories: [
      {
        id: 'business-consulting',
        name: 'Business Consulting',
        description: 'Strategy, operations, and business improvement',
        keywords: ['consulting', 'strategy', 'operations', 'improvement'],
        popular: false,
        order: 1,
      },
      {
        id: 'marketing',
        name: 'Marketing & Branding',
        description: 'Marketing strategy, branding, and digital marketing',
        keywords: ['marketing', 'branding', 'digital marketing', 'strategy'],
        popular: false,
        order: 2,
      },
      {
        id: 'finance-accounting',
        name: 'Finance & Accounting',
        description: 'Financial planning, accounting, and bookkeeping',
        keywords: ['finance', 'accounting', 'bookkeeping', 'financial planning'],
        popular: false,
        order: 3,
      },
      {
        id: 'grant-writing',
        name: 'Grant Writing',
        description: 'Grant applications, proposals, and funding support',
        keywords: ['grant', 'proposal', 'funding', 'application'],
        popular: false,
        order: 4,
      },
      {
        id: 'tax-advisory',
        name: 'Tax Advisory',
        description: 'Tax planning, filing, and advisory services',
        keywords: ['tax', 'filing', 'planning', 'advisory'],
        popular: false,
        order: 5,
      },
    ],
  },
  {
    id: 'credentials',
    name: 'Credentials & Assessment',
    description: 'Credential evaluation, assessment, and recognition',
    icon: '📜',
    vertical: 'general',
    popular: false,
    order: 7,
    subcategories: [
      {
        id: 'credential-assessment',
        name: 'Credential Assessment',
        description: 'Foreign credential evaluation and assessment',
        keywords: ['credential', 'assessment', 'evaluation', 'foreign'],
        popular: false,
        order: 1,
      },
      {
        id: 'license-certification',
        name: 'License & Certification',
        description: 'Professional licensing and certification support',
        keywords: ['license', 'certification', 'professional', 'licensing'],
        popular: false,
        order: 2,
      },
      {
        id: 'education-verification',
        name: 'Education Verification',
        description: 'Degree verification and education documentation',
        keywords: ['verification', 'degree', 'education', 'documentation'],
        popular: false,
        order: 3,
      },
    ],
  },
  {
    id: 'mentorship',
    name: 'Mentorship & Coaching',
    description: 'Ongoing mentorship, coaching, and guidance',
    icon: '🤝',
    vertical: 'general',
    popular: false,
    order: 8,
    subcategories: [
      {
        id: 'student-mentorship',
        name: 'Student Mentorship',
        description: 'Ongoing student support and guidance',
        keywords: ['student', 'mentorship', 'guidance', 'support'],
        popular: false,
        order: 1,
      },
      {
        id: 'professional-coaching',
        name: 'Professional Coaching',
        description: 'Career and professional development coaching',
        keywords: ['professional', 'coaching', 'development', 'career'],
        popular: false,
        order: 2,
      },
      {
        id: 'life-coaching',
        name: 'Life Coaching',
        description: 'Personal development and life coaching',
        keywords: ['life coaching', 'personal development', 'coaching'],
        popular: false,
        order: 3,
      },
    ],
  },
]

/**
 * Helper functions for category operations
 */

export function getCategoryById(id: CategoryId): Category | undefined {
  return CATEGORIES.find(cat => cat.id === id)
}

export function getSubcategoryById(
  categoryId: CategoryId,
  subcategoryId: SubcategoryId
): Subcategory | undefined {
  return getCategoryById(categoryId)?.subcategories.find(
    sub => sub.id === subcategoryId
  )
}

export function getCategoryBySubcategoryId(subcategoryId: SubcategoryId): Category | undefined {
  return CATEGORIES.find(cat => cat.subcategories.some(sub => sub.id === subcategoryId))
}

export function getPopularCategories(): Category[] {
  return CATEGORIES.filter(cat => cat.popular).sort((a, b) => a.order - b.order)
}

export function getCategoriesByVertical(vertical: Vertical): Category[] {
  return CATEGORIES.filter(cat => cat.vertical === vertical).sort(
    (a, b) => a.order - b.order
  )
}

export function searchCategories(query: string): Category[] {
  const lowerQuery = query.toLowerCase()
  return CATEGORIES.filter(
    cat =>
      cat.name.toLowerCase().includes(lowerQuery) ||
      cat.description.toLowerCase().includes(lowerQuery) ||
      cat.subcategories.some(
        sub =>
          sub.name.toLowerCase().includes(lowerQuery) ||
          sub.keywords.some(kw => kw.toLowerCase().includes(lowerQuery))
      )
  )
}

export function getAllSubcategories(): Subcategory[] {
  return CATEGORIES.flatMap(cat =>
    cat.subcategories.map(sub => ({
      ...sub,
      categoryId: cat.id,
      categoryName: cat.name,
    }))
  )
}

/**
 * Category provenance pulled from the existing portal/service catalogue,
 * legal service seeds, and public consultancy service pages. This lets the
 * marketplace use one normalized taxonomy while still matching legacy service
 * rows and older gig categories already stored in Supabase.
 */
export const CATEGORY_SOURCE_LABELS: Record<CategoryId, string[]> = {
  immigration: [
    'Immigration consultation',
    'Business immigration',
    'USA Study',
    'USA Visitor',
    'USA Work After Study',
    'USA Financial Support',
    'Canada Study',
    'Canada Visitor',
    'Canada Work',
    'Canada Work After Study',
    'Canada General',
    'Refusal Recovery',
    'General Intake',
    'Bundle',
  ],
  'study-permits': [
    'Study Permits',
    'Study Permit Starter Package',
    'Study Permit Standard Package',
    'Study Permit Premium Package',
    'Study Permit & Visa Consulting',
    'USA F-1 Student Visa DS-160 + I-20 Preparation Pack',
    'Canada Study Permit Complete Application Preparation Pack',
    'Canada Study Plan + Letter of Explanation Pack',
  ],
  'visitor-visas': [
    'USA Visitor',
    'Canada Visitor',
    'USA B-1/B-2 Visitor Visa DS-160 + Invitation Pack',
    'Canada Temporary Resident Visa Visitor Pack',
  ],
  'work-permits': [
    'USA Work After Study',
    'Canada Work',
    'Canada Work After Study',
    'PGWP Only Package',
    'USA F-1 OPT I-765 Application Preparation Pack',
    'USA STEM OPT I-765 + I-983 Companion Pack',
    'Canada Work Permit Outside Canada Preparation Pack',
    'Canada PGWP Post-Graduation Work Permit Pack',
  ],
  'pr-immigration': [
    'Post-Graduate',
    'PR & Immigration',
    'PR Roadmap Package',
    'Full PR Acceleration Package',
    'USA/Canada Refusal Review + Reapplication Response Pack',
  ],
  education: ['University Admissions', 'Education planning', 'Admissions'],
  'university-admissions': [
    'University Admission Basic',
    'University Admission Comprehensive',
    'University Admission Elite',
  ],
  legal: ['Legal Consulting', 'Legal Services', 'Attorney Engagement'],
  'document-prep': [
    'Document review',
    'Legal forms review',
    'Document Preparation',
    'Legal Document Prep — Basic',
    'Universal Immigration Client Intake + Document Review Kit',
  ],
  'attorney-review': [
    'Attorney Review',
    'Legal Document Prep + Attorney Review — Essential',
    'Document Prep + Live Consultation — Enhanced',
  ],
  'legal-consultation': ['Attorney Engagement', 'Full Attorney Engagement — Professional'],
  settlement: [
    'Settlement',
    'Settlement planning',
    'Arrival Essentials Package',
    'Full Settlement Package',
    'Premium Integration Package',
  ],
  career: ['Career', 'Resume Services', 'Career mentorship'],
  'resume-cv': ['Resume & LinkedIn Glow-Up', 'Resume Services'],
  linkedin: ['Resume & LinkedIn Glow-Up', 'LinkedIn'],
  'job-search': ['Job Search Mastery', 'Premium Placement Package'],
  mentorship: ['Mentorship', 'Monthly Mentorship', 'Quarterly Mentorship', 'Annual Mentorship'],
  credentials: ['Credentials', 'Credential Assessment Guided', 'Credential Assessment Full + Appeal'],
  business: ['Business Services', 'Business Formation', 'Tax Advisory', 'Compliance', 'Grant Writing'],
  'business-formation': ['Business Formation'],
  compliance: ['Compliance'],
  'grant-writing': ['Grant Writing'],
  'tax-advisory': ['Tax Advisory'],
}

export function getCategorySourceLabels(categoryId: CategoryId): string[] {
  const category = getCategoryById(categoryId)
  const subcategoryCategory = category ? undefined : getCategoryBySubcategoryId(categoryId)
  const sourceIds = category
    ? [category.id, ...category.subcategories.map(sub => sub.id)]
    : [categoryId]

  const labels = new Set<string>()
  if (category) labels.add(category.name)
  if (subcategoryCategory) {
    const sub = getSubcategoryById(subcategoryCategory.id, categoryId)
    if (sub) labels.add(sub.name)
  }
  sourceIds.forEach(id => {
    ;(CATEGORY_SOURCE_LABELS[id] || []).forEach(label => labels.add(label))
  })
  return Array.from(labels)
}

export function getCategoryFilterTerms(categoryId: CategoryId): string[] {
  const category = getCategoryById(categoryId)
  const subcategoryCategory = category ? undefined : getCategoryBySubcategoryId(categoryId)
  const terms = new Set<string>()

  if (category) {
    terms.add(category.id)
    terms.add(category.name)
    category.subcategories.forEach(sub => {
      terms.add(sub.id)
      terms.add(sub.name)
      ;(CATEGORY_SOURCE_LABELS[sub.id] || []).forEach(label => terms.add(label))
    })
  } else if (subcategoryCategory) {
    const sub = getSubcategoryById(subcategoryCategory.id, categoryId)
    terms.add(subcategoryCategory.id)
    terms.add(subcategoryCategory.name)
    terms.add(categoryId)
    if (sub) terms.add(sub.name)
  } else if (categoryId) {
    terms.add(categoryId)
  }

  getCategorySourceLabels(categoryId).forEach(label => terms.add(label))
  return Array.from(terms).filter(Boolean)
}

export function getCategoryPath(
  categoryId: CategoryId,
  subcategoryId?: SubcategoryId
): string {
  const category = getCategoryById(categoryId)
  if (!category) return ''

  if (subcategoryId) {
    const subcategory = getSubcategoryById(categoryId, subcategoryId)
    return subcategory
      ? `${category.name} > ${subcategory.name}`
      : category.name
  }

  return category.name
}

/**
 * Legacy category mapping for backward compatibility
 * Maps old category names to new category IDs
 */
export const LEGACY_CATEGORY_MAP: Record<string, CategoryId> = {
  'Immigration consultation': 'immigration',
  'Document review': 'document-prep',
  'Study permits': 'study-permits',
  'University admissions': 'university-admissions',
  'Settlement planning': 'settlement',
  'Career mentorship': 'career-coaching',
  'Legal forms review': 'document-prep',
  'Business immigration': 'immigration',
  'Study Permits': 'study-permits',
  'University Admissions': 'university-admissions',
  'Post-Graduate': 'pr-immigration',
  'PR & Immigration': 'pr-immigration',
  'Settlement': 'settlement',
  'Mentorship': 'mentorship',
  'Credentials': 'credentials',
  'Career': 'career',
  'Document Preparation': 'document-prep',
  'Attorney Review': 'attorney-review',
  'Attorney Engagement': 'legal-consultation',
  'USA Study': 'study-permits',
  'USA Visitor': 'visitor-visas',
  'USA Work After Study': 'work-permits',
  'USA Financial Support': 'family-sponsorship',
  'Canada Study': 'study-permits',
  'Canada Visitor': 'visitor-visas',
  'Canada Work': 'work-permits',
  'Canada Work After Study': 'work-permits',
  'Canada General': 'immigration',
  'Refusal Recovery': 'pr-immigration',
  'General Intake': 'document-prep',
  'Bundle': 'immigration',
}

/**
 * Normalize a legacy category name to a new category ID
 */
export function normalizeCategory(category: string): CategoryId {
  return LEGACY_CATEGORY_MAP[category] || category.toLowerCase().replace(/\s+/g, '-')
}
