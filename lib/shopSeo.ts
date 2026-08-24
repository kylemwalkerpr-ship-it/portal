/**
 * Shop SEO — Content Studio tab for managing shop-product blog articles.
 *
 * Maps the 20 Payhip digital products to the Apex blog (yousafe-consultancy/landing-page).
 * Jobs flow: queued → drafting → drafted → shipped.
 *
 * Do NOT edit yousafe-consultancy marketing/SEO sites from here unless
 * the generate-ship path explicitly targets landing-page/app/blog/.
 */

// ---- Product Model ----

export interface ShopSeoProduct {
  /** URL-safe slug used for the blog path and queue id */
  slug: string
  title: string
  /** Exact product title from HANDOFF_PACKAGE.md */
  productTitle: string
  /** Price in USD from HANDOFF_PACKAGE.md */
  price: number
  format: 'Excel/Sheets' | 'PDF' | 'Word' | 'PowerPoint' | 'ZIP'
  category: 'Spreadsheet' | 'Guide' | 'Template' | 'Craft/Print'
  /** Payhip checkout URL (placeholder until products go live) */
  payhipUrl: string
  /** Full listing copy from HANDOFF_PACKAGE.md §6 */
  fullDescription: string
  /** Short card preview from HANDOFF_PACKAGE.md */
  shortDescription: string
  tags: string[]
  /** Slug-safe version of the product number from the staggered schedule */
  publishDay?: number
}

// ---- Queue Model ----

export type ShopSeoStatus = 'queued' | 'drafting' | 'drafted' | 'shipped'

export interface ShopSeoQueueItem {
  slug: string
  status: ShopSeoStatus
  blogSlug: string
  blogTitle: string
  createdAt: string
  draftedAt?: string
  shippedAt?: string
}

// ---- All 20 products (from HANDOFF_PACKAGE.md) ----

