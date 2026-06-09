export type Country = 'US' | 'UK' | 'CA' | 'AU'

export type QuestionOption = { id: string; label: string; help?: string }

export type Question =
  | {
      id: string
      type: 'select'
      label: string
      help?: string
      options: QuestionOption[]
      required?: boolean
    }
  | {
      id: string
      type: 'multiselect'
      label: string
      help?: string
      options: QuestionOption[]
      required?: boolean
    }
  | {
      id: string
      type: 'short_text' | 'long_text' | 'date' | 'email' | 'phone' | 'number'
      label: string
      help?: string
      placeholder?: string
      required?: boolean
    }

export type CaseType = {
  id: string
  label: string
  hot?: boolean
  questions: Question[]
}

export type CountryConfig = {
  id: Country
  label: string
  flag: string
  blurb: string
  caseTypes: CaseType[]
}

const URGENCY_OPTIONS: QuestionOption[] = [
  { id: 'now',     label: 'Within 30 days',  help: 'Priority queue (+20%)' },
  { id: 'soon',    label: '1–3 months',  help: 'Standard queue' },
  { id: 'later',   label: '3–6 months',  help: 'Plenty of runway' },
  { id: 'explore', label: 'Just exploring',   help: 'No timeline yet' },
]

export const URGENCY_QUESTION: Question = {
  id: 'urgency',
  type: 'select',
  label: 'When does this need to happen?',
  help: 'We use this to size the SLA tier you fall into.',
  options: URGENCY_OPTIONS,
  required: true,
}

export const PRIOR_DENIAL_QUESTION: Question = {
  id: 'prior_denial',
  type: 'select',
  label: 'Have you ever been denied a visa, refused entry, or had immigration trouble?',
  help: 'Honest answer here is critical — this changes which attorney we route you to.',
  options: [
    { id: 'no',          label: 'No, clean record' },
    { id: 'yes_visa',    label: 'Yes — visa or entry refusal' },
    { id: 'yes_arrest',  label: 'Yes — arrest, charge, or conviction' },
    { id: 'yes_other',   label: 'Yes — something else (overstay, RFE, NOID, etc.)' },
  ],
  required: true,
}

const FREEFORM_DETAIL: Question = {
  id: 'detail',
  type: 'long_text',
  label: 'Anything else the attorney should know upfront?',
  help: 'Optional. The more context, the better the first call goes.',
  placeholder: 'e.g. employer is small startup, prior H-1B was withdrawn, USCIS notice received, etc.',
}

