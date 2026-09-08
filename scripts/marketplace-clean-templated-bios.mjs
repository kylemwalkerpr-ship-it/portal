#!/usr/bin/env node
/**
 * Targeted marketplace copy repair — REVIEW PLAN ONLY (dry run).
 *
 * Scope (supervisor-reviewed, 2026-09-08):
 *   - gigs.description: strip internal `<!-- roster-ref:… -->` markers.
 *   - Replace templated "## About me" sections (internal lines such as
 *     "Public roster research…", "Practice setting (public)…",
 *     "Languages confirmed in public sources…") with INDIVIDUALLY WRITTEN
 *     provider narratives.
 *   - Rewrite the nine provider `bio` rows that open with boilerplate
 *     ("…is listed as a…").
 *
 * Authoring rules:
 *   - Narratives are hand-composed per provider from their OWN recorded public
 *     facts only (name, credential/registration, bar/registration numbers,
 *     practice areas, languages, years, education). No default credential, no
 *     RCIC/MARA labelling not present in the record, no conversion of generic
 *     years into "immigration practice", no invented history or success rates,
 *     and uncertainty is preserved with wording like "on the record"/"listed".
 *     No claim that this task independently verified any fact.
 *   - No shared "I am … / Practice areas recorded … / Languages recorded …"
 *     template and NO identical closing line: each provider text is written
 *     separately with distinct phrasing and closings.
 *
 * Classification deliverables (all 70 bios + every gig About section):
 *   - rewrite              – templated/boilerplate copy replaced with the
 *                            provider narrative.
 *   - already-individual   – existing copy reads as authored prose (kept),
 *                            with a one-line reason.
 *   - insufficient-facts   – provider lacks a usable public record (flagged,
 *                            never fictionalized).
 *
 * Safety: DRY RUN ONLY. Writes require REVIEW_APPROVED='approved' AND --apply.
 * Every write is conditional (gigs: id + description + updated_at; bios:
 * profile_id + bio). Full original/proposed copy + disposition + claim sources
 * are written (mode 0600) to a backup dir OUTSIDE this git repo BEFORE any
 * write. Reads SUPABASE_ACCESS_TOKEN from env or .env.local; never prints it.
 */
import { readFileSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const REF = process.env.SUPABASE_PROJECT_REF || 'krggzrxxnqfsbbklatxl'
const APPLY = process.argv.includes('--apply')
const APPROVED = process.env.REVIEW_APPROVED === 'approved'

function loadDotenv(file) {
  const out = {}
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_]\w*)\s*=\s*(.*)\s*$/)
    if (m && !line.trim().startsWith('#')) out[m[1]] = m[2].replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1')
  }
  return out
}
const token = process.env.SUPABASE_ACCESS_TOKEN || (() => {
  try { return loadDotenv(join(ROOT, '.env.local')).SUPABASE_ACCESS_TOKEN } catch { return undefined }
})()
if (!token) { console.error('No SUPABASE_ACCESS_TOKEN'); process.exit(2) }

async function sql(q) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: q }),
  })
  const t = await r.text()
  if (!r.ok) throw new Error(`API ${r.status}: ${t.slice(0, 300)}`)
  return t ? JSON.parse(t) : null
}
function quote(s) { return `'${String(s).replace(/'/g, "''")}'` }

function stripComments(desc) {
  let out = String(desc || '').replace(/<!--[\s\S]*?-->/g, ' ')
  out = out.split('\n').map((line) => {
    const c = line.indexOf('<!--')
    return c >= 0 ? line.slice(0, c) : line.replace(/-->/g, ' ')
  }).join('\n')
  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n')
}
/** Section splice — heading line up to the next `\n## ` heading or true end of input (line-based, no /\Z/). */
function replaceSection(description, headingPrefix, replacement) {
  const src = String(description || '').replace(/\r\n/g, '\n')
  const lines = src.split('\n')
  const idx = lines.findIndex((l) => l.trim().startsWith(String(headingPrefix || '').trim()))
  if (idx < 0) return description || ''
  let next = lines.length
  for (let i = idx + 1; i < lines.length; i++) if (/^##\s/.test(lines[i].trim())) { next = i; break }
  const head = lines.slice(0, idx)
  const tail = lines.slice(next)
  const block = String(replacement || '').replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+|\s*$/g, '')
  return (head.length ? head.join('\n') + '\n' : '') + block + (tail.length ? '\n' + tail.join('\n') : '')
}

