// Sitewide SEO knowledge base — distilled from
// /SEO strategies/SEO_STRATEGY_Q3_2026.md (June-Aug 2026, owner: YouSafe
// Consultancy SEO team + Claude Code). This file is the single source
// of truth for the strategy directives injected into the AI gig-draft
// prompts. When the quarterly plan is refreshed, edit THIS file — every
// downstream prompt picks up the change automatically.
//
// Two consumers:
//   1. lib/seoResearch.ts — merges STRATEGIC_KEYWORDS into the priority
//      ranking with source='strategic'. Strategic terms are SEO-team-
//      curated quarterly targets, so they outrank generic 'intent'
//      modifiers but sit below live GSC signals (when available) and
//      taxonomy-anchored category keywords.
//   2. lib/seoSuggest.ts — emits getStrategyDirectivesBlock() inside
//      buildBaseContext so the LLM sees the banned-phrase list, the
//      5-question test, length gates, and the freshness rule on
//      EVERY field draft.

import type { Jurisdiction } from './seoResearch'

// Clusters from §1 of the strategy doc. A cluster is a topical
// authority pillar; gigs in adjacent taxonomy categories ride its
// coattails for SEO purposes (e.g. an SOP-writing gig in the US is
// adjacent to the F-1/OPT cluster and should reference USCIS-aligned
// policy timing if relevant).
export type Cluster =
  | 'uk-tenancy'
  | 'us-f1-opt'
  | 'canada-sp-pgwp'
  | 'us-work'      // H-1B + EB-2 NIW
  | 'uk-work'      // Skilled worker
  | 'canada-pr'    // Express Entry + family
  | 'us-pr'        // EB-2 NIW after OPT
  | 'compare'      // Cross-country comparison content
  | 'academic-writing-essay'
                   // Commercial-intent academic-writing keywords —
                   // competitor-mapped (essaypro.com et al). Not in the
                   // Q3 strategy doc because the canonical-content plan
                   // is legal/immigration-focused; this cluster
                   // augments it for the consultant marketplace surface
                   // where academic-writing gigs need essay-service
                   // commercial-intent vocabulary to rank against
                   // established competitors.
  | 'career-services'
                   // Competitor-mapped: LinkedIn Premium, Resume.com,
                   // TopResume, ResumeGenius, ZipJob, TopInterview,
                   // MyPerfectResume, Career.io. Resume + LinkedIn +
                   // cover-letter + interview-prep + job-search-coach
                   // commercial-intent vocabulary.
  | 'business-formation'
                   // Competitor-mapped: LegalZoom, ZenBusiness,
                   // Incfile (now Bizee), Northwest Registered Agent,
                   // Rocket Lawyer, Stripe Atlas, Tailor Brands, Inc
                   // Authority. LLC/S-corp/C-corp formation +
                   // registered agent + EIN + compliance vocabulary.
  | 'credential-evaluation'
                   // Competitor-mapped: WES, ECE, IQAS, ICAS, ICES,
                   // SpanTran, Josef Silny, Foreign Credits, AERC.
                   // Foreign degree / transcript evaluation + license
                   // recognition vocabulary.
  | 'mentorship-coaching'
                   // Competitor-mapped: MentorCruise, Pathrise,
                   // Springboard, ADPList, Codementor, GrowthMentor.
                   // 1-on-1 mentor / coding mentor / career coach
                   // commercial-intent vocabulary.

export interface StrategicKeyword {
  // The exact phrase to surface in priority lists. Verbatim from the
  // strategy doc — these are the 20 "fastest ranking" keywords picked
  // for the quarter, not LLM-generated.
  term: string
  cluster: Cluster
  intent: 'informational' | 'commercial' | 'transactional'
  // Whether this keyword is on the public marketplace surface (gig
  // titles/descriptions can earn these) or strictly canonical-content
  // (legal canonicals on legal.yousafeconsultancy.com / caseworks).
  // 'either' = both surfaces compete fairly.
  surface: 'marketplace' | 'canonical' | 'either'
  // The quarter month this keyword was prioritized in. Surfaces
  // freshness on the prompt: month-1 keywords ride breaking 2026
  // policy waves and should be hit FAST.
  month: 1 | 2 | 3
}

