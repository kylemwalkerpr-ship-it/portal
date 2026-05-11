'use client'
// @ts-nocheck
import React from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { C, Btn, Badge, Card, Input, Select, Avatar, UserMenu, StatusBadge, Divider, StatCard, ProgressBar, NavItem, MessageBody } from './shared'
import FindAttorney from './find-attorney'
import MyInquiries from './my-inquiries'
import OrderRatingPrompt from './order-rating-prompt'
import DashboardRightPane from './dashboard-right-pane'
import { LanguageSelector } from '../language-selector'

// ── Premium section primitives ────────────────────────────────────────────
const sectionEyebrow = {
  color: C.textMuted,
  fontSize: '11px',
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  fontWeight: 700,
  marginBottom: '4px',
}
const sectionHeading = {
  fontFamily: C.serif,
  fontSize: '22px',
  fontWeight: 500,
  color: C.text,
  letterSpacing: '-0.01em',
  margin: 0,
  lineHeight: 1.2,
}
const sectionHeaderRow = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-end',
  marginBottom: '14px',
  flexWrap: 'wrap',
  gap: '12px',
}

function QuickActionTile({ icon, label, sub, onClick }) {
  const [hover, setHover] = React.useState(false)
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: C.surface,
        border: `1px solid ${hover ? 'rgba(0,0,0,0.14)' : C.border}`,
        borderRadius: '14px',
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        cursor: 'pointer',
        fontFamily: 'inherit',
        textAlign: 'left',
        transition: 'border-color 140ms ease, transform 140ms ease, box-shadow 140ms ease',
        transform: hover ? 'translateY(-2px)' : 'none',
        boxShadow: hover ? '0 8px 22px rgba(15,18,32,0.06)' : '0 1px 2px rgba(15,18,32,0.03)',
      }}
    >
      <span style={{ fontSize: '22px' }}>{icon}</span>
      <span style={{ fontFamily: C.serif, fontSize: '17px', fontWeight: 500, color: C.text, letterSpacing: '-0.005em' }}>
        {label}
      </span>
      {sub && <span style={{ fontSize: '12px', color: C.textMuted }}>{sub}</span>}
    </button>
  )
}

const STRIPE_PUB_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY

const TERMS_URL = 'https://yousafeconsultancy.com/terms'
const REFUND_POLICY_URL = 'https://yousafeconsultancy.com/refund-policy'

const formatUSD = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(value || 0));
const formatMoney = (value, currency = 'USD') => new Intl.NumberFormat('en-US', { style: 'currency', currency: String(currency || 'USD').toUpperCase(), minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(value || 0));
const serviceIcon = category => ({
  'Study Permits': '📋',
  'University Admissions': '🎓',
  'Post-Graduate': '🏫',
  'PR & Immigration': '🍁',
  Settlement: '🏠',
  Mentorship: '🤝',
  Credentials: '📜',
  Career: '💼',
})[category] || '🛒';
const deliveryLabel = days => {
  const n = Number(days || 0);
  if (!n) return 'Timeline TBD';
  if (n >= 365) return '12 months';
  if (n >= 90) return '3 months';
  if (n >= 28) return '2–4 weeks';
  return `${n} day${n === 1 ? '' : 's'}`;
};

const SERVICE_DETAIL_LIBRARY = {
  'Study Permit Starter Package': {
    label: 'Study Permit Starter Review',
    summary: 'A focused readiness review for students who already know their school/program and need help organizing a clean study permit package.',
    deliverables: [
      'Personalized intake checklist for study permit documents',
      'Review of school acceptance, passport, financial proof, and supporting records',
      'Statement of purpose outline with improvement notes',
      'One written review memo with gaps, risks, and next steps',
      'One follow-up clarification round by portal message',
    ],
    timeline: 'Initial review in 7 business days after all requested documents are uploaded.',
    bestFor: 'Students with most documents ready who want a second set of eyes before submission.',
  },
  'Study Permit Standard Package': {
    label: 'Study Permit Standard Preparation',
    summary: 'Document preparation support for students who want a structured package, stronger written materials, and organized proof-of-funds presentation.',
    deliverables: [
      'Full document checklist tailored to your country, school, and program',
      'Statement of purpose drafting support and one revision round',
      'Proof-of-funds organization plan and sponsor-document checklist',
      'Application-form review for consistency against your documents',
      'Final submission-readiness packet with outstanding items clearly marked',
    ],
    timeline: '10 business days after complete intake and document upload.',
    bestFor: 'Students who want guided preparation before they submit independently or with an authorized representative.',
  },
  'Study Permit Premium Package': {
    label: 'Study Permit Premium File Build',
    summary: 'A deeper preparation package for complex study histories, multiple sponsors, prior refusals, or students who need a more polished evidence packet.',
    deliverables: [
      'Priority intake review and document strategy checklist',
      'Statement of purpose drafting support with up to two revision rounds',
      'Financial evidence map for sponsors, bank records, income, and ties',
      'Refusal or complexity review, if applicable',
      'Final organized file index and submission-readiness review call',
    ],
    timeline: '14 business days after complete intake; complex files may require extra document-gathering time.',
    bestFor: 'Students with complex financial, academic, or prior-refusal circumstances.',
  },
  'Study Permit & Visa Consulting': {
    label: 'Student Visa Planning Call',
    summary: 'A short planning session to understand your goals, documents, deadlines, and next administrative steps.',
    deliverables: [
      'One consultation focused on your study or visa-document questions',
      'High-level document checklist after the call',
      'Written summary of next steps and open items',
      'Referral suggestion if your situation requires licensed legal advice',
    ],
    timeline: 'Scheduled based on availability; written recap usually within 2 business days after the call.',
    bestFor: 'Students who need direction before choosing a larger package.',
  },
  'University Admission Basic': {
    label: 'University Admission Starter',
    summary: 'A focused admissions package for students who need help narrowing programs and organizing their first application materials.',
    deliverables: [
      'Program-fit questionnaire and shortlist criteria',
      'Review of up to 3 target programs',
      'Admissions document checklist',
      'Personal statement or essay review notes for one draft',
      'Deadline tracker template',
    ],
    timeline: '7 business days after intake.',
    bestFor: 'Students who already have a direction and need application organization.',
  },
  'University Admission Comprehensive': {
    label: 'University Admission Application Build',
    summary: 'End-to-end admissions preparation support for multiple schools, essays, recommendations, and application sequencing.',
    deliverables: [
      'Shortlist of up to 6 schools or programs',
      'Application calendar with priority deadlines',
      'Essay or statement support for up to 2 drafts',
      'Recommendation-letter guidance and document tracker',
      'Final application-readiness review for consistency',
    ],
    timeline: '14 business days after intake; school response times are outside YouSafe control.',
    bestFor: 'Students applying to several schools who want a structured admissions plan.',
  },
  'University Admission Elite': {
    label: 'University Admission Elite Support',
    summary: 'High-touch admissions preparation for competitive programs, scholarship positioning, and several application rounds.',
    deliverables: [
      'Program strategy session and up to 10-school comparison matrix',
      'Essay support for up to 4 drafts across applications',
      'Scholarship-document checklist and positioning notes',
      'Interview preparation session, if applicable',
      'Weekly application progress check-ins during the package window',
    ],
    timeline: '2-4 weeks depending on the number of applications and draft cycles.',
    bestFor: 'Students applying to competitive or scholarship-sensitive programs.',
  },
  'PGWP Only Package': {
    label: 'PGWP Document Checklist Review',
    summary: 'Administrative support to organize documents for a post-graduation work permit request.',
    deliverables: [
      'PGWP eligibility and timing checklist based on official requirements',
      'Review of completion letter, transcript, passport, and study permit records',
      'Document consistency review and missing-item list',
      'Submission-readiness summary',
    ],
    timeline: '7 business days after all requested documents are uploaded.',
    bestFor: 'Graduates who need help organizing PGWP materials and deadlines.',
  },
  'PR Roadmap Package': {
    label: 'Post-Study Options Roadmap',
    summary: 'An informational planning package that helps you compare official post-study pathways and prepare questions for qualified representatives when needed.',
    deliverables: [
      'Profile intake covering education, work history, language tests, and goals',
      'High-level comparison of official pathway options',
      'Document-readiness checklist for future planning',
      'Timeline map for language tests, work history, and credential records',
      'Referral guidance for licensed legal or immigration representation where needed',
    ],
    timeline: '10 business days after intake.',
    bestFor: 'Students and graduates who want an organized, non-guaranteed planning roadmap.',
  },
  'Full PR Acceleration Package': {
    label: 'Post-Study Planning Intensive',
    summary: 'A longer planning engagement for graduates who need document organization, timeline tracking, and structured preparation for post-study options.',
    deliverables: [
      'Detailed intake review and planning tracker',
      'Credential, language-test, work-history, and reference-letter checklist',
      'Monthly milestone plan for up to 6 weeks',
      'Two planning calls and portal follow-up support',
      'Representative-referral checklist if case-specific advice is needed',
    ],
    timeline: 'Up to 6 weeks, with milestones set after intake.',
    bestFor: 'Graduates preparing a longer-term post-study plan with several moving parts.',
  },
  'Arrival Essentials Package': {
    label: 'Arrival Essentials Setup',
    summary: 'Practical settlement support for the first steps after landing, including housing, banking, phone, and local setup guidance.',
    deliverables: [
      'Arrival checklist for your city and school',
      'Housing-search guidance and rental-document checklist',
      'Banking, phone, transit, and ID setup checklist',
      'First-week appointment and task planner',
      'Portal follow-up for setup questions',
    ],
    timeline: '5 business days after intake; best started before arrival.',
    bestFor: 'Students arriving soon who need a practical first-week plan.',
  },
  'Full Settlement Package': {
    label: 'Full Settlement Planning',
    summary: 'Broader settlement support covering housing, banking, healthcare basics, campus setup, and local life planning.',
    deliverables: [
      'City-specific settlement plan',
      'Housing and roommate-search document checklist',
      'Banking, phone, health coverage, and transportation setup guidance',
      'Campus onboarding and local-services checklist',
      'Two follow-up support rounds by portal message',
    ],
    timeline: '10 business days after intake, plus follow-up during arrival week.',
    bestFor: 'Students who want support before and shortly after landing.',
  },
  'Premium Integration Package': {
    label: 'Premium Integration Support',
    summary: 'Extended support for students who want help settling into school, local routines, networking, and early career preparation.',
    deliverables: [
      '90-day integration roadmap',
      'Housing, banking, healthcare, and local-services planning',
      'Campus involvement and networking plan',
      'Resume baseline review and local job-readiness checklist',
      'Scheduled check-ins during the package period',
    ],
    timeline: 'Up to 90 days of structured support.',
    bestFor: 'Students who want sustained support beyond the first arrival week.',
  },
  'Monthly Mentorship': {
    label: 'Monthly Student Mentorship',
    summary: 'Ongoing monthly guidance to keep your study, documents, deadlines, and settlement tasks organized.',
    deliverables: [
      'One monthly planning check-in',
      'Deadline and document tracker updates',
      'Portal messaging for quick administrative questions',
      'Monthly next-step summary',
    ],
    timeline: 'Renews monthly; first check-in scheduled after purchase.',
    bestFor: 'Students who want light ongoing accountability.',
  },
  'Quarterly Mentorship': {
    label: 'Quarterly Student Mentorship',
    summary: 'Three months of periodic planning support for academic, settlement, and document-readiness milestones.',
    deliverables: [
      'Quarterly goal-setting session',
      'Monthly progress check-ins for 3 months',
      'Document and deadline tracker maintenance',
      'End-of-quarter action plan',
    ],
    timeline: '3 months of support.',
    bestFor: 'Students managing several deadlines across a semester.',
  },
  'Annual Mentorship': {
    label: 'Annual Student Mentorship',
    summary: 'Year-round planning support for students who want consistent help with academic, settlement, and post-study preparation.',
    deliverables: [
      'Annual roadmap session',
      'Monthly check-ins for 12 months',
      'Deadline, document, and renewal tracker',
      'Semester planning support',
      'Priority portal follow-up for administrative questions',
    ],
    timeline: '12 months of support.',
    bestFor: 'Students who want structured guidance across a full academic year.',
  },
  'Credential Assessment Guided': {
    label: 'Credential Assessment Guided Review',
    summary: 'Guidance for organizing transcripts, degree records, translations, and third-party credential assessment requirements.',
    deliverables: [
      'Credential-assessment provider comparison checklist',
      'Document collection list for transcripts and certificates',
      'Translation/notarization readiness notes',
      'Submission checklist and timeline tracker',
    ],
    timeline: '7 business days after intake.',
    bestFor: 'Students who need help preparing credential-assessment materials.',
  },
  'Credential Assessment Full + Appeal': {
    label: 'Credential Assessment Full Support',
    summary: 'Deeper support for credential-assessment packages, missing records, or follow-up documentation requests.',
    deliverables: [
      'Full credential document review',
      'Provider-specific submission checklist',
      'Translation/notarization and mailing plan',
      'Response plan for missing-document or clarification requests',
      'One follow-up review round',
    ],
    timeline: '14 business days after complete intake.',
    bestFor: 'Students with complex credential histories or prior assessment issues.',
  },
  'Resume & LinkedIn Glow-Up': {
    label: 'Resume & LinkedIn Refresh',
    summary: 'Career-document support to make your resume and LinkedIn profile clearer for student jobs, internships, or early professional roles.',
    deliverables: [
      'Resume review and rewrite notes',
      'LinkedIn headline/about/experience recommendations',
      'Keyword and skills checklist for target roles',
      'One revision round after your updates',
    ],
    timeline: '5 business days after intake.',
    bestFor: 'Students preparing for internships, campus jobs, or early career roles.',
  },
  'Job Search Mastery': {
    label: 'Job Search Preparation',
    summary: 'Structured job-search support covering resume, LinkedIn, role targeting, outreach, and interview preparation.',
    deliverables: [
      'Resume and LinkedIn review',
      'Target-role and employer list template',
      'Outreach message templates',
      'Interview preparation checklist',
      'Job-search weekly tracker',
    ],
    timeline: '14 business days after intake.',
    bestFor: 'Students actively applying for internships, co-op, OPT, or entry roles.',
  },
  'Premium Placement Package': {
    label: 'Premium Career Launch Support',
    summary: 'High-touch career readiness support for students who want help with positioning, applications, interviews, and accountability.',
    deliverables: [
      'Career-positioning intake and target-role strategy',
      'Resume and LinkedIn refresh',
      'Application tracker and outreach scripts',
      'Two mock interview sessions',
      'Weekly job-search check-ins during the package window',
    ],
    timeline: '2-4 weeks depending on interview and application pacing.',
    bestFor: 'Students who want a structured launch plan and recurring accountability.',
  },
};

const LEGAL_SERVICE_DETAILS = {
  Basic: {
    label: 'Legal Document Prep - Basic',
    summary: 'Administrative document-preparation support for straightforward legal forms and filing packets.',
    deliverables: [
      'Intake checklist and document collection list',
      'Draft preparation of selected forms using your information',
      'Basic filing packet organization',
      'One correction round for typos or missing fields',
    ],
    timeline: 'Typical turnaround follows the listed delivery estimate after all client information is received.',
    bestFor: 'Clients who need form organization and document-prep help, not legal advice.',
  },
  Essential: {
    label: 'Document Prep + Attorney Review - Essential',
    summary: 'Document preparation with an attorney review checkpoint before delivery.',
    deliverables: [
      'Document-prep intake and draft packet assembly',
      'Attorney review of prepared packet for issue spotting',
      'Written notes on corrections or missing information',
      'One revision round before final delivery',
    ],
    timeline: 'Typical turnaround follows the listed delivery estimate once all intake materials are complete.',
    bestFor: 'Clients who want document-prep support plus attorney review.',
  },
  Enhanced: {
    label: 'Document Prep + Live Consultation - Enhanced',
    summary: 'Document-prep support plus a live consultation to discuss the prepared packet and next steps.',
    deliverables: [
      'Prepared document packet from client-provided information',
      'Attorney or qualified professional review checkpoint',
      'Live consultation to discuss packet and process questions',
      'Final delivery checklist and filing-readiness notes',
    ],
    timeline: 'Typical turnaround follows the listed delivery estimate; consultation scheduling may affect final delivery.',
    bestFor: 'Clients who need a guided conversation before using the prepared packet.',
  },
  Professional: {
    label: 'Full Attorney Engagement - Professional',
    summary: 'A higher-touch engagement for matters requiring direct attorney involvement.',
    deliverables: [
      'Conflict and intake review',
      'Attorney-led scope confirmation',
      'Document strategy and preparation plan',
      'Matter-specific deliverables defined after attorney intake',
    ],
    timeline: 'Timeline is confirmed after intake because scope depends on the matter.',
    bestFor: 'Clients whose matter may require direct legal representation.',
  },
};

function getServiceDetails(service) {
  const title = service?.title || '';
  if (SERVICE_DETAIL_LIBRARY[title]) return SERVICE_DETAIL_LIBRARY[title];
  if (String(service?.vertical || '').toLowerCase() === 'legal' || /legal|attorney/i.test(title)) {
    const key = Object.keys(LEGAL_SERVICE_DETAILS).find(k => title.includes(k)) || 'Basic';
    return LEGAL_SERVICE_DETAILS[key];
  }
  const category = service?.category || 'General';
  return {
    label: title || 'YouSafe Service',
    summary: 'A YouSafe service package with escrow-protected payment, document intake, consultant assignment, and delivery through your portal.',
    deliverables: [
      'Client intake and document checklist',
      'Assigned consultant review',
      'Portal messaging during the service window',
      'Final deliverable uploaded to your order workspace',
    ],
    timeline: `${deliveryLabel(service?.delivery_days)} after complete intake unless otherwise noted.`,
    bestFor: `${category} support with a defined scope and secure payment flow.`,
  };
}

function splitDisplayName(name) {
  const raw = String(name || '').trim()
  const parts = raw.split(/\s+/).filter(Boolean)
  const salutation = /^(Mr\.?|Mrs\.?|Ms\.?|Mx\.?|Dr\.?|Prof\.?)$/i.test(parts[0] || '') ? parts.shift() : ''
  return {
    salutation: salutation ? salutation.replace(/\.$/, '.') : '',
    first_name: parts[0] || '',
    last_name: parts.slice(1).join(' '),
  }
}

// ─── Escrow Approval Card ─────────────────────────────────────────────────────
function EscrowApprovalCard({ order }) {
  const [state, setState] = React.useState('review'); // review | approved | rejected
  const [rejectStep, setRejectStep] = React.useState(null); // null | choose | refund | reassign
  const [refundRequested, setRefundRequested] = React.useState(false);
  const [reassigned, setReassigned] = React.useState(false);

  if (state === 'approved') return (
    <div style={{ background: `${C.green}12`, border: `1px solid ${C.green}33`, borderRadius: '14px', padding: '20px' }}>
      <div style={{ fontWeight: 700, fontSize: '15px', color: C.green }}>✅ Payment released from escrow!</div>
      <div style={{ fontSize: '13px', color: C.textMuted, marginTop: '6px' }}>80% sent to your consultant · 20% to platform. Your order is complete.</div>
    </div>
  );

  if (refundRequested) return (
    <div style={{ background: 'rgba(245,158,11,0.1)', border: `1px solid rgba(245,158,11,0.3)`, borderRadius: '14px', padding: '20px' }}>
      <div style={{ fontWeight: 700, fontSize: '15px', color: C.orange }}>🔄 Refund in progress</div>
      <div style={{ fontSize: '13px', color: C.textMuted, marginTop: '6px' }}>Your refund (minus 3% fee) is being processed. A 3% charge has been deducted from your consultant's balance.</div>
    </div>
  );

  if (reassigned) return (
    <div style={{ background: `${C.navy}20`, border: `1px solid ${C.navy}44`, borderRadius: '14px', padding: '20px' }}>
      <div style={{ fontWeight: 700, fontSize: '15px', color: '#7aadff' }}>🔁 Finding a new consultant</div>
      <div style={{ fontSize: '13px', color: C.textMuted, marginTop: '6px' }}>We're matching you with another available consultant. You'll be notified within 24 hours.</div>
    </div>
  );

  return (
    <div>
      {/* Main approval banner */}
      {!rejectStep && (
        <div style={{ background: `${C.green}12`, border: `1px solid ${C.green}33`, borderRadius: '14px', padding: '20px' }}>
          <div style={{ fontWeight: 700, fontSize: '15px', color: C.green, marginBottom: '8px' }}>🎉 Ready for your approval</div>
          <p style={{ fontSize: '13px', color: C.textMuted, lineHeight: 1.6, marginBottom: '16px' }}>
            Your consultant has completed the deliverable. Review the files, then approve to release payment — <strong style={{ color: C.cyan }}>80%</strong> goes to your consultant, <strong style={{ color: C.green }}>20%</strong> to the platform.
          </p>
          <div style={{ display: 'flex', gap: '10px' }}>
            <Btn variant="success" size="sm" onClick={() => setState('approved')}>✓ Approve &amp; release payment</Btn>
            <Btn variant="danger" size="sm" onClick={() => setRejectStep('choose')}>✕ Reject delivery</Btn>
          </div>
        </div>
      )}

      {/* Rejection choice */}
      {rejectStep === 'choose' && (
        <div style={{ background: 'rgba(239,68,68,0.08)', border: `1px solid rgba(239,68,68,0.3)`, borderRadius: '14px', padding: '20px' }}>
          <div style={{ fontWeight: 700, fontSize: '15px', color: C.red, marginBottom: '8px' }}>Reject delivery — what would you like to do?</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
            <div onClick={() => setRejectStep('reassign')} style={{ padding: '14px', background: C.surface2, borderRadius: '12px', border: `1px solid ${C.border2}`, cursor: 'pointer', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '20px' }}>🔁</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: '14px' }}>Find a new consultant</div>
                <div style={{ fontSize: '12px', color: C.textMuted, marginTop: '3px' }}>Your payment stays in escrow. We'll match you with another consultant at no extra cost.</div>
              </div>
            </div>
            <div onClick={() => setRejectStep('refund')} style={{ padding: '14px', background: C.surface2, borderRadius: '12px', border: `1px solid ${C.border2}`, cursor: 'pointer', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '20px' }}>💳</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: '14px' }}>Request a refund</div>
                <div style={{ fontSize: '12px', color: C.textMuted, marginTop: '3px' }}>Get your full payment back minus a <strong style={{ color: C.orange }}>3% processing fee</strong>, charged from the consultant's balance.</div>
              </div>
            </div>
          </div>
          <Btn variant="ghost" size="sm" onClick={() => setRejectStep(null)}>← Go back</Btn>
        </div>
      )}

      {/* Reassign confirmation */}
      {rejectStep === 'reassign' && (
        <div style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: '14px', padding: '20px' }}>
          <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '8px' }}>Confirm — find a new consultant?</div>
          <p style={{ fontSize: '13px', color: C.textMuted, lineHeight: 1.6, marginBottom: '16px' }}>
            Your payment of <strong style={{ color: C.cyan }}>{order.price}</strong> stays in escrow. The current consultant will be unassigned. You'll be matched with a new one within 24 hours.
          </p>
          <div style={{ display: 'flex', gap: '10px' }}>
            <Btn variant="navy" size="sm" onClick={() => setReassigned(true)}>Confirm — reassign</Btn>
            <Btn variant="ghost" size="sm" onClick={() => setRejectStep('choose')}>← Back</Btn>
          </div>
        </div>
      )}

      {/* Refund confirmation */}
      {rejectStep === 'refund' && (
        <div style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: '14px', padding: '20px' }}>
          <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '14px' }}>Confirm refund breakdown</div>
          <div style={{ background: C.surface3, borderRadius: '10px', padding: '14px', marginBottom: '16px' }}>
            {[
              ['Original payment', order.price],
              ['3% processing fee (from consultant)', `-${formatUSD((Number(String(order.price).replace(/[^0-9.]/g, '')) || 0) * 0.03)}`],
              ['You receive', formatUSD((Number(String(order.price).replace(/[^0-9.]/g, '')) || 0) * 0.97)],
            ].map(([k, v], i) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: i < 2 ? `1px solid ${C.border}` : 'none', fontSize: '14px' }}>
                <span style={{ color: C.textMuted }}>{k}</span>
                <span style={{ fontWeight: 700, color: i === 2 ? C.green : i === 1 ? C.red : C.text }}>{v}</span>
              </div>
            ))}
          </div>
          <p style={{ fontSize: '12px', color: C.textDim, marginBottom: '16px' }}>The 3% fee is deducted from the consultant's available balance. If insufficient balance exists, it will be deducted from their next payout.</p>
          <div style={{ display: 'flex', gap: '10px' }}>
            <Btn variant="danger" size="sm" onClick={() => setRefundRequested(true)}>Confirm refund</Btn>
            <Btn variant="ghost" size="sm" onClick={() => setRejectStep('choose')}>← Back</Btn>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Stripe Payment Method Component ─────────────────────────────────────────