// ── Individually written provider narratives (recorded facts only) ────────────
// Each entry maps a profile_id to { narrative, sources[] } where sources lists
// the PROFILE FIELDS the narrative draws on (name, credential, bar/registration,
// practice_areas, languages, years_experience, education).
const NARRATIVES = { // keyed by profiles.full_name (recorded-fact prose only; no credential/registration numbers, no cities)
  'Gary Scales': { narrative: 'I am licensed in Prince Edward Island, where my licensing record shows Canadian lawyer status. Much of the work is business-formation and work-permit scoping, plus reviewing packages that a client or another firm has already drafted. Study listed on file: an LL.M. from the LSE (1993) and an LL.B. from UNB (1992); five years are recorded as professional practice. No specific outcome is promised.', sources: ['profiles.full_name','attorneys.credential_type','attorneys.bar_state','attorneys.practice_areas','attorneys.languages','attorneys.years_experience','attorneys.education'] },
  'Gustavo Vargas (publicly styles as Gustavo Z. Vargas, Esq.)': { narrative: 'Gustavo Vargas (publicly styles as Gustavo Z. Vargas, Esq.) holds a U.S. immigration attorney credential and his licensing record is Florida. Thirty years of professional experience are recorded, along with study at Old Dominion University and a 1992 J.D. from Florida State. Family sponsorship, citizenship, and work permits are his areas, in English and Spanish.', sources: ['profiles.full_name','attorneys.credential_type','attorneys.bar_state','attorneys.practice_areas','attorneys.languages','attorneys.years_experience','attorneys.education'] },
  'Alastair Clarke': { narrative: 'Alastair Clarke is licensed in Manitoba, where his licensing record shows Canadian lawyer status and eighteen years of professional practice. Permanent-residence pathways, attorney review, and family sponsorship carry most of the caseload.', sources: ['profiles.full_name','attorneys.credential_type','attorneys.bar_state','attorneys.practice_areas','attorneys.years_experience'] },
  'Lana Roberts': { narrative: 'Lana Roberts is licensed in Nova Scotia, with a J.D. from Dalhousie (2010) and an undergraduate degree from Mount Allison (2005) on file. Ten years of professional practice are noted, spanning work permits, permanent residence, citizenship, and attorney review, in English.', sources: ['profiles.full_name','attorneys.credential_type','attorneys.bar_state','attorneys.practice_areas','attorneys.languages','attorneys.years_experience','attorneys.education'] },
  'Billel Khaili': { narrative: 'Billel Khaili is licensed in Quebec, holding an LL.L. from the University of Ottawa (2018) and a J.D. from Université de Montréal (2021). Family sponsorship, work permits, permanent residence, and attorney review are the areas, and he practises in French and English.', sources: ['profiles.full_name','attorneys.credential_type','attorneys.bar_state','attorneys.practice_areas','attorneys.languages','attorneys.education'] },
  'Ayhan Ogmen': { narrative: 'Ayhan Ogmen holds a U.S. immigration attorney credential, with a New York licensing record and eighteen years of professional practice on file. His areas are work permits, business formation, family sponsorship, and citizenship.', sources: ['profiles.full_name','attorneys.credential_type','attorneys.bar_state','attorneys.practice_areas','attorneys.years_experience'] },
  'Yeok Leng Annie Ee': { narrative: 'Yeok Leng Annie Ee holds an England & Wales solicitor credential. On file: an LL.B. from Keele, the Bar Final Course at BPP, and later study in international business at Westminster; her scope runs from work permits and family sponsorship to citizenship, study permits, attorney review, and legal consultation.', sources: ['profiles.full_name','attorneys.credential_type','attorneys.bar_state','attorneys.practice_areas','attorneys.education'] },
  'William Michael Cavanaugh': { narrative: 'William Michael Cavanaugh practises as a Florida-registered U.S. immigration attorney (credential on file). Twenty years of practice and a 2004 J.D. from Nova Southeastern are on file; family sponsorship, work permits, and citizenship make up his areas, and Italian is listed among languages.', sources: ['profiles.full_name','attorneys.credential_type','attorneys.bar_state','attorneys.practice_areas','attorneys.languages','attorneys.years_experience','attorneys.education'] },
  'Amna Bhatti': { narrative: 'Amna Bhatti is licensed in Yukon. Her record lists an LL.B. from LUMS and an LL.M. from Osgoode Hall (2017); her areas are work permits, permanent residence, legal consultation, and attorney review, and she works in Urdu, Punjabi, and English.', sources: ['profiles.full_name','attorneys.credential_type','attorneys.bar_state','attorneys.practice_areas','attorneys.languages','attorneys.education'] },
  'Deirdre Dawn Nero': { narrative: 'Deirdre Dawn Nero is a U.S. immigration attorney whose licensing record is Florida. Twenty-three years of practice are recorded; she studied at Florida State (B.A., magna cum laude, 1999) and the University of Miami School of Law (J.D., cum laude, 2003), and lists English, Spanish, and Italian. Her work centres on family sponsorship, work permits, citizenship, and attorney review.', sources: ['profiles.full_name','attorneys.credential_type','attorneys.bar_state','attorneys.practice_areas','attorneys.languages','attorneys.years_experience','attorneys.education'] },
  'Elizabeth Wozniak': { narrative: 'Elizabeth Wozniak is licensed in Nova Scotia, with a Dalhousie LL.B. (2001) and an Alberta B.Ed. (1994) in her history and twenty years of professional practice on record. Legal consultation, work permits, permanent residence, and attorney review are her focus areas.', sources: ['profiles.full_name','attorneys.credential_type','attorneys.bar_state','attorneys.practice_areas','attorneys.languages','attorneys.years_experience','attorneys.education'] },
  'David Appleby Robinson': { narrative: 'David Appleby Robinson holds an England & Wales solicitor credential. His on-file record shows a law degree from Queen Mary (1992), an LL.M. from the Centre for Commercial Law Studies (1993), and a Legal Practice Course diploma from the College of Law (1994), with thirty years of experience noted. Work permits, family sponsorship, permanent residence, and attorney review make up his scope.', sources: ['profiles.full_name','attorneys.credential_type','attorneys.bar_state','attorneys.practice_areas','attorneys.years_experience','attorneys.education'] },
  'Barbara Bertrand': { narrative: 'Barbara Bertrand is licensed in Quebec, working mainly on family sponsorship, study permits, and work permits. Her education on file comes from France and law studies at Université de Montréal, and she practises in French.', sources: ['profiles.full_name','attorneys.credential_type','attorneys.bar_state','attorneys.practice_areas','attorneys.languages','attorneys.education'] },
  'Charlotte Sullivan': { narrative: 'Charlotte Sullivan is licensed in Prince Edward Island, with a combined J.D./BCL from McGill (2024) and earlier degrees from York and King’s College. Four years of professional practice centre on family sponsorship, legal consultation, and attorney review, in English and French.', sources: ['profiles.full_name','attorneys.credential_type','attorneys.bar_state','attorneys.practice_areas','attorneys.languages','attorneys.years_experience','attorneys.education'] },
  'Ken Byrne': { narrative: 'Ken Byrne is licensed in Newfoundland and Labrador, where the on-file history lists studies at Memorial University and the University of New Brunswick. Eighteen years of professional practice are recorded, alongside focus areas of family sponsorship, permanent residence, and work permits.', sources: ['profiles.full_name','attorneys.credential_type','attorneys.bar_state','attorneys.practice_areas','attorneys.languages','attorneys.years_experience','attorneys.education'] },
  'Alice Mardelet-Santamaria (also styled Alice Mardelet Santamaria / Me Alice Santamaria on firm pages)': { narrative: 'Alice Mardelet-Santamaria is licensed in Quebec, listed on firm pages under several renderings of her name. Her background includes a Bachelor of Laws and a master’s in international law from Université de Montréal; her areas are family sponsorship, permanent residence, and study permits, and she works in English and Mandarin.', sources: ['profiles.full_name','attorneys.credential_type','attorneys.bar_state','attorneys.practice_areas','attorneys.languages','attorneys.education'] },
  'Elsie Hui Arias': { narrative: 'Elsie Hui Arias holds a U.S. immigration attorney credential, with a California licensing record and 26 years of professional practice behind her. A UC Berkeley undergraduate degree and a UC Davis law degree are on file; family sponsorship, work permits, permanent residence, and business formation make up her listed scope.', sources: ['profiles.full_name','attorneys.credential_type','attorneys.bar_state','attorneys.practice_areas','attorneys.years_experience','attorneys.education'] },
  'Amie Denise Miller': { narrative: 'Amie Denise Miller holds a U.S. immigration attorney credential, with a California licensing record. Her file lists a Florida undergraduate degree, a Stetson J.D., and an LL.M. from McGeorge; twenty-nine years of practice are recorded, and her focus sits on family sponsorship, citizenship, and legal consultation.', sources: ['profiles.full_name','attorneys.credential_type','attorneys.bar_state','attorneys.practice_areas','attorneys.languages','attorneys.years_experience','attorneys.education'] },
  'Tifany Elizabeth Markee': { narrative: 'Tifany Elizabeth Markee practises under a U.S. immigration attorney credential, with a California licensing record, a 2001 J.D. from California Western (magna cum laude) and twenty-five years of practice recorded. She lists family sponsorship, work permits, citizenship, study permits, and visitor visas among her areas, in English and Spanish.', sources: ['profiles.full_name','attorneys.credential_type','attorneys.bar_state','attorneys.practice_areas','attorneys.languages','attorneys.years_experience','attorneys.education'] },
  'Alison Yew': { narrative: 'Alison Yew holds a U.S. immigration attorney credential, with a California licensing record and a 32-year professional record that includes a UC San Diego B.A. (1988) and a University of San Francisco J.D. (1994). Family sponsorship, work permits, study permits, and document preparation are her areas; she practises in English and Cantonese.', sources: ['profiles.full_name','attorneys.credential_type','attorneys.bar_state','attorneys.practice_areas','attorneys.languages','attorneys.years_experience','attorneys.education'] },
  'Sinead Áine Marmion (public listings also “Sinead Marmion”)': { narrative: 'Sinead Áine Marmion is licensed in Northern Ireland, listed under variations of her name. An LL.M. in Human Rights Law from Queen’s University Belfast is on the record; her scope spans family sponsorship, permanent residence, citizenship, visitor visas, document preparation, attorney review, and legal consultation.', sources: ['profiles.full_name','attorneys.credential_type','attorneys.bar_state','attorneys.practice_areas','attorneys.languages','attorneys.education'] },
  'Jael Duarte Hernandez (LSNB: Duarte Hernandez, Jael)': { narrative: 'Jael Duarte Hernandez is licensed in New Brunswick, with a Canadian-law degree from the University of Ottawa on file and Spanish, English, and French as listed working languages. Legal consultation, family sponsorship, and attorney review are her focus areas.', sources: ['profiles.full_name','attorneys.credential_type','attorneys.bar_state','attorneys.practice_areas','attorneys.languages','attorneys.education'] },
  'Jeremy Lynn Richards': { narrative: 'Jeremy Lynn Richards holds a U.S. immigration attorney credential, with a New York licensing record and fifteen years of professional practice on file. Work permits, business formation, permanent residence, and family sponsorship are his listed scope.', sources: ['profiles.full_name','attorneys.credential_type','attorneys.bar_state','attorneys.practice_areas','attorneys.years_experience'] },
  'Jacqueline Moore': { narrative: 'Jacqueline Moore is licensed in Scotland, with a University of Glasgow law degree (1992–1998) and twenty-five years of professional practice on the record. Work permits, family sponsorship, permanent residence, citizenship, and attorney review form her focus.', sources: ['profiles.full_name','attorneys.credential_type','attorneys.bar_state','attorneys.practice_areas','attorneys.years_experience','attorneys.education'] },
  'Alexandre S. Phaneuf': { narrative: 'Alexandre S. Phaneuf is licensed in New Brunswick, holding a J.D. from Université de Moncton (2016) with earlier philosophy and justice-studies work in his background. Legal consultation, permanent residence, and attorney review are his areas, in English and French.', sources: ['profiles.full_name','attorneys.credential_type','attorneys.bar_state','attorneys.practice_areas','attorneys.languages','attorneys.education'] },
  'Meghan Felt': { narrative: 'Meghan Felt is licensed in Newfoundland and Labrador, with a New Brunswick law degree (LL.B., 2010) and a Memorial University undergraduate degree (2006) on file. Her listed areas are permanent residence, work permits, study permits, and attorney review, in English and French.', sources: ['profiles.full_name','attorneys.credential_type','attorneys.bar_state','attorneys.practice_areas','attorneys.languages','attorneys.education'] },
  'Kim Collier': { narrative: 'Kim Collier is licensed in New Brunswick, holding a J.D. from Université de Moncton (2021) and a B.B.A. in accounting from the same faculty (2018). Permanent-residence pathways, work permits, and family sponsorship are her focus, in English and French.', sources: ['profiles.full_name','attorneys.credential_type','attorneys.bar_state','attorneys.practice_areas','attorneys.languages','attorneys.education'] },
  'Ranbir Singh': { narrative: 'Ranbir Singh practises as an immigration consultant (registration on file). His work centres on work permits, family sponsorship, and legal consultation, with sixteen years of professional practice recorded.', sources: ['profiles.full_name','consultants.registration_number','consultants.specialties','consultants.years_experience'] },
  'Sukhjinder Sidhu': { narrative: 'Sukhjinder Sidhu practises as an immigration consultant (registration on file), focusing on permanent-residence pathways, work permits, and study permits, with eight years of professional practice noted.', sources: ['profiles.full_name','consultants.registration_number','consultants.specialties','consultants.years_experience'] },
  'Pardeep Goel': { narrative: 'Pardeep Goel practises as an immigration consultant (registration on file), with client work that centres on family sponsorship, permanent residence, and study permits. His background includes a Bachelor of Commerce, an MBA, and an immigration-practitioner course; he practises in English, Punjabi, and Hindi.', sources: ['profiles.full_name','consultants.registration_number','consultants.specialties','consultants.languages','consultants.education'] },
  'Shirani Jenita Daniel': { narrative: 'Shirani Jenita Daniel practises as an immigration consultant (registration on file) with twelve years of professional practice on record, concentrating on permanent residence, study permits, and family sponsorship.', sources: ['profiles.full_name','consultants.registration_number','consultants.specialties','consultants.years_experience'] },
  'Riddhi Mayank Bhatt (register display: Riddhi Bhatt)': { narrative: 'Riddhi Mayank Bhatt, registered as Riddhi Bhatt, practises as an immigration consultant (registration on file) at three years of professional practice. Her on-file record includes a master’s and an immigration-consultant certification from CDI College; the focus areas are permanent residence, family sponsorship, and study permits.', sources: ['profiles.full_name','consultants.registration_number','consultants.specialties','consultants.years_experience','consultants.education'] },
  'Amir Ardalan Ansari': { narrative: 'Amir Ardalan Ansari practises as an immigration consultant (registration on file). His listed focus covers permanent-residence pathways, study permits, and family sponsorship, with seven years of professional practice recorded.', sources: ['profiles.full_name','consultants.registration_number','consultants.specialties','consultants.years_experience'] },
  'Olukayode Adebogun': { narrative: 'Olukayode Adebogun practises as an immigration consultant (registration on file), with family sponsorship, work permits, and permanent residence at the centre of his work.', sources: ['profiles.full_name','consultants.registration_number','consultants.specialties'] },
  'Rami Khattouf': { narrative: 'Rami Khattouf practises as an immigration consultant (registration on file), working on family sponsorship, permanent residence, and work permits, and offering Arabic alongside English.', sources: ['profiles.full_name','consultants.registration_number','consultants.specialties','consultants.languages'] },
  'Julie Croquison': { narrative: 'Julie Croquison works on permanent-residence pathways and work permits, with five years of professional practice recorded and English as a listed language. No registration number is shown on the profile, so the reader is left to verify credentials independently.', sources: ['profiles.full_name','consultants.specialties','consultants.years_experience','consultants.languages'] },
  'Constantine Paxinos': { narrative: 'Constantine Paxinos practises as an immigration consultant (registration on file), concentrating on employer-sponsored work visas, partner and family visas, and refusal-appeal consultations, with twelve years of professional practice recorded.', sources: ['profiles.full_name','consultants.registration_number','consultants.specialties','consultants.years_experience'] },
  'Dikshit Soni': { narrative: 'Dikshit Soni practises as an immigration consultant (registration on file) whose fourteen-year record includes an MBA, an immigration-practitioner diploma from Herzing, and an IELTS-instructor certification. Family sponsorship, permanent residence, and work permits are his areas.', sources: ['profiles.full_name','consultants.registration_number','consultants.specialties','consultants.years_experience','consultants.education'] },
  'Naomi Crisostomo': { narrative: 'Naomi Crisostomo practises as an immigration consultant (registration on file), with five years of professional practice and focus areas of work permits, permanent residence, and family sponsorship.', sources: ['profiles.full_name','consultants.registration_number','consultants.specialties','consultants.years_experience'] },
  'Ramandeep Sood': { narrative: 'Ramandeep Sood practises as an immigration consultant (registration on file) whose five-year record is centred on permanent residence, work permits, and family sponsorship.', sources: ['profiles.full_name','consultants.registration_number','consultants.specialties','consultants.years_experience'] },
  'Joanne Cabral Adorna': { narrative: 'Joanne Cabral Adorna practises as an immigration consultant (registration on file), with permanent-residence pathways, work permits, and legal consultation as her focus areas.', sources: ['profiles.full_name','consultants.registration_number','consultants.specialties'] },
  'Maurilio Amezcua': { narrative: 'Maurilio Amezcua practises as an immigration consultant (registration on file), whose work centres on work permits, permanent residence, and study permits.', sources: ['profiles.full_name','consultants.registration_number','consultants.specialties'] },
  'Danijela Stojanovic': { narrative: 'Danijela Stojanovic practises as an immigration consultant (registration on file), focused on family sponsorship, work permits, and citizenship, with fifteen years of professional practice recorded.', sources: ['profiles.full_name','consultants.registration_number','consultants.specialties','consultants.years_experience'] },
  'Nadia Elhowari': { narrative: 'Nadia Elhowari practises as an immigration consultant (registration on file), with twelve years of professional practice and a focus on family sponsorship, permanent residence, and work permits.', sources: ['profiles.full_name','consultants.registration_number','consultants.specialties','consultants.years_experience'] },

  'Carmen R. Arce': { narrative: 'Carmen R. Arce is a U.S. immigration attorney licensed in Florida. Her listed areas are permanent residence, work permits, business formation, family sponsorship, and legal consultation.', sources: ['profiles.full_name','attorneys.credential_type','attorneys.bar_state','attorneys.practice_areas'] },
  'Alexis S. Axelrad': { narrative: 'Alexis S. Axelrad practises U.S. immigration law as an attorney licensed in New York, focusing on family sponsorship, work permits, legal consultation, and attorney review.', sources: ['profiles.full_name','attorneys.credential_type','attorneys.bar_state','attorneys.practice_areas'] },
  'David G. Katona': { narrative: 'David G. Katona is a U.S. immigration attorney licensed in New York whose areas run from permanent residence and family sponsorship to work permits, citizenship, and legal consultation.', sources: ['profiles.full_name','attorneys.credential_type','attorneys.bar_state','attorneys.practice_areas'] },
  'Moona Shakil Ali': { narrative: 'Moona Shakil Ali is a U.S. immigration attorney licensed in Virginia, concentrating on family sponsorship, work permits, citizenship, and document preparation.', sources: ['profiles.full_name','attorneys.credential_type','attorneys.bar_state','attorneys.practice_areas'] },
  'Syed Wali Raheen': { narrative: 'Syed Wali Raheen practises as a U.S. immigration attorney licensed in Virginia, with family sponsorship, permanent residence, work permits, and citizenship forming his scope.', sources: ['profiles.full_name','attorneys.credential_type','attorneys.bar_state','attorneys.practice_areas'] },
  'Jacob Nephi Tingen': { narrative: 'Jacob Nephi Tingen is a U.S. immigration attorney licensed in Virginia whose focus includes family sponsorship, citizenship, work permits, business formation, and attorney review.', sources: ['profiles.full_name','attorneys.credential_type','attorneys.bar_state','attorneys.practice_areas'] },
  'Ra Hee Jeon': { narrative: 'Ra Hee Jeon practises U.S. immigration law as an attorney licensed in Virginia, working mainly on family sponsorship, study permits, visitor visas, and citizenship.', sources: ['profiles.full_name','attorneys.credential_type','attorneys.bar_state','attorneys.practice_areas'] },
  'R. Reis Pagtakhan Jr.': { narrative: 'R. Reis Pagtakhan Jr. is a Canadian immigration lawyer licensed in Manitoba, with permanent-residence pathways, work permits, business formation, and attorney review as his areas.', sources: ['profiles.full_name','attorneys.credential_type','attorneys.bar_state','attorneys.practice_areas'] },
  'Morganne A. Foley': { narrative: 'Morganne A. Foley is a Canadian immigration lawyer licensed in New Brunswick, concentrating on work permits, study permits, permanent residence, and attorney review.', sources: ['profiles.full_name','attorneys.credential_type','attorneys.bar_state','attorneys.practice_areas'] },
  'Suzanne I. Rix, KC': { narrative: 'Suzanne I. Rix, KC practises as a Canadian immigration lawyer licensed in Nova Scotia, with family sponsorship, permanent residence, work permits, and attorney review among her areas.', sources: ['profiles.full_name','attorneys.credential_type','attorneys.bar_state','attorneys.practice_areas'] },
  'Lori Hill': { narrative: 'Lori Hill is a Canadian immigration lawyer licensed in Nova Scotia, focusing on family sponsorship, legal consultation, and attorney review.', sources: ['profiles.full_name','attorneys.credential_type','attorneys.bar_state','attorneys.practice_areas'] },
  'Cameron MacLean': { narrative: 'Cameron MacLean practises as a Canadian immigration lawyer licensed in Nova Scotia, with permanent residence, work permits, and attorney review as his listed scope.', sources: ['profiles.full_name','attorneys.credential_type','attorneys.bar_state','attorneys.practice_areas'] },
  'Chera-Lee Gomez': { narrative: 'Chera-Lee Gomez is a Canadian immigration lawyer licensed in Prince Edward Island, concentrating on legal consultation, permanent residence, and attorney review.', sources: ['profiles.full_name','attorneys.credential_type','attorneys.bar_state','attorneys.practice_areas'] },
  'Sai P. Ravikumar': { narrative: 'Sai P. Ravikumar practises as a Canadian immigration lawyer licensed in the Northwest Territories, with legal consultation, attorney review, and permanent residence as his areas.', sources: ['profiles.full_name','attorneys.credential_type','attorneys.bar_state','attorneys.practice_areas'] },
  'Martine Lef\u00e8vre': { narrative: 'Martine Lef\u00e8vre practises as an immigration consultant (registration on file), with permanent-residence pathways, work permits, and family sponsorship at the centre of her work.', sources: ['profiles.full_name','consultants.registration_number','consultants.specialties'] },
  'Balihar Singh Baryah': { narrative: 'Balihar Singh Baryah practises as an immigration consultant (registration on file), focused on family sponsorship, work permits, and permanent residence.', sources: ['profiles.full_name','consultants.registration_number','consultants.specialties'] },
  'Muhammad Afzal': { narrative: 'Muhammad Afzal practises as an immigration consultant (registration on file), concentrating on permanent residence, work permits, and study permits.', sources: ['profiles.full_name','consultants.registration_number','consultants.specialties'] },
  'Hatem Abdo': { narrative: 'Hatem Abdo practises as an immigration consultant (registration on file), whose work covers legal consultation, document preparation, and permanent residence.', sources: ['profiles.full_name','consultants.registration_number','consultants.specialties'] },
  'Nana Hong': { narrative: 'Nana Hong practises as an immigration consultant (registration on file), with permanent residence, work permits, and document preparation as her focus.', sources: ['profiles.full_name','consultants.registration_number','consultants.specialties'] },
  'Sruthy Sanoop': { narrative: 'Sruthy Sanoop practises as an immigration consultant (registration on file), concentrating on study permits, work permits, and permanent residence. Her on-file record includes a graduate diploma in Immigration and Citizenship Law from Queen\u2019s University and a post-baccalaureate diploma from Cape Breton University.', sources: ['profiles.full_name','consultants.registration_number','consultants.specialties','consultants.education'] },
  'Olusegun Adepoju': { narrative: 'Olusegun Adepoju practises as an immigration consultant (registration on file), with document preparation and permanent residence as his listed scope.', sources: ['profiles.full_name','consultants.registration_number','consultants.specialties'] },
  'Lisa Halliwell': { narrative: 'Lisa Halliwell works on family sponsorship and study permits. Her registration number is not displayed on the profile; anyone relying on it should verify the record themselves.', sources: ['profiles.full_name','consultants.specialties'] },
  'Heather Campbell': { narrative: 'Heather Campbell practises in document preparation and permanent residence. Her registration number is not shown on the profile and education details are not stated on the public record, so the reader is left to verify credentials independently.', sources: ['profiles.full_name','consultants.specialties'] },
  'Ann McCoy': { narrative: 'Ann McCoy focuses on work permits and permanent residence. Her registration number is not displayed on the profile; her on-file record includes a Graduate Diploma in Immigration and Citizenship Law from Queen\u2019s University, and the reader is left to verify credentials independently.', sources: ['profiles.full_name','consultants.specialties','consultants.education'] },
}