// The 20 target keywords from §3 of the strategy doc. Tagged with
// cluster + intent + surface so the gig-draft path can pull the
// relevant subset for the seller's category/jurisdiction.
export const STRATEGIC_KEYWORDS: StrategicKeyword[] = [
  // Month 1 — policy urgency
  { term: 'Section 21 abolished May 2026 student tenants',         cluster: 'uk-tenancy',     intent: 'informational', surface: 'either',      month: 1 },
  { term: 'Renters Rights Act 2026 international students UK',     cluster: 'uk-tenancy',     intent: 'informational', surface: 'either',      month: 1 },
  { term: 'F-1 duration of status proposed change 2026',           cluster: 'us-f1-opt',      intent: 'informational', surface: 'either',      month: 1 },
  { term: 'STEM OPT employer monitoring site visit 2026',          cluster: 'us-f1-opt',      intent: 'informational', surface: 'either',      month: 1 },
  { term: 'Canada study permit cap 2026 India Nigeria',            cluster: 'canada-sp-pgwp', intent: 'informational', surface: 'either',      month: 1 },
  { term: 'PGWP field of study requirements 2026 diploma',         cluster: 'canada-sp-pgwp', intent: 'informational', surface: 'either',      month: 1 },
  { term: 'PAL TAL exempt graduate programs Canada 2026',          cluster: 'canada-sp-pgwp', intent: 'informational', surface: 'canonical',   month: 1 },
  // Month 2 — topical depth & pain points
  { term: 'OPT 90 day unemployment cap grace period strategy',     cluster: 'us-f1-opt',      intent: 'informational', surface: 'either',      month: 2 },
  { term: 'SEVIS termination reinstatement timeline 2026',         cluster: 'us-f1-opt',      intent: 'informational', surface: 'either',      month: 2 },
  { term: 'Study permit refusal reapply Canada 2026',              cluster: 'canada-sp-pgwp', intent: 'informational', surface: 'either',      month: 2 },
  { term: 'H-1B lottery 2026 registration deadline employer',      cluster: 'us-work',        intent: 'informational', surface: 'either',      month: 2 },
  { term: 'Day 1 CPT risks 2026 legitimate programs',              cluster: 'us-f1-opt',      intent: 'informational', surface: 'canonical',   month: 2 },
  { term: 'UK skilled worker visa salary threshold 2026',          cluster: 'uk-work',        intent: 'informational', surface: 'either',      month: 2 },
  { term: 'Canada Express Entry CRS international student graduates', cluster: 'canada-pr',   intent: 'informational', surface: 'either',      month: 2 },
  // Month 3 — long-tail monetization
  { term: 'F-1 student health insurance USA Canada UK comparison 2026', cluster: 'compare',   intent: 'commercial',    surface: 'either',      month: 3 },
  { term: 'International student housing deposit dispute letter template', cluster: 'uk-tenancy', intent: 'transactional', surface: 'either',  month: 3 },
  { term: 'Spousal open work permit Canada study permit 2026',     cluster: 'canada-pr',      intent: 'informational', surface: 'either',      month: 3 },
  { term: 'EB-2 NIW green card STEM OPT students 2026',            cluster: 'us-pr',          intent: 'informational', surface: 'either',      month: 3 },
  { term: 'Canada study permit financial proof GIC vs bank statement 2026', cluster: 'canada-sp-pgwp', intent: 'commercial', surface: 'either', month: 3 },
  { term: 'F-1 visa interview questions Lagos Mumbai Nairobi London 2026', cluster: 'us-f1-opt', intent: 'informational', surface: 'canonical', month: 3 },
  // ===================================================================
  // --- Academic-writing-essay cluster ---
  //
  // Comprehensive competitor-mapped keyword bank for academic-writing
  // consultant gigs. Sourced by manual competitor analysis of the
  // ranking sets of:
  //
  //   * EssayPro.com           — broad essay/SOP commercial intent
  //   * EssayEdge.com          — admissions-essay editing
  //   * TopAdmit.com           — international student admissions
  //   * Accepted.com           — MBA + med school admissions
  //   * Crimson Education      — premium Ivy admissions consulting
  //   * Ivy Coach              — ivy-league admissions premium
  //   * IvyWise                — admissions consulting
  //   * College Coach          — generalist admissions consulting
  //   * Stratus Admissions     — MBA admissions
  //   * Aringo                 — MBA admissions
  //   * Personal Statement Pro — UCAS / UK admissions
  //   * MedSchoolCoach         — med school admissions
  //   * LawSchoolToolbox       — law school admissions
  //   * Scribendi              — academic editing
  //   * Wordvice               — academic editing (ESL focus)
  //   * Editage                — research-paper editing
  //   * Cambridge Proofreading — academic proofreading
  //   * Grammarly Business     — proofreading + editing (heavyweight)
  //   * StudyAbroad.com        — broader study abroad info hub
  //
  // All entries: commercial intent, surface=marketplace, month=1 so
  // they're always in scope regardless of quarterly-month filter.
  //
  // EXCLUDED: academically-dishonest terms ("write my essay", "buy
  // essay online", "cheap essay writing service", "pay someone to
  // write my essay"). Google's helpful-content updates penalize
  // sites ranking for those, and YouSafe consultants deliver
  // editing / coaching / review — never finished papers ghostwritten
  // for academic submission. Sellers who ARE doing that are in
  // violation of YouSafe ToS; we don't optimize for them.
  // ===================================================================

  // -- General admissions essay help (EssayPro, EssayEdge, College Coach) --
  { term: 'personal statement help',                 cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'college essay help',                      cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'admissions essay help',                   cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'essay editing service',                   cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'essay review service',                    cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'common app essay help',                   cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'supplemental essay help',                 cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'why this college essay help',             cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'college admissions essay coach',          cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'application essay feedback',              cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'essay topic brainstorming',               cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'essay structure help',                    cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'application essay review',                cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },

  // -- Premium / Ivy admissions consulting (Crimson, Ivy Coach, IvyWise) --
  { term: 'ivy league admissions consultant',        cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'ivy league essay help',                   cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'harvard admissions essay help',           cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'stanford application essay help',         cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'top college admissions strategy',         cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'private admissions counselor',            cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'admissions consultant',                   cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'college admissions coach',                cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },

  // -- Graduate school SOP / personal statement (Accepted, EssayEdge, TopAdmit) --
  { term: 'sop writing service',                     cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'statement of purpose help',               cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'graduate school personal statement',      cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'grad school sop editing',                 cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'phd personal statement',                  cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'masters personal statement help',         cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'study plan writing',                      cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'letter of intent writing',                cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'research statement help',                 cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },

  // -- MBA admissions (Stratus, Aringo, MBAStandard, Accepted MBA) --
  { term: 'mba essay help',                          cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'mba admissions consultant',               cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'mba personal statement',                  cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'mba application essay coach',             cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'mba essay editing',                       cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'wharton essay help',                      cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'harvard hbs essay help',                  cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'mba goals essay',                         cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },

  // -- Med school admissions (MedSchoolCoach, Accepted med arm) --
  { term: 'med school personal statement help',      cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'medical school admissions consultant',    cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'amcas personal statement',                cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'aacomas personal statement',              cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'med school secondary essays',             cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'medical school essay editing',            cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'pre-med essay coach',                     cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },

  // -- Law school admissions (LawSchoolToolbox, Accepted law arm) --
  { term: 'law school personal statement help',      cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'law school admissions consultant',        cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'lsat personal statement',                 cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'law school addendum writing',             cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'law school diversity statement',          cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'law school essay editing',                cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },

  // -- UK admissions / UCAS (Personal Statement Pro) --
  { term: 'ucas personal statement help',            cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'oxbridge admissions consultant',          cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'oxbridge personal statement',             cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'russell group application help',          cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'cambridge application essay',             cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'oxford application essay',                cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },

  // -- Scholarship + funding essays (EssayEdge, ScholarshipPoints) --
  { term: 'scholarship essay help',                  cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'scholarship essay editing',               cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'merit essay writing',                     cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'fulbright application help',              cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'rhodes scholarship essay',                cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'gates scholarship essay',                 cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'chevening essay help',                    cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'commonwealth scholarship essay',          cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },

  // -- Academic editing / proofreading (Scribendi, Wordvice, Editage, Cambridge Proofreading, Grammarly) --
  { term: 'essay proofreading',                      cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'academic editing service',                cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'academic proofreading service',           cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'paper proofreading service',              cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'esl essay editing',                       cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'english proofreading service',            cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'language polishing service',              cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'grammar editing service',                 cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },

  // -- Research-paper / thesis / dissertation (Editage, Cambridge Proofreading) --
  { term: 'thesis editing service',                  cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'dissertation editing',                    cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'dissertation proofreading',               cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'research paper editing',                  cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'research paper review',                   cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'manuscript editing service',              cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'journal submission editing',              cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'phd thesis editing',                      cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'literature review editing',               cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },

  // -- Application coaching / general consulting --
  { term: 'academic writing coach',                  cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'college application essay coach',         cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'graduate school application coach',       cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'admissions strategy session',             cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'school selection consultant',             cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'application timeline coaching',           cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'recommendation letter editing',           cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'recommendation letter coaching',          cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },

  // -- Interview prep adjacent --
  { term: 'admissions interview prep',               cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'mba interview coaching',                  cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'med school interview prep',               cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'mmi interview practice',                  cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'oxbridge interview prep',                 cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },

  // -- International / ESL student angle (TopAdmit, Wordvice) --
  { term: 'international student admissions essay',  cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'esl personal statement help',             cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'study abroad application essay',          cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'visa interview essay prep',               cluster: 'academic-writing-essay', intent: 'commercial', surface: 'marketplace', month: 1 },

  // ===================================================================
  // --- Career-services cluster ---
  // LinkedIn Premium, Resume.com, TopResume, ResumeGenius, ZipJob,
  // TopInterview, MyPerfectResume, Career.io, Find My Profession.
  // All commercial intent, surface=marketplace, month=1.
  // ===================================================================

  // -- Resume writing (TopResume, ResumeGenius, ZipJob, MyPerfectResume) --
  { term: 'professional resume writing service',     cluster: 'career-services', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'resume writing service',                  cluster: 'career-services', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'executive resume writing',                cluster: 'career-services', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'ats resume optimization',                 cluster: 'career-services', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'ats friendly resume',                     cluster: 'career-services', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'resume editing service',                  cluster: 'career-services', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'resume review service',                   cluster: 'career-services', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'resume rewrite service',                  cluster: 'career-services', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'federal resume writing',                  cluster: 'career-services', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'tech resume writing',                     cluster: 'career-services', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'engineering resume writing',              cluster: 'career-services', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'finance resume writing',                  cluster: 'career-services', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'healthcare resume writing',               cluster: 'career-services', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'sales resume writing',                    cluster: 'career-services', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'cv writing service',                      cluster: 'career-services', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'academic cv writing',                     cluster: 'career-services', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'military to civilian resume',             cluster: 'career-services', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'entry level resume writing',              cluster: 'career-services', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'career change resume writing',            cluster: 'career-services', intent: 'commercial', surface: 'marketplace', month: 1 },

  // -- LinkedIn (LinkedIn Premium, TopResume LinkedIn, Find My Profession) --
  { term: 'linkedin profile optimization',           cluster: 'career-services', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'linkedin profile writing service',        cluster: 'career-services', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'linkedin headline writing',               cluster: 'career-services', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'linkedin summary writing',                cluster: 'career-services', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'linkedin profile makeover',               cluster: 'career-services', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'linkedin all-star profile',               cluster: 'career-services', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'linkedin seo optimization',               cluster: 'career-services', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'linkedin recruiter optimization',         cluster: 'career-services', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'personal branding linkedin',              cluster: 'career-services', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'executive linkedin profile',              cluster: 'career-services', intent: 'commercial', surface: 'marketplace', month: 1 },

  // -- Cover letters (TopResume, ResumeGenius) --
  { term: 'cover letter writing service',            cluster: 'career-services', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'cover letter editing',                    cluster: 'career-services', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'custom cover letter writing',             cluster: 'career-services', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'cover letter coach',                      cluster: 'career-services', intent: 'commercial', surface: 'marketplace', month: 1 },

  // -- Interview prep (TopInterview, Pramp, IGotAnOffer) --
  { term: 'interview coaching',                      cluster: 'career-services', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'mock interview practice',                 cluster: 'career-services', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'behavioral interview prep',               cluster: 'career-services', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'technical interview prep',                cluster: 'career-services', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'case interview coaching',                 cluster: 'career-services', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'consulting interview prep',               cluster: 'career-services', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'finance interview prep',                  cluster: 'career-services', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'product manager interview prep',          cluster: 'career-services', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'system design interview prep',            cluster: 'career-services', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'coding interview prep',                   cluster: 'career-services', intent: 'commercial', surface: 'marketplace', month: 1 },

  // -- Job search / career coaching (Career.io, FindMyProfession) --
  { term: 'job search strategy coach',               cluster: 'career-services', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'career change coach',                     cluster: 'career-services', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'executive career coach',                  cluster: 'career-services', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'career transition coaching',              cluster: 'career-services', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'career pivot coaching',                   cluster: 'career-services', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'salary negotiation coach',                cluster: 'career-services', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'job application coach',                   cluster: 'career-services', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'networking coach',                        cluster: 'career-services', intent: 'commercial', surface: 'marketplace', month: 1 },

  // ===================================================================
  // --- Business-formation cluster ---
  // LegalZoom, ZenBusiness, Incfile/Bizee, Northwest Registered Agent,
  // Rocket Lawyer, Stripe Atlas, Tailor Brands, Inc Authority,
  // MyCorporation, FormSwift. All commercial intent, surface=
  // marketplace, month=1.
  // ===================================================================

  // -- Entity formation (LegalZoom, ZenBusiness, Bizee, Northwest) --
  { term: 'llc formation service',                   cluster: 'business-formation', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'llc formation help',                      cluster: 'business-formation', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'form an llc online',                      cluster: 'business-formation', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'single-member llc formation',             cluster: 'business-formation', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'multi-member llc formation',              cluster: 'business-formation', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'form a corporation online',               cluster: 'business-formation', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 's-corp formation',                        cluster: 'business-formation', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'c-corp formation',                        cluster: 'business-formation', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'nonprofit incorporation',                 cluster: 'business-formation', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'delaware llc formation',                  cluster: 'business-formation', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'wyoming llc formation',                   cluster: 'business-formation', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'nevada llc formation',                    cluster: 'business-formation', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'form a business online',                  cluster: 'business-formation', intent: 'commercial', surface: 'marketplace', month: 1 },

  // -- Registered agent (Northwest, Bizee, LegalZoom) --
  { term: 'registered agent service',                cluster: 'business-formation', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'virtual registered agent',                cluster: 'business-formation', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'commercial registered agent',             cluster: 'business-formation', intent: 'commercial', surface: 'marketplace', month: 1 },

  // -- Compliance / EIN / filings (LegalZoom, Bizee) --
  { term: 'ein application help',                    cluster: 'business-formation', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'federal tax id application',              cluster: 'business-formation', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'business license application',            cluster: 'business-formation', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'dba filing service',                      cluster: 'business-formation', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'annual report filing',                    cluster: 'business-formation', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'boi report filing',                       cluster: 'business-formation', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'operating agreement drafting',            cluster: 'business-formation', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'corporate bylaws drafting',               cluster: 'business-formation', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'shareholder agreement drafting',          cluster: 'business-formation', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'llc operating agreement template',        cluster: 'business-formation', intent: 'commercial', surface: 'marketplace', month: 1 },

  // -- Business setup peripherals (Tailor Brands, ZenBusiness) --
  { term: 'business name search',                    cluster: 'business-formation', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'dba name registration',                   cluster: 'business-formation', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'business address service',                cluster: 'business-formation', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'virtual business address',                cluster: 'business-formation', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'business mailing address',                cluster: 'business-formation', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'business formation package',              cluster: 'business-formation', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'foreign llc qualification',               cluster: 'business-formation', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'llc dissolution service',                 cluster: 'business-formation', intent: 'commercial', surface: 'marketplace', month: 1 },

  // -- Tax / accounting (FreshBooks, 1-800Accountant, Bench) --
  { term: 'small business tax filing',               cluster: 'business-formation', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'llc tax filing',                          cluster: 'business-formation', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 's-corp tax filing',                       cluster: 'business-formation', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'quarterly tax filing help',               cluster: 'business-formation', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'estimated tax payment help',              cluster: 'business-formation', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'bookkeeping service for llc',             cluster: 'business-formation', intent: 'commercial', surface: 'marketplace', month: 1 },

  // -- Startup / consulting angle (Stripe Atlas, founder consulting) --
  { term: 'startup formation consultant',            cluster: 'business-formation', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'small business consultant',               cluster: 'business-formation', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'e-commerce business setup',               cluster: 'business-formation', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'amazon fba business setup',               cluster: 'business-formation', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'business plan writing service',           cluster: 'business-formation', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'grant writing service',                   cluster: 'business-formation', intent: 'commercial', surface: 'marketplace', month: 1 },

  // ===================================================================
  // --- Credential-evaluation cluster ---
  // WES, ECE, IQAS, ICAS, ICES, SpanTran, Josef Silny, Foreign
  // Credits, AERC, ECFMG. All commercial intent, surface=marketplace,
  // month=1.
  // ===================================================================

  // -- Core credential evaluation (WES, ECE, IQAS, ICAS) --
  { term: 'foreign credential evaluation',           cluster: 'credential-evaluation', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'wes credential evaluation',               cluster: 'credential-evaluation', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'wes evaluation help',                     cluster: 'credential-evaluation', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'wes application help',                    cluster: 'credential-evaluation', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'ece credential evaluation',               cluster: 'credential-evaluation', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'iqas credential evaluation',              cluster: 'credential-evaluation', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'icas credential evaluation',              cluster: 'credential-evaluation', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'ices credential evaluation',              cluster: 'credential-evaluation', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'spantran evaluation',                     cluster: 'credential-evaluation', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'credential evaluation usa',               cluster: 'credential-evaluation', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'credential evaluation canada',            cluster: 'credential-evaluation', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'credential evaluation uk',                cluster: 'credential-evaluation', intent: 'commercial', surface: 'marketplace', month: 1 },

  // -- Degree / transcript evaluation --
  { term: 'degree equivalency evaluation',           cluster: 'credential-evaluation', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'transcript evaluation service',           cluster: 'credential-evaluation', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'course-by-course evaluation',             cluster: 'credential-evaluation', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'document-by-document evaluation',         cluster: 'credential-evaluation', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'transcript translation',                  cluster: 'credential-evaluation', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'diploma evaluation',                      cluster: 'credential-evaluation', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'academic credential assessment',          cluster: 'credential-evaluation', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'education verification service',          cluster: 'credential-evaluation', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'degree verification service',             cluster: 'credential-evaluation', intent: 'commercial', surface: 'marketplace', month: 1 },

  // -- Licensing / certification (ECFMG, FCCS, NCEES, NCLEX) --
  { term: 'professional license recognition',        cluster: 'credential-evaluation', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'nurse licensing usa',                     cluster: 'credential-evaluation', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'engineer licensing usa',                  cluster: 'credential-evaluation', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'pe licensing usa',                        cluster: 'credential-evaluation', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'teacher licensing usa',                   cluster: 'credential-evaluation', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'ecfmg certification help',                cluster: 'credential-evaluation', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'usmle preparation help',                  cluster: 'credential-evaluation', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'nclex preparation help',                  cluster: 'credential-evaluation', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'foreign degree recognition',              cluster: 'credential-evaluation', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'foreign diploma recognition',             cluster: 'credential-evaluation', intent: 'commercial', surface: 'marketplace', month: 1 },

  // ===================================================================
  // --- Mentorship-coaching cluster ---
  // MentorCruise, Pathrise, Springboard, ADPList, Codementor,
  // GrowthMentor, BetterUp, Coach.me. All commercial intent,
  // surface=marketplace, month=1.
  // ===================================================================

  // -- General mentor matching (MentorCruise, ADPList, GrowthMentor) --
  { term: '1-on-1 mentorship',                       cluster: 'mentorship-coaching', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'find a mentor online',                    cluster: 'mentorship-coaching', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'career mentor',                           cluster: 'mentorship-coaching', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'mentorship program',                      cluster: 'mentorship-coaching', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'expert mentor matching',                  cluster: 'mentorship-coaching', intent: 'commercial', surface: 'marketplace', month: 1 },

  // -- Tech mentorship (Codementor, MentorCruise tech, Pathrise) --
  { term: 'coding mentor',                           cluster: 'mentorship-coaching', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'software engineer mentor',                cluster: 'mentorship-coaching', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'web development mentor',                  cluster: 'mentorship-coaching', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'data science mentor',                     cluster: 'mentorship-coaching', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'machine learning mentor',                 cluster: 'mentorship-coaching', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'python mentor',                           cluster: 'mentorship-coaching', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'javascript mentor',                       cluster: 'mentorship-coaching', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'react mentor',                            cluster: 'mentorship-coaching', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'senior dev mentor',                       cluster: 'mentorship-coaching', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'engineering manager mentor',              cluster: 'mentorship-coaching', intent: 'commercial', surface: 'marketplace', month: 1 },

  // -- Product / design (ADPList core niche) --
  { term: 'product manager mentor',                  cluster: 'mentorship-coaching', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'ux design mentor',                        cluster: 'mentorship-coaching', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'ui design mentor',                        cluster: 'mentorship-coaching', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'product designer mentor',                 cluster: 'mentorship-coaching', intent: 'commercial', surface: 'marketplace', month: 1 },

  // -- Business / startup (GrowthMentor, MicroAcquire mentors) --
  { term: 'startup mentor',                          cluster: 'mentorship-coaching', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'founder mentor',                          cluster: 'mentorship-coaching', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'entrepreneur coach',                      cluster: 'mentorship-coaching', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'business mentorship',                     cluster: 'mentorship-coaching', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'growth marketing mentor',                 cluster: 'mentorship-coaching', intent: 'commercial', surface: 'marketplace', month: 1 },

  // -- Academic mentorship --
  { term: 'academic mentor',                         cluster: 'mentorship-coaching', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'phd mentor',                              cluster: 'mentorship-coaching', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'research mentor',                         cluster: 'mentorship-coaching', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'thesis mentor',                           cluster: 'mentorship-coaching', intent: 'commercial', surface: 'marketplace', month: 1 },

  // -- Life coaching (BetterUp, Coach.me) --
  { term: 'life coach online',                       cluster: 'mentorship-coaching', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'accountability coach',                    cluster: 'mentorship-coaching', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'personal development coach',              cluster: 'mentorship-coaching', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'mindset coach',                           cluster: 'mentorship-coaching', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'goal-setting coach',                      cluster: 'mentorship-coaching', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'executive coach',                         cluster: 'mentorship-coaching', intent: 'commercial', surface: 'marketplace', month: 1 },
  { term: 'leadership coach',                        cluster: 'mentorship-coaching', intent: 'commercial', surface: 'marketplace', month: 1 },
]

