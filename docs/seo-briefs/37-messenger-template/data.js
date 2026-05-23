/* ─────────────────────────────────────────────────────────────────────────
   Seed data for the WhatsApp-style prototype.
   The shape MATCHES the existing Supabase tables (conversations,
   conversation_messages, conversation_reads) plus a small set of NEW
   columns documented in HANDOFF.md. Nothing here is mock filler — every
   message reflects a realistic legal-marketplace interaction.
   ───────────────────────────────────────────────────────────────────── */

window.SEED_USER = {
  id: 'me',
  full_name: 'Aanya Sharma',
  short_name: 'You',
  avatar_color: '#3C3B6E',
  initials: 'AS',
  role: 'student',                  // 'student' (buyer) | 'attorney' | 'consultant' (seller)
  can_send_offer: false,            // buyers don't send offers; sellers do
  status: 'Researching the I-130 evidence pack',
};

/* People you talk to (counterparts in DM convos, members in groups) */
window.SEED_PEOPLE = [
  { id: 'p_renu',   full_name: 'Renu Nair, Esq.',   initials: 'RN', avatar_color: '#3C3B6E', role: 'attorney',   subtitle: 'NY Bar · Immigration · 11 yrs', online: true,  last_seen: null, about: 'Replies typically within 2 hrs (9am–6pm ET)', verified: true },
  { id: 'p_marcus', full_name: 'Marcus Whitford',   initials: 'MW', avatar_color: '#5F6B3A', role: 'attorney',   subtitle: 'Tenancy Specialist · England & Wales', online: false, last_seen: '2026-05-22T07:14:00Z', about: 'Section 21 / Renters Rights Act 2025', verified: true },
  { id: 'p_yuki',   full_name: 'Yuki Tanaka',       initials: 'YT', avatar_color: '#B22234', role: 'consultant', subtitle: 'Tax · Non-resident & treaty', online: true, last_seen: null, about: 'CPA · IRS-enrolled · JP/US treaty', verified: true },
  { id: 'p_priya',  full_name: 'Priya Kapoor',      initials: 'PK', avatar_color: '#C4A45A', role: 'consultant', subtitle: 'RCIC · Canadian immigration', online: false, last_seen: '2026-05-21T22:40:00Z', about: 'PGWP, Express Entry, PNP', verified: true },
  { id: 'p_dso',    full_name: 'Hannah Reyes (DSO)',initials: 'HR', avatar_color: '#2A6FDB', role: 'staff',      subtitle: 'Designated School Official · NYU', online: false, last_seen: '2026-05-22T11:02:00Z', about: 'Office hours: Tue/Thu 1–4pm' },
  { id: 'p_kofi',   full_name: 'Kofi Mensah',       initials: 'KM', avatar_color: '#1F8A5B', role: 'attorney',   subtitle: 'Solicitor · UK family & spouse visas', online: false, last_seen: '2026-05-20T15:20:00Z', verified: true },
  { id: 'p_elena',  full_name: 'Elena Brooks',      initials: 'EB', avatar_color: '#8B4FBF', role: 'paralegal',  subtitle: 'Paralegal · Renu Nair LLP', online: true, last_seen: null },
  { id: 'p_support',full_name: 'Yousafe Support',   initials: 'YS', avatar_color: '#1D2433', role: 'staff',      subtitle: 'Verified · platform support', online: true, last_seen: null, verified: true },
  { id: 'p_alex',   full_name: 'Alex Tran',         initials: 'AT', avatar_color: '#D97757', role: 'student',    subtitle: 'F-1 student · NYU Stern', online: false, last_seen: '2026-05-22T09:30:00Z' },
  { id: 'p_javier', full_name: 'Javier Ortiz',      initials: 'JO', avatar_color: '#4A7C59', role: 'student',    subtitle: 'F-1 / OPT · UMich', online: false, last_seen: '2026-05-19T18:00:00Z' },
  { id: 'p_mei',    full_name: 'Mei Lin',           initials: 'ML', avatar_color: '#D97757', role: 'student',    subtitle: 'PhD applicant · MIT',          online: true,  last_seen: null,                       has_active_status: true },
  { id: 'p_omar',   full_name: 'Omar Hassan',       initials: 'OH', avatar_color: '#5F6B3A', role: 'student',    subtitle: 'Skilled Worker visa · UK',     online: false, last_seen: '2026-05-22T08:15:00Z',     has_active_status: true },
  { id: 'p_sofia',  full_name: 'Sofia Reyes',       initials: 'SR', avatar_color: '#B22234', role: 'student',    subtitle: 'Spousal sponsorship · Canada', online: false, last_seen: '2026-05-21T19:42:00Z',     has_active_status: true },
  { id: 'p_diego',  full_name: 'Diego Martín',      initials: 'DM', avatar_color: '#2A6FDB', role: 'student',    subtitle: 'F-1 reinstatement · Columbia', online: true,  last_seen: null,                       has_active_status: true },
  { id: 'p_aisha',  full_name: 'Aisha Bello',       initials: 'AB', avatar_color: '#8B4FBF', role: 'student',    subtitle: 'PNP Ontario · tech draw',      online: false, last_seen: '2026-05-22T11:48:00Z',     has_active_status: true },
];

/* ID helper for seed messages */
let _seedSeq = 0;
const mk = () => `seed_${++_seedSeq}`;
const now = Date.parse('2026-05-22T14:38:00Z');
const ago = (mins) => new Date(now - mins * 60_000).toISOString();