export const COUNTRIES: CountryConfig[] = [
  {
    id: 'US',
    flag: 'US',
    label: 'United States',
    blurb: 'F-1 / OPT / H-1B / green card / loan defense',
    caseTypes: [
      {
        id: 'f1',
        label: "I'm an international student (F-1 / J-1)",
        questions: [
          {
            id: 'school',
            type: 'short_text',
            label: 'Which school are you attending (or admitted to)?',
            placeholder: 'e.g. NYU, USC, Purdue',
            required: true,
          },
          {
            id: 'program_level',
            type: 'select',
            label: 'Program level',
            options: [
              { id: 'bachelors', label: "Bachelor's" },
              { id: 'masters',   label: "Master's" },
              { id: 'phd',       label: 'PhD' },
              { id: 'other',     label: 'Language / certificate / other' },
            ],
            required: true,
          },
          {
            id: 'status_now',
            type: 'select',
            label: 'Where are you in the process right now?',
            options: [
              { id: 'pre_visa',     label: 'Admitted, need to apply for the F-1 visa' },
              { id: 'visa_denied',  label: 'F-1 visa was denied' },
              { id: 'in_us',        label: 'Already in the US on F-1' },
              { id: 'transfer',     label: 'Transferring schools (SEVIS transfer)' },
              { id: 'reinstate',    label: 'Out of status — need reinstatement' },
            ],
            required: true,
          },
          {
            id: 'program_end',
            type: 'date',
            label: 'When does your program end (or when did it end)?',
            help: 'I-20 end date if you have one handy.',
          },
          PRIOR_DENIAL_QUESTION,
          URGENCY_QUESTION,
          FREEFORM_DETAIL,
        ],
      },
      {
        id: 'opt',
        label: "I'm starting OPT or CPT",
        questions: [
          {
            id: 'opt_type',
            type: 'select',
            label: 'Which one?',
            options: [
              { id: 'pre_opt',     label: 'Pre-completion OPT' },
              { id: 'post_opt',    label: 'Post-completion OPT (12 months)' },
              { id: 'stem_opt',    label: 'STEM OPT extension (24 months)' },
              { id: 'cpt',         label: 'CPT (curricular practical training)' },
              { id: 'unsure_opt',  label: "I'm not sure which I qualify for" },
            ],
            required: true,
          },
          {
            id: 'employer',
            type: 'short_text',
            label: 'Employer name (or "still looking")',
            placeholder: 'e.g. Acme Corp / still searching',
            required: true,
          },
          {
            id: 'employer_evverify',
            type: 'select',
            label: 'Is your employer E-Verify enrolled?',
            help: 'Required for STEM OPT. Skip if you’re not sure.',
            options: [
              { id: 'yes',    label: 'Yes' },
              { id: 'no',     label: 'No' },
              { id: 'unsure', label: "Don't know" },
            ],
          },
          {
            id: 'start_date',
            type: 'date',
            label: 'Intended start date',
          },
          PRIOR_DENIAL_QUESTION,
          URGENCY_QUESTION,
          FREEFORM_DETAIL,
        ],
      },
      {
        id: 'h1b',
        label: "I'm on (or moving to) an H-1B",
        questions: [
          {
            id: 'h1b_stage',
            type: 'select',
            label: 'Where are you in the H-1B journey?',
            options: [
              { id: 'lottery',    label: 'About to register / waiting on the lottery' },
              { id: 'selected',   label: 'Selected in the lottery, need to file the petition' },
              { id: 'transfer',   label: 'Currently on H-1B, want to transfer employer' },
              { id: 'extension',  label: 'Currently on H-1B, need an extension or amendment' },
              { id: 'cap_gap',    label: 'F-1 to H-1B cap-gap question' },
            ],
            required: true,
          },
          {
            id: 'employer_h1b',
            type: 'short_text',
            label: 'Sponsoring employer (or prospective)',
            placeholder: 'e.g. Tech company, small consulting firm, etc.',
            required: true,
          },
          {
            id: 'role',
            type: 'short_text',
            label: 'Role / job title',
            placeholder: 'e.g. Software Engineer II',
          },
          PRIOR_DENIAL_QUESTION,
          URGENCY_QUESTION,
          FREEFORM_DETAIL,
        ],
      },
      {
        id: 'gc',
        label: 'Green card — family or marriage-based',
        questions: [
          {
            id: 'gc_basis',
            type: 'select',
            label: 'Basis for the green card',
            options: [
              { id: 'spouse_uscitizen', label: 'Spouse is a US citizen' },
              { id: 'spouse_lpr',       label: 'Spouse is a green card holder (LPR)' },
              { id: 'parent',           label: 'Parent of a US citizen 21+' },
              { id: 'child',            label: 'Child of a US citizen / LPR' },
              { id: 'sibling',          label: 'Sibling of a US citizen' },
              { id: 'fiance',           label: 'Fiancé(e) (K-1) — not yet married' },
            ],
            required: true,
          },
          {
            id: 'gc_location',
            type: 'select',
            label: 'Where is the applicant currently?',
            options: [
              { id: 'inside_us',  label: 'Inside the US (adjustment of status)' },
              { id: 'abroad',     label: 'Outside the US (consular processing)' },
            ],
            required: true,
          },
          {
            id: 'married_when',
            type: 'date',
            label: 'Date of marriage (if applicable)',
          },
          {
            id: 'gc_conditional',
            type: 'select',
            label: 'Is this a removal of conditions (I-751)?',
            options: [
              { id: 'no',          label: 'No — first-time green card' },
              { id: 'yes_joint',   label: 'Yes — still married, joint petition' },
              { id: 'yes_waiver',  label: 'Yes — divorced / separated, need waiver' },
            ],
          },
          PRIOR_DENIAL_QUESTION,
          URGENCY_QUESTION,
          FREEFORM_DETAIL,
        ],
      },
      {
        id: 'loan',
        label: 'Student loan / borrower defense',
        questions: [
          {
            id: 'loan_type',
            type: 'select',
            label: 'Which kind of loan(s)?',
            options: [
              { id: 'federal',  label: 'Federal student loans only' },
              { id: 'private',  label: 'Private student loans only' },
              { id: 'both',     label: 'Both federal and private' },
            ],
            required: true,
          },
          {
            id: 'loan_issue',
            type: 'select',
            label: 'What’s the situation?',
            options: [
              { id: 'borrower_defense', label: 'Borrower defense (school misled me)' },
              { id: 'forgiveness',      label: 'PSLF / IDR forgiveness question' },
              { id: 'default',          label: "I'm in default" },
              { id: 'consolidation',    label: 'Consolidation / repayment plan' },
              { id: 'other',            label: 'Something else' },
            ],
            required: true,
          },
          {
            id: 'loan_balance',
            type: 'short_text',
            label: 'Approximate balance',
            placeholder: 'e.g. $45,000',
          },
          {
            id: 'school_name',
            type: 'short_text',
            label: 'School the loans are tied to',
            placeholder: 'e.g. ITT Tech, University of Phoenix, etc.',
          },
          URGENCY_QUESTION,
          FREEFORM_DETAIL,
        ],
      },
      {
        id: 'other_us',
        label: 'Something else',
        questions: [
          {
            id: 'topic',
            type: 'long_text',
            label: 'In a sentence or two, what’s going on?',
            placeholder: 'e.g. employer requested L-1B transfer, asylum interview scheduled, etc.',
            required: true,
          },
          PRIOR_DENIAL_QUESTION,
          URGENCY_QUESTION,
          FREEFORM_DETAIL,
        ],
      },
    ],
  },
  {
    id: 'UK',
    flag: 'UK',
    label: 'United Kingdom',
    blurb: 'Student Route / ILR / tenancy / spouse',
    caseTypes: [
      {
        id: 'tenancy',
        label: "Rental / tenancy issue (Renters' Rights Act 2025)",
        hot: true,
        questions: [
          {
            id: 'tenancy_issue',
            type: 'select',
            label: 'Which best describes your situation?',
            options: [
              { id: 'deposit',         label: 'Landlord refusing to return my deposit' },
              { id: 'section8',        label: 'Section 8 / eviction notice received' },
              { id: 'rent_increase',   label: 'Unfair rent increase' },
              { id: 'disrepair',       label: 'Disrepair / mould / habitability' },
              { id: 'illegal_eviction',label: 'Illegal eviction / lockout' },
              { id: 'hmo',             label: 'HMO licensing / rogue landlord' },
              { id: 'other_tenancy',   label: 'Something else' },
            ],
            required: true,
          },
          {
            id: 'city',
            type: 'short_text',
            label: 'Which city?',
            placeholder: 'e.g. London, Manchester, Bristol',
            required: true,
          },
          {
            id: 'tenancy_type',
            type: 'select',
            label: 'What type of tenancy do you have?',
            options: [
              { id: 'ast',     label: 'Assured Shorthold Tenancy (AST)' },
              { id: 'periodic',label: 'Rolling / periodic tenancy' },
              { id: 'lodger',  label: 'Lodger (live with landlord)' },
              { id: 'unsure',  label: "I'm not sure" },
            ],
          },
          {
            id: 'monthly_rent',
            type: 'short_text',
            label: 'Monthly rent',
            placeholder: 'e.g. £1,400',
          },
          {
            id: 'notice_received',
            type: 'select',
            label: 'Have you received any formal notice from the landlord?',
            options: [
              { id: 'no',         label: 'No' },
              { id: 's8',         label: 'Yes — Section 8' },
              { id: 's21',        label: 'Yes — Section 21 (note: abolished by RRA 2025)' },
              { id: 'court',      label: 'Yes — a court claim form' },
              { id: 'other',      label: 'Yes — something else / not sure which' },
            ],
          },
          URGENCY_QUESTION,
          FREEFORM_DETAIL,
        ],
      },
      {
        id: 'student_visa',
        label: 'Student Route visa',
        questions: [
          {
            id: 'visa_stage',
            type: 'select',
            label: 'Where are you in the Student Route process?',
            options: [
              { id: 'pre_apply', label: 'Have CAS, ready to apply' },
              { id: 'awaiting_cas', label: 'Awaiting CAS from university' },
              { id: 'denied', label: 'Visa was refused' },
              { id: 'extension', label: 'Need to extend my Student visa' },
              { id: 'switch_graduate', label: 'Switching to Graduate Route' },
              { id: 'switch_skilled',  label: 'Switching to Skilled Worker' },
            ],
            required: true,
          },
          {
            id: 'university',
            type: 'short_text',
            label: 'Which university?',
            placeholder: 'e.g. UCL, Manchester, Edinburgh',
            required: true,
          },
          {
            id: 'course_start',
            type: 'date',
            label: 'Course start date',
          },
          PRIOR_DENIAL_QUESTION,
          URGENCY_QUESTION,
          FREEFORM_DETAIL,
        ],
      },
      {
        id: 'skilled',
        label: 'Skilled Worker visa',
        questions: [
          {
            id: 'sponsor',
            type: 'short_text',
            label: 'Sponsoring employer',
            placeholder: 'e.g. Deloitte UK, NHS Trust',
            required: true,
          },
          {
            id: 'salary',
            type: 'short_text',
            label: 'Annual salary (£)',
            placeholder: 'e.g. £42,000',
          },
          {
            id: 'soc_code',
            type: 'short_text',
            label: 'SOC code (if known)',
            placeholder: 'e.g. 2136',
          },
          {
            id: 'sw_stage',
            type: 'select',
            label: 'Where are you in the process?',
            options: [
              { id: 'cos_pending',  label: 'Awaiting Certificate of Sponsorship' },
              { id: 'cos_received', label: 'Have CoS, ready to apply' },
              { id: 'inside_uk',    label: 'Already in UK, switching to Skilled Worker' },
              { id: 'extension',    label: 'Extending current Skilled Worker visa' },
            ],
            required: true,
          },
          PRIOR_DENIAL_QUESTION,
          URGENCY_QUESTION,
          FREEFORM_DETAIL,
        ],
      },
      {
        id: 'ilr',
        label: 'Indefinite Leave to Remain (ILR)',
        questions: [
          {
            id: 'ilr_route',
            type: 'select',
            label: 'Which route to ILR?',
            options: [
              { id: 'skilled_5y',   label: '5 years on Skilled Worker' },
              { id: 'spouse_5y',    label: '5 years on spouse / partner visa' },
              { id: 'long_residence', label: '10-year long residence' },
              { id: 'global_talent',  label: 'Global Talent' },
              { id: 'other_ilr',    label: 'Something else' },
            ],
            required: true,
          },
          {
            id: 'first_arrival',
            type: 'date',
            label: 'When did you first arrive in the UK on this route?',
          },
          {
            id: 'absences',
            type: 'short_text',
            label: 'Total days outside UK in last 5 years (approx)',
            placeholder: 'e.g. 120',
          },
          {
            id: 'lifeintheuk',
            type: 'select',
            label: 'Have you passed Life in the UK + B1 English?',
            options: [
              { id: 'both',  label: 'Yes — both' },
              { id: 'partial', label: 'One of them' },
              { id: 'neither', label: 'Neither yet' },
            ],
          },
          PRIOR_DENIAL_QUESTION,
          URGENCY_QUESTION,
          FREEFORM_DETAIL,
        ],
      },
      {
        id: 'spouse_uk',
        label: 'Spouse / partner visa',
        questions: [
          {
            id: 'partner_status',
            type: 'select',
            label: 'Your partner is a',
            options: [
              { id: 'british',     label: 'British citizen' },
              { id: 'settled',     label: 'Settled (ILR holder)' },
              { id: 'pre_settled', label: 'Pre-settled status (EU)' },
              { id: 'refugee',     label: 'Refugee / humanitarian protection' },
            ],
            required: true,
          },
          {
            id: 'married_civil',
            type: 'select',
            label: 'Are you married / in a civil partnership, or unmarried partners?',
            options: [
              { id: 'married',   label: 'Married / civil partners' },
              { id: 'unmarried', label: 'Unmarried partners (2+ years cohabitation)' },
              { id: 'fiance',    label: 'Engaged — applying as fiancé(e)' },
            ],
            required: true,
          },
          {
            id: 'income_threshold',
            type: 'select',
            label: 'Does the British/settled partner meet the financial requirement?',
            help: 'Currently £29,000/year as of April 2024.',
            options: [
              { id: 'yes',        label: 'Yes' },
              { id: 'no',         label: 'No' },
              { id: 'cash_savings', label: 'Using cash savings instead' },
              { id: 'unsure',     label: "Don't know" },
            ],
          },
          {
            id: 'applicant_location',
            type: 'select',
            label: 'Where is the applicant now?',
            options: [
              { id: 'abroad',  label: 'Outside the UK (entry clearance)' },
              { id: 'inside',  label: 'Inside the UK (in-country switch / extension)' },
            ],
          },
          PRIOR_DENIAL_QUESTION,
          URGENCY_QUESTION,
          FREEFORM_DETAIL,
        ],
      },
      {
        id: 'other_uk',
        label: 'Something else',
        questions: [
          {
            id: 'topic',
            type: 'long_text',
            label: 'In a sentence or two, what’s going on?',
            required: true,
          },
          PRIOR_DENIAL_QUESTION,
          URGENCY_QUESTION,
          FREEFORM_DETAIL,
        ],
      },
    ],
  },
  {
    id: 'CA',
    flag: 'CA',
    label: 'Canada',
    blurb: 'Express Entry / PNP / spousal / LMIA',
    caseTypes: [
      {
        id: 'ee',
        label: 'Express Entry application',
        questions: [
          {
            id: 'ee_program',
            type: 'select',
            label: 'Which Express Entry program?',
            options: [
              { id: 'cec',  label: 'Canadian Experience Class (CEC)' },
              { id: 'fsw',  label: 'Federal Skilled Worker (FSW)' },
              { id: 'fst',  label: 'Federal Skilled Trades (FST)' },
              { id: 'unsure', label: "I'm not sure which I qualify for" },
            ],
            required: true,
          },
          {
            id: 'crs_score',
            type: 'short_text',
            label: 'Current CRS score (if calculated)',
            placeholder: 'e.g. 472',
          },
          {
            id: 'noc',
            type: 'short_text',
            label: 'NOC code for your work experience',
            placeholder: 'e.g. 21231',
          },
          {
            id: 'ielts_done',
            type: 'select',
            label: 'IELTS / CELPIP language test done?',
            options: [
              { id: 'yes_strong', label: 'Yes — CLB 9+' },
              { id: 'yes_ok',     label: 'Yes — CLB 7–8' },
              { id: 'yes_low',    label: 'Yes — below CLB 7' },
              { id: 'no',         label: 'Not yet' },
            ],
          },
          PRIOR_DENIAL_QUESTION,
          URGENCY_QUESTION,
          FREEFORM_DETAIL,
        ],
      },
      {
        id: 'pnp',
        label: 'Provincial Nominee Program (PNP)',
        questions: [
          {
            id: 'province',
            type: 'select',
            label: 'Which province?',
            options: [
              { id: 'on', label: 'Ontario (OINP)' },
              { id: 'bc', label: 'British Columbia (BC PNP)' },
              { id: 'ab', label: 'Alberta (AAIP)' },
              { id: 'sk', label: 'Saskatchewan (SINP)' },
              { id: 'mb', label: 'Manitoba (MPNP)' },
              { id: 'ns', label: 'Nova Scotia (NSNP)' },
              { id: 'nb', label: 'New Brunswick (NBPNP)' },
              { id: 'pe', label: 'PEI (PEI PNP)' },
              { id: 'nl', label: 'Newfoundland (NLPNP)' },
              { id: 'yt', label: 'Yukon (YNP)' },
              { id: 'nt', label: 'Northwest Territories (NTNP)' },
              { id: 'qc_separate', label: 'Quebec uses its own (PEQ/PRTQ) — not PNP' },
            ],
            required: true,
          },
          {
            id: 'pnp_stream',
            type: 'short_text',
            label: 'Which PNP stream?',
            placeholder: 'e.g. Ontario Tech Draw, BC Skilled Worker, etc.',
          },
          {
            id: 'job_offer',
            type: 'select',
            label: 'Do you have a Canadian job offer?',
            options: [
              { id: 'yes_lmia',   label: 'Yes — with LMIA' },
              { id: 'yes_nolmia', label: 'Yes — LMIA-exempt' },
              { id: 'pending',    label: 'In conversations with an employer' },
              { id: 'no',         label: 'No job offer yet' },
            ],
          },
          PRIOR_DENIAL_QUESTION,
          URGENCY_QUESTION,
          FREEFORM_DETAIL,
        ],
      },
      {
        id: 'study',
        label: 'Study permit',
        questions: [
          {
            id: 'institution',
            type: 'short_text',
            label: 'Designated Learning Institution (DLI)',
            placeholder: 'e.g. UofT, McGill, Seneca College',
            required: true,
          },
          {
            id: 'province_study',
            type: 'select',
            label: 'Province',
            options: [
              { id: 'on', label: 'Ontario' },
              { id: 'qc', label: 'Quebec' },
              { id: 'bc', label: 'British Columbia' },
              { id: 'ab', label: 'Alberta' },
              { id: 'other', label: 'Other' },
            ],
          },
          {
            id: 'pal',
            type: 'select',
            label: 'Do you have a Provincial Attestation Letter (PAL/TAL)?',
            options: [
              { id: 'yes',    label: 'Yes' },
              { id: 'no',     label: 'No / not yet' },
              { id: 'exempt', label: 'My program is exempt' },
              { id: 'unsure', label: "Don't know" },
            ],
          },
          {
            id: 'gic',
            type: 'select',
            label: 'GIC + tuition deposit ready?',
            options: [
              { id: 'yes',  label: 'Yes — both' },
              { id: 'partial', label: 'One of them' },
              { id: 'no', label: 'Not yet' },
            ],
          },
          PRIOR_DENIAL_QUESTION,
          URGENCY_QUESTION,
          FREEFORM_DETAIL,
        ],
      },
      {
        id: 'spouse_ca',
        label: 'Spousal sponsorship',
        questions: [
          {
            id: 'sponsor_status',
            type: 'select',
            label: 'Your sponsor is a',
            options: [
              { id: 'citizen', label: 'Canadian citizen' },
              { id: 'pr',      label: 'Permanent resident' },
            ],
            required: true,
          },
          {
            id: 'in_or_out',
            type: 'select',
            label: 'Inland or outland sponsorship?',
            options: [
              { id: 'inland',  label: 'Inland (applicant inside Canada)' },
              { id: 'outland', label: 'Outland (applicant outside Canada)' },
              { id: 'unsure',  label: 'Not sure which is right for us' },
            ],
            required: true,
          },
          {
            id: 'relationship_type',
            type: 'select',
            label: 'Relationship type',
            options: [
              { id: 'married',     label: 'Married' },
              { id: 'common_law',  label: 'Common-law (12+ months cohabitation)' },
              { id: 'conjugal',    label: 'Conjugal partner' },
            ],
          },
          PRIOR_DENIAL_QUESTION,
          URGENCY_QUESTION,
          FREEFORM_DETAIL,
        ],
      },
      {
        id: 'lmia',
        label: 'LMIA / work permit',
        questions: [
          {
            id: 'lmia_role',
            type: 'select',
            label: 'Are you the employer or the worker?',
            options: [
              { id: 'employer', label: "I'm the employer applying for an LMIA" },
              { id: 'worker',   label: "I'm the worker, employer wants to hire me" },
            ],
            required: true,
          },
          {
            id: 'lmia_stream',
            type: 'select',
            label: 'Which stream?',
            options: [
              { id: 'high_wage',    label: 'High-wage' },
              { id: 'low_wage',     label: 'Low-wage' },
              { id: 'gts',          label: 'Global Talent Stream' },
              { id: 'agri',         label: 'Agricultural / SAWP' },
              { id: 'caregiver',    label: 'Home Child Care / Home Support Worker' },
              { id: 'unsure_stream', label: "Don't know" },
            ],
          },
          {
            id: 'noc_lmia',
            type: 'short_text',
            label: 'NOC code (if known)',
            placeholder: 'e.g. 21231',
          },
          {
            id: 'wage',
            type: 'short_text',
            label: 'Hourly wage / annual salary offered',
            placeholder: 'e.g. $35/hr or $72,800/yr',
          },
          PRIOR_DENIAL_QUESTION,
          URGENCY_QUESTION,
          FREEFORM_DETAIL,
        ],
      },
      {
        id: 'other_ca',
        label: 'Something else',
        questions: [
          {
            id: 'topic',
            type: 'long_text',
            label: 'In a sentence or two, what’s going on?',
            required: true,
          },
          PRIOR_DENIAL_QUESTION,
          URGENCY_QUESTION,
          FREEFORM_DETAIL,
        ],
      },
    ],
  },
  {
    id: 'AU',
    flag: 'AU',
    label: 'Australia',
    blurb: 'Student visas / graduate visas / work rights / tenancy',
    caseTypes: [
      {
        id: 'student_visa',
        label: 'Student visa',
        questions: [
          {
            id: 'institution',
            type: 'short_text',
            label: 'Education provider',
            placeholder: 'e.g. University of Sydney, UNSW, RMIT',
            required: true,
          },
          {
            id: 'visa_stream',
            type: 'select',
            label: 'Which visa / grant type?',
            options: [
              { id: 'subclass_500', label: 'Subclass 500 student visa' },
              { id: 'genuine_student', label: 'Genuine Student requirement' },
              { id: 'financial_capacity', label: 'Financial capacity evidence' },
              { id: 'unsure', label: "I'm not sure yet" },
            ],
            required: true,
          },
          {
            id: 'application_stage',
            type: 'select',
            label: 'Where are you in the process?',
            options: [
              { id: 'pre_lodgement', label: 'Preparing to lodge' },
              { id: 'lodged', label: 'Already lodged' },
              { id: 'refused', label: 'Refused / need reapply' },
              { id: 'inside_australia', label: 'Already in Australia' },
            ],
            required: true,
          },
          PRIOR_DENIAL_QUESTION,
          URGENCY_QUESTION,
          FREEFORM_DETAIL,
        ],
      },
      {
        id: 'graduate_visa',
        label: 'Temporary Graduate visa',
        questions: [
          {
            id: 'visa_subclass',
            type: 'select',
            label: 'Which subclass?',
            options: [
              { id: '485', label: 'Subclass 485' },
              { id: 'other', label: 'Another post-study stream' },
              { id: 'unsure', label: "I'm not sure" },
            ],
            required: true,
          },
          {
            id: 'study_area',
            type: 'short_text',
            label: 'Course / qualification completed',
            placeholder: 'e.g. Bachelor of Nursing',
          },
          {
            id: 'location',
            type: 'select',
            label: 'Where are you applying from?',
            options: [
              { id: 'inside', label: 'Inside Australia' },
              { id: 'outside', label: 'Outside Australia' },
            ],
            required: true,
          },
          PRIOR_DENIAL_QUESTION,
          URGENCY_QUESTION,
          FREEFORM_DETAIL,
        ],
      },
      {
        id: 'work_rights',
        label: 'Work rights',
        questions: [
          {
            id: 'employment_status',
            type: 'select',
            label: 'What do you need help with?',
            options: [
              { id: 'hour_limit', label: 'Student visa work-hour limit' },
              { id: 'work_while_studying', label: 'Working while studying' },
              { id: 'poststudy', label: 'Post-study work rights' },
              { id: 'unsure', label: "I'm not sure" },
            ],
            required: true,
          },
          {
            id: 'sector',
            type: 'short_text',
            label: 'Industry / employer',
            placeholder: 'e.g. hospitality, healthcare, tech',
          },
          PRIOR_DENIAL_QUESTION,
          URGENCY_QUESTION,
          FREEFORM_DETAIL,
        ],
      },
      {
        id: 'tenancy',
        label: 'Tenancy / housing',
        questions: [
          {
            id: 'state',
            type: 'select',
            label: 'Which state or territory?',
            options: [
              { id: 'nsw', label: 'New South Wales' },
              { id: 'vic', label: 'Victoria' },
              { id: 'qld', label: 'Queensland' },
              { id: 'wa', label: 'Western Australia' },
              { id: 'sa', label: 'South Australia' },
              { id: 'act', label: 'ACT' },
              { id: 'tas', label: 'Tasmania' },
              { id: 'nt', label: 'Northern Territory' },
            ],
            required: true,
          },
          {
            id: 'tenancy_issue',
            type: 'select',
            label: 'What is happening?',
            options: [
              { id: 'bond', label: 'Bond / deposit issue' },
              { id: 'repairs', label: 'Repairs / maintenance' },
              { id: 'notice', label: 'Notice to vacate' },
              { id: 'sharehouse', label: 'Roommate / sharehouse dispute' },
              { id: 'other', label: 'Something else' },
            ],
            required: true,
          },
          PRIOR_DENIAL_QUESTION,
          URGENCY_QUESTION,
          FREEFORM_DETAIL,
        ],
      },
      {
        id: 'other_au',
        label: 'Something else',
        questions: [
          {
            id: 'topic',
            type: 'long_text',
            label: 'In a sentence or two, what’s going on?',
            required: true,
          },
          PRIOR_DENIAL_QUESTION,
          URGENCY_QUESTION,
          FREEFORM_DETAIL,
        ],
      },
    ],
  },
]