// Map a taxonomy category + jurisdiction to the relevant strategy
// cluster(s). The mapping is ROLE-AWARE because the same category
// means different things for attorneys vs consultants:
//
//   ATTORNEY: a "legal" or "immigration" gig genuinely sells the
//   policy outcome the strategy cluster targets. Broad mapping is
//   correct — an attorney offering education-category services for
//   the US is doing student-visa work, which is the F-1/OPT cluster.
//
//   CONSULTANT: an "academic-writing" or "education" gig is selling
//   SOPs, essays, admissions support — NOT immigration policy
//   guidance. Surfacing the F-1/OPT cluster's policy keywords (STEM
//   OPT employer monitoring, F-1 duration of status, SEVIS) on a
//   non-legal academic-writing gig drowns out the actual subcategory
//   vocabulary (SOP, personal statement, scholarship essay) and
//   produces incoherent titles. So consultant mapping is tight:
//   only categories where the buyer intent genuinely overlaps with
//   the strategy cluster (settlement+UK tenancy is the one clean
//   overlap; everything else gets none and falls back to taxonomy
//   keywords alone).
//
// When the lookup returns no clusters, the strategy signals collapse
// to an empty list and the prompt is still fully grounded by
// taxonomy keywords + the playbook rules.

type ClusterMap = Record<string, Partial<Record<Exclude<Jurisdiction, ''>, Cluster[]>>>

