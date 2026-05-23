/* ─────────────────────────────────────────────────────────────────────────
   Inquiry data — ported from the portal codebase
   (lib/intake-questions.ts in kylemwalkerpr-ship-it/portal).

   Three countries × ~6 case types each, each case type carries a small
   bank of picker / freeform questions and a tier recommender. The
   InquiryComposer modal uses this as its source of truth — picker-first
   so the form stays at ≤5 steps even for the richest case type.

   Shape preserved so the real backend (Supabase intake_responses table,
   /api/intake/* endpoints) can swap straight back in.
   ───────────────────────────────────────────────────────────────────── */

window.INQUIRY_URGENCY_OPTIONS = [
  { id: 'now',     label: 'Within 30 days',  help: 'Priority queue (+20%)', tag: 'urgent' },
  { id: 'soon',    label: '1–3 months',      help: 'Standard queue',        tag: 'standard' },
  { id: 'later',   label: '3–6 months',      help: 'Plenty of runway',      tag: 'standard' },
  { id: 'explore', label: 'Just exploring',  help: 'No timeline yet',       tag: 'standard' },
];

window.INQUIRY_URGENCY_QUESTION = {
  id: 'urgency', type: 'select', required: true,
  label: 'When does this need to happen?',
  help: 'We use this to size the SLA tier you fall into.',
  options: window.INQUIRY_URGENCY_OPTIONS,
};

window.INQUIRY_PRIOR_DENIAL_QUESTION = {
  id: 'prior_denial', type: 'select', required: true,
  label: 'Have you ever been denied a visa, refused entry, or had immigration trouble?',
  help: 'Honest answer here is critical — this changes routing.',
  options: [
    { id: 'no',         label: 'No, clean record' },
    { id: 'yes_visa',   label: 'Visa or entry refusal' },
    { id: 'yes_arrest', label: 'Arrest, charge, or conviction' },
    { id: 'yes_other',  label: 'Something else (overstay, RFE, NOID…)' },
  ],
};

window.INQUIRY_FREEFORM_DETAIL = {
  id: 'detail', type: 'long_text',
  label: 'Anything else the attorney should know upfront?',
  help: 'Optional — the more context, the better the first call goes.',
  placeholder: 'e.g. employer is small startup, prior H-1B was withdrawn, USCIS notice received…',
};