const SHOP_PRODUCTS: ShopSeoProduct[] = [
  {
    slug: 'consultant-toolkit',
    title: 'Solo Consultant Business Toolkit: The Spreadsheet That Runs Your Practice',
    productTitle: 'Solo Consultant Business Toolkit — Client Tracker, Invoice Log & Cash Flow Dashboard',
    price: 12,
    format: 'Excel/Sheets',
    category: 'Spreadsheet',
    payhipUrl: 'https://payhip.com/b/xQg6i',
    shortDescription: 'Stop guessing who owes you what. One spreadsheet to track clients, log invoices, and see your real cash flow — no accounting degree needed.',
    fullDescription: `Built for freelancers, consultants, and solo service providers done running their business out of memory and scattered notes.

- Client tracker — status, source, monthly value, notes
- Invoice log — issue date, due date, paid status
- Categorized expense tracker
- Auto-calculating dashboard — active clients, total invoiced, total paid, outstanding, overdue count, net cash flow

Compatible with Excel and Google Sheets. Instant download.`,
    tags: ['freelancer template', 'consultant spreadsheet', 'invoice tracker', 'client management', 'small business finance', 'cash flow dashboard'],
    publishDay: 1,
  },
  {
    slug: 'ai-prompts-business',
    title: '50 AI Prompts That Actually Help Small Business Owners (Not Just Hype)',
    productTitle: '50 AI Prompts for Small Business Owners — Marketing, Sales, Admin & Strategy',
    price: 9,
    format: 'PDF',
    category: 'Guide',
    payhipUrl: 'https://payhip.com/b/rlsyK',
    shortDescription: '50 copy-paste AI prompts for the parts of running a business that eat your week — marketing, sales follow-ups, customer replies, admin, and planning.',
    fullDescription: `50 prompts across 6 categories: Marketing & Social Media, Sales & Outreach, Customer Service, Admin & Operations, Content & Copywriting, Strategy & Planning. Copy-paste ready, includes usage tips and ground rules for using AI safely in a business.

10-page PDF. Instant download.`,
    tags: ['ai prompts', 'chatgpt prompts', 'small business guide', 'marketing prompts', 'productivity', 'claude prompts'],
    publishDay: 1,
  },
  {
    slug: 'rate-calculator',
    title: 'Freelance Rate Calculator: Charge What You\'re Worth, Know What You Actually Earn',
    productTitle: 'Freelance Rate Calculator & Project Profitability Tracker',
    price: 10,
    format: 'Excel/Sheets',
    category: 'Spreadsheet',
    payhipUrl: 'https://payhip.com/b/ZLyP9',
    shortDescription: 'Know exactly what to charge, then track whether every project actually pays what you need.',
    fullDescription: `Stop guessing at your rates and hoping it works out.

- Automatic hourly and day rate calculator based on income goal, expenses, and billable hours
- Project tracker showing effective hourly rate on every job
- Works whether you price hourly, by project, or by day

Compatible with Excel and Google Sheets.`,
    tags: ['freelance rate calculator', 'hourly rate', 'freelancer pricing', 'project profitability', 'consultant rate', 'pricing calculator'],
    publishDay: 11,
  },
  {
    slug: 'budget-debt-planner',
    title: 'Household Budget & Debt Payoff Planner: See Where Your Money Goes',
    productTitle: 'Household Budget Planner & Debt Payoff Tracker',
    price: 10,
    format: 'Excel/Sheets',
    category: 'Spreadsheet',
    payhipUrl: 'https://payhip.com/b/sjFIf',
    shortDescription: 'See exactly where your money goes each month, and how long until each debt is paid off.',
    fullDescription: `A no-nonsense budgeting system for real households.

- Full monthly income/expense breakdown with automatic leftover calculation
- Debt payoff estimator — balance, interest rate, payment → months until paid off
- Dashboard summarizing your full financial picture

Compatible with Excel and Google Sheets.`,
    tags: ['budget planner', 'debt payoff tracker', 'debt snowball', 'monthly budget', 'personal finance', 'money management'],
    publishDay: 4,
  },
  {
    slug: 'wedding-budget-planner',
    title: 'Wedding Budget Planner: Track Every Vendor, Every Dollar, Every Time',
    productTitle: 'Wedding Budget Planner & Vendor Tracker',
    price: 11,
    format: 'Excel/Sheets',
    category: 'Spreadsheet',
    payhipUrl: 'https://payhip.com/b/tWBz2',
    shortDescription: 'Track every wedding category, every vendor deposit, and every dollar — so nothing sneaks up on you.',
    fullDescription: `10 pre-built budget categories (venue, catering, attire, photography, etc.), vendor tracker with deposits and balances due, auto-calculating remaining budget by category.

Compatible with Excel and Google Sheets.`,
    tags: ['wedding budget planner', 'wedding planning', 'vendor tracker', 'wedding budget', 'bride spreadsheet', 'expense tracker'],
    publishDay: 7,
  },
  {
    slug: 'content-calendar',
    title: 'Content Calendar & Social Media Planner: Plan It, Post It, Track It',
    productTitle: 'Content Calendar & Social Media Planner',
    price: 9,
    format: 'Excel/Sheets',
    category: 'Spreadsheet',
    payhipUrl: 'https://payhip.com/b/xdCZl',
    shortDescription: 'Plan your posts, track what you publish, and see what\'s actually performing — all in one spreadsheet.',
    fullDescription: `Content calendar with platform/type/status/notes, performance log for likes/comments/shares, dashboard showing posts by status and platform.

Compatible with Excel and Google Sheets.`,
    tags: ['content calendar', 'social media planner', 'content planning', 'instagram planner', 'content scheduling', 'marketing calendar'],
    publishDay: 9,
  },
  {
    slug: 'rental-tracker',
    title: 'Rental Property Income & Expense Tracker: Know Your Real Profit',
    productTitle: 'Rental Property Income & Expense Tracker for Landlords',
    price: 11,
    format: 'Excel/Sheets',
    category: 'Spreadsheet',
    payhipUrl: 'https://payhip.com/b/ROGvC',
    shortDescription: 'Track income and expenses across one or more rental properties, and see your real net income.',
    fullDescription: `Multi-property setup, separate income/expense logs with categories, dashboard showing total income, expenses, and net income per property.

Compatible with Excel and Google Sheets.`,
    tags: ['rental property tracker', 'landlord spreadsheet', 'rental income', 'airbnb expense tracker', 'property management', 'real estate'],
    publishDay: 13,
  },
  {
    slug: 'ai-prompts-creators',
    title: '50 AI Prompts for Content Creators: Video Scripts, Captions, Email & SEO',
    productTitle: '50 AI Prompts for Content Creators & Marketers (ChatGPT & Claude Ready)',
    price: 9,
    format: 'PDF',
    category: 'Guide',
    payhipUrl: 'https://payhip.com/b/ju1Xm',
    shortDescription: 'Copy-paste AI prompts for video scripts, captions, email marketing, SEO, and content strategy.',
    fullDescription: `50 prompts across video/short-form scripts, captions & social copy, email marketing, SEO & blogging, branding & positioning, and content strategy & analytics.

10-page PDF. Instant download.`,
    tags: ['ai prompts creators', 'content creator prompts', 'chatgpt marketing', 'social media prompts', 'video script prompts', 'seo prompts'],
    publishDay: 6,
  },
  {
    slug: 'habit-tracker',
    title: '30-Day Habit & Wellness Tracker: Build One Habit at a Time',
    productTitle: '30-Day Habit & Wellness Tracker (Printable PDF)',
    price: 7,
    format: 'PDF',
    category: 'Guide',
    payhipUrl: 'https://payhip.com/b/Jnm2E',
    shortDescription: 'A simple printable system for building one habit at a time, with weekly check-ins.',
    fullDescription: `Guided section for choosing a realistic habit, 30-day tracker grid, weekly reflection prompts, Day 30 check-in.

7-page PDF. Instant download — print or fill on a tablet.`,
    tags: ['habit tracker', '30 day challenge', 'wellness journal', 'habit building', 'self improvement', 'goal tracker'],
    publishDay: 14,
  },
  {
    slug: 'startup-checklist',
    title: 'Small Business Startup Checklist & 90-Day Launch Plan: From Idea to Customer',
    productTitle: 'Small Business Startup Checklist & 90-Day Launch Plan (Printable PDF)',
    price: 9,
    format: 'PDF',
    category: 'Guide',
    payhipUrl: 'https://payhip.com/b/yJP2Y',
    shortDescription: 'From idea to first paying customer, broken into a pre-launch checklist and a 90-day, week-by-week plan.',
    fullDescription: `Pre-launch checklist (foundations, legal/money, brand, first offer), 90-day plan in 3 phases (Foundation, Launch, Growth), common first-90-days mistakes to avoid.

5-page PDF. Instant download.`,
    tags: ['startup checklist', '90 day plan', 'small business planner', 'business launch', 'entrepreneur checklist'],
    publishDay: 13,
  },
  {
    slug: 'meal-planner',
    title: 'Weekly Meal Planner & Grocery List: Your Shopping List Organizes Itself',
    productTitle: 'Weekly Meal Planner & Grocery List Template — Auto-Updating Shopping List',
    price: 8,
    format: 'Excel/Sheets',
    category: 'Spreadsheet',
    payhipUrl: 'https://payhip.com/b/l3Cdc',
    shortDescription: 'Plan your week\'s meals, log what you need to buy, and watch your shopping list organize itself by category.',
    fullDescription: `Weekly planner grid (breakfast/lunch/dinner/snacks x 7 days), grocery list with category tagging, "Got It?" checkbox, auto-calculating summary of what's left to buy by category.

Compatible with Excel and Google Sheets.`,
    tags: ['meal planner', 'grocery list', 'weekly meal plan', 'meal prep', 'family meal planner', 'shopping list'],
    publishDay: 3,
  },
  {
    slug: 'resume-template',
    title: 'ATS-Friendly Resume + Cover Letter: Get Past the Robots, Impress the Humans',
    productTitle: 'ATS-Friendly Resume Template + Matching Cover Letter (Word, Google Docs Compatible)',
    price: 10,
    format: 'Word',
    category: 'Template',
    payhipUrl: 'https://payhip.com/b/eB2KM',
    shortDescription: 'A clean, ATS-safe resume and matching cover letter — no tables or graphics that get your application silently rejected.',
    fullDescription: `Fully editable resume (summary/experience/education/skills), matching cover letter with paragraph-by-paragraph guidance, no tables/text boxes/columns, bracketed prompts guide what to write.

Delivered as .docx. Instant download.`,
    tags: ['resume template', 'ATS resume', 'cover letter', 'CV template', 'job application', 'professional resume'],
    publishDay: 2,
  },
  {
    slug: 'wedding-stationery',
    title: 'Wedding Invitation Suite: Four Coordinated, Editable Pieces for One Price',
    productTitle: 'Wedding Invitation Suite — Invitation, RSVP Card, Details Card & Thank You Card',
    price: 14,
    format: 'Word',
    category: 'Template',
    payhipUrl: 'https://payhip.com/b/9Pgn8',
    shortDescription: 'Four matching pieces — invitation, RSVP, details card, and thank-you note — in one coordinated, editable set.',
    fullDescription: `Elegant serif invitation with gold-accent detailing, RSVP card with meal preference/guest count, details card (ceremony/reception/accommodations/dress code/registry), thank-you card ready to personalize.

Fully editable in Word. Instant download.`,
    tags: ['wedding invitation', 'wedding stationery', 'editable invite', 'RSVP card', 'DIY wedding'],
    publishDay: 7,
  },
  {
    slug: 'welcome-packet',
    title: 'Client Welcome Packet: The Document That Makes Clients Feel Instantly Confident',
    productTitle: 'Client Welcome Packet Template — Onboarding Document for Freelancers & Consultants',
    price: 9,
    format: 'Word',
    category: 'Template',
    payhipUrl: 'https://payhip.com/b/YngNy',
    shortDescription: 'The document that makes new clients feel instantly confident they hired the right person.',
    fullDescription: `Warm welcome section, "what happens next" timeline, communication/meeting/revision policy sections, what you need from the client, billing/payment terms.

Fully editable in Word. Instant download.`,
    tags: ['client onboarding', 'welcome packet', 'freelance template', 'consultant template', 'new client checklist'],
    publishDay: 8,
  },
  {
    slug: 'pitch-deck',
    title: 'Business Plan & Pitch Deck Template: The 10 Slides Investors Actually Expect',
    productTitle: 'Business Plan & Investor Pitch Deck Template — 10 Editable Slides (PowerPoint)',
    price: 16,
    format: 'PowerPoint',
    category: 'Template',
    payhipUrl: 'https://payhip.com/b/KX0Rd',
    shortDescription: 'The 10 slides every investor actually expects to see — problem, market, model, traction, financials, ask.',
    fullDescription: `Title, Problem, Solution, Market Size (TAM/SAM/SOM), Business Model, Traction, Competitive Landscape, Financial Projections (editable chart), Team, and The Ask.

Editable PowerPoint. Instant download.`,
    tags: ['pitch deck', 'business plan', 'investor presentation', 'startup pitch', 'powerpoint template'],
    publishDay: 5,
  },
  {
    slug: 'social-templates',
    title: 'Social Media Post Template Pack: 8 Editable Instagram-Ready Designs',
    productTitle: 'Social Media Content Template Pack — 8 Editable Instagram-Ready Templates (PowerPoint)',
    price: 12,
    format: 'PowerPoint',
    category: 'Template',
    payhipUrl: 'https://payhip.com/b/9jpJQ',
    shortDescription: '8 square, on-brand post templates — quote, announcement, testimonial, sale, and more — edit the text and post.',
    fullDescription: `Quote post, tip/educational post, announcement post, testimonial post, engagement post, product feature post, carousel cover, sale/offer post. 1080x1080 square format.

Editable PowerPoint. Instant download.`,
    tags: ['instagram template', 'social media template', 'content template', 'instagram post design', 'social graphics'],
    publishDay: 10,
  },
  {
    slug: 'digital-planner',
    title: 'Hyperlinked Digital Planner 2026: Tap Between Views, Never Scroll',
    productTitle: 'Digital Planner 2026 — Hyperlinked, Undated, GoodNotes & Notability Template (PDF)',
    price: 12,
    format: 'PDF',
    category: 'Guide',
    payhipUrl: 'https://payhip.com/b/rRVb4',
    shortDescription: 'Tap between Yearly, Monthly, Weekly, Daily, Habits, and Notes instantly — no scrolling required.',
    fullDescription: `Working hyperlinked navigation on every page, yearly/monthly/weekly/daily/habit/notes pages, undated so it's reusable every year.

Works in GoodNotes, Notability, any PDF app; prints well too. Instant download.`,
    tags: ['digital planner', 'goodnotes planner', 'notability planner', 'hyperlinked planner', 'ipad planner'],
    publishDay: 12,
  },
  {
    slug: 'wall-art',
    title: 'Minimalist Wall Art Bundle: 6 Gallery-Ready Printable Prints',
    productTitle: 'Minimalist Wall Art Bundle — 6 Printable Abstract & Typographic Prints',
    price: 9,
    format: 'PDF',
    category: 'Craft/Print',
    payhipUrl: 'https://payhip.com/b/XLI0e',
    shortDescription: '6 gallery-ready prints — line art, abstract shapes, and typography — in one cohesive, modern set.',
    fullDescription: `6 unique 8x10 designs (mountain line art, typographic quote, geometric abstract, botanical line art, statement word print, abstract topography lines) in a cohesive navy/teal/mustard palette.

Instant download.`,
    tags: ['printable wall art', 'minimalist wall art', 'abstract line art', 'typography print', 'digital wall art'],
    publishDay: 14,
  },
  {
    slug: 'svg-bundle',
    title: 'SVG Cut File Bundle: 8 Designs for Cricut & Silhouette Crafters',
    productTitle: 'SVG Cut File Bundle — 8 Designs for Cricut & Silhouette (Monograms, Frames & Icons)',
    price: 7,
    format: 'ZIP',
    category: 'Craft/Print',
    payhipUrl: 'https://payhip.com/b/ntE4Q',
    shortDescription: '8 ready-to-cut designs — monogram frame, wreath, banner, heart, star, arrow, sunburst, and an "Est." family name banner.',
    fullDescription: `8 SVG files with clean vector paths, sized for easy resizing. Delivered as one ZIP.

Instant download.`,
    tags: ['svg cut file', 'cricut svg', 'silhouette svg', 'monogram svg', 'svg bundle', 'cut file'],
    publishDay: 14,
  },
  {
    slug: 'reflection-journal',
    title: '90-Day Guided Self-Reflection Journal: Weekly Prompts for Clarity & Growth',
    productTitle: '90-Day Guided Self-Reflection Journal — Weekly Prompts for Clarity & Growth (Printable PDF)',
    price: 9,
    format: 'PDF',
    category: 'Guide',
    payhipUrl: 'https://payhip.com/b/87eHp',
    shortDescription: '13 weeks of guided prompts covering values, relationships, work, rest, and growth — with space to actually write.',
    fullDescription: `13 themed weekly entries, 3 prompts per week with write-in space, gentle note on when to seek outside support.

16-page PDF. Instant download. A thinking-on-paper journal, not a therapy program.`,
    tags: ['self reflection journal', 'guided journal', '90 day journal', 'journaling prompts', 'mindfulness', 'personal growth'],
    publishDay: 14,
  },
]