const CATEGORY_TO_CLUSTERS_ATTORNEY: ClusterMap = {
  // Attorneys keep the broad immigration-policy cluster mapping
  // because they ARE selling the legal/policy outcome the clusters
  // target. Layered ON TOP of that: the commercial-intent clusters
  // (career-services, business-formation, credential-evaluation,
  // mentorship-coaching) so an attorney offering resume review,
  // LLC formation, WES help, or mentorship still gets the
  // competitor-mapped commercial vocabulary on top of the
  // legal-anchor vocabulary.
  immigration:        { us: ['us-f1-opt', 'us-work', 'us-pr'], uk: ['uk-work'],     ca: ['canada-sp-pgwp', 'canada-pr'] },
  education:          { us: ['us-f1-opt', 'academic-writing-essay'], uk: ['academic-writing-essay'], ca: ['canada-sp-pgwp', 'academic-writing-essay'] },
  'academic-writing': { us: ['us-f1-opt', 'academic-writing-essay'], uk: ['academic-writing-essay'], ca: ['canada-sp-pgwp', 'academic-writing-essay'] },
  legal:              { us: ['us-f1-opt', 'us-work', 'us-pr', 'business-formation'], uk: ['uk-tenancy', 'uk-work', 'business-formation'], ca: ['canada-sp-pgwp', 'canada-pr', 'business-formation'] },
  settlement:         { us: [],                                uk: ['uk-tenancy'],  ca: [] },
  career:             { us: ['us-f1-opt', 'us-work', 'career-services'], uk: ['uk-work', 'career-services'], ca: ['canada-pr', 'career-services'] },
  business:           { us: ['us-work', 'business-formation'], uk: ['uk-work', 'business-formation'], ca: ['canada-pr', 'business-formation'] },
  credentials:        { us: ['us-work', 'credential-evaluation'], uk: ['uk-work', 'credential-evaluation'], ca: ['canada-pr', 'credential-evaluation'] },
  mentorship:         { us: ['us-f1-opt', 'mentorship-coaching'], uk: ['mentorship-coaching'], ca: ['canada-sp-pgwp', 'mentorship-coaching'] },
}