/* Conversations: shape mirrors `conversations` + the new per-user columns
   (pinned_at, archived_at, muted_until, custom_wallpaper) we propose. */
window.SEED_CONVERSATIONS = [
  {
    id: 'c_renu',
    type: 'dm',
    counterpart_id: 'p_renu',
    context_kind: 'order',
    context_id: 'ord_2840',
    context_label: 'Order #MC-2840 · I-130 evidence pack',
    pinned_at: ago(60 * 24 * 3),
    archived_at: null,
    muted_until: null,
    blocked: false,
    typing: false,
    wallpaper: null,
  },
  {
    id: 'c_marcus',
    type: 'dm',
    counterpart_id: 'p_marcus',
    context_kind: 'inquiry',
    context_id: 'inq_771',
    context_label: 'Inquiry · Section 21 defence',
    pinned_at: ago(60 * 24 * 1),
    archived_at: null,
    muted_until: null,
    blocked: false,
    typing: true,
  },
  {
    id: 'c_grp_i130',
    type: 'group',
    name: 'I-130 case team',
    initials: 'I130',
    avatar_color: '#3C3B6E',
    subtitle: 'Renu Nair · Elena Brooks · You',
    members: ['me', 'p_renu', 'p_elena'],
    admins: ['p_renu'],
    context_kind: 'order',
    context_id: 'ord_2840',
    pinned_at: null,
    archived_at: null,
    muted_until: null,
  },
  {
    id: 'c_yuki',
    type: 'dm',
    counterpart_id: 'p_yuki',
    context_kind: 'general',
    pinned_at: null,
    archived_at: null,
    muted_until: null,
  },
  {
    id: 'c_dso',
    type: 'dm',
    counterpart_id: 'p_dso',
    context_kind: 'general',
    pinned_at: null,
    archived_at: null,
    muted_until: ago(-60 * 24 * 30), // muted for 30 days forward
  },
  {
    id: 'c_priya',
    type: 'dm',
    counterpart_id: 'p_priya',
    context_kind: 'inquiry',
    context_label: 'Inquiry · PGWP eligibility',
    pinned_at: null,
    archived_at: null,
  },
  {
    id: 'c_support',
    type: 'dm',
    counterpart_id: 'p_support',
    context_kind: 'general',
    pinned_at: null,
    archived_at: null,
    muted_until: null,
  },
  {
    id: 'c_kofi',
    type: 'dm',
    counterpart_id: 'p_kofi',
    context_kind: 'general',
    pinned_at: null,
    archived_at: null,
  },
  {
    id: 'c_alex',
    type: 'dm',
    counterpart_id: 'p_alex',
    context_kind: 'general',
    pinned_at: null,
    archived_at: null, /* visible — used to demo the seller "Send offer" flow when role is flipped via Settings */
  },
  {
    id: 'c_javier',
    type: 'dm',
    counterpart_id: 'p_javier',
    context_kind: 'general',
    pinned_at: null,
    archived_at: ago(60 * 24 * 20),
  },
];

/* Messages: one big map keyed by conversation_id, oldest first.
   Each message follows the conversation_messages schema with the
   additions documented in HANDOFF.md (reply_to_id, reactions, starred,
   forwarded_from, edited_at, delivered_at, read_at, deleted_for). */