function StripePaymentSection() {
  const [cards, setCards] = React.useState([]);
  const [selectedCardId, setSelectedCardId] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [addingCard, setAddingCard] = React.useState(false);
  const [cardMounted, setCardMounted] = React.useState(false);
  const [stripe, setStripe] = React.useState(null);
  const [stripeStatus, setStripeStatus] = React.useState('idle'); // idle | loading | ready | error
  const [stripeErr, setStripeErr] = React.useState(null);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState(null);

  const cardElemRef = React.useRef(null);
  const mountNodeRef = React.useRef(null);

  const fetchCards = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/wallet/payment-methods');
      const d = await res.json();
      const nextCards = d.cards ?? [];
      setCards(nextCards);
      setSelectedCardId(current => current || nextCards[0]?.id || '');
    } catch (e) {
      setCards([]);
      setErrorMsg(e.message || 'Could not load saved cards.');
    } finally { setLoading(false); }
  };

  React.useEffect(() => { fetchCards(); }, []);

  // Lazy-load Stripe ON DEMAND when the user clicks "Add new card"
  const handleAddCard = async () => {
    setErrorMsg(null);
    setStripeErr(null);

    // If already loaded, just open the form
    if (stripe) { setAddingCard(true); return; }

    if (!STRIPE_PUB_KEY) {
      setStripeErr('Stripe is not configured. Add NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY to the environment.');
      return;
    }

    setStripeStatus('loading');
    setAddingCard(true);    // open the form immediately so user sees "Loading…" inside it

    try {
      const s = await loadStripe(STRIPE_PUB_KEY);
      if (!s) throw new Error('loadStripe() returned null — Stripe.js may have been blocked by a browser extension or ad blocker.');
      setStripe(s);
      setStripeStatus('ready');
    } catch (err) {
      console.error('[Stripe] load failed:', err);
      setStripeErr(err.message || 'Failed to load Stripe');
      setStripeStatus('error');
    }
  };

  // Mount card element whenever stripe instance AND addingCard are both ready
  React.useEffect(() => {
    if (!stripe || !addingCard) return;
    const node = mountNodeRef.current;
    if (!node) return;

    if (cardElemRef.current) { try { cardElemRef.current.destroy(); } catch (_) {} }

    try {
      const elements = stripe.elements();
      const card = elements.create('card', {
        hidePostalCode: true,
        style: {
          base: { color: '#111827', fontFamily: 'inherit', fontSize: '15px', '::placeholder': { color: '#9CA3AF' } },
          invalid: { color: '#EF4444' },
        },
      });
      card.mount(node);
      cardElemRef.current = card;
      setCardMounted(true);
    } catch (err) {
      console.error('[Stripe] mount failed:', err);
      setStripeErr(err.message || 'Failed to mount card element');
    }

    return () => {
      try { cardElemRef.current?.destroy(); } catch (_) {}
      cardElemRef.current = null;
      setCardMounted(false);
    };
  }, [stripe, addingCard]);

  const handleSave = async () => {
    if (!stripe || !cardElemRef.current) {
      setErrorMsg('Card fields are not ready — please wait a moment.');
      return;
    }
    setSaving(true); setErrorMsg(null);
    try {
      const res = await fetch('/api/wallet/setup-intent', { method: 'POST' });
      let body;
      try { body = await res.json(); }
      catch { body = { error: `Server returned status ${res.status} with a non-JSON response (likely a Worker crash).` }; }
      const { clientSecret, error: apiErr } = body;
      if (!res.ok || apiErr || !clientSecret) {
        throw new Error(`${apiErr || 'SetupIntent failed'} (HTTP ${res.status}). Run /api/wallet/diagnose for details.`);
      }
      const { error: confirmErr } = await stripe.confirmCardSetup(clientSecret, {
        payment_method: { card: cardElemRef.current },
      });
      if (confirmErr) throw new Error(confirmErr.message);
      setAddingCard(false); setSaved(true);
      await fetchCards();
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setErrorMsg(e.message);
    } finally { setSaving(false); }
  };

  const handleRemove = async (pmId) => {
    try {
      await fetch(`/api/wallet/payment-methods/${pmId}`, { method: 'DELETE' });
      if (selectedCardId === pmId) setSelectedCardId('');
      await fetchCards();
    } catch (e) { console.error('Remove failed', e); }
  };

  const brandColor = b => ({ visa: '#1a1f71', mastercard: '#eb001b', amex: '#007bc1' }[b] ?? C.textMuted);

  return (
    <Card>
      <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '6px' }}>Payment Methods</div>
      <div style={{ fontSize: '12px', color: C.textMuted, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{ background: '#635bff', color: '#fff', fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px' }}>stripe</span>
        Secured by Stripe — we never store card details directly.
      </div>
      {saved && <div style={{ background: `${C.green}15`, border: `1px solid ${C.green}33`, borderRadius: '10px', padding: '10px 14px', fontSize: '13px', color: C.green, marginBottom: '14px' }}>✓ Card saved securely via Stripe</div>}
      {errorMsg && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '10px', padding: '10px 14px', fontSize: '13px', color: '#EF4444', marginBottom: '14px' }}>⚠ {errorMsg}</div>}
      {stripeErr && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '10px', padding: '10px 14px', fontSize: '13px', color: '#EF4444', marginBottom: '14px' }}>⚠ Stripe error: {stripeErr}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
        {loading ? (
          <div style={{ color: C.textMuted, fontSize: '13px', padding: '8px 0' }}>Loading saved cards…</div>
        ) : cards.length === 0 && !addingCard ? (
          <div style={{ color: C.textMuted, fontSize: '13px', textAlign: 'center', padding: '16px 0' }}>No cards saved yet.</div>
        ) : cards.map(card => (
          <button
            key={card.id}
            type="button"
            onClick={() => setSelectedCardId(card.id)}
            style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px', background: selectedCardId === card.id ? `${C.cyan}0f` : C.surface2, borderRadius: '999px', border: `1px solid ${selectedCardId === card.id ? C.cyan : C.border}`, cursor: 'pointer', color: C.text, fontFamily: 'inherit', textAlign: 'left' }}
          >
            <span style={{ width: '20px', height: '20px', borderRadius: '999px', border: `2px solid ${selectedCardId === card.id ? C.cyan : C.border2}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {selectedCardId === card.id && <span style={{ width: '10px', height: '10px', borderRadius: '999px', background: C.cyan }} />}
            </span>
            <div style={{ width: '44px', height: '28px', borderRadius: '6px', background: brandColor(card.brand), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 800, color: '#fff', flexShrink: 0 }}>{card.brand.slice(0,4).toUpperCase()}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '14px', fontWeight: 600 }}>•••• •••• •••• {card.last4}</div>
              <div style={{ fontSize: '12px', color: C.textMuted }}>Expires {card.exp_month}/{card.exp_year}</div>
            </div>
            <Btn variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); handleRemove(card.id); }}>Remove</Btn>
          </button>
        ))}
      </div>
      {!addingCard ? (
        <Btn variant="secondary" size="sm" onClick={handleAddCard} disabled={stripeStatus === 'loading'}>
          {stripeStatus === 'loading' ? 'Loading Stripe…' : '+ Add new card'}
        </Btn>
      ) : (
        <div style={{ background: '#F9FAFB', borderRadius: '14px', padding: '20px', border: '1px solid #E5E7EB' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#6B7280', marginBottom: '16px', display: 'flex', justifyContent: 'space-between' }}>
            <span>Add payment method</span>
            <span style={{ background: '#635bff', color: '#fff', fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px' }}>powered by stripe</span>
          </div>
          <div style={{ position: 'relative', marginBottom: '16px' }}>
            <div
              ref={mountNodeRef}
              style={{ padding: '12px 14px', background: '#ffffff', borderRadius: '8px', border: '1px solid #D1D5DB', minHeight: '46px' }}
            />
            {!cardMounted && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', paddingLeft: '14px', fontSize: '13px', color: '#9CA3AF', pointerEvents: 'none' }}>
                {stripe ? 'Initialising…' : 'Loading Stripe…'}
              </div>
            )}
          </div>
          <div style={{ fontSize: '12px', color: '#9CA3AF', marginBottom: '16px' }}>
            🔒 Your card is encrypted and stored securely via Stripe. YouSafe never sees your full card number.
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <Btn variant="primary" size="sm" onClick={handleSave} disabled={saving || !cardMounted}>
              {saving ? 'Saving…' : !cardMounted ? 'Loading…' : 'Save card securely'}
            </Btn>
            <Btn variant="ghost" size="sm" onClick={() => { setAddingCard(false); setErrorMsg(null); }}>Cancel</Btn>
          </div>
        </div>
      )}
    </Card>
  );
}

window.EscrowApprovalCard = EscrowApprovalCard;
window.StripePaymentSection = StripePaymentSection;

// ─── Top-up Dialog ───────────────────────────────────────────────────────────
function TopUpDialog({ onClose, onSuccess }) {
  const [cards, setCards] = React.useState([]);
  const [loadingCards, setLoadingCards] = React.useState(true);
  const [selectedCardId, setSelectedCardId] = React.useState('');
  const [amount, setAmount] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [errMsg, setErrMsg] = React.useState(null);
  const [success, setSuccess] = React.useState(false);

  React.useEffect(() => {
    fetch('/api/wallet/payment-methods')
      .then(r => r.json())
      .then(d => {
        const list = d.cards ?? [];
        setCards(list);
        if (list[0]) setSelectedCardId(list[0].id);
      })
      .finally(() => setLoadingCards(false));
  }, []);

  const PRESETS = [10, 25, 50, 100, 250];
  const amountNum = parseFloat(amount);
  const validAmount = !Number.isNaN(amountNum) && amountNum >= 1;
  const canSubmit = validAmount && !!selectedCardId && !submitting;

  const handleSubmit = async () => {
    setErrMsg(null);
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/wallet/topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentMethodId: selectedCardId,
          amount: Math.round(amountNum * 100), // cents
        }),
      });
      let body;
      try { body = await res.json(); } catch { body = { error: `Server returned ${res.status}` }; }
      if (!res.ok || body.error) throw new Error(body.error || `Top-up failed (${res.status})`);
      setSuccess(true);
      setTimeout(() => onSuccess(), 1200);
    } catch (e) {
      setErrMsg(e.message);
    } finally { setSubmitting(false); }
  };

  const brandColor = b => ({ visa: '#1a1f71', mastercard: '#eb001b', amex: '#007bc1' }[b] ?? C.textMuted);

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '20px' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: C.surface, borderRadius: '16px', padding: '28px', maxWidth: '460px', width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
          <div>
            <div style={{ fontSize: '20px', fontWeight: 800, marginBottom: '4px' }}>Top up wallet</div>
            <div style={{ fontSize: '13px', color: C.textMuted }}>Add funds to your wallet using a saved card</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: C.textMuted, lineHeight: 1 }}>×</button>
        </div>

        {success ? (
          <div style={{ background: `${C.green}15`, border: `1px solid ${C.green}33`, borderRadius: '12px', padding: '20px', textAlign: 'center' }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>✓</div>
            <div style={{ fontWeight: 700, color: C.green }}>Top-up successful!</div>
            <div style={{ fontSize: '13px', color: C.textMuted, marginTop: '4px' }}>Your wallet will update in a moment.</div>
          </div>
        ) : (
          <>
            {/* Amount */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: C.text, marginBottom: '10px' }}>Amount (USD)</div>
              <div style={{ position: 'relative', marginBottom: '10px' }}>
                <span style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', fontSize: '18px', fontWeight: 700, color: C.textMuted }}>$</span>
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="0.00"
                  style={{ width: '100%', padding: '12px 14px 12px 28px', fontSize: '18px', fontWeight: 600, background: C.surface2, border: `1px solid ${C.border2}`, borderRadius: '10px', color: C.text, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {PRESETS.map(p => (
                  <button
                    key={p}
                    onClick={() => setAmount(String(p))}
                    style={{
                      padding: '6px 14px', borderRadius: '20px', border: `1px solid ${amount === String(p) ? C.cyan : C.border}`,
                      background: amount === String(p) ? `${C.cyan}15` : C.surface2, color: amount === String(p) ? C.cyan : C.textMuted,
                      fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
                    }}
                  >${p}</button>
                ))}
              </div>
            </div>

            {/* Card selector */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: C.text, marginBottom: '10px' }}>Pay with</div>
              {loadingCards ? (
                <div style={{ color: C.textMuted, fontSize: '13px', padding: '12px' }}>Loading cards…</div>
              ) : cards.length === 0 ? (
                <div style={{ background: 'rgba(245,158,11,0.1)', border: `1px solid rgba(245,158,11,0.3)`, borderRadius: '10px', padding: '14px', fontSize: '13px', color: C.orange }}>
                  No saved cards. Add a card first using the "+ Add new card" button below.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {cards.map(card => (
                    <label
                      key={card.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px',
                        background: C.surface2, borderRadius: '10px',
                        border: `2px solid ${selectedCardId === card.id ? C.cyan : C.border}`,
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="radio"
                        checked={selectedCardId === card.id}
                        onChange={() => setSelectedCardId(card.id)}
                        style={{ accentColor: C.cyan }}
                      />
                      <div style={{ width: '36px', height: '24px', borderRadius: '4px', background: brandColor(card.brand), color: '#fff', fontSize: '9px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {card.brand.slice(0, 4).toUpperCase()}
                      </div>
                      <div style={{ flex: 1, fontSize: '14px' }}>
                        •••• {card.last4} <span style={{ color: C.textMuted, fontSize: '12px' }}>· {card.exp_month}/{card.exp_year}</span>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {errMsg && (
              <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '10px', padding: '10px 14px', fontSize: '13px', color: '#EF4444', marginBottom: '16px' }}>⚠ {errMsg}</div>
            )}

            <div style={{ display: 'flex', gap: '10px' }}>
              <Btn variant="primary" size="md" onClick={handleSubmit} disabled={!canSubmit} fullWidth>
                {submitting ? 'Charging…' : validAmount ? `Charge $${amountNum.toFixed(2)}` : 'Enter an amount'}
              </Btn>
              <Btn variant="ghost" size="md" onClick={onClose}>Cancel</Btn>
            </div>
            <div style={{ fontSize: '11px', color: C.textDim, textAlign: 'center', marginTop: '12px' }}>
              🔒 Charged securely via Stripe. Funds added to your wallet for future orders.
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Billing() {
  const [walletBal, setWalletBal] = React.useState(null);
  const [topUpOpen, setTopUpOpen] = React.useState(false);

  const refreshBalance = React.useCallback(() => {
    fetch('/api/wallet/balance')
      .then(r => r.json())
      .then(d => setWalletBal(d.available?.usd ?? d.available ?? 0))
      .catch(() => setWalletBal(0));
  }, []);

  React.useEffect(() => { refreshBalance(); }, [refreshBalance]);

  return (
    <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <div style={{ color: C.textMuted, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.16em', fontWeight: 700, marginBottom: '4px' }}>Money</div>
        <h2 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: '32px', fontWeight: 500, color: C.text, letterSpacing: '-0.012em', margin: '0 0 6px' }}>Billing.</h2>
      </div>

      <Card style={{ background: `linear-gradient(135deg, ${C.surface}, rgba(60,59,110,0.06))`, border: `1px solid rgba(60,59,110,0.18)` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
          <div>
            <div style={{ fontSize: '11px', color: C.textMuted, marginBottom: '6px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em' }}>Wallet balance</div>
            <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: '40px', fontWeight: 500, color: C.text, lineHeight: 1, letterSpacing: '-0.012em' }}>
              {walletBal === null ? '—' : `$${Number(walletBal).toFixed(2)}`}
            </div>
            <div style={{ fontSize: '12px', color: C.textMuted, marginTop: '6px' }}>Available to spend on services</div>
          </div>
          <Btn variant="primary" size="sm" onClick={() => setTopUpOpen(true)}>+ Top up</Btn>
        </div>
      </Card>

      {topUpOpen && (
        <TopUpDialog
          onClose={() => setTopUpOpen(false)}
          onSuccess={() => { setTopUpOpen(false); refreshBalance(); }}
        />
      )}

      <StripePaymentSection />

      <Card>
        <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '16px' }}>Payment History</div>
        <div style={{ padding: '28px 0', textAlign: 'center', color: C.textMuted, fontSize: '13px' }}>
          No payments yet. Your order history will appear here once you place an order.
        </div>
      </Card>
    </div>
  );
}

function OrderCheckoutDialog({ request, onClose, onPaid }) {
  const [payMethod, setPayMethod] = React.useState('stripe');
  const [walletBalance, setWalletBalance] = React.useState(null);
  const [cards, setCards] = React.useState([]);
  const [selectedCardId, setSelectedCardId] = React.useState('');
  const [acceptedTerms, setAcceptedTerms] = React.useState(false);
  const [acceptedRefundPolicy, setAcceptedRefundPolicy] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const requiresAck = payMethod === 'wallet' || payMethod === 'saved_card';
  const ackComplete = !requiresAck || (acceptedTerms && acceptedRefundPolicy);
  const total = Number(request?.total || 0);
  const canUseWallet = walletBalance !== null && walletBalance >= total;
  const selectedCard = cards.find(card => card.id === selectedCardId);

  React.useEffect(() => {
    fetch('/api/wallet/balance')
      .then(r => r.json())
      .then(d => setWalletBalance(Number(d.available?.usd ?? d.available ?? 0)))
      .catch(() => setWalletBalance(0));
    fetch('/api/wallet/payment-methods')
      .then(r => r.json())
      .then(d => {
        const next = d.cards ?? [];
        setCards(next);
        setSelectedCardId(next[0]?.id || '');
      })
      .catch(() => setCards([]));
  }, []);

  const pay = async () => {
    if (!request || busy) return;
    if (!ackComplete) {
      setError('Please confirm the Terms of Service and Refund Policy before paying.');
      return;
    }
    if (payMethod === 'wallet' && !canUseWallet) {
      setError('Your wallet balance is not enough for this order.');
      return;
    }
    if (payMethod === 'saved_card' && !selectedCardId) {
      setError('Choose a saved card first.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/checkout/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceType: request.sourceType,
          sourceId: request.sourceId,
          tierId: request.tierId,
          paymentMethod: payMethod,
          paymentMethodId: selectedCardId,
          acceptedTerms,
          acceptedRefundPolicy,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Checkout failed.');
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      if (data.requiresAction) {
        if (!STRIPE_PUB_KEY) throw new Error('Stripe is not configured.');
        const stripe = await loadStripe(STRIPE_PUB_KEY);
        if (!stripe) throw new Error('Unable to load Stripe.');
        const result = await stripe.confirmCardPayment(data.clientSecret);
        if (result.error) throw new Error(result.error.message);
        const completeRes = await fetch('/api/checkout/order', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentIntentId: data.paymentIntentId }),
        });
        const completeData = await completeRes.json();
        if (!completeRes.ok) throw new Error(completeData.error || 'Payment confirmation failed.');
      }
      await onPaid?.(data.orderId);
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!request) return null;

  return (
    <div onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }} style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(15,18,32,0.48)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '18px' }}>
      <div style={{ width: '100%', maxWidth: '560px', background: C.surface, color: C.text, border: `1px solid ${C.border}`, borderRadius: '16px', overflow: 'hidden', boxShadow: '0 24px 70px rgba(15,18,32,0.22)' }}>
        <div style={{ padding: '18px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', gap: '14px' }}>
          <div>
            <div style={{ color: C.textMuted, fontSize: '11px', letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 800 }}>Secure checkout</div>
            <div style={{ fontFamily: C.serif, fontSize: '24px', fontWeight: 500, marginTop: '4px' }}>{request.title}</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close checkout" style={{ width: '34px', height: '34px', borderRadius: '999px', border: `1px solid ${C.border}`, background: C.surface2, cursor: 'pointer', color: C.text }}>x</button>
        </div>
        <div style={{ padding: '20px', display: 'grid', gap: '14px' }}>
          <Card style={{ padding: '14px' }}>
            <div style={{ color: C.textMuted, fontSize: '13px', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{request.description || 'Fixed-scope order'}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', paddingTop: '12px', borderTop: `1px solid ${C.border}` }}>
              <span style={{ fontWeight: 800 }}>Total</span>
              <span style={{ fontFamily: C.serif, fontSize: '26px', color: C.text }}>{formatMoney(total, request.currency || 'usd')}</span>
            </div>
          </Card>

          <div style={{ display: 'grid', gap: '10px' }}>
            <CheckoutChoice active={payMethod === 'wallet'} disabled={!canUseWallet} onClick={() => canUseWallet && setPayMethod('wallet')} title="Wallet balance" detail={walletBalance === null ? 'Loading balance...' : `${formatMoney(walletBalance, 'usd')} available${canUseWallet ? '' : ' - insufficient'}`} />
            <CheckoutChoice active={payMethod === 'saved_card'} disabled={!cards.length} onClick={() => cards.length && setPayMethod('saved_card')} title="Saved card" detail={selectedCard ? `${selectedCard.brand?.toUpperCase?.() || 'CARD'} ending ${selectedCard.last4}` : 'No saved cards yet'} />
            {payMethod === 'saved_card' && cards.length > 0 && (
              <select value={selectedCardId} onChange={e => setSelectedCardId(e.target.value)} style={{ width: '100%', border: `1px solid ${C.border2}`, borderRadius: '10px', padding: '11px 12px', background: C.surface2, color: C.text }}>
                {cards.map(card => <option key={card.id} value={card.id}>{card.brand?.toUpperCase?.() || 'CARD'} ending {card.last4} - exp {card.exp_month}/{card.exp_year}</option>)}
              </select>
            )}
            <CheckoutChoice active={payMethod === 'stripe'} onClick={() => setPayMethod('stripe')} title="Stripe hosted checkout" detail="Open Stripe's secure payment page" />
          </div>

          {requiresAck && (
            <Card style={{ padding: '14px' }}>
              <label style={{ display: 'flex', gap: '10px', fontSize: '13px', marginBottom: '8px', cursor: 'pointer' }}>
                <input type="checkbox" checked={acceptedTerms} onChange={e => setAcceptedTerms(e.target.checked)} />
                <span>I agree to the <a href={TERMS_URL} target="_blank" rel="noreferrer" style={{ color: C.cyan, fontWeight: 800 }}>Terms of Service</a>.</span>
              </label>
              <label style={{ display: 'flex', gap: '10px', fontSize: '13px', cursor: 'pointer' }}>
                <input type="checkbox" checked={acceptedRefundPolicy} onChange={e => setAcceptedRefundPolicy(e.target.checked)} />
                <span>I accept the <a href={REFUND_POLICY_URL} target="_blank" rel="noreferrer" style={{ color: C.cyan, fontWeight: 800 }}>Refund Policy</a>.</span>
              </label>
            </Card>
          )}

          {error && <div style={{ color: C.red, background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.22)', borderRadius: '10px', padding: '10px 12px', fontSize: '13px' }}>{error}</div>}
          <Btn variant="primary" fullWidth size="lg" onClick={pay} disabled={busy || (requiresAck && !ackComplete)}>
            {busy ? 'Processing...' : payMethod === 'stripe' ? 'Continue to Stripe checkout' : `Pay ${formatMoney(total, request.currency || 'usd')}`}
          </Btn>
        </div>
      </div>
    </div>
  );
}

function CheckoutChoice({ active, disabled, onClick, title, detail }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} style={{ width: '100%', border: `2px solid ${active ? C.cyan : C.border}`, background: active ? `${C.cyan}10` : C.surface2, opacity: disabled ? 0.55 : 1, cursor: disabled ? 'not-allowed' : 'pointer', borderRadius: '12px', padding: '13px 14px', color: C.text, display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', fontFamily: 'inherit', textAlign: 'left' }}>
      <span>
        <span style={{ display: 'block', fontWeight: 800, fontSize: '14px' }}>{title}</span>
        <span style={{ display: 'block', color: C.textMuted, fontSize: '12px', marginTop: '3px' }}>{detail}</span>
      </span>
      <span style={{ color: active ? C.cyan : C.textDim, fontWeight: 900 }}>{active ? '✓' : '○'}</span>
    </button>
  );
}

function StudentApp({ onLogout, userId, userName }) {
  const [page, setPage] = React.useState('dashboard');
  // Cross-component navigation: child views (e.g. FindAttorney) dispatch a
  // CustomEvent('yousafe-navigate', { detail: { page } }) to switch tabs.
  React.useEffect(() => {
    const handler = (e) => {
      if (e.detail?.attorneyChatId) {
        setSelectedAttorneyChatId(e.detail.attorneyChatId)
        setSelectedOrder(null)
      }
      if (e.detail?.page) setPage(e.detail.page)
    }
    window.addEventListener('yousafe-navigate', handler)
    return () => window.removeEventListener('yousafe-navigate', handler)
  }, []);
  const [selectedOrder, setSelectedOrder] = React.useState(null);
  const [msgInput, setMsgInput] = React.useState('');
  const [messages, setMessages] = React.useState([]);
  const [consultantOffers, setConsultantOffers] = React.useState([]);
  const [messagesLoading, setMessagesLoading] = React.useState(false);
  const [attorneyChats, setAttorneyChats] = React.useState([]);
  const [selectedAttorneyChatId, setSelectedAttorneyChatId] = React.useState(null);
  const [attorneyChatData, setAttorneyChatData] = React.useState(null);
  const [attorneyChatLoading, setAttorneyChatLoading] = React.useState(false);
  const attorneyChatFileRef = React.useRef(null);
  const orderMessageFileRef = React.useRef(null);
  const [orderFilter, setOrderFilter] = React.useState('all');
  const [notifOpen, setNotifOpen] = React.useState(false);
  const [actionNotice, setActionNotice] = React.useState('');
  const [orderPlaced, setOrderPlaced] = React.useState(false);
  const [checkoutRequest, setCheckoutRequest] = React.useState(null);
  const [orders, setOrders] = React.useState([]);
  const [ordersLoading, setOrdersLoading] = React.useState(true);
  const [ordersError, setOrdersError] = React.useState(null);
  const [viewerVertical, setViewerVertical] = React.useState('study_abroad');
  const [profileData, setProfileData] = React.useState({ name: userName || '', email: '' });
  const [walletSummary, setWalletSummary] = React.useState({ available: 0, pending: 0 });
  const [orderFiles, setOrderFiles] = React.useState([]);
  const [filesLoading, setFilesLoading] = React.useState(false);
  const [uploadingOrderFile, setUploadingOrderFile] = React.useState(false);
  const orderFileInputRef = React.useRef(null);
  const [allFiles, setAllFiles] = React.useState([]);
  const [allFilesLoading, setAllFilesLoading] = React.useState(false);
  const [docUploadOrderId, setDocUploadOrderId] = React.useState('');
  const [uploadingDoc, setUploadingDoc] = React.useState(false);
  const docFileInputRef = React.useRef(null);

  const refreshStudentData = React.useCallback(() => {
    setOrdersLoading(true);
    return fetch('/api/student/data')
      .then(async r => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'Unable to load your dashboard');
        return data;
      })
      .then(data => {
        setOrders(data.orders ?? []);
        setProfileData({ name: data.profile?.name || userName || '', email: data.profile?.email || '' });
        if (data.profile?.vertical) setViewerVertical(data.profile.vertical);
        setOrdersError(null);
      })
      .catch(e => setOrdersError(e.message))
      .finally(() => setOrdersLoading(false));
  }, []);

  React.useEffect(() => { refreshStudentData(); }, [refreshStudentData]);

  React.useEffect(() => {
    let cancelled = false;
    fetch('/api/wallet/balance', { credentials: 'same-origin' })
      .then(async r => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || 'Unable to load wallet');
        if (!cancelled) setWalletSummary({ available: Number(data.available || 0), pending: Number(data.pending || 0) });
      })
      .catch(() => !cancelled && setWalletSummary({ available: 0, pending: 0 }));
    return () => { cancelled = true; };
  }, []);

  const goToRoute = React.useCallback((href) => {
    if (typeof window !== 'undefined') window.location.href = href;
  }, []);

  const loadAttorneyChats = React.useCallback(() => {
    return fetch('/api/client/attorney-chats')
      .then(async r => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'Unable to load attorney chats');
        setAttorneyChats(data.chats || []);
        return data.chats || [];
      })
      .catch(e => {
        setActionNotice(e.message);
        return [];
      });
  }, []);

  React.useEffect(() => { loadAttorneyChats(); }, [loadAttorneyChats]);

  const loadAttorneyChat = React.useCallback(async chatId => {
    if (!chatId) return;
    setAttorneyChatLoading(true);
    try {
      const res = await fetch(`/api/client/attorney-chats/${chatId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to load attorney chat');
      setAttorneyChatData(data);
    } catch (e) {
      setActionNotice(e.message);
    } finally {
      setAttorneyChatLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (!selectedAttorneyChatId) {
      setAttorneyChatData(null);
      return undefined;
    }
    loadAttorneyChat(selectedAttorneyChatId);
    if (page !== 'messages') return undefined;
    const interval = setInterval(() => loadAttorneyChat(selectedAttorneyChatId), 6000);
    return () => clearInterval(interval);
  }, [selectedAttorneyChatId, loadAttorneyChat, page]);

  React.useEffect(() => {
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      refreshStudentData();
    }, 30000);
    return () => clearInterval(interval);
  }, [refreshStudentData]);

  // Keep selectedOrder in sync with the latest orders payload
  React.useEffect(() => {
    if (!selectedOrder) return;
    const fresh = orders.find(o => o.id === selectedOrder.id);
    if (fresh && fresh !== selectedOrder) setSelectedOrder(fresh);
  }, [orders, selectedOrder]);

  const filteredOrders = orderFilter === 'all' ? orders : orders.filter(o => o.status === orderFilter);
  const activeOrders = orders.filter(o => o.status === 'active' || o.status === 'review').length;
  const completedOrders = orders.filter(o => o.status === 'completed').length;

  const loadMessagesFor = React.useCallback(async order => {
    if (!order?.id) return;
    setMessagesLoading(true);
    try {
      const res = await fetch(`/api/student/messages?orderId=${encodeURIComponent(order.id)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to load messages');
      setMessages((data.messages ?? []).map(m => ({
        id: m.id,
        from: m.sender_role === 'client' ? 'student' : 'consultant',
        text: m.body,
        name: order.consultant,
        created_at: m.created_at,
        time: new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      })));
      setConsultantOffers(data.offers ?? []);
    } catch (e) {
      setActionNotice(e.message);
    } finally {
      setMessagesLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (!selectedOrder) {
      setMessages([]);
      setConsultantOffers([]);
      return undefined;
    }
    loadMessagesFor(selectedOrder);
    if (page !== 'messages' && page !== 'order-detail') return undefined;
    const interval = setInterval(() => loadMessagesFor(selectedOrder), 6000);
    return () => clearInterval(interval);
  }, [selectedOrder, loadMessagesFor, page]);

  const sendMessage = async (file) => {
    const text = msgInput.trim();
    if ((!text && !file) || !selectedOrder?.id) return;
    setMsgInput('');
    try {
      let res;
      if (file) {
        const form = new FormData();
        form.append('orderId', selectedOrder.id);
        form.append('body', text);
        form.append('file', file);
        res = await fetch('/api/student/messages', { method: 'POST', body: form });
      } else {
        res = await fetch('/api/student/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId: selectedOrder.id, body: text }),
        });
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to send message');
      const m = data.message;
      setMessages(prev => [...prev, {
        id: m.id,
        from: 'student',
        text: m.body,
        created_at: m.created_at,
        time: new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }]);
    } catch (e) {
      setMsgInput(text);
      setActionNotice(e.message);
    } finally {
      if (orderMessageFileRef.current) orderMessageFileRef.current.value = '';
    }
  };

  const sendAttorneyChatMessage = async (file) => {
    const text = msgInput.trim();
    if ((!text && !file) || !selectedAttorneyChatId) return;
    setMsgInput('');
    try {
      let res;
      if (file) {
        const form = new FormData();
        form.append('body', text);
        form.append('file', file);
        res = await fetch(`/api/client/attorney-chats/${selectedAttorneyChatId}/messages`, { method: 'POST', body: form });
      } else {
        res = await fetch(`/api/client/attorney-chats/${selectedAttorneyChatId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body: text }),
        });
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to send message');
      await loadAttorneyChat(selectedAttorneyChatId);
      await loadAttorneyChats();
    } catch (e) {
      setMsgInput(text);
      setActionNotice(e.message);
    } finally {
      if (attorneyChatFileRef.current) attorneyChatFileRef.current.value = '';
    }
  };

  const acceptAttorneyOffer = offer => {
    const sourceType = offer.source_type || (offer.platform_fee != null ? 'attorney_offer' : 'unified_offer');
    const subtotal = Number(offer.price || 0);
    const total = subtotal + Number(offer.platform_fee || 0);
    setCheckoutRequest({
      sourceType,
      sourceId: offer.id,
      title: offer.title,
      description: offer.description,
      total,
      currency: offer.currency || 'usd',
      onSuccess: async () => {
        await loadAttorneyChats();
        if (selectedAttorneyChatId) await loadAttorneyChat(selectedAttorneyChatId);
      },
    });
  };

  const declineAttorneyOffer = async offerId => {
    try {
      let res = await fetch(`/api/offers/${offerId}/decline`, { method: 'POST' });
      let data = await res.json().catch(() => null);
      if (!res.ok) {
        res = await fetch(`/api/offers/${offerId}/decline`, { method: 'PATCH' });
        data = await res.json().catch(() => null);
      }
      if (!res.ok) throw new Error(data?.error?.message || data?.error || 'Could not decline offer.');
      await loadAttorneyChat(selectedAttorneyChatId);
    } catch (e) {
      setActionNotice(e.message);
    }
  };

  const acceptConsultantOffer = offer => {
    setCheckoutRequest({
      sourceType: offer.source_type || 'consultant_offer',
      sourceId: offer.id,
      title: offer.title,
      description: offer.description,
      total: Number(offer.price || 0),
      currency: offer.currency || 'usd',
      onSuccess: async () => {
        await refreshStudentData();
        await loadMessagesFor(selectedOrder);
      },
    });
  };

  const declineConsultantOffer = async offerId => {
    try {
      let res = await fetch(`/api/consultant/offers/${offerId}/decline`, { method: 'POST' });
      let data = await res.json().catch(() => null);
      if (!res.ok) {
        res = await fetch(`/api/offers/${offerId}/decline`, { method: 'PATCH' });
        data = await res.json().catch(() => null);
      }
      if (!res.ok) throw new Error(data?.error?.message || data?.error || 'Could not decline offer.');
      await loadMessagesFor(selectedOrder);
    } catch (e) {
      setActionNotice(e.message);
    }
  };

  const loadOrderFiles = React.useCallback(async order => {
    if (!order?.id) return;
    setFilesLoading(true);
    try {
      const res = await fetch(`/api/student/orders/${order.id}/files`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to load files');
      setOrderFiles(data.files || []);
    } catch (e) {
      setActionNotice(e.message);
    } finally {
      setFilesLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (selectedOrder) loadOrderFiles(selectedOrder);
    else setOrderFiles([]);
  }, [selectedOrder, loadOrderFiles]);

  const uploadOrderFile = async file => {
    if (!file || !selectedOrder?.id) return;
    setUploadingOrderFile(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`/api/student/orders/${selectedOrder.id}/files`, { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setOrderFiles(prev => [data.file, ...prev]);
      setActionNotice(`Uploaded ${data.file.name}.`);
    } catch (e) {
      setActionNotice(e.message);
    } finally {
      setUploadingOrderFile(false);
      if (orderFileInputRef.current) orderFileInputRef.current.value = '';
    }
  };

  const deleteOrderFile = async fileId => {
    if (!selectedOrder?.id || !fileId) return;
    if (typeof window !== 'undefined' && !window.confirm('Delete this file?')) return;
    try {
      const res = await fetch(`/api/student/orders/${selectedOrder.id}/files?fileId=${encodeURIComponent(fileId)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to delete file');
      setOrderFiles(prev => prev.filter(f => f.id !== fileId));
    } catch (e) {
      setActionNotice(e.message);
    }
  };

  const refreshAllFiles = React.useCallback(() => {
    setAllFilesLoading(true);
    return fetch('/api/student/files')
      .then(async r => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'Unable to load files');
        setAllFiles(data.files || []);
      })
      .catch(e => setActionNotice(e.message))
      .finally(() => setAllFilesLoading(false));
  }, []);

  React.useEffect(() => {
    if (page === 'documents') refreshAllFiles();
  }, [page, refreshAllFiles]);

  const uploadDocToOrder = async file => {
    if (!file) return;
    if (!docUploadOrderId) {
      setActionNotice('Pick an order to upload to.');
      return;
    }
    setUploadingDoc(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`/api/student/orders/${docUploadOrderId}/files`, { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setActionNotice(`Uploaded ${data.file.name}.`);
      await refreshAllFiles();
    } catch (e) {
      setActionNotice(e.message);
    } finally {
      setUploadingDoc(false);
      if (docFileInputRef.current) docFileInputRef.current.value = '';
    }
  };

  const deleteDocFile = async file => {
    if (!file?.id || !file?.order_id) return;
    if (typeof window !== 'undefined' && !window.confirm(`Delete ${file.name}?`)) return;
    try {
      const res = await fetch(`/api/student/orders/${file.order_id}/files?fileId=${encodeURIComponent(file.id)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to delete file');
      setAllFiles(prev => prev.filter(f => f.id !== file.id));
    } catch (e) {
      setActionNotice(e.message);
    }
  };

  // ── SIDEBAR ──
  const Sidebar = () => (
    <div className="yousafe-sidebar" style={{
      width: '240px', flexShrink: 0, background: C.surface, borderRight: `1px solid ${C.border}`,
      display: 'flex', flexDirection: 'column', height: '100vh', position: 'sticky', top: 0,
    }}>
      <div style={{ padding: '22px 18px', borderBottom: `1px solid ${C.border}` }}>
        <a href="https://yousafeconsultancy.com" aria-label="Back to Yousafe Consultancy" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }}>
          <span style={{ width: '28px', height: '28px', borderRadius: '6px', background: C.cyan, color: '#fff', fontFamily: C.serif, fontWeight: 600, fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Y</span>
          <span style={{ fontFamily: C.serif, fontSize: '17px', color: C.text, letterSpacing: '0.005em' }}>YouSafe</span>
        </a>
        <div style={{ marginTop: '4px', color: C.textDim, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.14em', fontWeight: 700 }}>Student portal</div>
      </div>
      <div className="yousafe-sidebar-nav" style={{ padding: '12px 8px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <NavItem icon="⬛" label="Dashboard" active={page === 'dashboard'} onClick={() => setPage('dashboard')} />
        <NavItem icon="🏬" label="Marketplace" active={typeof window !== 'undefined' && window.location.pathname === '/marketplace'} onClick={() => goToRoute('/marketplace')} />
        <NavItem icon="📦" label="My Orders" active={page === 'orders'} onClick={() => setPage('orders')} badge={activeOrders > 0 ? activeOrders : null} />
        <NavItem icon="🛒" label="Browse Services" active={page === 'services'} onClick={() => setPage('services')} />
        <NavItem icon="⚖️" label="Find an Attorney" active={page === 'attorneys'} onClick={() => setPage('attorneys')} />
        <NavItem icon="📥" label="My Inquiries" active={page === 'inquiries'} onClick={() => setPage('inquiries')} />
        <NavItem icon="💬" label="Messages" active={page === 'messages'} onClick={() => setPage('messages')} />
        <NavItem icon="📋" label="Documents" active={page === 'documents'} onClick={() => setPage('documents')} />
        <div style={{ height: '1px', background: C.border, margin: '8px 6px' }} />
        <NavItem icon="💳" label="Billing" active={page === 'billing'} onClick={() => setPage('billing')} />
        <NavItem icon="⚙️" label="Settings" active={page === 'settings'} onClick={() => setPage('settings')} />
      </div>
      <div className="yousafe-sidebar-user" style={{ padding: '12px', borderTop: `1px solid ${C.border}` }}>
        <div style={{ marginBottom: '8px', padding: '8px 10px', borderRadius: '10px', background: C.surface2, border: `1px solid ${C.border}`, color: C.text, fontSize: '12px', fontWeight: 800 }}>
          Wallet: {formatMoney(walletSummary.available, 'usd')}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', borderRadius: '10px', background: C.surface2 }}>
          <Avatar name={profileData.name || 'Student'} size={32} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profileData.name || 'Student'}</div>
            <div style={{ fontSize: '11px', color: C.textMuted }}>Student</div>
          </div>
          <button
            type="button"
            onClick={onLogout}
            aria-label="Log out and return to Yousafe Consultancy"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              border: `1px solid ${C.border}`,
              borderRadius: '8px',
              background: C.surface,
              color: C.textMuted,
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 700,
              padding: '7px 9px',
              whiteSpace: 'nowrap',
            }}
            title="Log out"
          >
            <span style={{ fontSize: '14px', lineHeight: 1 }}>⏻</span>
            <span>Logout</span>
          </button>
        </div>
      </div>
    </div>
  );

  // ── TOPBAR ──
  const TopBar = ({ title }) => (
    <div className="yousafe-topbar" style={{
      height: '60px', background: C.surface, borderBottom: `1px solid ${C.border}`,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 28px', position: 'sticky', top: 0, zIndex: 10,
    }}>
      <h1 style={{ fontSize: '16px', fontWeight: 700, color: C.text }}>{title}</h1>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <LanguageSelector placement="inline" />
        <div style={{ position: 'relative' }}>
          <button onClick={() => setNotifOpen(!notifOpen)} style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: '8px', padding: '7px 10px', cursor: 'pointer', color: C.textMuted, fontSize: '16px' }}>🔔</button>
          {notifOpen && (
            <div className="yousafe-notification-menu" style={{ position: 'absolute', right: 0, top: '44px', width: '300px', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)', zIndex: 100 }}>
              <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}`, fontSize: '13px', fontWeight: 700 }}>Notifications</div>
              <div style={{ padding: '28px 16px', textAlign: 'center', color: C.textMuted, fontSize: '13px' }}>No notifications yet.</div>
            </div>
          )}
        </div>
        <UserMenu
          name={profileData.name || 'Student'}
          role="Student"
          email={profileData.email}
          onNavigate={setPage}
          onLogout={onLogout}
          items={[
            { label: 'Profile settings', icon: '⚙️', action: () => setPage('settings') },
            { label: 'My orders', icon: '📦', action: () => setPage('orders') },
            { label: 'Billing wallet', icon: '💳', action: () => setPage('billing') },
            { label: 'Messages', icon: '💬', action: () => setPage('messages') },
          ]}
        />
      </div>
    </div>
  );

  // ── DASHBOARD ──
  const Dashboard = () => (
    <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <div style={{ color: C.textMuted, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.14em', fontWeight: 700, marginBottom: '4px' }}>Today</div>
        <h2 style={{ fontFamily: C.serif, fontSize: '34px', fontWeight: 500, marginBottom: '6px', letterSpacing: '-0.012em', color: C.text }}>Welcome back{profileData.name ? `, ${profileData.name.split(' ').slice(-2, -1)[0] || profileData.name.split(' ')[0]}` : ''}.</h2>
        <p style={{ color: C.textMuted, fontSize: '14px' }}>
          {activeOrders > 0 ? `You have ${activeOrders} active order${activeOrders !== 1 ? 's' : ''} in progress.` : 'Browse services and place your first order to get started.'}
        </p>
      </div>
      {/* Stats — only shown once there's real activity */}
      {orders.length > 0 && (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
        <StatCard label="Active Orders" value={activeOrders} icon="📦" color={C.cyan} />
        <StatCard label="Completed" value={completedOrders} icon="✅" color={C.green} />
      </div>
      )}
      {/* Active Orders */}
      <section>
        <div style={sectionHeaderRow}>
          <div>
            <div style={sectionEyebrow}>Active</div>
            <h3 style={sectionHeading}>Orders in motion</h3>
          </div>
          <Btn variant="ghost" size="sm" onClick={() => setPage('orders')}>View all →</Btn>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {orders.filter(o => o.status !== 'completed').length === 0 && (
            <Card style={{ padding: '20px', textAlign: 'center', color: C.textMuted, fontSize: '14px' }}>
              Nothing in progress right now. Browse services or submit an inquiry to start.
            </Card>
          )}
          {orders.filter(o => o.status !== 'completed').map(order => (
            <Card key={order.id} style={{ padding: '18px 20px', cursor: 'pointer' }} hover onClick={() => { setSelectedOrder(order); setPage('order-detail'); }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                <Avatar name={order.consultant} size={42} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '6px' }}>
                    <div>
                      <div style={{ fontFamily: C.serif, fontWeight: 500, fontSize: '17px', color: C.text, lineHeight: 1.25, letterSpacing: '-0.005em' }}>{order.service}</div>
                      <div style={{ color: C.textMuted, fontSize: '12px', marginTop: '2px' }}>with {order.consultant}</div>
                    </div>
                    <StatusBadge status={order.status} />
                  </div>
                  <ProgressBar value={order.progress} style={{ marginTop: '8px' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '12px', color: C.textMuted }}>
                    <span>{order.deliverable}</span>
                    <span>{order.progress}%</span>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* Quick actions */}
      <section>
        <div style={sectionHeaderRow}>
          <div>
            <div style={sectionEyebrow}>Shortcuts</div>
            <h3 style={sectionHeading}>Quick actions</h3>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
          {[
            { icon: '⚖️', label: 'Find an attorney', sub: 'Browse the legal panel', action: () => setPage('attorneys') },
            { icon: '🛒', label: 'Browse services', sub: 'Study-abroad catalogue', action: () => setPage('services') },
            { icon: '📥', label: 'New inquiry', sub: 'Describe your case', action: () => setPage('inquiries') },
            { icon: '📋', label: 'Documents', sub: 'Securely shared files', action: () => setPage('documents') },
            { icon: '💳', label: 'Billing', sub: 'Receipts and methods', action: () => setPage('billing') },
          ].map(({ icon, label, sub, action }) => (
            <QuickActionTile key={label} icon={icon} label={label} sub={sub} onClick={action} />
          ))}
        </div>
      </section>
    </div>
  );

  // ── ORDERS LIST ──
  const OrdersList = () => (
    <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={sectionEyebrow}>Engagements</div>
          <h2 style={{ fontFamily: C.serif, fontSize: '32px', fontWeight: 500, color: C.text, letterSpacing: '-0.012em', margin: '0 0 6px' }}>My orders.</h2>
          <p style={{ color: C.textMuted, fontSize: '13px', margin: 0 }}>{orders.length} total · {activeOrders} in progress · {completedOrders} completed</p>
        </div>
        <Btn variant="primary" size="sm" onClick={() => setPage('services')}>+ New order</Btn>
      </div>
      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {['all', 'active', 'review', 'pending', 'completed'].map(f => (
          <button key={f} onClick={() => setOrderFilter(f)} style={{
            padding: '7px 16px', borderRadius: '999px',
            border: `1px solid ${orderFilter === f ? 'rgba(0,0,0,0.18)' : C.border}`,
            background: orderFilter === f ? C.surface : 'transparent',
            color: orderFilter === f ? C.text : C.textMuted,
            fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit',
            fontWeight: orderFilter === f ? 600 : 500,
            transition: 'all 0.15s', textTransform: 'capitalize',
            letterSpacing: '0.01em',
          }}>{f}</button>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {filteredOrders.length === 0 && (
          <Card style={{ padding: '32px', textAlign: 'center', color: C.textMuted, fontSize: '14px' }}>
            No orders match this filter.
          </Card>
        )}
        {filteredOrders.map(order => (
          <Card key={order.id} hover style={{ padding: '20px 22px', cursor: 'pointer' }} onClick={() => { setSelectedOrder(order); setPage('order-detail'); }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
              <Avatar name={order.consultant} size={44} />
              <div style={{ flex: 1, minWidth: '200px' }}>
                <div style={{ fontFamily: C.serif, fontWeight: 500, fontSize: '18px', color: C.text, lineHeight: 1.2, letterSpacing: '-0.005em', marginBottom: '2px' }}>{order.service}</div>
                <div style={{ color: C.textMuted, fontSize: '12px' }}>{order.orderNumber || order.id} · with {order.consultant} · {order.date}</div>
                <ProgressBar value={order.progress} style={{ marginTop: '10px', maxWidth: '260px' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-end' }}>
                <StatusBadge status={order.status} />
                <span style={{ fontFamily: C.serif, fontSize: '20px', color: C.text }}>{order.price}</span>
                {order.messages > 0 && <Badge color="red" style={{ fontSize: '11px' }}>{order.messages} new</Badge>}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );

  // ── ORDER DETAIL ──
  const OrderDetail = ({ order }) => {
    const timeline = [
      { label: 'Order placed', date: order.date || '—', done: true },
      { label: 'Consultant assigned', date: order.consultantId ? 'Assigned' : 'Pending', done: Boolean(order.consultantId) },
      { label: 'Working on deliverable', date: 'In progress', done: (order.progress || 0) >= 40 },
      { label: 'Sent for review', date: order.deadline || '—', done: (order.progress || 0) >= 90 },
      { label: 'Completed', date: order.status === 'completed' ? 'Done' : '—', done: order.status === 'completed' },
    ];
    const orderTimeline = buildOfferTimeline(messages, consultantOffers);
    return (
      <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div>
          <button onClick={() => setPage('orders')} style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: '13px', fontFamily: 'inherit', padding: 0, marginBottom: '10px' }}>← Back to orders</button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <h2 style={{ fontFamily: C.serif, fontSize: '28px', fontWeight: 500, color: C.text, letterSpacing: '-0.012em', margin: 0 }}>{order.service}</h2>
            <StatusBadge status={order.status} />
          </div>
          <div style={{ color: C.textMuted, fontSize: '12px', marginTop: '4px' }}>{order.orderNumber || order.id} · started {order.date}</div>
        </div>
        <div className="yousafe-mobile-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '20px' }}>
          {/* Main */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Progress */}
            <Card>
              <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '16px' }}>Progress</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '13px', color: C.textMuted }}>Overall completion</span>
                <span style={{ fontSize: '13px', fontWeight: 700, color: C.cyan }}>{order.progress}%</span>
              </div>
              <ProgressBar value={order.progress} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '20px' }}>
                {timeline.map((t, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: t.done ? C.cyan : C.surface3, border: `2px solid ${t.done ? C.cyan : C.border2}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: t.done ? '#000' : C.textDim, fontWeight: 700, flexShrink: 0 }}>{t.done ? '✓' : ''}</div>
                    <span style={{ flex: 1, fontSize: '14px', color: t.done ? C.text : C.textMuted }}>{t.label}</span>
                    <span style={{ fontSize: '12px', color: C.textDim }}>{t.date}</span>
                  </div>
                ))}
              </div>
            </Card>
            {/* Escrow approval */}
            {order.status === 'review' && (
              <EscrowApprovalCard order={order} />
            )}
            {/* Messages */}
            <Card style={{ padding: '20px' }}>
              <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '16px' }}>Messages</div>
              <div className="yousafe-message-scroll" style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '260px', overflowY: 'auto', marginBottom: '16px' }}>
                {orderTimeline.map((item, i) => item.kind === 'offer' ? (
                  <OfferBubble key={item.key} mine={false} createdAt={item.created_at}>
                    <ConsultantOfferCard offer={item.offer} onAccept={() => acceptConsultantOffer(item.offer)} onDecline={() => declineConsultantOffer(item.offer.id)} />
                  </OfferBubble>
                ) : (
                  <div key={item.key || i} style={{ display: 'flex', gap: '10px', flexDirection: item.message.from === 'student' ? 'row-reverse' : 'row' }}>
                    {item.message.from === 'consultant' && <Avatar name={item.message.name} size={30} />}
                    <div style={{ maxWidth: '70%' }}>
                      <div style={{
                        padding: '10px 14px', borderRadius: '12px', fontSize: '14px', lineHeight: 1.5,
                        background: item.message.from === 'student' ? C.studentMessageBg : C.surface2,
                        color: item.message.from === 'student' ? C.studentMessageText : C.text,
                        border: item.message.from === 'student' ? `1px solid ${C.studentMessageBorder}` : 'none',
                      }}><MessageBody body={item.message.text} linkColor={item.message.from === 'student' ? C.studentMessageText : C.cyan} /></div>
                      <div style={{ fontSize: '11px', color: C.textDim, marginTop: '4px', textAlign: item.message.from === 'student' ? 'right' : 'left' }}>{item.message.time}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="yousafe-message-composer" style={{ display: 'flex', gap: '8px' }}>
                <input ref={orderMessageFileRef} type="file" style={{ display: 'none' }} onChange={e => sendMessage(e.target.files?.[0])} />
                <Btn variant="secondary" size="sm" onClick={() => orderMessageFileRef.current?.click()}>Attach</Btn>
                <input className="yousafe-message-input" value={msgInput} onChange={e => setMsgInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendMessage()}
                  placeholder="Type a message…"
                  style={{ flex: 1, padding: '10px 14px', background: C.surface2, border: `1px solid ${C.border2}`, borderRadius: '10px', color: C.text, fontSize: '14px', fontFamily: 'inherit', outline: 'none' }} />
                <Btn variant="primary" size="sm" onClick={sendMessage}>Send</Btn>
              </div>
            </Card>
          </div>
          {/* Sidebar info */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <Card style={{ padding: '20px' }}>
              <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '16px' }}>Order Details</div>
              {[['Order #', order.orderNumber || order.id], ['Date placed', order.date], ['Price', order.price], ['Deliverable', order.deliverable]].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${C.border}`, fontSize: '13px' }}>
                  <span style={{ color: C.textMuted }}>{k}</span>
                  <span style={{ color: C.text, fontWeight: 600 }}>{v}</span>
                </div>
              ))}
            </Card>
            <OrderRatingPrompt orderId={order.id} />
            <Card style={{ padding: '20px' }}>
              <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '14px' }}>Your Consultant</div>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <Avatar name={order.consultant} size={44} />
                <div>
                  <div style={{ fontWeight: 700, fontSize: '14px' }}>{order.consultant}</div>
                  <div style={{ color: C.textMuted, fontSize: '12px' }}>Senior Consultant</div>
                  <div style={{ color: C.cyan, fontSize: '12px', marginTop: '2px' }}>⭐ 4.9 (128 reviews)</div>
                </div>
              </div>
              <Btn variant="secondary" fullWidth size="sm" style={{ marginTop: '14px' }} onClick={() => setPage('messages')}>Send message</Btn>
            </Card>
            <Card style={{ padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <div style={{ fontWeight: 700, fontSize: '14px' }}>Documents</div>
                <button
                  type="button"
                  onClick={() => orderFileInputRef.current?.click()}
                  disabled={uploadingOrderFile}
                  style={{ background: C.surface2, border: `1px solid ${C.border2}`, borderRadius: '8px', padding: '6px 10px', cursor: uploadingOrderFile ? 'not-allowed' : 'pointer', color: C.text, fontSize: '12px', fontWeight: 600, opacity: uploadingOrderFile ? 0.6 : 1 }}
                >
                  {uploadingOrderFile ? 'Uploading…' : '+ Upload'}
                </button>
                <input
                  ref={orderFileInputRef}
                  type="file"
                  style={{ display: 'none' }}
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) uploadOrderFile(f);
                  }}
                />
              </div>
              {filesLoading && orderFiles.length === 0 && (
                <div style={{ color: C.textMuted, fontSize: '13px' }}>Loading files…</div>
              )}
              {!filesLoading && orderFiles.length === 0 && (
                <div style={{ color: C.textMuted, fontSize: '13px', lineHeight: 1.6 }}>No files yet. Share transcripts, IDs, or supporting docs with your consultant here.</div>
              )}
              {orderFiles.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {orderFiles.map((f, i) => {
                    const sizeKb = f.size_bytes ? Math.max(1, Math.round(f.size_bytes / 1024)) : null;
                    const date = f.created_at ? new Date(f.created_at).toLocaleDateString() : '';
                    const mine = f.uploader_role === 'client';
                    return (
                      <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 0', borderBottom: i < orderFiles.length - 1 ? `1px solid ${C.border}` : 'none', fontSize: '13px' }}>
                        <span style={{ flexShrink: 0 }}>📄</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: C.text }}>{f.name}</div>
                          <div style={{ fontSize: '11px', color: C.textDim }}>
                            {mine ? 'You' : f.uploader_name || 'Consultant'}{sizeKb ? ` · ${sizeKb} KB` : ''}{date ? ` · ${date}` : ''}
                          </div>
                        </div>
                        {f.url && (
                          <a href={f.url} target="_blank" rel="noreferrer" style={{ color: C.cyan, fontSize: '12px', fontWeight: 600, textDecoration: 'none' }}>Open</a>
                        )}
                        {mine && (
                          <button onClick={() => deleteOrderFile(f.id)} title="Delete" style={{ background: 'none', border: 'none', color: C.red, cursor: 'pointer', fontSize: '14px', padding: '0 4px' }}>×</button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              <div style={{ marginTop: '12px', fontSize: '11px', color: C.textDim, lineHeight: 1.5 }}>
                Files are stored privately. Links expire after 10 minutes — they're regenerated each time the order is opened.
              </div>
            </Card>
          </div>
        </div>
      </div>
    );
  };

  // ── SERVICES BROWSE ──
  const ServicesBrowse = React.useMemo(() => function ServicesBrowse() {
    const [catFilter, setCatFilter] = React.useState('All');
    const [cart, setCart] = React.useState(null);
    const [selectedService, setSelectedService] = React.useState(null);
    const [showCheckout, setShowCheckout] = React.useState(false);
    const [services, setServices] = React.useState([]);
    const [servicesLoading, setServicesLoading] = React.useState(true);
    const [servicesError, setServicesError] = React.useState(null);
    const [primaryCurrency, setPrimaryCurrency] = React.useState('usd');
    const [usdToCadRate, setUsdToCadRate] = React.useState(1.37);
    const [displayCurrency, setDisplayCurrency] = React.useState(() => {
      if (typeof window === 'undefined') return null;
      try { return window.localStorage.getItem('yousafe.displayCurrency') || null; } catch { return null; }
    });
    const effectiveDisplayCurrency = (displayCurrency || primaryCurrency || 'usd').toLowerCase();
    const setAndPersistDisplayCurrency = c => {
      const next = c.toLowerCase();
      setDisplayCurrency(next);
      try { window.localStorage.setItem('yousafe.displayCurrency', next); } catch { /* ignore */ }
    };
    const convertPrice = (amount, fromCurrency = 'usd') => {
      const from = String(fromCurrency || 'usd').toLowerCase();
      const to = effectiveDisplayCurrency;
      const value = Number(amount || 0);
      if (from === to) return value;
      if (from === 'usd' && to === 'cad') return value * usdToCadRate;
      if (from === 'cad' && to === 'usd') return value / (usdToCadRate || 1);
      return value;
    };
    const [payMethod, setPayMethod] = React.useState('stripe'); // 'stripe' | 'wallet' | 'saved_card'
    const [savedCards, setSavedCards] = React.useState([]);
    const [cardsLoading, setCardsLoading] = React.useState(false);
    const [selectedCardId, setSelectedCardId] = React.useState('');
    const [walletBalance, setWalletBalance] = React.useState(null);
    const [paying, setPaying] = React.useState(false);
    const [payError, setPayError] = React.useState(null);
    const [acceptedTerms, setAcceptedTerms] = React.useState(false);
    const [acceptedRefundPolicy, setAcceptedRefundPolicy] = React.useState(false);
    const requiresAck = payMethod === 'wallet' || payMethod === 'saved_card';
    const ackComplete = !requiresAck || (acceptedTerms && acceptedRefundPolicy);
    const categories = ['All', ...Array.from(new Set(services.map(s => s.category || 'General')))];
    const filtered = catFilter === 'All' ? services : services.filter(s => (s.category || 'General') === catFilter);
    const openCheckoutForService = service => {
      const details = getServiceDetails(service);
      setCart({ ...service, title: details.label, serviceDetails: details, icon: serviceIcon(service.category) });
      setSelectedService(null);
      setShowCheckout(true);
      setPayError(null);
    };

    React.useEffect(() => {
      setServicesLoading(true);
      // Scope the catalogue to the viewer's vertical so a legal-vertical
      // user (came in via legal.yousafeconsultancy.com intake) only sees
      // legal services, not the study-abroad consultancy catalogue.
      const url = viewerVertical && viewerVertical !== 'study_abroad'
        ? `/api/services?vertical=${encodeURIComponent(viewerVertical)}`
        : '/api/services';
      fetch(url)
        .then(async r => {
          const d = await r.json();
          if (!r.ok) throw new Error(d.error || 'Unable to load services');
          setServices(d.services ?? []);
          if (d.primaryCurrency) setPrimaryCurrency(String(d.primaryCurrency).toLowerCase());
          const rate = Number(d.rates?.usd_to_cad);
          if (Number.isFinite(rate) && rate > 0) setUsdToCadRate(rate);
          setServicesError(null);
        })
        .catch(e => setServicesError(e.message))
        .finally(() => setServicesLoading(false));
    }, [viewerVertical]);

    // Fetch wallet balance when checkout opens
    React.useEffect(() => {
      if (!showCheckout) return;
      fetch('/api/wallet/balance')
        .then(r => r.json())
        .then(d => setWalletBalance(d.available?.usd ?? 0))
        .catch(() => setWalletBalance(0));

      setCardsLoading(true);
      fetch('/api/wallet/payment-methods')
        .then(r => r.json())
        .then(d => {
          const cards = d.cards ?? [];
          setSavedCards(cards);
          setSelectedCardId(current => current || cards[0]?.id || '');
        })
        .catch(() => setSavedCards([]))
        .finally(() => setCardsLoading(false));
    }, [showCheckout]);

    if (showCheckout && cart) {
      const priceNum = Number(cart.price || 0);
      const amountCents = priceNum * 100;
      const serviceCurrency = 'usd';
      const displayPriceNum = effectiveDisplayCurrency === 'cad' ? convertPrice(priceNum, 'usd') : priceNum;
      const canUseWallet = walletBalance !== null && walletBalance >= priceNum;
      const selectedCard = savedCards.find(card => card.id === selectedCardId);
      const canUseSavedCard = Boolean(selectedCardId);

      const handleWalletPay = async () => {
        if (!ackComplete) {
          setPayError('Please confirm the Terms of Service and Refund Policy before paying.');
          return;
        }
        setPaying(true); setPayError(null);
        try {
          const res = await fetch('/api/checkout/wallet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: cart.title,
              amountCents,
              serviceId: cart.id,
              acceptedTerms: true,
              acceptedRefundPolicy: true,
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Payment failed');
          setShowCheckout(false); setCart(null); setOrderPlaced(true);
          refreshStudentData();
          setTimeout(() => setOrderPlaced(false), 6000);
        } catch (e) {
          setPayError(e.message);
        } finally { setPaying(false); }
      };

      const handleSavedCardPay = async () => {
        if (!selectedCardId) {
          setPayError('Choose a saved card first.');
          return;
        }
        if (!ackComplete) {
          setPayError('Please confirm the Terms of Service and Refund Policy before paying.');
          return;
        }

        setPaying(true); setPayError(null);
        try {
          const res = await fetch('/api/checkout/card', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              serviceId: cart.id,
              paymentMethodId: selectedCardId,
              acceptedTerms: true,
              acceptedRefundPolicy: true,
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Payment failed');

          if (data.requiresAction) {
            if (!STRIPE_PUB_KEY) throw new Error('Stripe is not configured.');
            const stripe = await loadStripe(STRIPE_PUB_KEY);
            if (!stripe) throw new Error('Unable to load Stripe.');
            const result = await stripe.confirmCardPayment(data.clientSecret);
            if (result.error) throw new Error(result.error.message);

            const completeRes = await fetch('/api/checkout/card', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ paymentIntentId: data.paymentIntentId }),
            });
            const completeData = await completeRes.json();
            if (!completeRes.ok) throw new Error(completeData.error || 'Payment confirmation failed');
          }

          setShowCheckout(false); setCart(null); setOrderPlaced(true);
          refreshStudentData();
          setTimeout(() => setOrderPlaced(false), 6000);
        } catch (e) {
          setPayError(e.message);
        } finally { setPaying(false); }
      };

      return (
        <div style={{ padding: '28px', maxWidth: '560px' }}>
          <Btn variant="ghost" size="sm" onClick={() => { setShowCheckout(false); setPayError(null); }} style={{ marginBottom: '20px' }}>← Back to services</Btn>
          <h2 style={{ fontSize: '20px', fontWeight: 800, marginBottom: '24px' }}>Checkout</h2>
          {/* Service summary */}
          <Card style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
              <div style={{ fontSize: '32px' }}>{cart.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: '15px' }}>{cart.title}</div>
                <div style={{ color: C.textMuted, fontSize: '13px', marginTop: '4px' }}>{cart.category || 'General'}</div>
                <div style={{ fontSize: '12px', color: C.textMuted, marginTop: '8px' }}>⏱ {deliveryLabel(cart.delivery_days)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '20px', fontWeight: 800, color: C.cyan }}>
                  {formatMoney(displayPriceNum, effectiveDisplayCurrency)}
                  <span style={{ fontSize: '11px', fontWeight: 700, color: C.textMuted, marginLeft: '4px' }}>{effectiveDisplayCurrency.toUpperCase()}</span>
                </div>
                <div style={{ fontSize: '11px', color: C.textDim, marginTop: '2px' }}>
                  {effectiveDisplayCurrency === 'cad'
                    ? `≈ ${formatMoney(priceNum, 'usd')} · charged in USD`
                    : 'charged in USD'}
                </div>
              </div>
            </div>
          </Card>
          {/* Payment method selector */}
          <Card style={{ marginBottom: '16px' }}>
            <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '14px' }}>Choose payment method</div>
            {/* Wallet option */}
            <div
              onClick={() => canUseWallet && setPayMethod('wallet')}
              style={{
                padding: '14px', borderRadius: '12px', border: `2px solid ${payMethod === 'wallet' ? C.cyan : C.border}`,
                background: payMethod === 'wallet' ? `${C.cyan}10` : C.surface2,
                cursor: canUseWallet ? 'pointer' : 'not-allowed', opacity: canUseWallet ? 1 : 0.5,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px',
              }}
            >
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <span style={{ fontSize: '20px' }}>💰</span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '14px' }}>Pay with Wallet</div>
                  <div style={{ fontSize: '12px', color: C.textMuted }}>
                    Balance: {walletBalance === null ? '…' : `$${walletBalance.toFixed(2)}`}
                    {!canUseWallet && walletBalance !== null && <span style={{ color: '#EF4444', marginLeft: '6px' }}>— insufficient</span>}
                  </div>
                </div>
              </div>
              {payMethod === 'wallet' && <span style={{ color: C.cyan, fontWeight: 700 }}>✓</span>}
            </div>
            {/* Saved card option */}
            <div
              onClick={() => canUseSavedCard && setPayMethod('saved_card')}
              style={{
                padding: '14px', borderRadius: '12px', border: `2px solid ${payMethod === 'saved_card' ? C.cyan : C.border}`,
                background: payMethod === 'saved_card' ? `${C.cyan}10` : C.surface2,
                cursor: canUseSavedCard ? 'pointer' : 'not-allowed', opacity: canUseSavedCard ? 1 : 0.55,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px',
              }}
            >
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <span style={{ fontSize: '20px' }}>💳</span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '14px' }}>Pay with Saved Card</div>
                  <div style={{ fontSize: '12px', color: C.textMuted }}>
                    {cardsLoading ? 'Loading saved cards…' : selectedCard ? `${selectedCard.brand?.toUpperCase?.() || 'CARD'} ending ${selectedCard.last4}` : 'No saved cards yet'}
                  </div>
                </div>
              </div>
              {payMethod === 'saved_card' && <span style={{ color: C.cyan, fontWeight: 700 }}>✓</span>}
            </div>
            {payMethod === 'saved_card' && savedCards.length > 0 && (
              <div style={{ display: 'grid', gap: '8px', margin: '-2px 0 10px 0' }}>
                {savedCards.map(card => (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => setSelectedCardId(card.id)}
                    style={{
                      width: '100%', padding: '11px 12px', borderRadius: '999px', border: `1px solid ${selectedCardId === card.id ? C.cyan : C.border}`,
                      background: selectedCardId === card.id ? `${C.cyan}0f` : '#fff', display: 'flex', justifyContent: 'space-between',
                      alignItems: 'center', cursor: 'pointer', color: C.text, gap: '10px',
                    }}
                  >
                    <span style={{ width: '20px', height: '20px', borderRadius: '999px', border: `2px solid ${selectedCardId === card.id ? C.cyan : C.border2}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {selectedCardId === card.id && <span style={{ width: '10px', height: '10px', borderRadius: '999px', background: C.cyan }} />}
                    </span>
                    <span style={{ fontSize: '13px', fontWeight: 700, flex: 1, textAlign: 'left' }}>{card.brand?.toUpperCase?.() || 'CARD'} •••• {card.last4}</span>
                    <span style={{ fontSize: '12px', color: C.textMuted }}>Exp {card.exp_month}/{card.exp_year}</span>
                  </button>
                ))}
              </div>
            )}
            {/* Stripe option */}
            <div
              onClick={() => setPayMethod('stripe')}
              style={{
                padding: '14px', borderRadius: '12px', border: `2px solid ${payMethod === 'stripe' ? C.cyan : C.border}`,
                background: payMethod === 'stripe' ? `${C.cyan}10` : C.surface2,
                cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}
            >
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <span style={{ fontSize: '20px' }}>💳</span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '14px' }}>Stripe Hosted Checkout</div>
                  <div style={{ fontSize: '12px', color: C.textMuted }}>Open the secure hosted payment page</div>
                </div>
              </div>
              {payMethod === 'stripe' && <span style={{ color: C.cyan, fontWeight: 700 }}>✓</span>}
            </div>
          </Card>
          {/* Order summary */}
          <Card style={{ marginBottom: '24px' }}>
            <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '14px' }}>Order summary</div>
            {[
              ['Service', cart.title],
              ['Delivery', deliveryLabel(cart.delivery_days)],
              ['Currency', `${effectiveDisplayCurrency.toUpperCase()}${effectiveDisplayCurrency === 'cad' && Number.isFinite(usdToCadRate) ? ` · 1 USD ≈ ${usdToCadRate.toFixed(2)} CAD` : ''}`],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${C.border}`, fontSize: '13px' }}>
                <span style={{ color: C.textMuted }}>{k}</span>
                <span style={{ fontWeight: 600 }}>{v}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', fontSize: '16px', fontWeight: 800 }}>
              <span>Total</span>
              <span style={{ color: C.cyan, textAlign: 'right' }}>
                {formatMoney(displayPriceNum, effectiveDisplayCurrency)}
                <span style={{ fontSize: '11px', fontWeight: 700, color: C.textMuted, marginLeft: '4px' }}>{effectiveDisplayCurrency.toUpperCase()}</span>
                {effectiveDisplayCurrency === 'cad' && (
                  <div style={{ fontSize: '11px', color: C.textDim, fontWeight: 600, marginTop: '2px' }}>
                    ≈ {formatMoney(priceNum, 'usd')} · charged in USD
                  </div>
                )}
              </span>
            </div>
          </Card>
          {payError && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '10px', padding: '10px 14px', fontSize: '13px', color: '#EF4444', marginBottom: '14px' }}>⚠ {payError}</div>}
          {requiresAck && (
            <Card style={{ marginBottom: '14px', padding: '16px' }}>
              <div style={{ fontWeight: 700, fontSize: '13px', marginBottom: '10px' }}>Required: review and accept</div>
              <label style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', fontSize: '13px', color: C.text, marginBottom: '8px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={e => setAcceptedTerms(e.target.checked)}
                  style={{ marginTop: '3px' }}
                />
                <span>
                  I have read and agree to the{' '}
                  <a href={TERMS_URL} target="_blank" rel="noreferrer" style={{ color: C.cyan, fontWeight: 600 }}>Terms of Service</a>.
                </span>
              </label>
              <label style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', fontSize: '13px', color: C.text, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={acceptedRefundPolicy}
                  onChange={e => setAcceptedRefundPolicy(e.target.checked)}
                  style={{ marginTop: '3px' }}
                />
                <span>
                  I have read and accept the{' '}
                  <a href={REFUND_POLICY_URL} target="_blank" rel="noreferrer" style={{ color: C.cyan, fontWeight: 600 }}>Refund Policy</a>.
                </span>
              </label>
            </Card>
          )}
          {payMethod === 'wallet' ? (
            <Btn variant="primary" fullWidth size="lg" onClick={handleWalletPay} disabled={paying || !canUseWallet || !ackComplete}>
              {paying ? 'Processing…' : !ackComplete ? 'Accept Terms & Refund Policy to continue' : `Pay ${formatMoney(displayPriceNum, effectiveDisplayCurrency)} from Wallet`}
            </Btn>
          ) : payMethod === 'saved_card' ? (
            <Btn variant="primary" fullWidth size="lg" onClick={handleSavedCardPay} disabled={paying || !canUseSavedCard || !ackComplete}>
              {paying ? 'Processing…' : !ackComplete ? 'Accept Terms & Refund Policy to continue' : selectedCard ? `Pay ${formatMoney(displayPriceNum, effectiveDisplayCurrency)} with •••• ${selectedCard.last4}` : 'Choose a saved card'}
            </Btn>
          ) : (
            <Btn variant="primary" fullWidth size="lg" disabled={paying} onClick={async () => {
              setPaying(true); setPayError(null);
              try {
                const res = await fetch('/api/checkout/service', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ serviceId: cart.id }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Checkout failed');
                window.location.href = data.url;
              } catch (e) {
                setPayError(e.message);
                setPaying(false);
              }
            }}>
              {paying ? 'Opening checkout…' : `Pay ${formatMoney(displayPriceNum, effectiveDisplayCurrency)} with Stripe →`}
            </Btn>
          )}
          <p style={{ fontSize: '12px', color: C.textDim, textAlign: 'center', marginTop: '12px' }}>
            Funds held in escrow until you approve delivery. Full refund if no consultant is assigned.
          </p>
        </div>
      );
    }

    return (
      <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div>
          <div style={sectionEyebrow}>Catalogue</div>
          <h2 style={{ fontFamily: C.serif, fontSize: '32px', fontWeight: 500, color: C.text, letterSpacing: '-0.012em', margin: '0 0 6px' }}>Browse services.</h2>
          <p style={{ color: C.textMuted, fontSize: '13px', margin: 0, maxWidth: '560px' }}>
            Expert support at every stage of your study-abroad journey. Funds held in escrow until you approve the deliverable.
            {' '}
            <span style={{ color: C.cyan, fontWeight: 700 }}>
              Prices shown in {effectiveDisplayCurrency.toUpperCase()}
              {effectiveDisplayCurrency === 'cad' && Number.isFinite(usdToCadRate) ? ` (1 USD ≈ ${usdToCadRate.toFixed(2)} CAD)` : ''}.
            </span>
          </p>
        </div>
        {orderPlaced && (
          <div style={{ background: `${C.green}15`, border: `1px solid ${C.green}33`, borderRadius: '12px', padding: '16px', display: 'flex', gap: '12px', alignItems: 'center' }}>
            <span style={{ fontSize: '20px' }}>✅</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: '14px', color: C.green }}>Order placed! Payment held in escrow.</div>
              <div style={{ fontSize: '13px', color: C.textMuted }}>Funds are safe. A consultant will be assigned within 24 hours. You release payment on approval.</div>
            </div>
            <Btn variant="ghost" size="sm" onClick={() => setPage('orders')}>View order →</Btn>
          </div>
        )}
        {/* Category filter + currency selector */}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {categories.map(c => (
              <button key={c} onClick={() => setCatFilter(c)} style={{
                padding: '6px 16px', borderRadius: '20px', border: `1px solid ${catFilter === c ? C.cyan : C.border}`,
                background: catFilter === c ? `${C.cyan}18` : C.surface2,
                color: catFilter === c ? C.cyan : C.textMuted,
                fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: catFilter === c ? 600 : 400, transition: 'all 0.15s',
              }}>{c}</button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: C.textMuted, fontWeight: 600 }}>Show prices in</span>
            <div style={{ display: 'inline-flex', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: '999px', padding: '3px' }}>
              {[
                { value: 'usd', label: 'USD' },
                { value: 'cad', label: 'CAD' },
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setAndPersistDisplayCurrency(opt.value)}
                  style={{
                    padding: '5px 14px',
                    borderRadius: '999px',
                    border: 'none',
                    background: effectiveDisplayCurrency === opt.value ? C.cyan : 'transparent',
                    color: effectiveDisplayCurrency === opt.value ? '#fff' : C.textMuted,
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    transition: 'all 0.15s',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
          {servicesLoading && <div style={{ color: C.textMuted, fontSize: '14px', padding: '20px' }}>Loading services…</div>}
          {servicesError && <div style={{ color: C.red, fontSize: '14px', padding: '20px' }}>{servicesError}</div>}
          {!servicesLoading && !servicesError && filtered.length === 0 && <div style={{ color: C.textMuted, fontSize: '14px', padding: '20px' }}>No active services are available yet.</div>}
          {filtered.map(s => {
            const details = getServiceDetails(s);
            const deliverablePreview = details.deliverables?.slice(0, 2) || [];
            return (
            <Card key={s.id} onClick={() => setSelectedService(s)} style={{ display: 'flex', flexDirection: 'column', gap: '14px', position: 'relative', minHeight: '276px' }}>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <div style={{ fontSize: '28px' }}>{serviceIcon(s.category)}</div>
                <Badge color="gray" style={{ fontSize: '11px', marginTop: '4px' }}>{s.category || 'General'}</Badge>
              </div>
              <div>
                <div style={{ fontFamily: C.serif, fontWeight: 600, fontSize: '20px', lineHeight: 1.15, letterSpacing: '-0.006em', marginBottom: '8px', color: C.text }}>{details.label}</div>
                <div style={{ color: C.textMuted, fontSize: '13px', lineHeight: 1.55 }}>{details.summary}</div>
              </div>
              <div style={{ display: 'grid', gap: '6px', color: C.textMuted, fontSize: '12px', lineHeight: 1.35 }}>
                {deliverablePreview.map(item => (
                  <div key={item} style={{ display: 'flex', gap: '7px' }}>
                    <span style={{ color: C.green, fontWeight: 800 }}>✓</span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: '12px', color: C.textDim }}>⏱ {deliveryLabel(s.delivery_days)} · 🔒 Escrow protected · 💱 {effectiveDisplayCurrency.toUpperCase()}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 'auto', gap: '12px' }}>
                <div style={{ minWidth: 0 }}>
                  {(() => {
                    const usdValue = Number(s.price || 0);
                    const displayed = effectiveDisplayCurrency === 'cad'
                      ? convertPrice(s.price, 'usd')
                      : usdValue;
                    return (
                      <>
                        <div style={{ fontSize: '20px', fontWeight: 800, color: C.cyan, lineHeight: 1.05 }}>
                          {formatMoney(displayed, effectiveDisplayCurrency)}
                          <span style={{ fontSize: '11px', fontWeight: 700, color: C.textMuted, marginLeft: '4px' }}>
                            {effectiveDisplayCurrency.toUpperCase()}
                          </span>
                        </div>
                        <div style={{ fontSize: '11px', color: C.textDim, marginTop: '3px' }}>
                          {effectiveDisplayCurrency === 'cad'
                            ? `≈ ${formatMoney(usdValue, 'usd')} · charged in USD`
                            : 'one-time package · charged in USD'}
                        </div>
                      </>
                    );
                  })()}
                </div>
                <Btn variant="primary" size="sm" onClick={e => { e.stopPropagation(); openCheckoutForService(s); }}>View & buy</Btn>
              </div>
            </Card>
          )})}
        </div>
        {selectedService && (() => {
          const details = getServiceDetails(selectedService);
          const displayed = effectiveDisplayCurrency === 'cad' ? convertPrice(selectedService.price, 'usd') : Number(selectedService.price || 0);
          return (
            <div style={{ position: 'fixed', inset: 0, zIndex: 80, display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                aria-label="Close service details"
                onClick={() => setSelectedService(null)}
                style={{ flex: 1, border: 'none', background: 'rgba(31,41,55,0.28)', cursor: 'pointer' }}
              />
              <aside
                role="dialog"
                aria-modal="true"
                aria-label={`${details.label} service details`}
                style={{
                  width: 'min(460px, 100vw)',
                  height: '100vh',
                  background: C.surface,
                  boxShadow: '-24px 0 60px rgba(15,18,32,0.18)',
                  display: 'flex',
                  flexDirection: 'column',
                  borderLeft: `1px solid ${C.border}`,
                }}
              >
                <div style={{ padding: '22px 24px 18px', borderBottom: `1px solid ${C.border}`, display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                  <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: C.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', flex: '0 0 auto' }}>
                    {serviceIcon(selectedService.category)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Badge color="gray" style={{ fontSize: '11px', marginBottom: '8px' }}>{selectedService.category || 'General'}</Badge>
                    <h3 style={{ fontFamily: C.serif, fontSize: '28px', fontWeight: 600, color: C.text, letterSpacing: '-0.012em', lineHeight: 1.08, margin: 0 }}>{details.label}</h3>
                    <div style={{ color: C.textMuted, fontSize: '13px', marginTop: '8px' }}>{selectedService.title !== details.label ? selectedService.title : 'YouSafe service package'}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedService(null)}
                    style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.textMuted, borderRadius: '999px', width: '34px', height: '34px', cursor: 'pointer', fontSize: '18px', lineHeight: 1 }}
                    aria-label="Close"
                  >
                    ×
                  </button>
                </div>
                <div style={{ padding: '22px 24px 120px', overflowY: 'auto', flex: 1 }}>
                  <div style={{ color: C.text, fontSize: '14px', lineHeight: 1.7, marginBottom: '22px' }}>{details.summary}</div>
                  <div style={{ display: 'grid', gap: '16px' }}>
                    <section>
                      <div style={{ fontSize: '12px', color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 800, marginBottom: '10px' }}>Deliverables</div>
                      <div style={{ display: 'grid', gap: '9px' }}>
                        {details.deliverables.map(item => (
                          <div key={item} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: '12px', padding: '11px 12px' }}>
                            <span style={{ color: C.green, fontWeight: 900, lineHeight: 1.3 }}>✓</span>
                            <span style={{ color: C.text, fontSize: '13px', lineHeight: 1.45 }}>{item}</span>
                          </div>
                        ))}
                      </div>
                    </section>
                    <section style={{ display: 'grid', gap: '10px' }}>
                      <div style={{ fontSize: '12px', color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 800 }}>Expected timeline</div>
                      <div style={{ border: `1px solid ${C.border}`, borderRadius: '12px', padding: '14px', background: '#fff' }}>
                        <div style={{ fontWeight: 800, fontSize: '14px', color: C.text, marginBottom: '4px' }}>{deliveryLabel(selectedService.delivery_days)}</div>
                        <div style={{ color: C.textMuted, fontSize: '13px', lineHeight: 1.55 }}>{details.timeline}</div>
                      </div>
                    </section>
                    <section style={{ display: 'grid', gap: '10px' }}>
                      <div style={{ fontSize: '12px', color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 800 }}>Best for</div>
                      <div style={{ color: C.textMuted, fontSize: '13px', lineHeight: 1.6 }}>{details.bestFor}</div>
                    </section>
                    <section style={{ border: `1px solid rgba(217,119,6,0.22)`, background: 'rgba(217,119,6,0.06)', borderRadius: '12px', padding: '14px' }}>
                      <div style={{ fontWeight: 800, color: C.orange, fontSize: '13px', marginBottom: '5px' }}>Before you order</div>
                      <div style={{ color: C.textMuted, fontSize: '12px', lineHeight: 1.55 }}>
                        Timelines begin after you complete intake and upload requested documents. Government, school, employer, or third-party decisions are not guaranteed.
                      </div>
                    </section>
                  </div>
                </div>
                <div style={{ position: 'sticky', bottom: 0, padding: '16px 24px 20px', borderTop: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.96)', backdropFilter: 'blur(10px)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'center', marginBottom: '12px' }}>
                    <div>
                      <div style={{ color: C.textMuted, fontSize: '12px', fontWeight: 700 }}>Package price ({effectiveDisplayCurrency.toUpperCase()})</div>
                      <div style={{ color: C.text, fontSize: '13px' }}>
                        Escrow protected · {effectiveDisplayCurrency === 'cad'
                          ? `≈ ${formatMoney(Number(selectedService.price || 0), 'usd')} charged in USD`
                          : 'charged in USD'}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '22px', fontWeight: 900, color: C.cyan }}>{formatMoney(displayed, effectiveDisplayCurrency)}</div>
                      <div style={{ color: C.textDim, fontSize: '11px', fontWeight: 700, marginTop: '2px' }}>
                        {effectiveDisplayCurrency === 'cad' && Number.isFinite(usdToCadRate) ? `1 USD ≈ ${usdToCadRate.toFixed(2)} CAD` : 'Live USD'}
                      </div>
                    </div>
                  </div>
                  <Btn variant="primary" size="lg" fullWidth onClick={() => openCheckoutForService(selectedService)}>
                    Buy now
                  </Btn>
                </div>
              </aside>
            </div>
          );
        })()}
      </div>
    );
  }, [viewerVertical, orderPlaced, refreshStudentData]);

  // ── DOCUMENTS ──
  const Documents = () => {
    const groups = React.useMemo(() => {
      const map = new Map();
      for (const f of allFiles) {
        const key = f.order_id;
        if (!map.has(key)) map.set(key, { orderId: key, title: f.order_title || 'Order', files: [] });
        map.get(key).files.push(f);
      }
      return Array.from(map.values());
    }, [allFiles]);

    const triggerUpload = () => {
      if (orders.length === 0) {
        setActionNotice('Place an order before uploading documents.');
        return;
      }
      if (!docUploadOrderId) setDocUploadOrderId(orders[0].id);
      docFileInputRef.current?.click();
    };

    return (
      <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <div style={sectionEyebrow}>Files</div>
            <h2 style={{ fontFamily: C.serif, fontSize: '32px', fontWeight: 500, color: C.text, letterSpacing: '-0.012em', margin: '0 0 6px' }}>Documents.</h2>
            <p style={{ color: C.textMuted, fontSize: '13px', margin: 0 }}>All files shared with consultants across your orders.</p>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            {orders.length > 0 && (
              <select
                value={docUploadOrderId || orders[0]?.id || ''}
                onChange={e => setDocUploadOrderId(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: '10px', border: `1px solid ${C.border2}`, background: C.surface2, color: C.text, fontSize: '13px', fontFamily: 'inherit' }}
              >
                {orders.map(o => (
                  <option key={o.id} value={o.id}>{o.service} · {o.id.slice(0, 8)}</option>
                ))}
              </select>
            )}
            <Btn variant="primary" size="sm" onClick={triggerUpload} disabled={uploadingDoc}>
              {uploadingDoc ? 'Uploading…' : '+ Upload'}
            </Btn>
            <input
              ref={docFileInputRef}
              type="file"
              style={{ display: 'none' }}
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) uploadDocToOrder(f);
              }}
            />
          </div>
        </div>

        {allFilesLoading && allFiles.length === 0 && (
          <Card style={{ padding: '24px', color: C.textMuted, fontSize: '14px', textAlign: 'center' }}>Loading documents…</Card>
        )}

        {!allFilesLoading && allFiles.length === 0 && (
          <Card style={{ padding: '32px', textAlign: 'center' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>📄</div>
            <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '6px' }}>No documents yet</div>
            <div style={{ fontSize: '13px', color: C.textMuted, lineHeight: 1.6, maxWidth: '380px', margin: '0 auto' }}>
              {orders.length === 0
                ? 'Place an order from Browse Services to start exchanging files with your consultant.'
                : 'Upload transcripts, IDs, or supporting docs to share them with your consultant.'}
            </div>
          </Card>
        )}

        {groups.map(group => (
          <Card key={group.orderId} style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '14px' }}>{group.title}</div>
                <div style={{ fontSize: '12px', color: C.textMuted }}>{group.files.length} file{group.files.length === 1 ? '' : 's'}</div>
              </div>
              <Btn variant="ghost" size="sm" onClick={() => {
                const order = orders.find(o => o.id === group.orderId);
                if (order) { setSelectedOrder(order); setPage('order-detail'); }
              }}>Open order →</Btn>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {group.files.map((f, i) => {
                const sizeKb = f.size_bytes ? Math.max(1, Math.round(f.size_bytes / 1024)) : null;
                const date = f.created_at ? new Date(f.created_at).toLocaleDateString() : '';
                return (
                  <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 0', borderBottom: i < group.files.length - 1 ? `1px solid ${C.border}` : 'none', fontSize: '13px' }}>
                    <span style={{ flexShrink: 0 }}>📄</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: C.text }}>{f.name}</div>
                      <div style={{ fontSize: '11px', color: C.textDim }}>
                        {f.is_mine ? 'You' : f.uploader_name || 'Consultant'}{sizeKb ? ` · ${sizeKb} KB` : ''}{date ? ` · ${date}` : ''}
                      </div>
                    </div>
                    {f.url && <a href={f.url} target="_blank" rel="noreferrer" style={{ color: C.cyan, fontSize: '12px', fontWeight: 600, textDecoration: 'none' }}>Open</a>}
                    {f.is_mine && <button onClick={() => deleteDocFile(f)} title="Delete" style={{ background: 'none', border: 'none', color: C.red, cursor: 'pointer', fontSize: '14px', padding: '0 4px' }}>×</button>}
                  </div>
                );
              })}
            </div>
          </Card>
        ))}
      </div>
    );
  };

  // Billing is declared at module top-level so its component identity is stable
  // across StudentApp re-renders (otherwise StripePaymentSection remounts on
  // every poll tick and the saved-cards loader never settles).

  // ── SETTINGS ──
  const Settings = () => {
    const [notifs, setNotifs] = React.useState({ messages: true, orders: true, promo: false });
    const parsedName = React.useMemo(() => splitDisplayName(profileData.name || userName || ''), []);
    const [profile, setProfile] = React.useState({ ...parsedName, email: profileData.email || '', phone: '' });
    const [savingProfile, setSavingProfile] = React.useState(false);
    const [profileError, setProfileError] = React.useState('');
    const saveProfile = async () => {
      setSavingProfile(true);
      setProfileError('');
      try {
        const res = await fetch('/api/profile', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(profile),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not save profile.');
        setProfileData({ name: data.profile?.full_name || '', email: data.profile?.email || profile.email });
        setActionNotice('Profile changes saved.');
      } catch (e) {
        setProfileError(e.message);
      } finally {
        setSavingProfile(false);
      }
    };
    React.useEffect(() => {
      const nextName = splitDisplayName(profileData.name || userName || '');
      setProfile(p => ({
        ...p,
        salutation: p.salutation || nextName.salutation,
        first_name: p.first_name || nextName.first_name,
        last_name: p.last_name || nextName.last_name,
        email: p.email || profileData.email || '',
      }));
    }, [profileData.name, profileData.email]);
    return (
      <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '720px' }}>
        <div>
          <div style={sectionEyebrow}>Account</div>
          <h2 style={{ fontFamily: C.serif, fontSize: '32px', fontWeight: 500, color: C.text, letterSpacing: '-0.012em', margin: '0 0 6px' }}>Settings.</h2>
        </div>
        <Card>
          <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '20px' }}>Profile</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
            <Avatar name={profileData.name || 'User'} size={60} />
            <div>
              <div style={{ fontWeight: 700 }}>{profileData.name || 'Add your name'}</div>
              <div style={{ color: C.textMuted, fontSize: '13px', marginTop: '2px' }}>{profileData.email || 'Email appears here'}</div>
              <Btn variant="secondary" size="sm" style={{ marginTop: '8px' }} onClick={() => setActionNotice('Student avatar upload is ready for profile storage wiring.')}>Change photo</Btn>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {profileError && <div style={{ color: C.red, fontSize: '13px' }}>{profileError}</div>}
            <Select
              label="Preferred salutation"
              value={profile.salutation}
              onChange={v => setProfile(p => ({ ...p, salutation: v }))}
              options={[
                { value: '', label: 'No salutation' },
                { value: 'Mr.', label: 'Mr.' },
                { value: 'Mrs.', label: 'Mrs.' },
                { value: 'Ms.', label: 'Ms.' },
                { value: 'Mx.', label: 'Mx.' },
                { value: 'Dr.', label: 'Dr.' },
                { value: 'Prof.', label: 'Prof.' },
              ]}
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <Input label="First name" value={profile.first_name} onChange={v => setProfile(p => ({ ...p, first_name: v }))} />
              <Input label="Last name" value={profile.last_name} onChange={v => setProfile(p => ({ ...p, last_name: v }))} />
            </div>
            <Input label="Email" type="email" value={profile.email} onChange={v => setProfile(p => ({ ...p, email: v }))} />
            <Input label="Phone" value={profile.phone} onChange={v => setProfile(p => ({ ...p, phone: v }))} placeholder="+44 7700 000000" />
            <Btn variant="primary" size="sm" style={{ alignSelf: 'flex-start' }} disabled={savingProfile} onClick={saveProfile}>{savingProfile ? 'Saving...' : 'Save changes'}</Btn>
          </div>
        </Card>
        <Card>
          <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '20px' }}>Notifications</div>
          {[['messages', 'New messages from consultants'], ['orders', 'Order status updates'], ['promo', 'Promotions and offers']].map(([key, label]) => (
            <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${C.border}` }}>
              <span style={{ fontSize: '14px' }}>{label}</span>
              <button onClick={() => setNotifs(n => ({ ...n, [key]: !n[key] }))} style={{
                width: '44px', height: '24px', borderRadius: '99px', border: 'none', cursor: 'pointer',
                background: notifs[key] ? C.cyan : C.surface3, position: 'relative', transition: 'background 0.2s',
              }}>
                <div style={{ position: 'absolute', top: '3px', left: notifs[key] ? '22px' : '3px', width: '18px', height: '18px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
              </button>
            </div>
          ))}
        </Card>
        <Card>
          <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '16px' }}>Password</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <Input label="Current password" type="password" value="" onChange={() => {}} placeholder="••••••••" />
            <Input label="New password" type="password" value="" onChange={() => {}} placeholder="••••••••" />
            <Btn variant="secondary" size="sm" style={{ alignSelf: 'flex-start' }} onClick={() => setActionNotice('Password update requested. Connect Clerk account management to complete this securely.')}>Update password</Btn>
          </div>
        </Card>
      </div>
    );
  };

  const StudentMessages = () => {
    const conversations = [
      ...attorneyChats.map(c => ({ type: 'attorney', id: c.id, name: c.attorney_name, sub: c.last_message || 'Attorney profile chat', avatar: c.headshot_url, presence: c.presence, pending: c.pending_offers })),
      ...orders.map(o => ({ type: 'order', id: o.id, name: o.consultant, sub: o.service, order: o, pending: o.messages })),
    ];
    const currentAttorneyChat = attorneyChatData?.chat;
    const currentMessages = attorneyChatData?.messages || [];
    const currentOffers = attorneyChatData?.offers || [];
    const attorneyTimeline = buildOfferTimeline(currentMessages, currentOffers);
    const orderTimeline = buildOfferTimeline(messages, consultantOffers);
    return (
      <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 800 }}>Messages</h2>
        <div className="yousafe-mobile-stack yousafe-message-layout" style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '20px', height: 'calc(100vh - 180px)' }}>
          <div className="yousafe-conversation-list" style={{ background: C.surface, borderRadius: '16px', border: `1px solid ${C.border}`, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '14px', borderBottom: `1px solid ${C.border}`, fontSize: '13px', fontWeight: 700, color: C.textMuted }}>CONVERSATIONS</div>
            {conversations.length === 0 && (
              <div style={{ padding: '24px 16px', color: C.textMuted, fontSize: '13px', lineHeight: 1.5 }}>No conversations yet. Open an attorney profile to start a chat, or place an order to message a consultant.</div>
            )}
            {conversations.map(c => {
              const active = c.type === 'attorney' ? selectedAttorneyChatId === c.id : selectedOrder?.id === c.id;
              return (
                <button
                  key={`${c.type}-${c.id}`}
                  type="button"
                  onClick={() => {
                    if (c.type === 'attorney') { setSelectedAttorneyChatId(c.id); setSelectedOrder(null); }
                    else { setSelectedOrder(c.order); setSelectedAttorneyChatId(null); }
                  }}
                  style={{ width: '100%', padding: '14px', display: 'flex', gap: '10px', cursor: 'pointer', background: active ? C.surface2 : 'transparent', border: 'none', borderBottom: `1px solid ${C.border}`, textAlign: 'left', fontFamily: 'inherit', color: C.text }}
                >
                  <Avatar name={c.name} src={c.avatar} size={36} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                    <div style={{ fontSize: '12px', color: C.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.sub}</div>
                    {c.type === 'attorney' && <div style={{ fontSize: '11px', color: c.presence === 'online' ? C.green : C.textDim, marginTop: '2px' }}>{c.presence === 'online' ? '● Online' : '○ Offline'}</div>}
                  </div>
                  {c.pending > 0 && <Badge color="red" style={{ fontSize: '10px', alignSelf: 'flex-start', padding: '1px 6px' }}>{c.pending}</Badge>}
                </button>
              );
            })}
          </div>

          {selectedAttorneyChatId ? (
            <Card className="yousafe-message-thread" style={{ display: 'flex', flexDirection: 'column', padding: '0', overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', gap: '12px', alignItems: 'center' }}>
                <Avatar name={currentAttorneyChat?.attorney_name || 'Attorney'} src={currentAttorneyChat?.headshot_url} size={38} />
                <div>
                  <div style={{ fontWeight: 800, fontSize: '14px' }}>{currentAttorneyChat?.attorney_name || 'Attorney'}</div>
                  <div style={{ fontSize: '12px', color: currentAttorneyChat?.presence === 'online' ? C.green : C.textDim }}>
                    {currentAttorneyChat?.presence === 'online' ? '● Online' : currentAttorneyChat?.last_seen ? `○ Last seen ${new Date(currentAttorneyChat.last_seen).toLocaleString()}` : '○ Offline'}
                  </div>
                </div>
              </div>
              <div className="yousafe-message-scroll" style={{ flex: 1, padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {attorneyChatLoading && attorneyTimeline.length === 0 && <div style={{ color: C.textMuted, fontSize: '13px' }}>Loading chat...</div>}
                {attorneyTimeline.map((item) => item.kind === 'offer' ? (
                  <OfferBubble key={item.key} mine={false} createdAt={item.created_at}>
                    <AttorneyOfferCard offer={item.offer} onAccept={() => acceptAttorneyOffer(item.offer)} onDecline={() => declineAttorneyOffer(item.offer.id)} />
                  </OfferBubble>
                ) : (
                  <ChatBubble key={item.key} message={item.message} mine={item.message.sender_role === 'client'} />
                ))}
              </div>
              <div className="yousafe-message-composer" style={{ padding: '16px', borderTop: `1px solid ${C.border}`, display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input ref={attorneyChatFileRef} type="file" style={{ display: 'none' }} onChange={e => sendAttorneyChatMessage(e.target.files?.[0])} />
                <Btn variant="secondary" size="sm" onClick={() => attorneyChatFileRef.current?.click()}>Attach</Btn>
                <input className="yousafe-message-input" value={msgInput} onChange={e => setMsgInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendAttorneyChatMessage()}
                  placeholder="Type a message…"
                  style={{ flex: 1, padding: '10px 14px', background: C.surface2, border: `1px solid ${C.border2}`, borderRadius: '10px', color: C.text, fontSize: '14px', fontFamily: 'inherit', outline: 'none' }} />
                <Btn variant="primary" size="sm" onClick={() => sendAttorneyChatMessage()}>Send</Btn>
              </div>
            </Card>
          ) : selectedOrder ? (
            <Card className="yousafe-message-thread" style={{ display: 'flex', flexDirection: 'column', padding: '0', overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', gap: '12px', alignItems: 'center' }}>
                <Avatar name={selectedOrder.consultant} size={36} />
                <div>
                  <div style={{ fontWeight: 700, fontSize: '14px' }}>{selectedOrder.consultant}</div>
                  <div style={{ fontSize: '12px', color: C.green }}>● Online</div>
                </div>
              </div>
              <div className="yousafe-message-scroll" style={{ flex: 1, padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {orderTimeline.map((item, i) => item.kind === 'offer' ? (
                <OfferBubble key={item.key} mine={false} createdAt={item.created_at}>
                  <ConsultantOfferCard offer={item.offer} onAccept={() => acceptConsultantOffer(item.offer)} onDecline={() => declineConsultantOffer(item.offer.id)} />
                </OfferBubble>
              ) : (
                  <div key={item.key || i} style={{ display: 'flex', gap: '10px', flexDirection: item.message.from === 'student' ? 'row-reverse' : 'row' }}>
                    {item.message.from === 'consultant' && <Avatar name={item.message.name} size={30} />}
                    <div style={{ maxWidth: '60%' }}>
                      <div style={{ padding: '10px 14px', borderRadius: '12px', fontSize: '14px', lineHeight: 1.5, background: item.message.from === 'student' ? C.studentMessageBg : C.surface2, color: item.message.from === 'student' ? C.studentMessageText : C.text, border: item.message.from === 'student' ? `1px solid ${C.studentMessageBorder}` : 'none' }}><MessageBody body={item.message.text} linkColor={item.message.from === 'student' ? C.studentMessageText : C.cyan} /></div>
                      <div style={{ fontSize: '11px', color: C.textDim, marginTop: '4px', textAlign: item.message.from === 'student' ? 'right' : 'left' }}>{item.message.time}</div>
                    </div>
                </div>
              ))}
            </div>
              <div className="yousafe-message-composer" style={{ padding: '16px', borderTop: `1px solid ${C.border}`, display: 'flex', gap: '8px' }}>
                <input ref={orderMessageFileRef} type="file" style={{ display: 'none' }} onChange={e => sendMessage(e.target.files?.[0])} />
                <Btn variant="secondary" size="sm" onClick={() => orderMessageFileRef.current?.click()}>Attach</Btn>
                <input className="yousafe-message-input" value={msgInput} onChange={e => setMsgInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendMessage()} placeholder="Type a message…" style={{ flex: 1, padding: '10px 14px', background: C.surface2, border: `1px solid ${C.border2}`, borderRadius: '10px', color: C.text, fontSize: '14px', fontFamily: 'inherit', outline: 'none' }} />
                <Btn variant="primary" size="sm" onClick={sendMessage}>Send</Btn>
              </div>
            </Card>
          ) : (
            <Card style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textMuted, fontSize: '14px' }}>
              Select a conversation.
            </Card>
          )}
        </div>
      </div>
    );
  };

  // ── RENDER ──
  return (
    <div className="yousafe-dashboard-shell" style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: C.bg }}>
      <Sidebar />
      <div className="yousafe-dashboard-main" style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        <TopBar title={{
          dashboard: 'Dashboard', orders: 'My Orders', services: 'Browse Services',
          messages: 'Messages', documents: 'Documents', billing: 'Billing', settings: 'Settings',
          'order-detail': 'Order Details',
        }[page] || 'Dashboard'} />
        <div className="yousafe-dashboard-body" style={{ flex: 1, display: 'flex', alignItems: 'flex-start', minWidth: 0 }}>
          <div className="yousafe-dashboard-content" style={{ flex: 1, minWidth: 0 }}>
          {actionNotice && (
            <div style={{ margin: '16px 28px 0', padding: '12px 14px', background: `${C.cyan}10`, border: `1px solid ${C.cyan}33`, borderRadius: '10px', color: C.cyan, fontSize: '13px', display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
              <span>{actionNotice}</span>
              <button onClick={() => setActionNotice('')} style={{ background: 'none', border: 'none', color: C.cyan, cursor: 'pointer', fontWeight: 800 }}>×</button>
            </div>
          )}
          {page === 'dashboard' && <Dashboard />}
          {page === 'orders' && <OrdersList />}
          {page === 'order-detail' && selectedOrder && <OrderDetail order={selectedOrder} />}
          {page === 'services' && <ServicesBrowse />}
          {page === 'attorneys' && <FindAttorney />}
          {page === 'inquiries' && <MyInquiries />}
          {page === 'documents' && <Documents />}
          {page === 'billing' && <Billing />}
          {page === 'settings' && <Settings />}
          {page === 'messages' && StudentMessages()}
          </div>
          <DashboardRightPane role="student" />
        </div>
      </div>
      {checkoutRequest && (
        <OrderCheckoutDialog
          request={checkoutRequest}
          onClose={() => setCheckoutRequest(null)}
          onPaid={async (orderId) => {
            setOrderPlaced(true);
            setActionNotice(`Payment successful. Order ${orderId || ''} is ready for the provider to start.`);
            await checkoutRequest.onSuccess?.(orderId);
            await refreshStudentData();
            setTimeout(() => setOrderPlaced(false), 6000);
          }}
        />
      )}
    </div>
  );
}

function isOfferSystemMessage(message) {
  const body = String(message?.body || message?.text || '')
  return /^(New offer from|New consultant offer:|Custom offer:)/i.test(body.trim())
}

function itemTime(item) {
  const raw = item?.created_at || item?.message?.created_at || item?.offer?.created_at
  const ts = raw ? new Date(raw).getTime() : 0
  return Number.isFinite(ts) ? ts : 0
}

function buildOfferTimeline(messages = [], offers = []) {
  const hasOffers = offers.length > 0
  return [
    ...messages
      .filter(message => !(hasOffers && isOfferSystemMessage(message)))
      .map(message => ({ kind: 'message', key: `message-${message.id || itemTime({ message })}`, message, created_at: message.created_at })),
    ...offers.map(offer => ({ kind: 'offer', key: `offer-${offer.id}`, offer, created_at: offer.created_at })),
  ].sort((a, b) => itemTime(a) - itemTime(b))
}

function OfferBubble({ children, mine, createdAt }) {
  const timeLabel = createdAt ? new Date(createdAt).toLocaleString() : ''
  return (
    <div style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
      <div style={{ maxWidth: '70%', display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start', gap: '4px' }}>
        {children}
        {timeLabel && <div style={{ fontSize: '11px', color: C.textDim, marginTop: '2px', textAlign: mine ? 'right' : 'left' }}>{timeLabel}</div>}
      </div>
    </div>
  )
}

function ChatBubble({ message, mine }) {
  const body = String(message.body || '')
  const lines = body.split('\n')
  const attachmentLine = lines.find(line => /^https?:\/\//.test(line.trim()))
  const labelLine = lines.find(line => line.startsWith('Attachment:'))
  const text = attachmentLine ? lines.filter(line => line !== attachmentLine && line !== labelLine).join('\n').trim() : body
  return (
    <div style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
      <div style={{ maxWidth: '70%', padding: '10px 14px', borderRadius: '12px', fontSize: '14px', lineHeight: 1.5, background: mine ? C.studentMessageBg : C.surface2, color: mine ? C.studentMessageText : C.text, border: mine ? `1px solid ${C.studentMessageBorder}` : 'none', whiteSpace: 'pre-wrap' }}>
        {text && <div>{text}</div>}
        {attachmentLine && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: text ? '8px' : 0 }}>
            <a href={attachmentLine.trim()} target="_blank" rel="noreferrer" style={{ color: mine ? C.studentMessageText : C.cyan, fontWeight: 800, textDecoration: 'none' }}>
              {labelLine || 'Open attachment'}
            </a>
            <a href={attachmentLine.trim()} download target="_blank" rel="noreferrer" style={{ color: mine ? C.studentMessageText : C.cyan, border: `1px solid ${mine ? C.studentMessageText : C.cyan}`, borderRadius: '999px', padding: '2px 8px', fontSize: '12px', fontWeight: 800, textDecoration: 'none' }}>
              Download
            </a>
          </div>
        )}
        <div style={{ fontSize: '11px', opacity: 0.7, marginTop: '4px' }}>{new Date(message.created_at).toLocaleString()}</div>
      </div>
    </div>
  )
}

function AttorneyOfferCard({ offer, onAccept, onDecline }) {
  const platformFee = Number(offer.platform_fee || 0)
  const total = Number(offer.price || 0) + platformFee
  const pending = offer.status === 'sent'
  return (
    <div style={{ border: `1px solid ${pending ? C.cyan : C.border}`, borderRadius: '12px', padding: '14px', background: pending ? `${C.cyan}0d` : C.surface2 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 800, fontSize: '14px', color: C.text }}>{offer.title}</div>
        <Badge color={pending ? 'orange' : offer.status === 'accepted' ? 'green' : 'gray'}>{offer.status}</Badge>
      </div>
      <div style={{ marginTop: '6px', color: C.textMuted, fontSize: '13px', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{offer.description}</div>
      <div style={{ marginTop: '10px', display: 'grid', gap: '4px', fontSize: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Attorney fee</span><strong>${Number(offer.price || 0).toFixed(2)}</strong></div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Platform fee ({offer.platform_fee_percent_snapshot || 25}%)</span><strong>${platformFee.toFixed(2)}</strong></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: `1px solid ${C.border}`, paddingTop: '5px', marginTop: '3px' }}><span>You pay</span><strong>${total.toFixed(2)}</strong></div>
      </div>
      {pending && (
        <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
          <Btn variant="primary" size="sm" onClick={onAccept}>Accept & pay ${total.toFixed(2)}</Btn>
          <Btn variant="ghost" size="sm" onClick={onDecline}>Decline</Btn>
        </div>
      )}
    </div>
  )
}

function ConsultantOfferCard({ offer, onAccept, onDecline }) {
  const total = Number(offer.price || 0)
  const pending = offer.status === 'sent'
  return (
    <div style={{ alignSelf: 'stretch', border: `1px solid ${pending ? C.cyan : C.border}`, borderRadius: '12px', padding: '14px', background: pending ? `${C.cyan}0d` : C.surface2 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 800, fontSize: '14px', color: C.text }}>{offer.title}</div>
        <Badge color={pending ? 'orange' : offer.status === 'accepted' ? 'green' : 'gray'}>{offer.status}</Badge>
      </div>
      <div style={{ marginTop: '6px', color: C.textMuted, fontSize: '13px', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{offer.description}</div>
      <div style={{ marginTop: '10px', display: 'grid', gap: '4px', fontSize: '12px' }}>
        {Number(offer.discount_percent || 0) > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>List price</span><strong style={{ textDecoration: 'line-through' }}>${Number(offer.original_price || 0).toFixed(2)}</strong></div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Custom offer</span><strong>${total.toFixed(2)}</strong></div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Delivery</span><strong>{offer.delivery_days} days</strong></div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Revisions</span><strong>{offer.revision_count ?? 1}</strong></div>
      </div>
      {pending && (
        <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
          <Btn variant="primary" size="sm" onClick={onAccept}>Accept & pay ${total.toFixed(2)}</Btn>
          <Btn variant="ghost" size="sm" onClick={onDecline}>Decline</Btn>
        </div>
      )}
    </div>
  )
}

export default StudentApp;