const CATEGORY_TO_CLUSTERS_CONSULTANT: ClusterMap = {
  // Consultant mapping uses ONLY commercial-intent competitor clusters
  // — never the immigration-policy clusters. Consultants are not
  // selling policy outcomes; their value prop is the service itself
  // (essay editing, LLC formation, WES help, resume rewrite, etc.).
  // Surfacing immigration-policy strategic keywords on a non-legal
  // consultant gig misdirects the AI and produces incoherent drafts
  // (see commit history: "STEM OPT employer monitoring site visit
  // 2026" appearing on an academic-writing gig was exactly this bug).
  //
  // Each category maps to the cluster(s) that match the seller's
  // actual deliverable. The subcategory-affinity boosting in
  // getStrategicKeywordsForGig routes the narrowest slice of each
  // cluster to the specific subcategory the seller picked.
  'academic-writing': { us: ['academic-writing-essay'], uk: ['academic-writing-essay'], ca: ['academic-writing-essay'] },
  education:          { us: ['academic-writing-essay'], uk: ['academic-writing-essay'], ca: ['academic-writing-essay'] },
  career:             { us: ['career-services'],        uk: ['career-services'],        ca: ['career-services'] },
  business:           { us: ['business-formation'],     uk: ['business-formation'],     ca: ['business-formation'] },
  credentials:        { us: ['credential-evaluation'],  uk: ['credential-evaluation'],  ca: ['credential-evaluation'] },
  // Mentorship gets BOTH the academic-writing cluster (for student-
  // facing mentorship gigs — SAT/SOP/admissions) AND the mentorship-
  // coaching cluster (for tech/product/business mentor gigs). The
  // subcategory-affinity router picks the right slice based on
  // whether the seller picked student-mentorship vs professional-
  // coaching vs life-coaching.
  mentorship:         { us: ['mentorship-coaching', 'academic-writing-essay'], uk: ['mentorship-coaching', 'academic-writing-essay'], ca: ['mentorship-coaching', 'academic-writing-essay'] },
  settlement:         { us: [], uk: ['uk-tenancy'], ca: [] },
}