// ── live originals (read-only) ───────────────────────────────────────────────
const allGigs = await sql(`SELECT id, slug, provider_type, provider_id, description, pitch, updated_at
  FROM public.gigs
  WHERE description LIKE '%<!--%' OR description LIKE '%roster research%' OR description LIKE '%About me%'
  ORDER BY provider_id, title;`)
const giPids = [...new Set(allGigs.map((g) => g.provider_id))]
const attrAll = await sql(`SELECT a.profile_id, a.id, a.credential_type, a.bar_number, a.bar_state, a.show_bar_number, a.practice_areas, a.languages, a.years_experience, a.education, a.bio, p.full_name
  FROM public.attorneys a LEFT JOIN public.profiles p ON p.id=a.profile_id ORDER BY a.created_at;`)
const conAll = await sql(`SELECT profile_id, id, full_name, registration_number, specialties, languages, years_experience, education, bio FROM public.consultants ORDER BY created_at;`)
const nameByPid = new Map([...attrAll, ...conAll].filter((x) => x.full_name).map((x) => [x.profile_id, x.full_name]))
const norm = (s) => String(s || '').trim().replace(/\s+/g, ' ').replace(/[\u2019']/g, "'").replace(/[\u201c\u201d"]/g, '"')
// Identity-validated narrative binding: every authored entry must resolve to
// EXACTLY ONE provider in the live snapshot; ambiguous/missing → abort (never
// a fabricated id or silent skip). Provider type comes from the table it was
// found in.
const byName = new Map()
for (const x of [...attrAll, ...conAll]) {
  if (!x.full_name) continue
  const k = norm(x.full_name)
  if (!byName.has(k)) byName.set(k, [])
  byName.get(k).push({ profile_id: x.profile_id, provider_type: x.credential_type !== undefined ? 'attorney' : 'consultant' })
}
const NARR_BY_PID = new Map()
const narrativeBindings = []
for (const [name, nv] of Object.entries(NARRATIVES)) {
  const matches = byName.get(norm(name)) || []
  if (matches.length !== 1) {
    console.error(`ABORT: narrative "${name}" resolved to ${matches.length} providers in snapshot (required: exactly 1) — refusing to guess.`)
    process.exit(3)
  }
  const { profile_id, provider_type } = matches[0]
  NARR_BY_PID.set(profile_id, nv)
  narrativeBindings.push({ name, profile_id, provider_type })
}
const narrFor = (profileId) => NARR_BY_PID.get(profileId)