window.SEED_MESSAGES = {
  c_renu: [
    { id: mk(), conversation_id: 'c_renu', sender_id: 'p_renu',  type: 'text', body: "Hi Aanya — I've reviewed the marriage cert and your husband's I-94. Looks clean. Pulling the rest of the evidence list together now.", created_at: ago(60 * 28), delivered_at: ago(60 * 28), read_at: ago(60 * 27) },
    { id: mk(), conversation_id: 'c_renu', sender_id: 'me',      type: 'text', body: "Thank you! Should I scan the joint lease today or wait?", created_at: ago(60 * 27), delivered_at: ago(60 * 27), read_at: ago(60 * 27) },
    { id: mk(), conversation_id: 'c_renu', sender_id: 'p_renu',  type: 'text', body: "Today is great. PDF, both pages, signed and dated. Also any utility bills with both names — last 6 months ideally.", created_at: ago(60 * 26.7), delivered_at: ago(60 * 26.7), read_at: ago(60 * 26) },
    { id: mk(), conversation_id: 'c_renu', sender_id: 'p_renu',  type: 'document', attachment: { kind: 'document', file_name: 'I-130 evidence checklist v3.pdf', mime_type: 'application/pdf', file_size: 248_320, pages: 4 }, created_at: ago(60 * 26.5), delivered_at: ago(60 * 26.5), read_at: ago(60 * 26) },
    { id: mk(), conversation_id: 'c_renu', sender_id: 'me',      type: 'text', body: "Got it. Uploading now.", created_at: ago(60 * 4.2), delivered_at: ago(60 * 4.2), read_at: ago(60 * 4) },
    { id: mk(), conversation_id: 'c_renu', sender_id: 'me',      type: 'image', attachment: { kind: 'image', file_name: 'lease-page-1.jpg', mime_type: 'image/jpeg', file_size: 1_842_000, width: 1280, height: 1600, gradient: ['#ECE6D5', '#D9D1BD'], glyph: 'LEASE' }, created_at: ago(60 * 4.1), delivered_at: ago(60 * 4.1), read_at: ago(60 * 4) },
    { id: mk(), conversation_id: 'c_renu', sender_id: 'me',      type: 'image', attachment: { kind: 'image', file_name: 'lease-page-2.jpg', mime_type: 'image/jpeg', file_size: 1_710_000, width: 1280, height: 1600, gradient: ['#E7E0CD', '#C9BFA6'], glyph: 'LEASE p.2' }, created_at: ago(60 * 4.1), delivered_at: ago(60 * 4.1), read_at: ago(60 * 4) },
    { id: mk(), conversation_id: 'c_renu', sender_id: 'me',      type: 'document', attachment: { kind: 'document', file_name: 'ConEd_Nov_2025.pdf', mime_type: 'application/pdf', file_size: 312_400, pages: 2 }, created_at: ago(60 * 4.05), delivered_at: ago(60 * 4), read_at: ago(60 * 4) },
    { id: mk(), conversation_id: 'c_renu', sender_id: 'p_renu',  type: 'text', body: "Perfect — that's three months covered. Two more and we're solid.", created_at: ago(60 * 3.4), delivered_at: ago(60 * 3.4), read_at: ago(60 * 3.4), reactions: { '👍': ['me'] } },
    { id: mk(), conversation_id: 'c_renu', sender_id: 'p_renu',  type: 'voice', attachment: { kind: 'voice', duration_seconds: 38, waveform: [12,18,32,44,28,52,68,44,30,22,16,28,40,56,72,60,40,28,18,12,20,34,52,60,44,30,22,16,12,18,30,44,52,40,26,18,12,10,14,22,34,48,40] }, created_at: ago(60 * 3.3), delivered_at: ago(60 * 3.3), read_at: ago(60 * 3.3) },
    { id: mk(), conversation_id: 'c_renu', sender_id: 'me',      type: 'text', body: "Just listened — yes, I'll dig out the December and January statements after lunch.", reply_to_id: null, created_at: ago(60 * 2.1), delivered_at: ago(60 * 2.1), read_at: ago(60 * 2) },
    { id: mk(), conversation_id: 'c_renu', sender_id: 'p_renu',  type: 'text', body: "One more thing — passport-style photos. Two each, white background, taken within 30 days. CVS will do it for $15.", created_at: ago(60 * 1.8), delivered_at: ago(60 * 1.8), read_at: ago(60 * 1.8), starred: ['me'] },
    { id: mk(), conversation_id: 'c_renu', sender_id: 'me',      type: 'text', body: "Will do tonight. Quick Q —", created_at: ago(45), delivered_at: ago(45), read_at: ago(45) },
    { id: mk(), conversation_id: 'c_renu', sender_id: 'me',      type: 'text', body: "If our joint account only opened in March, is the 3-month threshold a problem?", created_at: ago(44.5), delivered_at: ago(44.5), read_at: ago(44.5) },
    { id: mk(), conversation_id: 'c_renu', sender_id: 'p_renu',  type: 'text', body: "Not on its own. We pair it with the lease + your declarations. I'll write a one-pager explaining the timeline so USCIS doesn't ask.", reply_to_id: null, created_at: ago(38), delivered_at: ago(38), read_at: ago(38) },
    { id: mk(), conversation_id: 'c_renu', sender_id: 'p_renu',  type: 'text', body: "Sending the draft declaration template now ↓", created_at: ago(37), delivered_at: ago(37), read_at: ago(37) },
    { id: mk(), conversation_id: 'c_renu', sender_id: 'p_renu',  type: 'document', attachment: { kind: 'document', file_name: 'I-130 bona-fide marriage declaration TEMPLATE.docx', mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', file_size: 42_800, pages: 2 }, created_at: ago(36.5), delivered_at: ago(36.5), read_at: ago(36) },
    /* Earlier accepted/paid offer that opened ord_2840 */
    { id: mk(), conversation_id: 'c_renu', sender_id: 'p_renu', type: 'offer',
      attachment: { kind: 'offer', id: 'of_2840', title: 'I-130 evidence pack & cover memo',
        description: "Full evidence package, bona-fide declarations, and a cover memo signed off by me. Three rounds of edits included.",
        price_cents: 68000, currency: 'USD', delivery_days: 10, revisions: 3,
        expires_at: ago(60 * 24 * 4 - 60 * 24 * 7),  // expired in the past
        status: 'paid',
        order_id: 'ord_2840',
        linked_gig: { id: 'g_i130', title: 'I-130 evidence pack & cover memo', slug: 'i130-evidence-pack' },
      },
      created_at: ago(60 * 24 * 5 + 30), delivered_at: ago(60 * 24 * 5 + 30), read_at: ago(60 * 24 * 5 + 29) },
    { id: mk(), conversation_id: 'c_renu', sender_id: 'me',      type: 'text', body: "Amazing, thank you. I'll have both declarations back by Sunday.", created_at: ago(12), delivered_at: ago(12), read_at: ago(11) },
    { id: mk(), conversation_id: 'c_renu', sender_id: 'p_renu',  type: 'text', body: "Sounds good. Once those are in, I'll lock the cover memo and we can ship.", created_at: ago(4), delivered_at: ago(4), read_at: null },
    /* NEW offer for an add-on, currently pending — buyer must accept/decline */
    { id: mk(), conversation_id: 'c_renu', sender_id: 'p_renu', type: 'offer',
      attachment: { kind: 'offer', id: 'of_3120',
        title: 'Add-on: priority-processing cover note for the I-130',
        description: 'Two-page cover note arguing for the medical-hardship priority lane. Optional add-on — only worthwhile if your husband\'s parent illness is documented.',
        price_cents: 22000, currency: 'USD', delivery_days: 3, revisions: 2,
        expires_at: ago(-60 * 24 * 4),  // expires in 4 days
        status: 'pending',
      },
      created_at: ago(3), delivered_at: ago(3), read_at: null },
  ],

  c_marcus: [
    { id: mk(), conversation_id: 'c_marcus', sender_id: 'p_marcus', type: 'text', body: "Hi Aanya — I read the inquiry. Quick note: the landlord's Section 21 looks like it predates the Renters Rights Act 2025 transition. Do you have the date it was served?", created_at: ago(60 * 6), delivered_at: ago(60 * 6), read_at: ago(60 * 6) },
    { id: mk(), conversation_id: 'c_marcus', sender_id: 'me',      type: 'text', body: "March 14, 2026. I have a photo of the envelope.", created_at: ago(60 * 5.9), delivered_at: ago(60 * 5.9), read_at: ago(60 * 5.9) },
    { id: mk(), conversation_id: 'c_marcus', sender_id: 'me',      type: 'image', attachment: { kind: 'image', file_name: 'envelope-postmark.jpg', mime_type: 'image/jpeg', file_size: 980_000, width: 1024, height: 768, gradient: ['#F4F0E6', '#D9D1BD'], glyph: '14 MAR 2026' }, created_at: ago(60 * 5.9), delivered_at: ago(60 * 5.9), read_at: ago(60 * 5.9) },
    { id: mk(), conversation_id: 'c_marcus', sender_id: 'p_marcus', type: 'text', body: "Helpful. That's post-transition. Which means the section 21 route is closed — your landlord can only proceed under the new s.8 grounds.", created_at: ago(60 * 5.7), delivered_at: ago(60 * 5.7), read_at: ago(60 * 5.5) },
    { id: mk(), conversation_id: 'c_marcus', sender_id: 'p_marcus', type: 'text', body: "Have they cited any specific ground in the notice?", created_at: ago(60 * 5.7), delivered_at: ago(60 * 5.7), read_at: ago(60 * 5.5) },
    { id: mk(), conversation_id: 'c_marcus', sender_id: 'me',      type: 'text', body: "It just says 'section 21' with the standard form. No new ground listed.", created_at: ago(60 * 2), delivered_at: ago(60 * 2), read_at: ago(60 * 2) },
    { id: mk(), conversation_id: 'c_marcus', sender_id: 'p_marcus', type: 'text', body: "Then the notice is invalid on its face. Drafting your response letter — sending in ~20 min.", created_at: ago(60 * 1.5), delivered_at: ago(60 * 1.5), read_at: ago(60 * 1.5) },
    { id: mk(), conversation_id: 'c_marcus', sender_id: 'p_marcus', type: 'text', body: "Typing…", created_at: ago(3), delivered_at: ago(3), read_at: null, _typing: true },
  ],

  c_grp_i130: [
    { id: mk(), conversation_id: 'c_grp_i130', sender_id: 'system', type: 'system', body: "Renu Nair created group 'I-130 case team'", created_at: ago(60 * 24 * 5) },
    { id: mk(), conversation_id: 'c_grp_i130', sender_id: 'system', type: 'system', body: "Renu Nair added Elena Brooks (paralegal)", created_at: ago(60 * 24 * 5 - 5) },
    { id: mk(), conversation_id: 'c_grp_i130', sender_id: 'p_renu', type: 'text', body: "Team — using this for working docs only. Elena will own the evidence checklist.", created_at: ago(60 * 24 * 5 - 10), delivered_at: ago(60 * 24 * 5 - 10), read_at: ago(60 * 24 * 5 - 9) },
    { id: mk(), conversation_id: 'c_grp_i130', sender_id: 'p_elena', type: 'text', body: "Hi! I'll be your day-to-day contact. Aanya, please tag me directly when you upload anything new.", created_at: ago(60 * 24 * 5 - 11), delivered_at: ago(60 * 24 * 5 - 11), read_at: ago(60 * 24 * 5 - 11) },
    { id: mk(), conversation_id: 'c_grp_i130', sender_id: 'me',     type: 'text', body: "Got it 👍", created_at: ago(60 * 24 * 5 - 12), delivered_at: ago(60 * 24 * 5 - 12), read_at: ago(60 * 24 * 5 - 12) },
    { id: mk(), conversation_id: 'c_grp_i130', sender_id: 'p_elena', type: 'document', attachment: { kind: 'document', file_name: 'evidence-tracker.xlsx', mime_type: 'application/vnd.ms-excel', file_size: 28_400, pages: null }, created_at: ago(60 * 26), delivered_at: ago(60 * 26), read_at: ago(60 * 25) },
    { id: mk(), conversation_id: 'c_grp_i130', sender_id: 'p_elena', type: 'text', body: "Live tracker ☝ — you and Renu can both edit. Green = received, amber = pending, red = missing.", created_at: ago(60 * 26), delivered_at: ago(60 * 26), read_at: ago(60 * 25) },
    { id: mk(), conversation_id: 'c_grp_i130', sender_id: 'p_renu',  type: 'text', body: "Aanya — when you sent the lease pages to me directly, can you also drop a copy here so Elena can check it in?", created_at: ago(60 * 3), delivered_at: ago(60 * 3), read_at: ago(60 * 3) },
  ],

  c_yuki: [
    { id: mk(), conversation_id: 'c_yuki', sender_id: 'p_yuki', type: 'text', body: "Aanya — your 1040-NR draft is back. I treated the Indian fellowship as exempt under Article 21(2) of the US-India treaty.", created_at: ago(60 * 50), delivered_at: ago(60 * 50), read_at: ago(60 * 50) },
    { id: mk(), conversation_id: 'c_yuki', sender_id: 'p_yuki', type: 'document', attachment: { kind: 'document', file_name: '1040-NR_2025_draft_Sharma_A.pdf', mime_type: 'application/pdf', file_size: 612_000, pages: 11 }, created_at: ago(60 * 50), delivered_at: ago(60 * 50), read_at: ago(60 * 50) },
    { id: mk(), conversation_id: 'c_yuki', sender_id: 'me',     type: 'text', body: "Quick read — line 8 looks higher than I expected. What's the breakdown?", created_at: ago(60 * 48), delivered_at: ago(60 * 48), read_at: ago(60 * 48) },
    { id: mk(), conversation_id: 'c_yuki', sender_id: 'p_yuki', type: 'text', body: "$2,140 is the OPT income from Sept–Dec. $640 is interest from your high-yield savings (taxable, treaty doesn't cover it). Net refund is $312.", created_at: ago(60 * 47), delivered_at: ago(60 * 47), read_at: ago(60 * 47) },
    { id: mk(), conversation_id: 'c_yuki', sender_id: 'me',     type: 'text', body: "Makes sense. Sign off when ready and I'll e-file via the portal.", created_at: ago(60 * 46), delivered_at: ago(60 * 46), read_at: ago(60 * 46) },
    { id: mk(), conversation_id: 'c_yuki', sender_id: 'p_yuki', type: 'text', body: "Signed. You're good to file.", created_at: ago(60 * 45), delivered_at: ago(60 * 45), read_at: ago(60 * 8) },
  ],

  c_dso: [
    { id: mk(), conversation_id: 'c_dso', sender_id: 'p_dso', type: 'text', body: "Hi Aanya — your I-20 reprint is ready. Office hours Tue/Thu 1–4pm, Kimmel 9th floor. Bring ID.", created_at: ago(60 * 72), delivered_at: ago(60 * 72), read_at: ago(60 * 71) },
    { id: mk(), conversation_id: 'c_dso', sender_id: 'me',    type: 'text', body: "Thank you! Picking up Thursday.", created_at: ago(60 * 70), delivered_at: ago(60 * 70), read_at: ago(60 * 70) },
    { id: mk(), conversation_id: 'c_dso', sender_id: 'p_dso', type: 'text', body: "Confirmed. Also — your OPT recommendation has been processed in SEVIS. You can apply to USCIS now.", created_at: ago(60 * 33), delivered_at: ago(60 * 33), read_at: ago(60 * 30) },
  ],

  c_priya: [
    { id: mk(), conversation_id: 'c_priya', sender_id: 'p_priya', type: 'text', body: "Reviewed your transcript. You're eligible for a 3-year PGWP based on a 2-year master's plus your one-semester co-op — but the co-op needs to be on a separate letter.", created_at: ago(60 * 96), delivered_at: ago(60 * 96), read_at: ago(60 * 96) },
    { id: mk(), conversation_id: 'c_priya', sender_id: 'p_priya', type: 'text', body: "I've drafted the request — send it to your registrar.", created_at: ago(60 * 95), delivered_at: ago(60 * 95), read_at: ago(60 * 94) },
    { id: mk(), conversation_id: 'c_priya', sender_id: 'p_priya', type: 'document', attachment: { kind: 'document', file_name: 'co-op-letter-request.docx', mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', file_size: 22_100, pages: 1 }, created_at: ago(60 * 95), delivered_at: ago(60 * 95), read_at: ago(60 * 94) },
    { id: mk(), conversation_id: 'c_priya', sender_id: 'me',      type: 'text', body: "Got it — sending today.", created_at: ago(60 * 90), delivered_at: ago(60 * 90), read_at: ago(60 * 90) },
  ],

  c_support: [
    { id: mk(), conversation_id: 'c_support', sender_id: 'p_support', type: 'text', body: "Welcome to MyCaseworks Messaging. Your conversations with attorneys, consultants and the platform live here. Files are scanned for malware and stored encrypted at rest.", created_at: ago(60 * 24 * 14), delivered_at: ago(60 * 24 * 14), read_at: ago(60 * 24 * 14) },
    { id: mk(), conversation_id: 'c_support', sender_id: 'p_support', type: 'text', body: "Two tips:\n• Long-press a message to react, reply, forward, star or delete.\n• Pin up to 3 conversations to keep them on top.", created_at: ago(60 * 24 * 14), delivered_at: ago(60 * 24 * 14), read_at: ago(60 * 24 * 14) },
  ],

  c_kofi: [
    { id: mk(), conversation_id: 'c_kofi', sender_id: 'p_kofi', type: 'text', body: "Hi — confirming we're on for 4pm BST tomorrow re: spouse visa financial requirement. I'll send the brief 30 min before.", created_at: ago(60 * 18), delivered_at: ago(60 * 18), read_at: ago(60 * 18) },
    { id: mk(), conversation_id: 'c_kofi', sender_id: 'p_kofi', type: 'location', attachment: { kind: 'location', label: 'Kofi Mensah & Co — 14 Chancery Lane, London', lat: 51.5163, lng: -0.1130 }, created_at: ago(60 * 17.9), delivered_at: ago(60 * 17.9), read_at: ago(60 * 17.9) },
  ],

  c_alex: [
    { id: mk(), conversation_id: 'c_alex', sender_id: 'p_alex', type: 'text', body: "Hey — did Renu end up using the cover memo template I sent? I'm filing mine next month and curious.", created_at: ago(60 * 24 * 6), delivered_at: ago(60 * 24 * 6), read_at: ago(60 * 24 * 6) },
    { id: mk(), conversation_id: 'c_alex', sender_id: 'me',     type: 'text', body: "She tweaked it heavily. I'll send you her version once it's final.", created_at: ago(60 * 24 * 6), delivered_at: ago(60 * 24 * 6), read_at: ago(60 * 24 * 6) },
  ],

  c_javier: [
    { id: mk(), conversation_id: 'c_javier', sender_id: 'p_javier', type: 'text', body: "Question about STEM OPT — did you find someone good for the I-983?", created_at: ago(60 * 24 * 22), delivered_at: ago(60 * 24 * 22), read_at: ago(60 * 24 * 22) },
    { id: mk(), conversation_id: 'c_javier', sender_id: 'me',       type: 'text', body: "Renu Nair on the platform. 4.96 stars. She's worth the price.", created_at: ago(60 * 24 * 22), delivered_at: ago(60 * 24 * 22), read_at: ago(60 * 24 * 22) },
    /* A legacy contact-leak attempt — the bubble must redact this at render time. */
    { id: mk(), conversation_id: 'c_javier', sender_id: 'p_javier', type: 'text',
      body: "Cool — easier to just chat directly though. Text me at 555-203-4117 or email javier.ortiz@gmail.com 🙏",
      created_at: ago(60 * 24 * 21), delivered_at: ago(60 * 24 * 21), read_at: ago(60 * 24 * 21) },
  ],
};

/* Pre-compute last message snippets and unread counts for each conversation. */
window.SEED_CONVERSATIONS.forEach(c => {
  const msgs = window.SEED_MESSAGES[c.id] || [];
  const last = msgs[msgs.length - 1];
  if (last) {
    c.last_message_at = last.created_at;
    c.last_message_id = last.id;
    c.last_message_snippet = last.type === 'text'
      ? last.body
      : last.type === 'image'    ? '📷 Photo'
      : last.type === 'video'    ? '🎥 Video'
      : last.type === 'voice'    ? '🎙 Voice message'
      : last.type === 'document' ? `📄 ${last.attachment?.file_name || 'Document'}`
      : last.type === 'location' ? '📍 Location'
      : last.type === 'contact'  ? '👤 Contact'
      : last.type === 'offer'    ? `💼 Custom offer · ${last.attachment?.title || ''}`
      : last.type === 'system'   ? last.body
      : '(message)';
    c.last_message_from_me = last.sender_id === 'me';
  }
  /* Unread = messages from counterpart that are unread by 'me' */
  c.unread = msgs.filter(m => m.sender_id !== 'me' && m.sender_id !== 'system' && !m.read_at).length;
});

/* ─────────────────────────────────────────────────────────────────────────
   MARKETPLACE — Orders.
   Active and historical orders between me and the various counterparts.
   ─────────────────────────────────────────────────────────────────── */
window.SEED_ORDERS = [
  {
    id: 'ord_2840', id_short: 'MC-2840',
    title: 'I-130 evidence pack & cover memo — spouse of US citizen',
    buyer_id: 'me', seller_id: 'p_renu',
    participants: ['me', 'p_renu'],
    total_cents: 68000, escrow_amount_cents: 68000, currency: 'USD',
    status: 'in_progress', escrow_status: 'held',
    created_at: ago(60 * 24 * 5),
    updated_at: ago(60 * 4),
    due_at:     ago(-60 * 24 * 3),  // 3 days in the future
    milestones: [
      { title: 'Initial intake & doc review', amount_cents: 12000, status: 'approved',   due_at: ago(60 * 24 * 4) },
      { title: 'Evidence checklist + drafts',  amount_cents: 28000, status: 'in_progress', due_at: ago(-60 * 24) },
      { title: 'Cover memo + final signoff',   amount_cents: 28000, status: 'pending',     due_at: ago(-60 * 24 * 3) },
    ],
  },
  {
    id: 'ord_2918', id_short: 'MC-2918',
    title: '1040-NR review — OPT + fellowship treaty',
    buyer_id: 'me', seller_id: 'p_yuki',
    participants: ['me', 'p_yuki'],
    total_cents: 18500, escrow_amount_cents: 18500, currency: 'USD',
    status: 'submitted', escrow_status: 'held',
    created_at: ago(60 * 24 * 7),
    updated_at: ago(60 * 47),
    due_at:     ago(60 * 47),
    milestones: [
      { title: 'Document intake',  amount_cents: 4000,  status: 'approved',  due_at: ago(60 * 24 * 6) },
      { title: 'Draft 1040-NR',    amount_cents: 9000,  status: 'approved',  due_at: ago(60 * 24 * 3) },
      { title: 'Final review',     amount_cents: 5500,  status: 'submitted', due_at: ago(60 * 47) },
    ],
  },
  {
    id: 'ord_2455', id_short: 'MC-2455',
    title: 'PGWP eligibility opinion — 3-year route',
    buyer_id: 'me', seller_id: 'p_priya',
    participants: ['me', 'p_priya'],
    total_cents: 14000, escrow_amount_cents: 0, currency: 'USD',
    status: 'completed', escrow_status: 'released',
    created_at: ago(60 * 24 * 14),
    updated_at: ago(60 * 24 * 4),
    due_at:     ago(60 * 24 * 5),
    milestones: [
      { title: 'Transcript review',         amount_cents: 6000, status: 'approved', due_at: ago(60 * 24 * 12) },
      { title: 'Written opinion + letter',  amount_cents: 8000, status: 'released', due_at: ago(60 * 24 * 4) },
    ],
  },
  {
    id: 'ord_2733', id_short: 'MC-2733',
    title: 'Section 21 defence response letter',
    buyer_id: 'me', seller_id: 'p_marcus',
    participants: ['me', 'p_marcus'],
    total_cents: 12000, escrow_amount_cents: 12000, currency: 'USD',
    status: 'in_progress', escrow_status: 'held',
    created_at: ago(60 * 8),
    updated_at: ago(60 * 1.5),
    due_at:     ago(-60 * 24 * 2),
    milestones: [
      { title: 'Intake & validity analysis', amount_cents: 4000, status: 'approved',    due_at: ago(60 * 6) },
      { title: 'Draft response letter',      amount_cents: 8000, status: 'in_progress', due_at: ago(-60 * 24 * 2) },
    ],
  },
];

window.SEED_USER.can_send_offer = false;  // explicit: buyer can't send offers

/* ─────────────────────────────────────────────────────────────────────────
   MARKETPLACE — Open inquiries (the buyer-side intake form's output).
   Each entry mirrors the new `inquiries` table proposed in HANDOFF.md.
   Sellers see this feed live; claiming an inquiry creates a DM.
   ─────────────────────────────────────────────────────────────────── */
window.SEED_INQUIRIES = [
  {
    id: 'inq_771', buyer_id: 'me',
    country: 'UK', country_label: 'United Kingdom', country_flag: '🇬🇧',
    case_type: 'tenancy', case_type_label: "Rental / tenancy issue (RRA 2025)", case_type_icon: '🏠',
    headline: 'Section 21 notice received in London',
    summary: 'Landlord served notice on March 14 — post-transition. AST tenancy in London.',
    answers: { tenancy_issue: 'section8', city: 'London', notice_received: 's21', urgency: 'now', prior_denial: 'no' },
    urgency: 'now',
    tier: { tier: 'Enhanced', price: '$599 – $899', description: 'Document prep plus live attorney video consult.' },
    status: 'claimed', claimed_by: 'p_marcus',
    created_at: ago(60 * 8), updated_at: ago(60 * 1.5),
    expires_at: ago(-60 * 16),
  },
  {
    id: 'inq_812', buyer_id: 'p_mei',
    country: 'US', country_label: 'United States', country_flag: '🇺🇸',
    case_type: 'h1b', case_type_label: "I'm on (or moving to) an H-1B", case_type_icon: '🏢',
    headline: 'F-1 to H-1B cap-gap question',
    summary: 'PhD candidate, OPT ends July 30, employer registered for lottery and selected.',
    answers: { h1b_stage: 'selected', employer_h1b: 'Quanta Labs', role: 'Research Engineer', urgency: 'now', prior_denial: 'no' },
    urgency: 'now',
    tier: { tier: 'Professional', price: '$999 – $1,499', description: 'Three attorney consults + priority review.' },
    status: 'open', claimed_by: null,
    created_at: ago(45),
    updated_at: ago(45),
    expires_at: ago(-60 * 23),
  },
  {
    id: 'inq_813', buyer_id: 'p_omar',
    country: 'UK', country_label: 'United Kingdom', country_flag: '🇬🇧',
    case_type: 'skilled', case_type_label: 'Skilled Worker visa', case_type_icon: '💼',
    headline: 'Awaiting Certificate of Sponsorship · NHS Trust',
    summary: 'NHS sponsor finalising CoS. Need pre-application strategy and salary check.',
    answers: { sw_stage: 'cos_pending', sponsor: 'Manchester NHS Trust', salary: '£44,000', urgency: 'soon', prior_denial: 'no' },
    urgency: 'soon',
    tier: { tier: 'Essential', price: '$299 – $499', description: 'Guided doc prep + async attorney review.' },
    status: 'open', claimed_by: null,
    created_at: ago(110), updated_at: ago(110),
    expires_at: ago(-60 * 21.6),
  },
  {
    id: 'inq_814', buyer_id: 'p_sofia',
    country: 'CA', country_label: 'Canada', country_flag: '🇨🇦',
    case_type: 'spouse_ca', case_type_label: 'Spousal sponsorship', case_type_icon: '💍',
    headline: 'Inland spousal sponsorship — common-law',
    summary: 'Sponsor is a Canadian citizen, applicant currently inside Canada on visitor record.',
    answers: { sponsor_status: 'citizen', in_or_out: 'inland', relationship_type: 'common_law', urgency: 'soon', prior_denial: 'no' },
    urgency: 'soon',
    tier: { tier: 'Essential', price: '$299 – $499', description: 'Guided doc prep + async attorney review.' },
    status: 'open', claimed_by: null,
    created_at: ago(180), updated_at: ago(180),
    expires_at: ago(-60 * 21),
  },
  {
    id: 'inq_815', buyer_id: 'p_diego',
    country: 'US', country_label: 'United States', country_flag: '🇺🇸',
    case_type: 'f1', case_type_label: "I'm an international student (F-1 / J-1)", case_type_icon: '🎓',
    headline: 'F-1 reinstatement — out of status 21 days',
    summary: 'Missed enrollment confirmation, SEVIS terminated. Columbia DSO recommends reinstatement over travel.',
    answers: { school: 'Columbia', program_level: 'masters', status_now: 'reinstate', urgency: 'now', prior_denial: 'yes_other' },
    urgency: 'now',
    tier: { tier: 'Professional', price: '$999 – $1,499', description: 'Three attorney consults + priority review.' },
    status: 'open', claimed_by: null,
    created_at: ago(25), updated_at: ago(25),
    expires_at: ago(-60 * 23.5),
  },
  {
    id: 'inq_816', buyer_id: 'p_aisha',
    country: 'CA', country_label: 'Canada', country_flag: '🇨🇦',
    case_type: 'pnp', case_type_label: 'Provincial Nominee Program (PNP)', case_type_icon: '🏔️',
    headline: 'Ontario Tech Draw eligibility',
    summary: 'CRS 463, NOC 21231, no Canadian job offer. Wants to assess OINP tech-draw nomination.',
    answers: { province: 'on', job_offer: 'no', urgency: 'later', prior_denial: 'no' },
    urgency: 'later',
    tier: { tier: 'Essential', price: '$299 – $499', description: 'Guided doc prep + async attorney review.' },
    status: 'open', claimed_by: null,
    created_at: ago(300), updated_at: ago(300),
    expires_at: ago(-60 * 19),
  },
];

/* ─────────────────────────────────────────────────────────────────────────
   STATUSES — WhatsApp-style 24h status updates posted by buyers
   announcing new inquiries. Keyed by person_id.
   ─────────────────────────────────────────────────────────────────── */
window.SEED_STATUSES = {
  'me': [
    /* Aanya's own active status — published when she posted inq_771 */
    { id: 'st_inq_771', kind: 'inquiry', inquiry_id: 'inq_771',
      country_flag: '🇬🇧', case_type_label: "Rental / tenancy issue (RRA 2025)", urgency: 'now',
      created_at: ago(60 * 8), expires_at: ago(-60 * 16),
      viewers: ['p_marcus', 'p_kofi'] },
  ],
  'p_mei':   [{ id: 'st_812', kind: 'inquiry', inquiry_id: 'inq_812', country_flag: '🇺🇸', case_type_label: "H-1B (cap-gap)", urgency: 'now',  created_at: ago(45),  expires_at: ago(-60 * 23),   viewers: [] }],
  'p_omar':  [{ id: 'st_813', kind: 'inquiry', inquiry_id: 'inq_813', country_flag: '🇬🇧', case_type_label: 'Skilled Worker', urgency: 'soon', created_at: ago(110), expires_at: ago(-60 * 21.6), viewers: [] }],
  'p_sofia': [{ id: 'st_814', kind: 'inquiry', inquiry_id: 'inq_814', country_flag: '🇨🇦', case_type_label: 'Spousal sponsorship', urgency: 'soon', created_at: ago(180), expires_at: ago(-60 * 21), viewers: [] }],
  'p_diego': [{ id: 'st_815', kind: 'inquiry', inquiry_id: 'inq_815', country_flag: '🇺🇸', case_type_label: 'F-1 reinstatement', urgency: 'now', created_at: ago(25), expires_at: ago(-60 * 23.5), viewers: [] }],
  'p_aisha': [{ id: 'st_816', kind: 'inquiry', inquiry_id: 'inq_816', country_flag: '🇨🇦', case_type_label: 'PNP — Ontario', urgency: 'later', created_at: ago(300), expires_at: ago(-60 * 19), viewers: [] }],
};

/* Mark my own status flag so the avatar ring shows */
window.SEED_USER.has_active_status = true;
window.SEED_PEOPLE.forEach(p => {
  if (window.SEED_STATUSES[p.id]?.length) p.has_active_status = true;
});

/* ─────────────────────────────────────────────────────────────────────────
   SUPPORT TICKETS — voids / refunds raised by support, pending admin review.
   New SQL table `support_tickets` proposed in HANDOFF.md §11.
   ─────────────────────────────────────────────────────────────────── */
window.SEED_TICKETS = [
  {
    id: 'tk_2918', order_id: 'ord_2918', order_id_short: 'MC-2918',
    conversation_id: 'c_yuki',
    raised_by: 'p_support',
    kind: 'refund_partial',
    amount_cents: 5500,
    reason: 'Quality concern — buyer flagged on the final review.',
    detail: "Buyer says the final-review milestone deliverable was missing the schedule comparison they paid for. Yuki acknowledged the omission. Proposing a $55 partial refund (final-review milestone) rather than a full void.",
    status: 'pending',
    created_at: ago(60 * 2.5), updated_at: ago(60 * 2.5),
    decided_by: null, decided_at: null, decision_notes: null,
  },
  {
    id: 'tk_2733', order_id: 'ord_2733', order_id_short: 'MC-2733',
    conversation_id: 'c_marcus',
    raised_by: 'p_support',
    kind: 'void',
    amount_cents: 12000,
    reason: 'Duplicate order — buyer charged twice.',
    detail: 'Buyer mistakenly accepted two consecutive offers for the same Section 21 response. Voiding the duplicate (MC-2733 second of two).',
    status: 'approved',
    created_at: ago(60 * 28), updated_at: ago(60 * 26),
    decided_by: 'admin_1', decided_at: ago(60 * 26),
    decision_notes: 'Confirmed via Stripe dashboard. Refund issued.',
  },
];

/* Add support + admin people for role demos. */
window.SEED_PEOPLE.push(
  { id: 'p_admin', full_name: 'Kim Ramos (Admin)', initials: 'KR', avatar_color: '#1D2433', role: 'admin', subtitle: 'Yousafe superadmin', online: true, verified: true },
);