export interface GetStrategicKeywordsOpts {
  category: string
  subcategory?: string
  jurisdiction: string
  // Role determines surface eligibility. Consultants get marketplace
  // + either surface; attorneys get all three. This matches the
  // role-aware split in lib/seoResearch.ts.
  role: 'attorney' | 'consultant'
  // Optional: limit the slice to a specific quarterly month (1, 2, 3).
  // Default — return ALL months; the consumer ranks by month later if
  // it wants freshness preference.
  month?: 1 | 2 | 3
}

export function getStrategicKeywordsForGig(opts: GetStrategicKeywordsOpts): StrategicKeyword[] {
  const jx = (String(opts.jurisdiction || '').trim().toLowerCase()) as Exclude<Jurisdiction, ''>
  const cat = String(opts.category || '').trim().toLowerCase()
  const sub = String(opts.subcategory || '').trim().toLowerCase()
  if (jx !== 'us' && jx !== 'uk' && jx !== 'ca') return []
  const clusterMap = opts.role === 'consultant' ? CATEGORY_TO_CLUSTERS_CONSULTANT : CATEGORY_TO_CLUSTERS_ATTORNEY
  const clusters = clusterMap[cat]?.[jx] ?? []
  if (clusters.length === 0) return []
  const clusterSet = new Set(clusters)
  const surfaceFilter = opts.role === 'consultant' ? new Set(['marketplace', 'either']) : new Set(['marketplace', 'canonical', 'either'])

  // Subcategory-affinity boosting. When the seller picked a specific
  // subcategory (e.g. sop-writing, scholarship-essays, application-
  // essays), prefer strategic keywords whose term contains one of
  // the subcategory's anchor tokens. Without this the slice(0, N) cap
  // picks generic cluster keywords ("personal statement help" wins
  // every time) and SOP-specific gigs miss the SOP-specific
  // commercial-intent terms ("sop writing service", "statement of
  // purpose help") that would actually compete for the seller's
  // narrowest audience.
  const subTokens = subcategoryAffinityTokens(sub)
  const affinityScore = (term: string): number => {
    if (!subTokens.length) return 0
    const lower = term.toLowerCase()
    let score = 0
    for (const tok of subTokens) {
      if (lower.includes(tok)) score -= 1 // lower = ranked earlier
    }
    return score
  }

  return STRATEGIC_KEYWORDS
    .filter((kw) => clusterSet.has(kw.cluster))
    .filter((kw) => surfaceFilter.has(kw.surface))
    .filter((kw) => (opts.month ? kw.month === opts.month : true))
    // Sort by affinity (subcategory-aligned first), then preserve
    // original declaration order via stable sort.
    .map((kw, i) => ({ kw, ord: i, aff: affinityScore(kw.term) }))
    .sort((a, b) => a.aff - b.aff || a.ord - b.ord)
    .map((x) => x.kw)
    // Cap at 6 so we don't crowd out taxonomy-anchored category terms.
    // Strategy keywords are *supporting* signals — the gig's own
    // subcategory keywords must still win the primary slot.
    .slice(0, 6)
}