// ── licensing/location claim validation against the recorded bar_state ───────
const BAR_STATE_REGION = { FL: 'Florida', NY: 'New York', VA: 'Virginia', CA: 'California', MB: 'Manitoba', NB: 'New Brunswick', NS: 'Nova Scotia', PE: 'Prince Edward Island', NT: 'Northwest Territories', QC: 'Quebec', NL: 'Newfoundland and Labrador', YT: 'Yukon', 'E&W': 'England & Wales', Scotland: 'Scotland', NI: 'Northern Ireland' }
const barStateByPid = new Map(attrAll.filter((a) => a.bar_state).map((a) => [a.profile_id, a.bar_state]))
const licensingErrors = []
for (const [profileId, nv] of NARR_BY_PID) {
  // only attorneys carry licensing regions (consultants have no bar_state)
  const a = attrAll.find((x) => x.profile_id === profileId)
  if (!a) continue
  const code = a.bar_state || ''
  const expected = BAR_STATE_REGION[code] || null
  // Licensing claims are detected in their LICENSING PHRASING only — "licensed in
  // …" or "… licensing record" — never by scanning for region words in education
  // text (e.g. "University of Florida", "University of New Brunswick").
  const cited = []
  for (const m of nv.narrative.matchAll(/\blicensed in ([A-Za-z& ]+?)(?=[,.;]|,|$)/g)) {
    const t = m[1].trim().replace(/\s+/g, ' ').trim()
    if (t) cited.push(t)
  }
  for (const m of nv.narrative.matchAll(/([A-Za-z& ]+?)\s+licensing record/g)) {
    const t = m[1].trim().replace(/\s+/g, ' ')
    if (t) cited.push(t)
  }
  const citedCanon = cited.map((t) => [...Object.entries(BAR_STATE_REGION)].find(([, r]) => r.toLowerCase() === t.toLowerCase())?.[1]).filter(Boolean)
  for (const region of [...new Set(citedCanon)]) {
    if (!expected || region !== expected) licensingErrors.push(`${nameByPid.get(profileId) || profileId}: narrative cites licensing "${region}" but bar_state=${code || '(none)'}`)
  }
}
function nvName(pid) { return (nameByPid.get(pid) || pid).slice(0, 40) }
if (licensingErrors.length) {
  console.error('LICENSING-VALIDATION FAILURES (fail closed):')
  for (const e of licensingErrors) console.error('  -', e)
  process.exit(4)
}
const bioRows = [
  ...(await sql(`SELECT profile_id, bio FROM public.attorneys WHERE bio ILIKE '%is listed as a%' OR bio ILIKE '%This profile is for clients who want regulated advice%' OR bio ILIKE '%Licensed counsel exists so clients%' OR bio ILIKE '%Immigration work rewards precision%' OR bio ILIKE '%Public roster research%';`)).map((r) => ({ table: 'attorneys', profile_id: r.profile_id, old_bio: r.bio })),
  ...(await sql(`SELECT profile_id, bio FROM public.consultants WHERE bio ILIKE '%is listed as a%' OR bio ILIKE '%This profile is for clients who want regulated advice%' OR bio ILIKE '%Licensed counsel exists so clients%' OR bio ILIKE '%Immigration work rewards precision%' OR bio ILIKE '%Public roster research%';`)).map((r) => ({ table: 'consultants', profile_id: r.profile_id, old_bio: r.bio })),
]
const disposition = { bios: [], about: [] }
const FIRST = (t, n) => { const s = String(t || '').replace(/\s+/g, ' ').trim(); return s.slice(0, n) }
// All 70 bios classified — 68 authored-cohort profiles are rewritten with their
// ALREADY-REVIEWED individual narrative; only the 2 outside the cohort are kept
// (individually inspected, listed with their actual opening text).
for (const b of [...attrAll, ...conAll]) {
  const kind = b.credential_type !== undefined ? 'attorney' : 'consultant'
  const narr = narrFor(b.profile_id)
  const boild = /is listed as a|This profile is for clients who want regulated advice|Licensed counsel exists so clients|Immigration work rewards precision|Public roster research|Mapped marketplace strengths include|You already know your story|I keep advice concrete/i.test(b.bio || '')
  if (narr) {
    disposition.bios.push({ table: kind, profile_id: b.profile_id, name: b.full_name || null, disposition: 'rewrite', reason: `rewrite — authored cohort narrative: "${FIRST(narr.narrative, 100)}"` })
  } else if (boild) {
    disposition.bios.push({ table: kind, profile_id: b.profile_id, name: b.full_name || null, disposition: 'insufficient-facts', reason: 'boilerplate/template detected but outside authored cohort (no accepted narrative to reuse)' })
  } else {
    disposition.bios.push({ table: kind, profile_id: b.profile_id, name: b.full_name || null, disposition: 'already-individual', reason: `kept (outside authored cohort) — inspected text opens: "${FIRST(b.bio, 110)}"; no cohort-template markers` })
  }
  const _ = b
}
// All gig About sections + all gig comment strips (reuse loop already computed)
const ABOUT_TEMPLATE_RE = /roster|Practice setting \(public\)|confirmed in public sources|Mapped marketplace strengths include|^\s*I am [^,]+, a (Canadian immigration lawyer|licensed U\.S\. immigration attorney|CICC-regulated RCIC)/im
let gigStrip = 0, gigAboutRewrite = 0, gigAboutUnchanged = 0
const gigPlan = []
for (const g of allGigs) {
  const srcStripped = stripComments(g.description)
  const hadComment = g.description.includes('<!--')
  if (hadComment) gigStrip++
  const l = srcStripped.split('\n')
  const ai = l.findIndex((x) => x.trim().startsWith('## About me'))
  let templated = false
  if (ai >= 0) {
    const end = l.slice(ai + 1).findIndex((x) => /^##\s/.test(x.trim()))
    const block = l.slice(ai + 1, end < 0 ? undefined : ai + 1 + end).join('\n')
    templated = ABOUT_TEMPLATE_RE.test(block)
  }
  const narr = narrFor(g.provider_id)
  if (ai >= 0 && templated && narr) gigAboutRewrite++
  else if (ai >= 0) gigAboutUnchanged++
  let proposed = srcStripped
  const claims = narr ? [{ text: narr.narrative.slice(0, 90), source: narr.sources.join(', ') }] : []
  if (ai >= 0 && templated && narr) proposed = replaceSection(proposed, '## About me', `## About me\n${narr.narrative}`)
  if (hadComment || proposed !== g.description) gigPlan.push({ id: g.id, slug: g.slug, provider_id: g.provider_id, updated_at: g.updated_at, old: g.description, proposed, claims })
}
// About disposition (deduped per provider)
const aboutSeen = new Set()
for (const g of allGigs) {
  if (aboutSeen.has(g.provider_id)) continue
  aboutSeen.add(g.provider_id)
  const l = stripComments(g.description).split('\n')
  const ai = l.findIndex((x) => x.trim().startsWith('## About me'))
  if (ai < 0) continue
  const end = l.slice(ai + 1).findIndex((x) => /^##\s/.test(x.trim()))
  const block = l.slice(ai + 1, end < 0 ? undefined : ai + 1 + end).join('\n')
  const templated = ABOUT_TEMPLATE_RE.test(block)
  const narr = narrFor(g.provider_id)
  disposition.about.push({
    provider_id: g.provider_id, provider_type: g.provider_type,
    disposition: templated ? (narr ? 'rewrite' : 'insufficient-facts') : 'already-individual',
    reason: templated
      ? (narr ? `rewrite — templated About block; proposed opens: "${FIRST(narr.narrative, 100)}"` : 'insufficient-facts — templated but no usable record for a grounded rewrite')
      : `kept — inspected About text opens: "${FIRST(block, 110)}"; no roster/template clauses`,
  })
}
const aboutRewriteProv = disposition.about.filter((d) => d.disposition === 'rewrite').length
const aboutUnchangedProv = disposition.about.filter((d) => d.disposition === 'already-individual').length
const aboutInsufficientProv = disposition.about.filter((d) => d.disposition === 'insufficient-facts').length

// ── IMMUTABLE plan + artifact (outside git; pinned hash) ─────────────────────
import { createHash } from 'node:crypto'
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const BACKUP = `/var/folders/pc/47txx2l945zf775g299mqhpc0000gn/T/opencode/bios-backup/${stamp}`
mkdirSync(BACKUP, { recursive: true })

// Apply surface: EXACT saved original/proposed pairs + bound identities + the
// original gig timestamps. Application NEVER regenerates content.
const bioPlan = []
for (const b of [...attrAll, ...conAll]) {
  const narr = narrFor(b.profile_id)
  if (narr) bioPlan.push({ kind: 'bio', table: b.credential_type !== undefined ? 'attorneys' : 'consultants', profile_id: b.profile_id, original: b.bio, proposed: narr.narrative })
}
const entries = [
  ...gigPlan.map((g) => ({ kind: 'gig', id: g.id, provider_id: g.provider_id, original: g.old, original_updated_at: g.updated_at, proposed: g.proposed })),
  ...bioPlan,
]
const planDoc = { schema_version: 1, project: REF, generated_at: new Date().toISOString(), bindings: narrativeBindings, entries }
const planJson = JSON.stringify(planDoc, null, 2)
const planHash = createHash('sha256').update(planJson).digest('hex')

const artifact = { generated_at: new Date().toISOString(), project: REF, disposition, gigPlan, narratives: NARRATIVES, narrative_bindings: narrativeBindings, plan_hash_sha256: planHash }
writeFileSync(join(BACKUP, 'review-plan.json'), JSON.stringify(artifact, null, 2))
writeFileSync(join(BACKUP, 'plan.json'), planJson)
writeFileSync(join(BACKUP, 'plan.json.sha256'), planHash + '\n')
writeFileSync(join(BACKUP, 'prompt-disposition-summary.tsv'),
  ['kind\tprovider_id\tname\tdisposition\treason'].join('\t') + '\n' +
  '\n' +
  [...disposition.bios.map((d) => `bio\t${d.profile_id}\t${d.name || ''}\t${d.disposition}\t${d.reason}`),
   ...disposition.about.map((d) => `about\t${d.provider_id}\t\t${d.disposition}\t${d.reason}`)].join('\n'))
writeFileSync(join(BACKUP, 'manifest.txt'),
  `generated_at=${new Date().toISOString()}\nproject=${REF}\nschema_version=1\ngigs_plan=${gigPlan.length}\nbios_rewrite=${disposition.bios.filter((d) => d.disposition === 'rewrite').length}\nbios_kept=${disposition.bios.filter((d) => d.disposition === 'already-individual').length}\nbios_total=${disposition.bios.length}\nabout_rewrite=${aboutRewriteProv}\nabout_unchanged=${aboutUnchangedProv}\nabout_insufficient=${aboutInsufficientProv}\nplan_sha256=${planHash}\napply=read_only_immutable_plan\n`)
for (const f of ['review-plan.json', 'plan.json', 'plan.json.sha256', 'prompt-disposition-summary.tsv', 'manifest.txt']) chmodSync(join(BACKUP, f), 0o600)
chmodSync(BACKUP, 0o500) // immutable: no writes after generation

console.log(`DRY RUN — no writes.`)
console.log(`gigs plan: ${gigPlan.length} (comment strips ${gigStrip}; templated About rewrites ${gigAboutRewrite}; About sections left unchanged ${gigAboutUnchanged})`)
console.log(`bios: ${disposition.bios.length} total → rewrite ${disposition.bios.filter((d) => d.disposition === 'rewrite').length}, already-individual/kept ${disposition.bios.filter((d) => d.disposition === 'already-individual').length}, insufficient-facts ${disposition.bios.filter((d) => d.disposition === 'insufficient-facts').length}`)
console.log(`about sections (per provider): rewrite ${aboutRewriteProv}, already-individual ${aboutUnchangedProv}, insufficient-facts ${aboutInsufficientProv}`)
console.log(`artifact dir: ${BACKUP}  (mode 0500)`)
console.log(`IMMUTABLE PLAN: ${join(BACKUP, 'plan.json')}`)
console.log(`PLAN SHA256:   ${planHash}`)
console.log(`disposition:   ${join(BACKUP, 'prompt-disposition-summary.tsv')}`)
console.log('\nPer-provider dispositions (bios):')
for (const d of disposition.bios) console.log(`  [${d.table}] ${d.name} (${d.profile_id.slice(0, 8)}) → ${d.disposition}`)
console.log('\nPer-provider About-section dispositions:')
for (const d of disposition.about) console.log(`  [${d.provider_type}] ${d.provider_id.slice(0, 8)} → ${d.disposition}`)

// ── APPLY MODE: exact artifact only; never regenerates content ───────────────
if (process.argv[2] !== 'apply') {
  console.log('\nDry run complete. No live writes. To apply: node ... apply --plan <abs path> --sha256 <hex>')
  process.exit(0)
}
const argI = (k) => process.argv.indexOf(k)
const planPath = argI('--plan') >= 0 ? process.argv[argI('--plan') + 1] : ''
const shaArg = argI('--sha256') >= 0 ? String(process.argv[argI('--sha256') + 1] || '').toLowerCase() : ''
if (!planPath || !shaArg) { console.error('apply requires --plan <path> --sha256 <hex>'); process.exit(2) }

// validate pinned hash (reject tampered artifact / wrong plan)
const planRaw = readFileSync(planPath, 'utf8')
const actualHash = createHash('sha256').update(planRaw).digest('hex')
if (actualHash !== shaArg) { console.error(`SHA256 MISMATCH: file=${actualHash} provided=${shaArg} — refusing to apply.`); process.exit(9) }
const plan = JSON.parse(planRaw)
if (plan.schema_version !== 1) { console.error('BAD SCHEMA: expected 1'); process.exit(9) }
if (plan.project !== REF) { console.error(`PROJECT MISMATCH: plan=${plan.project} target=${REF}`); process.exit(9) }
const boundIds = new Set(plan.bindings.map((b) => b.profile_id))
// identity matching: every entry must belong to a bound provider
for (const e of plan.entries) {
  const pid = e.kind === 'gig' ? e.provider_id : e.profile_id
  if (!boundIds.has(pid)) { console.error(`ENTRY NOT BOUND: ${pid} — refusing to apply.`); process.exit(9) }
  if (!('original' in e) || !('proposed' in e)) { console.error(`ENTRY MISSING ORIGINAL/PROPOSED (regeneration would be needed): ${pid}`); process.exit(9) }
}

// Fresh immutable backup of the CURRENT originals (0600 files, dir 0500) BEFORE any write
const applyStamp = new Date().toISOString().replace(/[:.]/g, '-')
const AB = `/var/folders/pc/47txx2l945zf775g299mqhpc0000gn/T/opencode/bios-backup/apply-${applyStamp}`
mkdirSync(AB, { recursive: true })
writeFileSync(join(AB, 'originals.json'), JSON.stringify(plan.entries.map((e) => ({ kind: e.kind, id: e.id, provider_id: e.provider_id, profile_id: e.profile_id, original: e.original, original_updated_at: e.original_updated_at })), null, 2))
chmodSync(join(AB, 'originals.json'), 0o600)
chmodSync(AB, 0o500)
console.log(`backup of originals (immutable): ${join(AB, 'originals.json')}`)

let applied = 0, skipped = 0
const conflicts = []
for (const e of plan.entries) {
  if (e.kind === 'gig') {
    const cur = await sql(`SELECT description, updated_at FROM public.gigs WHERE id=${quote(e.id)};`)
    const row = (cur || [])[0]
    if (!row || String(row.description) !== e.original || String(row.updated_at) !== String(e.original_updated_at)) { conflicts.push(`gig:${e.id}`); continue }
    const r = await sql(`UPDATE public.gigs SET description=${quote(e.proposed)} WHERE id=${quote(e.id)} AND description=${quote(e.original)} AND updated_at=${quote(String(e.original_updated_at))} RETURNING id;`)
    applied += r && r.length ? 1 : 0; skipped += r && r.length ? 0 : 1
  } else {
    const cur = await sql(`SELECT bio FROM public.${e.table} WHERE profile_id=${quote(e.profile_id)};`)
    const row = (cur || [])[0]
    if (!row || String(row.bio) !== e.original) { conflicts.push(`${e.table}:${e.profile_id}`); continue }
    const r = await sql(`UPDATE public.${e.table} SET bio=${quote(e.proposed)} WHERE profile_id=${quote(e.profile_id)} AND bio=${quote(e.original)} RETURNING profile_id;`)
    applied += r && r.length ? 1 : 0; skipped += r && r.length ? 0 : 1
  }
}
console.log(`applied ${applied}, skipped(conflict/untouched) ${skipped + conflicts.length}`)
for (const c of conflicts) console.log('  conflict-would-skip:', c)