export function getCountry(id: Country): CountryConfig | undefined {
  return COUNTRIES.find(c => c.id === id)
}

export function getCaseType(country: Country, caseTypeId: string): CaseType | undefined {
  return getCountry(country)?.caseTypes.find(ct => ct.id === caseTypeId)
}

export type IntakeAnswers = Record<string, string | string[]>

export type RecommendedTier = {
  tier: 'Essential' | 'Enhanced' | 'Professional'
  price: string
  description: string
}

export function recommendTier(
  country: Country,
  caseTypeId: string,
  answers: IntakeAnswers,
): RecommendedTier {
  const urgency = answers.urgency
  const priorDenial = answers.prior_denial
  const isUrgent = urgency === 'now'
  const hasComplexity =
    priorDenial === 'yes_visa' ||
    priorDenial === 'yes_arrest' ||
    priorDenial === 'yes_other' ||
    answers.gc_conditional === 'yes_waiver' ||
    answers.tenancy_issue === 'illegal_eviction' ||
    answers.tenancy_issue === 'court' ||
    answers.notice_received === 's8' ||
    answers.notice_received === 'court' ||
    answers.lmia_stream === 'gts'

  if (isUrgent && hasComplexity) {
    return {
      tier: 'Professional',
      price: '$999 – $1,499',
      description:
        'Document prep, three attorney consultations, and priority review. Built for tight deadlines and a complicated history.',
    }
  }
  if (isUrgent || hasComplexity) {
    return {
      tier: 'Enhanced',
      price: '$599 – $899',
      description:
        'Document prep plus a live attorney video consult and async review. Best for time-sensitive filings.',
    }
  }
  return {
    tier: 'Essential',
    price: '$299 – $499',
    description:
      'Guided document prep with async attorney review (5 business days). Right for standard filings.',
  }
}