// Tokens that, when present in a strategic keyword's term, signal
// affinity for the seller's chosen subcategory. Hand-curated per
// subcategory id from lib/categories.ts.
//
// The strategic keyword bank is broad (~100 academic-writing entries);
// affinity tokens route the right slice to the right gig. Multiple
// token matches stack: a keyword that contains MORE matching tokens
// outranks one that contains fewer (the affinity score sums hits).
//
// Tokens are matched as substring (case-insensitive) against the
// keyword term. Pick tokens that are SPECIFIC to the niche; broad
// tokens like "essay" would match everything and defeat the purpose.
function subcategoryAffinityTokens(subcategoryId: string): string[] {
  switch (subcategoryId) {
    // --- Academic Writing & Application Support subcategories ---
    case 'sop-writing':           return [
      'sop', 'statement of purpose', 'graduate school', 'grad school',
      'study plan', 'letter of intent', 'research statement',
      'phd personal statement', 'masters personal statement',
    ]
    case 'application-essays':    return [
      'college essay', 'common app', 'supplemental', 'admissions essay',
      'personal statement', 'application essay', 'why this college',
      'college admissions', 'application essay feedback',
    ]
    case 'scholarship-essays':    return [
      'scholarship', 'merit', 'funding', 'fulbright', 'rhodes',
      'gates scholarship', 'chevening', 'commonwealth',
    ]
    case 'research-writing':      return [
      'research paper', 'thesis', 'dissertation', 'manuscript',
      'journal submission', 'phd thesis', 'literature review',
    ]
    case 'proofreading-editing':  return [
      'editing', 'proofreading', 'language polishing', 'grammar',
      'esl', 'english proofreading',
    ]
    // --- Education & Admissions subcategories ---
    case 'university-admissions': return [
      'college essay', 'common app', 'admissions', 'personal statement',
      'ivy', 'harvard', 'stanford', 'oxbridge', 'cambridge', 'oxford',
      'ucas', 'russell group', 'private admissions counselor',
      'college admissions coach',
    ]
    case 'graduate-school':       return [
      'graduate', 'grad school', 'phd', 'mba', 'med school', 'medical school',
      'law school', 'thesis', 'amcas', 'aacomas', 'lsat',
      'wharton', 'hbs',
    ]
    case 'scholarships':          return [
      'scholarship', 'funding', 'merit', 'fulbright', 'rhodes',
      'chevening', 'commonwealth',
    ]
    case 'test-prep':             return [
      'lsat', 'mmi', 'interview prep', 'interview coaching',
    ]
    case 'academic-mentoring':    return [
      'coach', 'coaching', 'admissions strategy', 'application timeline',
      'school selection', 'recommendation letter',
    ]
    // --- Mentorship & Coaching subcategories ---
    case 'student-mentorship':    return [
      'admissions', 'coach', 'coaching', 'consultant',
      'admissions strategy', 'application timeline', 'school selection',
      'academic mentor', 'phd mentor', 'thesis mentor',
    ]
    case 'professional-coaching': return [
      'mba', 'med school', 'law school', 'professional', 'admissions coach',
      'career mentor', 'startup mentor', 'founder mentor',
      'engineering manager mentor', 'senior dev mentor',
      'product manager mentor', 'ux design mentor',
      'coding mentor', 'software engineer mentor', 'data science mentor',
      'machine learning mentor', 'growth marketing mentor',
      'executive coach', 'leadership coach',
    ]
    case 'life-coaching':         return [
      'life coach', 'accountability coach', 'personal development coach',
      'mindset coach', 'goal-setting coach',
    ]
    // --- Career Development subcategories ---
    case 'resume-cv':             return [
      'resume', 'cv', 'ats', 'rewrite', 'editing',
      'professional resume', 'executive resume', 'federal resume',
      'tech resume', 'engineering resume', 'finance resume',
      'healthcare resume', 'sales resume', 'academic cv',
      'military to civilian', 'entry level resume', 'career change resume',
    ]
    case 'linkedin':              return [
      'linkedin', 'headline', 'summary', 'profile makeover',
      'all-star', 'recruiter optimization', 'personal branding',
      'executive linkedin',
    ]
    case 'job-search':            return [
      'cover letter', 'interview coaching', 'mock interview',
      'behavioral interview', 'technical interview',
      'case interview', 'consulting interview', 'finance interview',
      'product manager interview', 'system design interview',
      'coding interview', 'job search strategy', 'job application coach',
      'networking coach', 'salary negotiation',
    ]
    case 'career-coaching':       return [
      'career coach', 'career change coach', 'executive career coach',
      'career transition', 'career pivot', 'salary negotiation',
      'leadership coach', 'executive coach',
    ]
    case 'internships':           return [
      'entry level', 'internship', 'cover letter', 'interview coaching',
      'mock interview', 'resume', 'networking coach',
    ]
    // --- Business Services subcategories ---
    case 'business-consulting':   return [
      'startup formation consultant', 'small business consultant',
      'e-commerce business setup', 'amazon fba',
      'business plan writing', 'business formation',
    ]
    case 'business-formation':    return [
      'llc formation', 'form an llc', 'corporation', 's-corp', 'c-corp',
      'nonprofit incorporation', 'delaware llc', 'wyoming llc',
      'nevada llc', 'registered agent', 'operating agreement',
      'corporate bylaws', 'shareholder agreement',
      'business name search', 'dba', 'ein', 'business license',
      'foreign llc qualification',
    ]
    case 'marketing':             return [
      'growth marketing', 'personal branding', 'linkedin', 'seo optimization',
    ]
    case 'finance-accounting':    return [
      'bookkeeping', 'small business tax', 'llc tax', 's-corp tax',
      'quarterly tax', 'estimated tax', 'finance interview',
    ]
    case 'grant-writing':         return [
      'grant writing', 'fulbright', 'rhodes', 'chevening',
      'commonwealth', 'funding statement', 'merit',
    ]
    case 'tax-advisory':          return [
      'small business tax', 'llc tax', 's-corp tax',
      'quarterly tax', 'estimated tax filing',
    ]
    // --- Credentials & Assessment subcategories ---
    case 'credential-assessment': return [
      'foreign credential evaluation', 'wes', 'ece', 'iqas', 'icas',
      'ices', 'spantran', 'degree equivalency', 'transcript evaluation',
      'course-by-course', 'document-by-document', 'diploma evaluation',
      'academic credential assessment',
    ]
    case 'license-certification': return [
      'professional license recognition', 'nurse licensing',
      'engineer licensing', 'pe licensing', 'teacher licensing',
      'ecfmg', 'usmle', 'nclex',
    ]
    case 'education-verification': return [
      'education verification', 'degree verification',
      'transcript translation', 'foreign degree recognition',
      'foreign diploma recognition',
    ]
    // --- Settlement & Integration subcategories ---
    case 'housing':               return [
      'tenancy', 'rent', 'housing', 'deposit', 'section 21',
      'renters rights', 'tenancy notice',
    ]
    default:                       return []
  }
}