// ---- Public API ----

export function getAllShopProducts(): ShopSeoProduct[] {
  return SHOP_PRODUCTS
}

export function getShopProduct(slug: string): ShopSeoProduct | undefined {
  return SHOP_PRODUCTS.find((p) => p.slug === slug)
}

/**
 * Generate a blog slug from the product slug.
 * Shop blog slugs are prefixed 'shop-' to avoid collision with legal/immigration blogs.
 */
export function productBlogSlug(productSlug: string): string {
  return `shop-${productSlug}`
}

/**
 * Format price for display.
 */
export function formatPrice(amount: number): string {
  return `$${amount}`
}

// ---- Queue persistence (file-based, lives in .content-studio) ----

import fs from 'fs'
import path from 'path'

const QUEUE_PATH = path.join(process.cwd(), '.content-studio', 'shop-seo-queue.json')

let queueCache: ShopSeoQueueItem[] | null = null

function readQueue(): ShopSeoQueueItem[] {
  if (queueCache) return queueCache
  try {
    const raw = fs.readFileSync(QUEUE_PATH, 'utf-8')
    queueCache = JSON.parse(raw)
    return queueCache!
  } catch {
    // First run — seed from products
    const now = new Date().toISOString()
    queueCache = SHOP_PRODUCTS.map((p) => ({
      slug: p.slug,
      status: 'queued' as const,
      blogSlug: productBlogSlug(p.slug),
      blogTitle: p.title,
      createdAt: now,
    }))
    writeQueue(queueCache)
    return queueCache
  }
}