/* ─── Country / case-type tree (verbatim from the portal) ──────────── */
window.INQUIRY_COUNTRIES = [
  {
    id: 'US', flag: '🇺🇸', label: 'United States',
    blurb: 'F-1 / OPT / H-1B / green card / loan defense',
    caseTypes: [
      {
        id: 'f1', label: "I'm an international student (F-1 / J-1)", icon: '🎓',
        questions: [
          { id: 'school',       type: 'short_text', required: true, label: 'Which school are you attending (or admitted to)?', placeholder: 'e.g. NYU, USC, Purdue' },
          { id: 'program_level', type: 'select', required: true, label: 'Program level',
            options: [
              { id: 'bachelors', label: "Bachelor's" },
              { id: 'masters',   label: "Master's" },
              { id: 'phd',       label: 'PhD' },
              { id: 'other',     label: 'Language / certificate / other' },
            ]},
          { id: 'status_now', type: 'select', required: true, label: 'Where are you in the process right now?',
            options: [
              { id: 'pre_visa',    label: 'Admitted, need to apply for the F-1' },
              { id: 'visa_denied', label: 'F-1 visa was denied' },
              { id: 'in_us',       label: 'Already in the US on F-1' },
              { id: 'transfer',    label: 'Transferring schools (SEVIS transfer)' },
              { id: 'reinstate',   label: 'Out of status — need reinstatement' },
            ]},
        ],
      },
      {
        id: 'opt', label: "I'm starting OPT or CPT", icon: '💼',
        questions: [
          { id: 'opt_type', type: 'select', required: true, label: 'Which one?',
            options: [
              { id: 'pre_opt',    label: 'Pre-completion OPT' },
              { id: 'post_opt',   label: 'Post-completion OPT (12 months)' },
              { id: 'stem_opt',   label: 'STEM OPT extension (24 months)' },
              { id: 'cpt',        label: 'CPT' },
              { id: 'unsure_opt', label: "I'm not sure which I qualify for" },
            ]},
          { id: 'employer', type: 'short_text', required: true, label: 'Employer name (or "still looking")', placeholder: 'e.g. Acme Corp / still searching' },
          { id: 'employer_evverify', type: 'select', label: 'Is your employer E-Verify enrolled?', help: 'Required for STEM OPT.',
            options: [{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }, { id: 'unsure', label: "Don't know" }] },
        ],
      },
      {
        id: 'h1b', label: "I'm on (or moving to) an H-1B", icon: '🏢',
        questions: [
          { id: 'h1b_stage', type: 'select', required: true, label: 'Where are you in the H-1B journey?',
            options: [
              { id: 'lottery',   label: 'About to register / waiting on the lottery' },
              { id: 'selected',  label: 'Selected, need to file the petition' },
              { id: 'transfer',  label: 'On H-1B, want to transfer employer' },
              { id: 'extension', label: 'On H-1B, need extension or amendment' },
              { id: 'cap_gap',   label: 'F-1 → H-1B cap-gap question' },
            ]},
          { id: 'employer_h1b', type: 'short_text', required: true, label: 'Sponsoring employer', placeholder: 'e.g. tech firm, consultancy' },
          { id: 'role', type: 'short_text', label: 'Role / job title', placeholder: 'e.g. Software Engineer II' },
        ],
      },
      {
        id: 'gc', label: 'Green card — family or marriage-based', icon: '💍',
        questions: [
          { id: 'gc_basis', type: 'select', required: true, label: 'Basis for the green card',
            options: [
              { id: 'spouse_uscitizen', label: 'Spouse is a US citizen' },
              { id: 'spouse_lpr',       label: 'Spouse is an LPR' },
              { id: 'parent',           label: 'Parent of a US citizen 21+' },
              { id: 'child',            label: 'Child of a US citizen / LPR' },
              { id: 'sibling',          label: 'Sibling of a US citizen' },
              { id: 'fiance',           label: 'Fiancé(e) K-1 — not yet married' },
            ]},
          { id: 'gc_location', type: 'select', required: true, label: 'Where is the applicant currently?',
            options: [
              { id: 'inside_us', label: 'Inside the US (adjustment of status)' },
              { id: 'abroad',    label: 'Outside the US (consular processing)' },
            ]},
          { id: 'gc_conditional', type: 'select', label: 'Is this a removal of conditions (I-751)?',
            options: [
              { id: 'no',         label: 'No — first-time green card' },
              { id: 'yes_joint',  label: 'Yes — joint petition' },
              { id: 'yes_waiver', label: 'Yes — divorced / separated, need waiver' },
            ]},
        ],
      },
      {
        id: 'loan', label: 'Student loan / borrower defense', icon: '💰',
        questions: [
          { id: 'loan_type', type: 'select', required: true, label: 'Which kind of loan(s)?',
            options: [
              { id: 'federal', label: 'Federal only' },
              { id: 'private', label: 'Private only' },
              { id: 'both',    label: 'Both federal and private' },
            ]},
          { id: 'loan_issue', type: 'select', required: true, label: "What's the situation?",
            options: [
              { id: 'borrower_defense', label: 'Borrower defense (school misled me)' },
              { id: 'forgiveness',      label: 'PSLF / IDR forgiveness' },
              { id: 'default',          label: "I'm in default" },
              { id: 'consolidation',    label: 'Consolidation / repayment plan' },
              { id: 'other',            label: 'Something else' },
            ]},
        ],
      },
      {
        id: 'other_us', label: 'Something else', icon: '✏️',
        questions: [
          { id: 'topic', type: 'long_text', required: true, label: 'In a sentence or two, what\u2019s going on?', placeholder: 'e.g. employer requested L-1B transfer, asylum interview scheduled…' },
        ],
      },
    ],
  },
  {
    id: 'UK', flag: '🇬🇧', label: 'United Kingdom',
    blurb: "Student Route / ILR / tenancy / spouse",
    caseTypes: [
      {
        id: 'tenancy', label: "Rental / tenancy issue (RRA 2025)", hot: true, icon: '🏠',
        questions: [
          { id: 'tenancy_issue', type: 'select', required: true, label: 'Which best describes your situation?',
            options: [
              { id: 'deposit',         label: 'Landlord refusing to return my deposit' },
              { id: 'section8',        label: 'Section 8 / eviction notice received' },
              { id: 'rent_increase',   label: 'Unfair rent increase' },
              { id: 'disrepair',       label: 'Disrepair / mould / habitability' },
              { id: 'illegal_eviction',label: 'Illegal eviction / lockout' },
              { id: 'hmo',             label: 'HMO licensing / rogue landlord' },
              { id: 'other_tenancy',   label: 'Something else' },
            ]},
          { id: 'city', type: 'short_text', required: true, label: 'Which city?', placeholder: 'e.g. London, Manchester' },
          { id: 'notice_received', type: 'select', label: 'Have you received any formal notice from the landlord?',
            options: [
              { id: 'no',    label: 'No' },
              { id: 's8',    label: 'Yes — Section 8' },
              { id: 's21',   label: 'Yes — Section 21 (abolished by RRA 2025)' },
              { id: 'court', label: 'Yes — a court claim form' },
              { id: 'other', label: 'Yes — something else' },
            ]},
        ],
      },
      {
        id: 'student_visa', label: 'Student Route visa', icon: '🎓',
        questions: [
          { id: 'visa_stage', type: 'select', required: true, label: 'Where are you in the Student Route process?',
            options: [
              { id: 'pre_apply',       label: 'Have CAS, ready to apply' },
              { id: 'awaiting_cas',    label: 'Awaiting CAS from university' },
              { id: 'denied',          label: 'Visa was refused' },
              { id: 'extension',       label: 'Need to extend my Student visa' },
              { id: 'switch_graduate', label: 'Switching to Graduate Route' },
              { id: 'switch_skilled',  label: 'Switching to Skilled Worker' },
            ]},
          { id: 'university', type: 'short_text', required: true, label: 'Which university?', placeholder: 'e.g. UCL, Edinburgh' },
        ],
      },
      {
        id: 'skilled', label: 'Skilled Worker visa', icon: '💼',
        questions: [
          { id: 'sw_stage', type: 'select', required: true, label: 'Where are you in the process?',
            options: [
              { id: 'cos_pending',  label: 'Awaiting Certificate of Sponsorship' },
              { id: 'cos_received', label: 'Have CoS, ready to apply' },
              { id: 'inside_uk',    label: 'Already in UK, switching to SW' },
              { id: 'extension',    label: 'Extending current SW visa' },
            ]},
          { id: 'sponsor', type: 'short_text', required: true, label: 'Sponsoring employer', placeholder: 'e.g. Deloitte UK, NHS Trust' },
          { id: 'salary', type: 'short_text', label: 'Annual salary (£)', placeholder: 'e.g. £42,000' },
        ],
      },
      {
        id: 'ilr', label: 'Indefinite Leave to Remain (ILR)', icon: '🛂',
        questions: [
          { id: 'ilr_route', type: 'select', required: true, label: 'Which route to ILR?',
            options: [
              { id: 'skilled_5y',     label: '5 years on Skilled Worker' },
              { id: 'spouse_5y',      label: '5 years on spouse / partner' },
              { id: 'long_residence', label: '10-year long residence' },
              { id: 'global_talent',  label: 'Global Talent' },
              { id: 'other_ilr',      label: 'Something else' },
            ]},
          { id: 'lifeintheuk', type: 'select', label: 'Have you passed Life in the UK + B1 English?',
            options: [
              { id: 'both',    label: 'Yes — both' },
              { id: 'partial', label: 'One of them' },
              { id: 'neither', label: 'Neither yet' },
            ]},
        ],
      },
      {
        id: 'spouse_uk', label: 'Spouse / partner visa', icon: '💍',
        questions: [
          { id: 'partner_status', type: 'select', required: true, label: 'Your partner is a',
            options: [
              { id: 'british',     label: 'British citizen' },
              { id: 'settled',     label: 'Settled (ILR holder)' },
              { id: 'pre_settled', label: 'Pre-settled status (EU)' },
              { id: 'refugee',     label: 'Refugee / humanitarian protection' },
            ]},
          { id: 'married_civil', type: 'select', required: true, label: 'Married or unmarried partners?',
            options: [
              { id: 'married',   label: 'Married / civil partners' },
              { id: 'unmarried', label: 'Unmarried (2+ years cohabitation)' },
              { id: 'fiance',    label: 'Engaged — fiancé(e) visa' },
            ]},
        ],
      },
      {
        id: 'other_uk', label: 'Something else', icon: '✏️',
        questions: [
          { id: 'topic', type: 'long_text', required: true, label: 'In a sentence or two, what\u2019s going on?' },
        ],
      },
    ],
  },
  {
    id: 'CA', flag: '🇨🇦', label: 'Canada',
    blurb: 'Express Entry / PNP / spousal / LMIA',
    caseTypes: [
      {
        id: 'ee', label: 'Express Entry application', icon: '✈️',
        questions: [
          { id: 'ee_program', type: 'select', required: true, label: 'Which Express Entry program?',
            options: [
              { id: 'cec',    label: 'Canadian Experience Class (CEC)' },
              { id: 'fsw',    label: 'Federal Skilled Worker (FSW)' },
              { id: 'fst',    label: 'Federal Skilled Trades (FST)' },
              { id: 'unsure', label: "I'm not sure which I qualify for" },
            ]},
          { id: 'crs_score', type: 'short_text', label: 'Current CRS score (if calculated)', placeholder: 'e.g. 472' },
          { id: 'ielts_done', type: 'select', label: 'IELTS / CELPIP done?',
            options: [
              { id: 'yes_strong', label: 'Yes — CLB 9+' },
              { id: 'yes_ok',     label: 'Yes — CLB 7–8' },
              { id: 'yes_low',    label: 'Yes — below CLB 7' },
              { id: 'no',         label: 'Not yet' },
            ]},
        ],
      },
      {
        id: 'pnp', label: 'Provincial Nominee Program (PNP)', icon: '🏔️',
        questions: [
          { id: 'province', type: 'select', required: true, label: 'Which province?',
            options: [
              { id: 'on', label: 'Ontario (OINP)' },
              { id: 'bc', label: 'British Columbia (BC PNP)' },
              { id: 'ab', label: 'Alberta (AAIP)' },
              { id: 'sk', label: 'Saskatchewan (SINP)' },
              { id: 'mb', label: 'Manitoba (MPNP)' },
              { id: 'ns', label: 'Nova Scotia (NSNP)' },
              { id: 'other_prov', label: 'Other province' },
            ]},
          { id: 'job_offer', type: 'select', label: 'Do you have a Canadian job offer?',
            options: [
              { id: 'yes_lmia',   label: 'Yes — with LMIA' },
              { id: 'yes_nolmia', label: 'Yes — LMIA-exempt' },
              { id: 'pending',    label: 'In conversations with an employer' },
              { id: 'no',         label: 'No job offer yet' },
            ]},
        ],
      },
      {
        id: 'study', label: 'Study permit', icon: '🎓',
        questions: [
          { id: 'institution', type: 'short_text', required: true, label: 'Designated Learning Institution (DLI)', placeholder: 'e.g. UofT, McGill, Seneca' },
          { id: 'pal', type: 'select', label: 'Do you have a Provincial Attestation Letter (PAL/TAL)?',
            options: [
              { id: 'yes',    label: 'Yes' },
              { id: 'no',     label: 'No / not yet' },
              { id: 'exempt', label: 'My program is exempt' },
              { id: 'unsure', label: "Don't know" },
            ]},
          { id: 'gic', type: 'select', label: 'GIC + tuition deposit ready?',
            options: [
              { id: 'yes',     label: 'Yes — both' },
              { id: 'partial', label: 'One of them' },
              { id: 'no',      label: 'Not yet' },
            ]},
        ],
      },
      {
        id: 'spouse_ca', label: 'Spousal sponsorship', icon: '💍',
        questions: [
          { id: 'sponsor_status', type: 'select', required: true, label: 'Your sponsor is a',
            options: [{ id: 'citizen', label: 'Canadian citizen' }, { id: 'pr', label: 'Permanent resident' }] },
          { id: 'in_or_out', type: 'select', required: true, label: 'Inland or outland sponsorship?',
            options: [
              { id: 'inland',  label: 'Inland (applicant inside Canada)' },
              { id: 'outland', label: 'Outland (applicant outside Canada)' },
              { id: 'unsure',  label: 'Not sure which is right for us' },
            ]},
          { id: 'relationship_type', type: 'select', label: 'Relationship type',
            options: [
              { id: 'married',    label: 'Married' },
              { id: 'common_law', label: 'Common-law (12+ mo cohabitation)' },
              { id: 'conjugal',   label: 'Conjugal partner' },
            ]},
        ],
      },
      {
        id: 'lmia', label: 'LMIA / work permit', icon: '🛠️',
        questions: [
          { id: 'lmia_role', type: 'select', required: true, label: 'Are you the employer or the worker?',
            options: [
              { id: 'employer', label: "I'm the employer" },
              { id: 'worker',   label: "I'm the worker" },
            ]},
          { id: 'lmia_stream', type: 'select', label: 'Which stream?',
            options: [
              { id: 'high_wage',     label: 'High-wage' },
              { id: 'low_wage',      label: 'Low-wage' },
              { id: 'gts',           label: 'Global Talent Stream' },
              { id: 'agri',          label: 'Agricultural / SAWP' },
              { id: 'caregiver',     label: 'Home Child Care / Support Worker' },
              { id: 'unsure_stream', label: "Don't know" },
            ]},
        ],
      },
      {
        id: 'other_ca', label: 'Something else', icon: '✏️',
        questions: [
          { id: 'topic', type: 'long_text', required: true, label: 'In a sentence or two, what\u2019s going on?' },
        ],
      },
    ],
  },
];