// Banned phrases — §6 of the strategy doc. If any of these appear in a
// draft, the AI is told to rewrite. We surface them in EVERY prompt so
// the model self-censors at generation time rather than relying on a
// post-hoc audit step.
export const BANNED_PHRASES = [
  'navigating immigration can be overwhelming',
  'comprehensive guide to everything you need to know',
  'get approved',
  'guaranteed',
  'fast PR',
  'high success rate',
  'land of opportunity',
  'your dreams abroad',
  'documents, deadlines, official sources, common pitfalls, FAQs', // boilerplate
  'navigate',                       // overused AI tell
  'in today\'s ever-changing',      // overused AI tell
  'in the realm of',                // overused AI tell
] as const

// The 5-question test from §6. Every legal canonical (and every long-
// form gig description) must answer all five before it can ship.
export const FIVE_QUESTION_TEST = [
  'WHO — who is this for / not for (reader persona)',
  'WHAT DECISION — what decision the reader must make next',
  'CONTROLLING SOURCE — USCIS / IRCC / GOV.UK / Home Office with live link or name',
  'WHAT DOCUMENT — specific form, evidence, or letter required',
  'DEADLINE / RISK — what stops the case if missed',
] as const

// Content length gates from §5.3. The gig draft path maps to these
// approximately: long-form gig description ≈ legal canonical;
// pitch/tagline ≈ blog summary opener; SEO description ≈ meta-only.
export const LENGTH_GATES = {
  longFormDescription: { min: 500, max: 700, unit: 'words' as const, note: 'Long-form gig descriptions target 500–700 words. Below the floor reads as thin; above the ceiling buries the conversion CTA.' },
  pitchTagline:        { min: 80,  max: 160, unit: 'chars' as const, note: 'Pitch / tagline targets 80–160 characters — long enough to name buyer + outcome, short enough to read in one breath.' },
  seoTitle:            { min: 50,  max: 60,  unit: 'chars' as const, note: 'SEO title: 50–60 chars. Truncation kicks in at ~60 on desktop SERPs.' },
  seoDescription:      { min: 140, max: 155, unit: 'chars' as const, note: 'SEO description: 140–155 chars. Anything above 155 truncates with an ellipsis.' },
} as const

// Freshness directive from §5.7. Surfaced in every prompt so the model
// embeds the current policy year inline rather than reaching for
// "recently" / "last year" hedges.
export function getFreshnessDirective(): string {
  const now = new Date()
  const year = now.getUTCFullYear()
  return [
    `FRESHNESS: Reference current policy dates explicitly ("as of ${now.toLocaleString('en-US', { month: 'long' })} ${year}", "${year}-${(now.getUTCMonth() + 1).toString().padStart(2, '0')}"). Do NOT use vague phrases like "recently", "last year", "currently", or "modern" — they age badly and hurt rankings as Google interprets stale-language signals.`,
    `Where the gig touches a policy that changed in ${year} (Section 21, F-1 duration of status, Canada study-permit cap, PGWP field-of-study rules, UK skilled-worker salary threshold), name the change and its effective date — this is the freshness signal that wins long-tail policy queries.`,
  ].join(' ')
}

// Format the structural requirements block. For long-form description
// drafts we surface the 5-question test verbatim; for shorter fields
// we surface a compact version. Returns an empty string when the
// field doesn't need this scaffolding.
export function getStructureRequirements(field: string): string {
  if (field === 'description') {
    return [
      'STRUCTURE: Long-form description must answer the 5-question test:',
      ...FIVE_QUESTION_TEST.map((q, i) => `  ${i + 1}. ${q}`),
      'Bury none of these — a buyer scanning the page should be able to lift the answer to each within the first scroll.',
    ].join('\n')
  }
  if (field === 'faq') {
    return 'STRUCTURE: Each FAQ entry must be a self-contained Q+A snippet that could be lifted into a Google PAA box. Question phrased as a real search query ("how long...", "can I...", "do I need..."). Answer ≤ 60 words, ends with a concrete next step (controlling source, document name, or "book a review" CTA).'
  }
  if (field === 'seo_description' || field === 'seo_title') {
    return 'STRUCTURE: Must include the primary keyword in the first 60 chars AND the country/jurisdiction phrasing exactly as the spine lists it. Truncation discipline: do NOT trail off mid-thought — every character counts.'
  }
  return ''
}

// Top-level convenience: returns the full strategy directives block to
// inject after the category brief in buildBaseContext. Compact enough
// (~600 tokens) to inline on every call without bloating prompts.
export interface StrategyDirectivesOpts {
  field: string
  category: string
  subcategory?: string
  jurisdiction: string
  role: 'attorney' | 'consultant'
}

export function getStrategyDirectivesBlock(opts: StrategyDirectivesOpts): string {
  const strategic = getStrategicKeywordsForGig(opts)
  const structure = getStructureRequirements(opts.field)
  const lines: string[] = ['### Sitewide SEO directives (Q3 2026 plan)']

  if (strategic.length) {
    lines.push('- Strategic keywords (quarterly priority, cluster-aligned — weave in when natural; do not force):')
    for (const kw of strategic) {
      lines.push(`  · [${kw.cluster} · M${kw.month} · ${kw.intent}] ${kw.term}`)
    }
  }

  lines.push('- Banned phrases (instant rewrite if any of these slip in):')
  // Surface the banned phrases as a single dense line — the LLM
  // reliably self-censors against a comma-separated list of explicit
  // strings; a bulleted list eats tokens for the same result.
  lines.push(`  "${[...BANNED_PHRASES].join('", "')}"`)

  if (structure) lines.push(structure)

  lines.push(getFreshnessDirective())

  lines.push(
    `LINKING: When you name a controlling authority, use the canonical name in full ("USCIS", "IRCC", "GOV.UK", "Home Office") — never "the government" or "the immigration office". The proper name IS the anchor signal Google reads.`,
  )

  return lines.join('\n')
}
