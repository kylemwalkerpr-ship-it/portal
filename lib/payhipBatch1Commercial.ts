import type { ImmigrationShopProduct } from '@/lib/immigration-shop-products'

export interface PayhipBatch1CommercialProduct {
  slug: string
  payhipId: string
  priceUsd: number
  marketRangeUsd: [number, number]
  deliveryLabel: string
  deliveryPromise: string
  sectionCount?: number
  tags: string[]
  cover: {
    pexelsPage: string
    imageUrl: string
    alt: string
    credit: string
  }
  apex: {
    slug: string
    title: string
    authorityLinks: { label: string; href: string }[]
  }
  payhipBlog: {
    slug: string
    title: string
    excerpt: string
    bodyMarkdown: string
  }
  crossSellSlugs: string[]
}

const PREP_BOUNDARY =
  'Self-guided preparation and document-organization resource. Not an official government form, legal advice, legal representation, or a guarantee of approval. Always verify current government instructions before filing.'

export const PAYHIP_BATCH1_COMMERCIAL: readonly PayhipBatch1CommercialProduct[] = [
  {
    slug: 'premium-usa-canada-study-work-mega-bundle',
    payhipId: 'Ap382',
    priceUsd: 49.99,
    marketRangeUsd: [39, 59],
    deliveryLabel: '15 individual fillable PDF preparation workbooks',
    deliveryPromise:
      `You receive 15 separately named, buyer-facing fillable PDF workbooks covering the full YouSafe USA + Canada immigration preparation collection. No raw Markdown, source files, or placeholder ZIP is sold. ${PREP_BOUNDARY}`,
    tags: ['immigration bundle', 'visa checklist bundle', 'USA visa preparation', 'Canada immigration preparation', 'study permit organizer', 'work permit checklist', 'fillable PDF', 'document organizer'],
    cover: {
      pexelsPage: 'https://www.pexels.com/photo/36618889/',
      imageUrl: 'https://images.pexels.com/photos/36618889/pexels-photo-36618889.jpeg?auto=compress&cs=tinysrgb&w=1200',
      alt: 'Woman reviewing travel documents at a desk beside a globe',
      credit: 'Pexels — real travel-planning photograph',
    },
    apex: {
      slug: 'shop-usa-canada-immigration-preparation-bundle',
      title: 'USA + Canada Immigration Preparation Bundle: What to Organize Before You File',
      authorityLinks: [
        { label: 'Canada study permit document checklist', href: 'https://legal.yousafeconsultancy.com/ca/study-permit-document-checklist/' },
        { label: 'F-1 document checklist', href: 'https://legal.yousafeconsultancy.com/us/student-visas/f1-document-checklist-2026/' },
      ],
    },
    payhipBlog: {
      slug: 'usa-canada-immigration-preparation-bundle',
      title: 'One Immigration File, 15 Preparation Workbooks: How to Build a Cleaner Application Record',
      excerpt: 'A practical way to organize study, visitor, work, funding, refusal-response, and intake documents before you open the official filing portal.',
      bodyMarkdown: `A visa or permit application rarely fails because the applicant needed more folders. The real problem is inconsistency: one date on a worksheet, another date on a school or employer record, a sponsor story that does not match the bank evidence, or a travel history rebuilt from memory at the last minute.\n\nThe **Premium USA + Canada Study/Work Template Mega Bundle** is designed as a preparation system for that problem. The download contains **15 separately named fillable PDF workbooks**—the same individual preparation packs sold across YouSafe's USA and Canada collection. You can open only the workbook that matches your route, or use several where the facts overlap.\n\n### What the bundle is for\n\nUse it to collect facts, map evidence, track deadlines, and spot inconsistencies **before** you transfer information to an official government process. The workbooks cover F-1 preparation, OPT and STEM OPT, B-1/B-2 visitor preparation, I-134 support evidence, Canada study permits, proof of funds, study-plan/LOE preparation, TRV, work permits, PGWP, family/travel history, refusal-response planning, and universal intake/document review.\n\n### What it is not\n\nIt is not a government form, legal advice, representation, or an approval guarantee. Government forms, fees, eligibility rules, filing windows, and documentary requirements change. Re-check the official USCIS, Department of State, DHS, or IRCC page that applies to your route on the day you file.\n\n### A useful way to use the 15 files\n\n1. Start with the intake/document-review workbook and record the facts you will reuse.\n2. Open the route-specific workbook and complete it from official records—not memory.\n3. Use the family/travel or financial workbooks only where relevant.\n4. Compare names, dates, addresses, school/employer details, and funding claims across the set.\n5. Open the current official government checklist and make the final filing decision from that source.\n\nFor the deeper regulatory explanation, read **USA + Canada Immigration Preparation Bundle: What to Organize Before You File** on YouSafe Consultancy. The Apex article links into the relevant legal checklists, while this Payhip post stays focused on using the paid preparation system.\n\n**Cross-sell note:** the Mega Bundle already includes the other 14 immigration preparation packs, so buyers should not be pushed to buy duplicates. If you need professional help rather than self-guided organization, compare YouSafe's immigration services separately.`,
    },
    crossSellSlugs: [],
  },
  {
    slug: 'universal-client-intake-document-review-kit',
    payhipId: 'kcRoK',
    priceUsd: 12.99,
    marketRangeUsd: [10, 17],
    deliveryLabel: '1 fillable PDF workbook · 5 guided sections',
    deliveryPromise:
      `One fillable PDF workbook containing client intake, document review, consultation notes, missing/risk tracking, and declaration sections. ${PREP_BOUNDARY}`,
    sectionCount: 5,
    tags: ['immigration intake form', 'client intake template', 'document review checklist', 'visa document organizer', 'immigration questionnaire', 'fillable PDF', 'case preparation', 'consultation worksheet'],
    cover: {
      pexelsPage: 'https://www.pexels.com/photo/business-people-discussing-about-documents-8297652/',
      imageUrl: 'https://images.pexels.com/photos/8297652/pexels-photo-8297652.jpeg?auto=compress&cs=tinysrgb&w=1200',
      alt: 'Two people reviewing documents together at a desk',
      credit: 'Pexels / Mikhail Nilov — real document-review photograph',
    },
    apex: {
      slug: 'shop-immigration-client-intake-document-review',
      title: 'Immigration Client Intake & Document Review: Build One Reliable Fact Record First',
      authorityLinks: [
        { label: 'YouSafe legal guide library', href: 'https://legal.yousafeconsultancy.com/articles/' },
        { label: 'Canada legal guides', href: 'https://legal.yousafeconsultancy.com/ca/' },
      ],
    },
    payhipBlog: {
      slug: 'immigration-intake-document-review-checklist',
      title: 'Why Your Immigration File Needs One Master Fact Record Before Any Form',
      excerpt: 'A practical intake and document-review workflow for keeping names, dates, travel, education, work history, and evidence consistent.',
      bodyMarkdown: `Immigration applications often reuse the same facts in several places: identity, addresses, education, employment, travel, family details, sponsors, and prior applications. Re-entering those facts from memory every time creates avoidable inconsistencies.\n\nThe **Universal Immigration Client Intake + Document Review Kit** is a **single fillable PDF workbook with five guided sections**. It is built to create one master preparation record before you start a route-specific application.\n\n### Use it before the route-specific form\n\nRecord identity and history from your passport, school records, employment documents, and prior filings. Then use the document-review section to mark what is present, missing, expired, unsigned, untranslated, or inconsistent. The risk/missing-document tracker is not a legal assessment; it is a practical way to make unresolved items visible.\n\n### Why this matters\n\nA clean master record makes it easier to notice that an address date overlaps incorrectly, an employer name changed between documents, or a travel period conflicts with school or work history. Those are preparation problems you can resolve before filing rather than after.\n\n### What you receive\n\n- One fillable PDF workbook\n- Client intake section\n- Document review checklist\n- Consultation/working notes\n- Missing-document and consistency tracker\n- Declaration/review section\n\nThis is a preparation tool, not an official government form and not legal advice. Verify the current instructions for your actual visa or permit category before submission.\n\nFor a deeper workflow, read **Immigration Client Intake & Document Review: Build One Reliable Fact Record First** on YouSafe Consultancy. From there, move into the route-specific legal guide and then the matching preparation pack.\n\n**Useful next products:** if you are rebuilding after a refusal, use the Refusal Review + Reapplication Response Pack. For Canada study-permit preparation, pair the intake workbook with the Study Plan/LOE and Proof of Funds packs rather than duplicating facts from scratch.`,
    },
    crossSellSlugs: ['us-canada-refusal-reapplication-response-pack', 'canada-study-plan-letter-of-explanation-pack', 'canada-proof-of-funds-sponsor-pack'],
  },
  {
    slug: 'us-canada-refusal-reapplication-response-pack',
    payhipId: 'e9Usb',
    priceUsd: 18.99,
    marketRangeUsd: [14, 20],
    deliveryLabel: '1 fillable PDF workbook · 5 reapplication-planning sections',
    deliveryPromise:
      `One fillable PDF workbook containing a refusal-reason matrix, evidence-gap tracker, reapplication cover-letter planner, changed-circumstances section, and document-upgrade checklist. It does not promise that reapplying is appropriate or that a refusal can be overcome. ${PREP_BOUNDARY}`,
    sectionCount: 5,
    tags: ['visa refusal', 'study permit refusal', 'visa reapplication', 'refusal response organizer', 'letter of explanation', 'evidence gap checklist', 'immigration document review', 'fillable PDF'],
    cover: {
      pexelsPage: 'https://www.pexels.com/photo/man-looking-through-documents-at-workplace-7129713/',
      imageUrl: 'https://images.pexels.com/photos/7129713/pexels-photo-7129713.jpeg?auto=compress&cs=tinysrgb&w=1200',
      alt: 'Focused person reviewing paperwork at a desk',
      credit: 'Pexels / Michael Burrows — real document-review photograph',
    },
    apex: {
      slug: 'shop-visa-refusal-reapplication-organizer',
      title: 'Visa Refusal Reapplication Organizer: Turn the Decision Letter Into a Document Plan',
      authorityLinks: [
        { label: 'F-1 refusal and reapplication guide', href: 'https://yousafeconsultancy.com/blog/f1-visa-refusal-reapply' },
        { label: 'Canada study permit document checklist', href: 'https://legal.yousafeconsultancy.com/ca/study-permit-document-checklist/' },
      ],
    },
    payhipBlog: {
      slug: 'visa-refusal-reapplication-evidence-gap-plan',
      title: 'After a Visa Refusal: Map the Reason Before You Add More Documents',
      excerpt: 'A refusal-response workflow that separates the decision letter, evidence gaps, changed facts, and reapplication documents without promising an outcome.',
      bodyMarkdown: `A refusal letter can create pressure to submit again quickly. Speed is not the same as a stronger file. Before you add documents, identify what the decision actually says and whether your facts have changed.\n\nThe **USA/Canada Refusal Review + Reapplication Response Pack** is a **single fillable PDF workbook with five reapplication-planning sections**. It helps you turn a refusal notice into an organized working record.\n\n### Start with the refusal reason—not a generic sample letter\n\nRecord each stated concern in the refusal matrix. Beside it, note the evidence that was originally submitted, what was missing or unclear, and what has genuinely changed since the first application. A new cover letter does not fix weak or unchanged facts by itself.\n\n### Separate three different questions\n\n1. What did the decision maker say?\n2. What evidence or explanation was missing, inconsistent, or weak?\n3. Is there new, stronger, truthful evidence now?\n\nThe workbook includes an evidence-gap tracker, reapplication cover-letter planner, changed-circumstances section, and document-upgrade checklist so those questions do not collapse into one emotional response.\n\nThis product does **not** tell you that reapplying is always appropriate, does not provide legal representation, and does not guarantee a different result. Some refusals require professional legal advice or a different remedy.\n\nRead **Visa Refusal Reapplication Organizer: Turn the Decision Letter Into a Document Plan** on YouSafe Consultancy for the deeper strategy and official-source links. If the refusal concerns study purpose or financial support, the Study Plan/LOE and Proof of Funds workbooks can help you reorganize those specific parts—but only if the underlying facts support them.`,
    },
    crossSellSlugs: ['canada-study-plan-letter-of-explanation-pack', 'canada-proof-of-funds-sponsor-pack', 'universal-client-intake-document-review-kit'],
  },
  {
    slug: 'canada-family-information-travel-history-pack',
    payhipId: '6gsAa',
    priceUsd: 10.99,
    marketRangeUsd: [8, 13],
    deliveryLabel: '1 fillable PDF workbook · family, travel, address, work/education and consistency sections',
    deliveryPromise:
      `One fillable PDF workbook for organizing family information, travel history, address history, work/education history, and a final consistency review before transferring facts to the current IRCC process. ${PREP_BOUNDARY}`,
    sectionCount: 5,
    tags: ['Canada immigration', 'travel history', 'family information', 'IMM 5645 preparation', 'address history', 'work history', 'visa document organizer', 'fillable PDF'],
    cover: {
      pexelsPage: 'https://www.pexels.com/photo/silhouette-of-a-family-looking-out-of-a-window-at-an-airplane-18379827/',
      imageUrl: 'https://images.pexels.com/photos/18379827/pexels-photo-18379827.jpeg?auto=compress&cs=tinysrgb&w=1200',
      alt: 'Family looking through an airport window toward an airplane',
      credit: 'Pexels / Duygu — real family-travel photograph',
    },
    apex: {
      slug: 'shop-canada-family-travel-history-organizer',
      title: 'Canada Family Information & Travel History Organizer: Rebuild Dates Before You File',
      authorityLinks: [
        { label: 'IRCC family information form', href: 'https://www.canada.ca/en/immigration-refugees-citizenship/services/application/application-forms-guides/imm5645.html' },
        { label: 'Canada legal guides', href: 'https://legal.yousafeconsultancy.com/ca/' },
      ],
    },
    payhipBlog: {
      slug: 'canada-family-travel-history-organizer',
      title: 'Canada Travel History: Build the Timeline Before You Open the Form',
      excerpt: 'A simple workflow for reconstructing family, travel, address, employment, and education dates from records instead of memory.',
      bodyMarkdown: `Travel history becomes difficult when you try to reconstruct years of dates while an application portal is already open. Passport stamps, tickets, previous visas, address records, school dates, and employment history should be compared before you start typing.\n\nThe **Canada Family Information + Travel History Organizer** is a **single fillable PDF workbook** built for that preparation stage. It contains dedicated sections for family information, travel history, address history, work/education history, and a final consistency review.\n\n### Build a chronology from records\n\nStart with your current passport and any older passports you still have. Add entry/exit evidence, prior applications, school records, and employment documents. If a date is uncertain, mark it for verification rather than inventing precision.\n\n### Compare connected histories\n\nTravel, address, work, and education histories can overlap. The point of the workbook is to put those timelines beside each other so obvious conflicts can be checked before information is transferred into the current IRCC process.\n\nThe workbook is not IMM 5645 itself and is not a substitute for the current IRCC form or instructions. Requirements vary by application type, and IRCC decides what history must be provided.\n\nRead **Canada Family Information & Travel History Organizer: Rebuild Dates Before You File** on YouSafe Consultancy for the complete chronology method and official links.\n\n**Related preparation packs:** TRV applicants may find this useful alongside the Canada Visitor Pack; study-permit and outside-Canada work-permit applicants can use the same history record to keep repeat facts consistent across their route-specific workbook.`,
    },
    crossSellSlugs: ['canada-trv-visitor-visa-pack', 'canada-work-permit-outside-canada-pack', 'canada-study-plan-letter-of-explanation-pack'],
  },
  {
    slug: 'canada-pgwp-application-pack',
    payhipId: 'jTfbO',
    priceUsd: 14.99,
    marketRangeUsd: [10, 15],
    deliveryLabel: '1 fillable PDF workbook · PGWP timeline, graduation evidence and submission tracking',
    deliveryPromise:
      `One fillable PDF workbook for organizing PGWP timing, graduation proof, transcript/letter evidence, status or restoration notes where relevant, and post-submission tracking. Eligibility and deadlines must be checked against current IRCC rules. ${PREP_BOUNDARY}`,
    sectionCount: 5,
    tags: ['PGWP Canada', 'post graduation work permit', 'PGWP checklist', 'international student Canada', 'graduation documents', 'work permit organizer', 'IRCC checklist', 'fillable PDF'],
    cover: {
      pexelsPage: 'https://www.pexels.com/photo/university-student-in-graduation-gown-holding-a-diploma-16374182/',
      imageUrl: 'https://images.pexels.com/photos/16374182/pexels-photo-16374182.jpeg?auto=compress&cs=tinysrgb&w=1200',
      alt: 'University graduate in cap and gown holding a diploma',
      credit: 'Pexels / mg shotz — real graduation photograph',
    },
    apex: {
      slug: 'shop-pgwp-application-organizer',
      title: 'PGWP Application Organizer: Timeline, Graduation Evidence and Final Filing Check',
      authorityLinks: [
        { label: 'PGWP Canada 2026 guide', href: 'https://yousafeconsultancy.com/blog/pgwp-canada-2026' },
        { label: 'IRCC PGWP application guidance', href: 'https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/work/after-graduation/apply.html' },
      ],
    },
    payhipBlog: {
      slug: 'pgwp-document-timeline-organizer',
      title: 'PGWP Preparation: Put the Graduation Timeline and Evidence in One Place',
      excerpt: 'Organize your completion date, graduation documents, status notes, and submission record before relying on the current IRCC filing instructions.',
      bodyMarkdown: `PGWP preparation is unusually sensitive to timing. Your program completion evidence, current status, application date, and the rules that apply to your program can matter. That makes a generic “documents folder” less useful than a timeline tied to the evidence you actually have.\n\nThe **Canada PGWP Post-Graduation Work Permit Pack** is a **single fillable PDF workbook** for organizing those moving parts. It includes a PGWP timeline, graduation-proof organizer, transcript/letter evidence section, status/restoration working notes where relevant, and a post-submission tracker.\n\n### Use current IRCC rules as the authority\n\nPGWP eligibility rules have changed over time, including requirements that can depend on program and applicant circumstances. The workbook does not determine eligibility. Before filing, check the current IRCC PGWP eligibility, document, and application pages and confirm the rules that apply to you.\n\n### Build the record in this order\n\n1. Record the date you received written confirmation of program completion.\n2. List the graduation/completion evidence you actually possess.\n3. Record current immigration status and any issue requiring verification.\n4. Check the current IRCC filing window and document requirements.\n5. After filing, record the submission date, confirmation, and later requests.\n\nRead **PGWP Application Organizer: Timeline, Graduation Evidence and Final Filing Check** on YouSafe Consultancy, then use the existing PGWP Canada 2026 authority guide for the changing regulatory rules.\n\nThis workbook is preparation support only—not a work permit, legal advice, or a guarantee that a PGWP will be issued.`,
    },
    crossSellSlugs: ['canada-family-information-travel-history-pack', 'universal-client-intake-document-review-kit'],
  },
  {
    slug: 'canada-work-permit-outside-canada-pack',
    payhipId: 'ZsyvP',
    priceUsd: 15.99,
    marketRangeUsd: [12, 17],
    deliveryLabel: '1 fillable PDF workbook · IMM 1295 prep, employer/job evidence and upload tracking',
    deliveryPromise:
      `One fillable PDF workbook containing an IMM 1295 preparation worksheet, employer/job-offer evidence organizer, work-history section, purpose/cover-letter planner, and upload tracker. It does not determine whether a work permit is employer-specific, open, LMIA-exempt, or otherwise eligible. ${PREP_BOUNDARY}`,
    sectionCount: 5,
    tags: ['Canada work permit', 'IMM 1295', 'work permit checklist', 'job offer documents', 'Canada immigration', 'work history organizer', 'IRCC work permit', 'fillable PDF'],
    cover: {
      pexelsPage: 'https://www.pexels.com/photo/crop-office-employee-working-with-document-near-laptop-5273559/',
      imageUrl: 'https://images.pexels.com/photos/5273559/pexels-photo-5273559.jpeg?auto=compress&cs=tinysrgb&w=1200',
      alt: 'Professional reviewing work documents beside a laptop',
      credit: 'Pexels / Monstera Production — real professional-work photograph',
    },
    apex: {
      slug: 'shop-canada-work-permit-application-organizer',
      title: 'Canada Work Permit Outside Canada: Organize IMM 1295, Employer Evidence and Work History',
      authorityLinks: [
        { label: 'IRCC work permit forms and documents', href: 'https://www.canada.ca/en/immigration-refugees-citizenship/services/work-canada/permit-outside/forms-documents.html' },
        { label: 'Canada legal guides', href: 'https://legal.yousafeconsultancy.com/ca/' },
      ],
    },
    payhipBlog: {
      slug: 'canada-work-permit-outside-imm1295-checklist',
      title: 'Applying for a Canada Work Permit From Outside Canada: Organize the Job Facts First',
      excerpt: 'A preparation workflow for IMM 1295 details, employer/job evidence, work history, supporting explanations, and uploads.',
      bodyMarkdown: `A Canada work-permit application from outside Canada can involve several different legal routes. The form fields may look similar even when the underlying employer, LMIA, exemption, open-work-permit, or program rules are different. Preparation should therefore separate **organizing facts** from **deciding eligibility**.\n\nThe **Canada Work Permit Outside Canada Preparation Pack** is a **single fillable PDF workbook with five guided sections**: IMM 1295 preparation, employer/job-offer evidence, work history, purpose/cover-letter planning, and an upload tracker.\n\n### What the workbook helps you do\n\nUse it to copy employer names, addresses, job titles, dates, work history, and documentary evidence from reliable records before you open the current IRCC process. Then compare those facts across the job offer, employment history, passport, and any supporting letter.\n\n### What it does not decide\n\nThe workbook does not tell you whether you qualify for a work permit, whether an LMIA is required, which exemption code applies, or whether you should use a different route. Those are current-rule questions. Use the IRCC work-permit forms/document page and the instructions for your specific category as the final authority.\n\nRead **Canada Work Permit Outside Canada: Organize IMM 1295, Employer Evidence and Work History** on YouSafe Consultancy for the deeper preparation sequence and official links.\n\nIf your filing also requires detailed travel/address history, the Family Information + Travel History Organizer can reduce duplicate data entry. If you are uncertain about your basic facts and documents, start with the Universal Intake + Document Review Kit before this route-specific workbook.`,
    },
    crossSellSlugs: ['canada-family-information-travel-history-pack', 'universal-client-intake-document-review-kit'],
  },
  {
    slug: 'canada-trv-visitor-visa-pack',
    payhipId: 'IMFsj',
    priceUsd: 13.99,
    marketRangeUsd: [10, 15],
    deliveryLabel: '1 fillable PDF workbook · IMM 5257 prep, invitation/host notes, itinerary and checklist',
    deliveryPromise:
      `One fillable PDF workbook containing IMM 5257 preparation notes, invitation-letter planning, host-support information, travel itinerary, travel-history and document-checklist sections. An invitation letter is supporting material in some cases; it is not represented as a universal IRCC requirement. ${PREP_BOUNDARY}`,
    sectionCount: 5,
    tags: ['Canada visitor visa', 'TRV Canada', 'IMM 5257', 'invitation letter template', 'visitor visa checklist', 'travel itinerary', 'host support letter', 'fillable PDF'],
    cover: {
      pexelsPage: 'https://www.pexels.com/photo/positive-woman-with-passport-using-laptop-on-luggage-in-airport-4173241/',
      imageUrl: 'https://images.pexels.com/photos/4173241/pexels-photo-4173241.jpeg?auto=compress&cs=tinysrgb&w=1200',
      alt: 'Traveler with passport, laptop and luggage in an airport terminal',
      credit: 'Pexels / Gustavo Fring — real airport-travel photograph',
    },
    apex: {
      slug: 'shop-canada-visitor-visa-organizer',
      title: 'Canada Visitor Visa Organizer: IMM 5257 Facts, Itinerary, Host Support and Evidence',
      authorityLinks: [
        { label: 'IRCC visitor visa application form', href: 'https://www.canada.ca/en/immigration-refugees-citizenship/services/application/application-forms-guides/imm5257.html' },
        { label: 'Canada legal guides', href: 'https://legal.yousafeconsultancy.com/ca/' },
      ],
    },
    payhipBlog: {
      slug: 'canada-trv-visitor-visa-document-organizer',
      title: 'Canada Visitor Visa Preparation: Make the Trip Story Match the Evidence',
      excerpt: 'Organize IMM 5257 facts, itinerary, host information, funding and travel history without treating an invitation letter as a magic requirement.',
      bodyMarkdown: `A visitor-visa file should tell one coherent travel story: why you are going, where you expect to stay, how long the visit is planned to last, who is paying, and what evidence supports those facts. A generic invitation letter cannot replace that consistency.\n\nThe **Canada Temporary Resident Visa Visitor Pack** is a **single fillable PDF preparation workbook**. It includes IMM 5257 planning notes, invitation-letter planning, host-support details, a travel itinerary, travel-history prompts, and a document checklist.\n\n### Treat the invitation letter correctly\n\nAn invitation letter can be relevant supporting material where someone in Canada is hosting or inviting you, but it is not marketed here as a universal government requirement or proof that a visa will be issued. The facts in any invitation should match the itinerary, host details, funding story, and the applicant's own records.\n\n### Prepare before you transfer information\n\nUse the workbook to assemble trip dates, destination cities, host/address details, available funds, travel history, and supporting documents. Then open the current IRCC visitor-visa instructions and complete the official process from those verified facts.\n\nRead **Canada Visitor Visa Organizer: IMM 5257 Facts, Itinerary, Host Support and Evidence** on YouSafe Consultancy for the full workflow and current official links.\n\nIf you need a longer chronology, pair the workbook with the Family Information + Travel History Organizer. If another person is supporting significant costs, the Proof of Funds + Sponsor Support Pack can help organize the evidence—but only use sponsor material that is truthful and relevant to your own application.`,
    },
    crossSellSlugs: ['canada-family-information-travel-history-pack', 'canada-proof-of-funds-sponsor-pack', 'universal-client-intake-document-review-kit'],
  },
  {
    slug: 'canada-study-plan-letter-of-explanation-pack',
    payhipId: '8Yo4F',
    priceUsd: 13.99,
    marketRangeUsd: [10, 15],
    deliveryLabel: '1 fillable PDF workbook · study plan, LOE, program fit, career plan and risk-review sections',
    deliveryPromise:
      `One fillable PDF workbook containing guided study-plan/letter-of-explanation preparation, program-fit analysis, career-plan prompts, refusal-risk review and cover-letter planning. The product does not claim that a particular SOP or LOE format guarantees approval or is mandatory in every case. ${PREP_BOUNDARY}`,
    sectionCount: 5,
    tags: ['Canada study plan', 'letter of explanation', 'LOE Canada', 'SOP Canada', 'study permit', 'program fit worksheet', 'career plan', 'fillable PDF'],
    cover: {
      pexelsPage: 'https://www.pexels.com/photo/crop-student-taking-note-from-laptop-5905880/',
      imageUrl: 'https://images.pexels.com/photos/5905880/pexels-photo-5905880.jpeg?auto=compress&cs=tinysrgb&w=1200',
      alt: 'Student taking notes from a laptop at a study desk',
      credit: 'Pexels / Katerina Holmes — real student-study photograph',
    },
    apex: {
      slug: 'shop-canada-study-plan-loe-template',
      title: 'Canada Study Plan & Letter of Explanation: Build the Logic Before You Write',
      authorityLinks: [
        { label: 'Canada study permit 2026 guide', href: 'https://yousafeconsultancy.com/blog/canadian-study-permit-2026' },
        { label: 'IRCC study permit documents', href: 'https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/study-permit/get-documents.html' },
      ],
    },
    payhipBlog: {
      slug: 'canada-study-plan-letter-of-explanation-workbook',
      title: 'Canada Study Plan / LOE: Build the Evidence Logic Before You Draft the Paragraphs',
      excerpt: 'A structured way to connect program choice, prior background, career plans and supporting evidence without copying a generic SOP.',
      bodyMarkdown: `A study plan or letter of explanation should not begin with a sample paragraph. It should begin with the facts: the program, your prior education or work, why the program fits, how it connects to your career plan, and which documents support those claims.\n\nThe **Canada Study Plan + Letter of Explanation Pack** is a **single fillable PDF workbook with five guided areas**. It helps you map the study-plan narrative, letter-of-explanation points, program fit, career plan, and refusal-risk questions before writing final prose.\n\n### Why a worksheet is safer than copying a sample\n\nGeneric SOPs can introduce claims that do not match your history. A structured worksheet forces you to identify the evidence behind each statement: program modules, prior qualifications, work experience, funding, career pathway, and any issue that needs a truthful explanation.\n\nIRCC's current study-permit guidance recommends a letter of explanation in the study-permit document process, but requirements and local instructions can vary. This product does not claim that a specific template or wording is mandatory, and it cannot determine whether your explanation is legally sufficient.\n\nRead **Canada Study Plan & Letter of Explanation: Build the Logic Before You Write** on YouSafe Consultancy, then follow the current IRCC study-permit document instructions.\n\nIf the explanation depends heavily on financial support, use the Proof of Funds + Sponsor Support Pack to organize those figures and evidence. If you are responding to a prior refusal, use the Refusal Review + Reapplication Response Pack to separate the officer's stated concerns from new evidence before drafting.`,
    },
    crossSellSlugs: ['canada-proof-of-funds-sponsor-pack', 'us-canada-refusal-reapplication-response-pack', 'universal-client-intake-document-review-kit'],
  },
  {
    slug: 'canada-proof-of-funds-sponsor-pack',
    payhipId: 'u0S1v',
    priceUsd: 14.99,
    marketRangeUsd: [11, 15],
    deliveryLabel: '1 fillable PDF workbook · funding plan, sponsor evidence, bank-statement review and cost tracking',
    deliveryPromise:
      `One fillable PDF workbook containing proof-of-funds organization, sponsor-support planning, bank-statement/evidence review, source-of-funds explanation prompts, and tuition/living-cost tracking. It does not create funds or make unsupported financial claims acceptable. ${PREP_BOUNDARY}`,
    sectionCount: 5,
    tags: ['Canada proof of funds', 'study permit finances', 'sponsor support letter', 'bank statement checklist', 'source of funds', 'student visa funding', 'tuition tracker', 'fillable PDF'],
    cover: {
      pexelsPage: 'https://www.pexels.com/photo/monthly-budget-planning-7054399/',
      imageUrl: 'https://images.pexels.com/photos/7054399/pexels-photo-7054399.jpeg?auto=compress&cs=tinysrgb&w=1200',
      alt: 'Financial planning desk with calculator and budget documents',
      credit: 'Pexels / Kindel Media — real financial-planning photograph',
    },
    apex: {
      slug: 'shop-canada-proof-of-funds-organizer',
      title: 'Canada Study Permit Proof of Funds Organizer: Make the Numbers Traceable',
      authorityLinks: [
        { label: 'Canada study permit financial proof guide', href: 'https://yousafeconsultancy.com/blog/canada-study-permit-financial-proof' },
        { label: 'IRCC proof of financial support', href: 'https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/study-permit/get-documents/financial-support.html' },
      ],
    },
    payhipBlog: {
      slug: 'canada-proof-of-funds-sponsor-support-organizer',
      title: 'Canada Study Permit Proof of Funds: Organize the Source, Not Just the Balance',
      excerpt: 'Map tuition, living costs, sponsor support, bank evidence and source-of-funds explanations into one traceable preparation record.',
      bodyMarkdown: `A large bank balance is not a complete financial story. A study-permit file may need to show how tuition, living costs, travel and other expenses will be covered—and where the money comes from. The supporting documents should make that story traceable.\n\nThe **Canada Proof of Funds + Sponsor Support Pack** is a **single fillable PDF workbook with five financial-preparation sections**. It organizes the funding plan, sponsor support, bank-statement evidence, source-of-funds explanation, and tuition/living-cost tracking.\n\n### Start with the costs\n\nList the actual tuition already paid, remaining tuition, expected living expenses, travel costs, and any other relevant amount. Then identify the evidence supporting each funding source: personal savings, sponsor income, scholarship, loan, GIC, or another legitimate source.\n\n### Explain unusual money honestly\n\nRecent large deposits, transfers, or sponsor funds should not be “fixed” with invented explanations. Use the workbook to flag them for truthful documentation and, where needed, professional advice.\n\nIRCC's required financial-support amounts and accepted evidence can change. The workbook therefore points buyers back to the live IRCC financial-support page and does not hard-code a permanent minimum as if it can never change.\n\nRead **Canada Study Permit Proof of Funds Organizer: Make the Numbers Traceable** on YouSafe Consultancy, then use the existing Canada study-permit financial-proof guide for current requirements.\n\nThe Study Plan/LOE Pack is the natural companion when your academic narrative references who is funding you and why. If a prior refusal raised financial concerns, use the Refusal Review + Reapplication Response Pack to map the stated concern before adding new documents.`,
    },
    crossSellSlugs: ['canada-study-plan-letter-of-explanation-pack', 'us-canada-refusal-reapplication-response-pack', 'universal-client-intake-document-review-kit'],
  },
] as const

const BATCH1_BY_SLUG = new Map(PAYHIP_BATCH1_COMMERCIAL.map((product) => [product.slug, product]))

export function getPayhipBatch1Commercial(slug: string): PayhipBatch1CommercialProduct | undefined {
  return BATCH1_BY_SLUG.get(slug)
}

export function applyPayhipBatch1Commercial(product: ImmigrationShopProduct): ImmigrationShopProduct {
  const commercial = getPayhipBatch1Commercial(product.slug)
  if (!commercial) return product
  return {
    ...product,
    price_usd: commercial.priceUsd,
    short_description: commercial.deliveryPromise.split(` ${PREP_BOUNDARY}`)[0],
  }
}

export function getPayhipBatch1CrossSells(
  slug: string,
  allProducts: readonly ImmigrationShopProduct[],
): ImmigrationShopProduct[] {
  const commercial = getPayhipBatch1Commercial(slug)
  if (!commercial) return []
  const bySlug = new Map(allProducts.map((product) => [product.slug, product]))
  return commercial.crossSellSlugs
    .map((crossSellSlug) => bySlug.get(crossSellSlug))
    .filter((product): product is ImmigrationShopProduct => Boolean(product))
    .map(applyPayhipBatch1Commercial)
}