function writeQueue(items: ShopSeoQueueItem[]): void {
  fs.mkdirSync(path.dirname(QUEUE_PATH), { recursive: true })
  fs.writeFileSync(QUEUE_PATH, JSON.stringify(items, null, 2))
  queueCache = items
}

export function getQueue(): ShopSeoQueueItem[] {
  return readQueue()
}

export function getQueueItem(slug: string): ShopSeoQueueItem | undefined {
  return readQueue().find((q) => q.slug === slug)
}

export function updateQueueStatus(
  slug: string,
  status: ShopSeoStatus,
  extra?: Partial<Pick<ShopSeoQueueItem, 'draftedAt' | 'shippedAt'>>,
): ShopSeoQueueItem {
  const items = readQueue()
  const idx = items.findIndex((q) => q.slug === slug)
  const now = new Date().toISOString()
  if (idx >= 0) {
    items[idx] = { ...items[idx], status, ...extra }
    if (status === 'drafted' && !items[idx].draftedAt) items[idx].draftedAt = now
    if (status === 'shipped' && !items[idx].shippedAt) items[idx].shippedAt = now
  } else {
    items.push({
      slug,
      status,
      blogSlug: productBlogSlug(slug),
      blogTitle: getShopProduct(slug)?.title ?? slug,
      createdAt: now,
      draftedAt: status === 'drafted' ? now : undefined,
      shippedAt: status === 'shipped' ? now : undefined,
    })
  }
  writeQueue(items)
  return items[idx >= 0 ? idx : items.length - 1]
}

/**
 * Reset the queue (re-seed from products). Useful for testing or bulk reset.
 */
export function resetQueue(): ShopSeoQueueItem[] {
  const now = new Date().toISOString()
  queueCache = SHOP_PRODUCTS.map((p) => ({
    slug: p.slug,
    status: 'queued' as const,
    blogSlug: productBlogSlug(p.slug),
    blogTitle: p.title,
    createdAt: now,
  }))
  writeQueue(queueCache)
  return queueCache
}

export function getQueueStats(): {
  total: number
  queued: number
  drafting: number
  drafted: number
  shipped: number
} {
  const items = readQueue()
  return {
    total: items.length,
    queued: items.filter((q) => q.status === 'queued').length,
    drafting: items.filter((q) => q.status === 'drafting').length,
    drafted: items.filter((q) => q.status === 'drafted').length,
    shipped: items.filter((q) => q.status === 'shipped').length,
  }
}