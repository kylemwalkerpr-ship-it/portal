export type FileShopCategory = 'spreadsheet' | 'guide' | 'template' | 'craft'

export interface FileShopProduct {
  id: string
  file: string
  cat: FileShopCategory
  format: string
  stamp: string
  title: string
  desc: string
  bullets: [string, string]
  price: string
  href: string
  /** False = Payhip listing is still Invisible. Do not send buyers there. */
  published: boolean
}

const P = 'https://payhip.com/b/'

/** Instant-download files sold via Payhip. Hidden Payhip listings still have keys so buttons work the day they go Visible. */
export const FILE_SHOP_PRODUCTS: FileShopProduct[] = [
  { id: 'consultant-toolkit', file: '01', cat: 'spreadsheet', format: 'Excel + Sheets', stamp: 'FIELD\nTESTED', title: 'Solo Consultant Business Toolkit', desc: 'Track clients, invoices, and cash flow — updated automatically as you type.', bullets: ['Client & invoice tracking', 'Auto-calculating dashboard'], price: '12', href: `${P}xQg6i`, published: true },
  { id: 'ai-prompts-business', file: '02', cat: 'guide', format: 'PDF · 10 pages', stamp: 'READY\nTO USE', title: '50 AI Prompts for Small Business Owners', desc: 'Copy-paste prompts for marketing, sales, admin, and strategy.', bullets: ['6 categories, 50 prompts', 'Works with ChatGPT & Claude'], price: '9', href: `${P}rlsyK`, published: true },
  { id: 'rate-calculator', file: '03', cat: 'spreadsheet', format: 'Excel + Sheets', stamp: 'FIELD\nTESTED', title: 'Freelance Rate & Profitability Calculator', desc: 'Work out what to charge, then check every project actually pays.', bullets: ['Required hourly & day rate', 'Per-project profitability tracker'], price: '10', href: `${P}ZLyP9`, published: false },
  { id: 'budget-debt-planner', file: '04', cat: 'spreadsheet', format: 'Excel + Sheets', stamp: 'FIELD\nTESTED', title: 'Household Budget & Debt Payoff Planner', desc: 'See where your money goes, and how long each debt takes at your current payment.', bullets: ['Full monthly budget breakdown', 'Per-debt payoff time estimator'], price: '10', href: `${P}sjFIf`, published: false },
  { id: 'wedding-budget-planner', file: '05', cat: 'spreadsheet', format: 'Excel + Sheets', stamp: 'FIELD\nTESTED', title: 'Wedding Budget Planner', desc: 'Every category, every vendor, every dollar — in one place.', bullets: ['10 budget categories tracked', 'Vendor & deposit tracker'], price: '11', href: `${P}tWBz2`, published: false },
  { id: 'content-calendar', file: '06', cat: 'spreadsheet', format: 'Excel + Sheets', stamp: 'FIELD\nTESTED', title: 'Content Calendar & Social Media Planner', desc: 'Plan, post, and track what actually performs.', bullets: ['Full content calendar', 'Performance log & dashboard'], price: '9', href: `${P}xdCZl`, published: false },
  { id: 'rental-tracker', file: '07', cat: 'spreadsheet', format: 'Excel + Sheets', stamp: 'FIELD\nTESTED', title: 'Rental Property Income & Expense Tracker', desc: 'For landlords and short-term-rental hosts running one or more properties.', bullets: ['Multi-property income log', 'Net income dashboard'], price: '11', href: `${P}ROGvC`, published: false },
  { id: 'ai-prompts-creators', file: '08', cat: 'guide', format: 'PDF · 10 pages', stamp: 'READY\nTO USE', title: '50 AI Prompts for Content Creators & Marketers', desc: 'Prompts for scripts, captions, email, SEO, and strategy.', bullets: ['6 categories, 50 prompts', 'Built for regular publishers'], price: '9', href: `${P}ju1Xm`, published: false },
  { id: 'habit-tracker', file: '09', cat: 'guide', format: 'PDF · 7 pages', stamp: 'READY\nTO USE', title: '30-Day Habit & Wellness Tracker', desc: 'A simple printable system for building one habit at a time.', bullets: ['Printable 30-day tracker grid', 'Weekly reflection prompts'], price: '7', href: `${P}Jnm2E`, published: false },
  { id: 'startup-checklist', file: '10', cat: 'guide', format: 'PDF · 5 pages', stamp: 'READY\nTO USE', title: 'Small Business Startup Checklist & 90-Day Plan', desc: 'From idea to first paying customer, broken into weekly steps.', bullets: ['Pre-launch checklist', '3-phase, 90-day roadmap'], price: '9', href: `${P}yJP2Y`, published: false },
  { id: 'meal-planner', file: '11', cat: 'spreadsheet', format: 'Excel + Sheets', stamp: 'FIELD\nTESTED', title: 'Weekly Meal Planner & Grocery List', desc: 'Plan your week, and your shopping list builds itself by category.', bullets: ['7-day meal grid', 'Auto-sorting grocery list'], price: '8', href: `${P}l3Cdc`, published: false },
  { id: 'resume-template', file: '12', cat: 'template', format: 'Word · 2 files', stamp: 'READY\nTO USE', title: 'ATS Resume + Cover Letter Template', desc: 'Clean, ATS-safe formatting that won\'t get mangled by tracking software.', bullets: ['Fully editable resume', 'Matching cover letter'], price: '10', href: `${P}eB2KM`, published: false },
  { id: 'wedding-stationery', file: '13', cat: 'template', format: 'Word · 4 cards', stamp: 'READY\nTO USE', title: 'Wedding Stationery Suite', desc: 'Invitation, RSVP, details card, and thank-you note — matched and editable.', bullets: ['4 coordinated pieces', 'Elegant gold-accent design'], price: '14', href: `${P}9Pgn8`, published: false },
  { id: 'welcome-packet', file: '14', cat: 'template', format: 'Word', stamp: 'READY\nTO USE', title: 'Client Welcome Packet Template', desc: 'Make new clients feel confident they hired the right person.', bullets: ['Onboarding timeline', 'Policies & billing sections'], price: '9', href: `${P}YngNy`, published: false },
  { id: 'pitch-deck', file: '15', cat: 'template', format: 'PowerPoint · 10 slides', stamp: 'READY\nTO USE', title: 'Business Plan & Pitch Deck Template', desc: 'The 10 slides investors actually expect to see, professionally designed.', bullets: ['Market size, model, traction', 'Editable financial chart'], price: '16', href: `${P}KX0Rd`, published: false },
  { id: 'social-templates', file: '16', cat: 'template', format: 'PowerPoint · 8 posts', stamp: 'READY\nTO USE', title: 'Social Media Content Template Pack', desc: '8 square, on-brand post templates — edit the text and post.', bullets: ['Quote, sale, testimonial & more', '1080x1080, Instagram-ready'], price: '12', href: `${P}9jpJQ`, published: false },
  { id: 'digital-planner', file: '17', cat: 'guide', format: 'PDF · Hyperlinked', stamp: 'READY\nTO USE', title: 'Hyperlinked Digital Planner', desc: 'Tap between Yearly, Monthly, Weekly, Daily, Habits, and Notes instantly.', bullets: ['Undated, reusable every year', 'GoodNotes & Notability ready'], price: '12', href: `${P}rRVb4`, published: false },
  { id: 'wall-art', file: '18', cat: 'craft', format: 'PDF · 6 prints', stamp: 'READY\nTO USE', title: 'Printable Wall Art Bundle', desc: '6 gallery-ready abstract & typographic prints in one cohesive set.', bullets: ['8x10, print at home or shop', 'Navy, teal & mustard palette'], price: '9', href: `${P}XLI0e`, published: false },
  { id: 'svg-bundle', file: '19', cat: 'craft', format: 'ZIP · 8 SVGs', stamp: 'READY\nTO USE', title: 'SVG Cut File Bundle', desc: '8 ready-to-cut designs for Cricut & Silhouette.', bullets: ['Monograms, frames & icons', 'Clean, resizable vector paths'], price: '7', href: `${P}ntE4Q`, published: false },
  { id: 'reflection-journal', file: '20', cat: 'guide', format: 'PDF · 16 pages', stamp: 'READY\nTO USE', title: '90-Day Guided Self-Reflection Journal', desc: '13 weeks of prompts on values, relationships, work, and rest.', bullets: ['3 prompts per week, space to write', 'Printable or digital use'], price: '9', href: `${P}87eHp`, published: false },
]

export const FILE_SHOP_FILTERS: { id: 'all' | FileShopCategory; label: string }[] = [
  { id: 'all', label: 'All Files' },
  { id: 'spreadsheet', label: 'Spreadsheets' },
  { id: 'guide', label: 'Guides & PDFs' },
  { id: 'template', label: 'Templates' },
  { id: 'craft', label: 'Craft & Print' },
]