window.INQUIRY_LOOKUP = {
  country: (id) => window.INQUIRY_COUNTRIES.find(c => c.id === id),
  caseType: (countryId, caseTypeId) => window.INQUIRY_LOOKUP.country(countryId)?.caseTypes.find(ct => ct.id === caseTypeId),
};

/* ─── Tier recommender (1:1 with recommendTier in the codebase) ────── */
window.INQUIRY_RECOMMEND_TIER = function recommendTier(answers) {
  const urgency = answers.urgency;
  const priorDenial = answers.prior_denial;
  const isUrgent = urgency === 'now';
  const hasComplexity =
    priorDenial === 'yes_visa' ||
    priorDenial === 'yes_arrest' ||
    priorDenial === 'yes_other' ||
    answers.gc_conditional === 'yes_waiver' ||
    answers.tenancy_issue === 'illegal_eviction' ||
    answers.tenancy_issue === 'court' ||
    answers.notice_received === 's8' ||
    answers.notice_received === 'court' ||
    answers.lmia_stream === 'gts';

  if (isUrgent && hasComplexity) {
    return { tier: 'Professional', price: '$999 – $1,499',
      description: 'Document prep, three attorney consultations, and priority review. For tight deadlines and complicated history.' };
  }
  if (isUrgent || hasComplexity) {
    return { tier: 'Enhanced', price: '$599 – $899',
      description: 'Document prep plus a live attorney video consult and async review. Best for time-sensitive filings.' };
  }
  return { tier: 'Essential', price: '$299 – $499',
    description: 'Guided document prep with async attorney review (5 business days). Right for standard filings.' };
};
