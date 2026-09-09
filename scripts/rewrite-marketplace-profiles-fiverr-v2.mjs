import { createClient } from '@supabase/supabase-js'

const RUN_TAG = 'fiverr-legal-profile-v2-2026-09-09'
const SNAPSHOT_REASON = `Pre-Fiverr legal profile v2 snapshot ${RUN_TAG}`
const APPLIED_REASON = `Fiverr legal profile v2 applied ${RUN_TAG}`
const EXPECTED_PROVIDERS = 70

if (process.env.MARKETPLACE_PROFILE_COPY_V2 !== '1') {
  console.log('[marketplace-profile-v2] disabled; no-op')
  process.exit(0)
}

const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_JWT || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
const xaiKey = String(process.env.XAI_API_KEY || '').trim()
const xaiModel = String(process.env.XAI_MODEL || 'grok-4.6').trim()
if (!supabaseUrl || !serviceKey) throw new Error('Missing Supabase production credentials')
if (!xaiKey) throw new Error('Missing authorized SuperGrok access token')

const db = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const GENERIC_BANNED = [
  'passionate about',
  'dedicated professional',
  'tailored to your needs',
  'comprehensive solutions',
  'trusted partner',
  'navigate complex',
  'every step of the way',
  'client satisfaction is key',
  'top-notch legal services',
  'results-driven',
  'best possible outcome',
  'best possible outcomes',
  'expert guidance',
  'seasoned professional',
  'look forward to working with you',
  'message me now',
  'contact me today',
]

const ARCHETYPES = [
  'Credential-led: open with the verified legal role and jurisdiction, then narrow quickly to the provider’s strongest actual practice focus.',
  'Client-led: open with the kind of buyer or matter reflected in the active service portfolio, then explain the provider’s role and verified credentials.',
  'Problem-led: open with one practical decision or document problem this provider repeatedly handles, then establish role, jurisdiction and approach.',
  'Portfolio-led: open with two or three related service themes from the active listings, then connect them to the provider’s verified professional background.',
  'Process-led: open with how this provider works—review, written findings, document preparation, strategy or evidence mapping—then establish credibility.',
  'Specialist-led: open with the narrowest verified specialty or practice area, then show who typically benefits without inventing a client history.',
  'Jurisdiction-led: open with the relevant country/state/province or cross-border scope, then state the provider’s role and the matters covered.',
  'Document-led: open with the documents, filings or written work this provider actually handles, then explain the professional lens applied to them.',
  'Conversational: use a polished buyer question or direct practical statement, then answer it with the provider’s verified role and focus. Avoid hype.',
  'Working-style-led: open with clarity, document discipline, written analysis or communication style supported by the service design, then add verified credentials.',
]

const PROFILE_SYSTEM = `You are the senior marketplace profile editor for YouSafe. Rewrite ONE attorney or consultant profile using the strongest current patterns seen on high-quality Fiverr legal and immigration profiles, while keeping every sentence original.

WHAT STRONG FIVERR LEGAL PROFILES DO:
- Their headline/tagline immediately signals legal role, jurisdiction, specialty, client niche, or the practical legal work they handle.
- Their first paragraph establishes who they are and why the buyer should trust them without a long generic greeting.
- They select a few relevant practice/service themes instead of dumping every possible legal service into a list.
- They use verified specifics—role, jurisdiction, years, languages, education, specialties, or service mix—as proof.
- They sound like an individual practitioner, not a marketplace template.
- Their closing is short and natural; not every profile needs the same call to action.

FACTUAL / YMYL RULES:
- Use ONLY supplied facts. Never invent client counts, success rates, case results, approval rates, employers, education, credentials, licence numbers, jurisdictions, languages, years of experience, awards or outcomes.
- Never promise an immigration, visa, court, business or legal outcome.
- An attorney may be called attorney/lawyer/solicitor only when the facts support it. A consultant must NEVER be relabelled as an attorney, lawyer or solicitor.
- Do not expose a registration or bar number unless the payload explicitly marks it public.
- Do not claim representation, litigation, court appearance, filing authority, notarization or regulated activity unless supplied facts support it.

ORIGINALITY RULES:
- Do not copy or closely paraphrase Fiverr sellers or any competitor.
- Do not reuse the same opening structure across the estate.
- Avoid generic marketplace filler: "passionate about", "dedicated professional", "tailored to your needs", "comprehensive solutions", "trusted partner", "navigate complex", "every step of the way", "top-notch legal services", "results-driven", "expert guidance", "seasoned professional", "client satisfaction is key".
- Do not start every bio with "I am" or "Hi, I’m". Use the assigned archetype naturally.
- Do not mechanically list all active gigs. Summarize the provider’s real service pattern into 2–4 coherent focus areas.

OUTPUT:
- tagline: 45–105 characters. A distinctive profile headline, not a gig title. No "I will". Prefer role/jurisdiction/specialty/client-fit specificity over adjectives. Avoid generic "expert" or "professional" unless necessary to state a verified role.
- intro: 40–85 words, 2–3 sentences. Give the buyer a fast, specific sense of role, focus and working style.
- bio: 130–240 words, first person, 3–4 natural short paragraphs. Establish positioning, selected focus areas, how the provider works, and verified differentiators. End naturally; vary whether there is a CTA.

Return one JSON object only with: tagline, intro, bio.`

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const compact = (value) => String(value ?? '').replace(/\s+/g, ' ').trim()
const normalize = (value) => compact(value).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
const opening = (value, words = 12) => normalize(value).split(' ').filter(Boolean).slice(0, words).join(' ')
const json = (value) => JSON.stringify(value, null, 2)

function parseJson(raw) {
  let text = String(raw || '').trim()
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) text = fence[1].trim()
  try { return JSON.parse(text) } catch {}
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1))
  throw new Error('Model did not return valid JSON')
}

async function postXai(system, user) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 150_000)
  try {
    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${xaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: xaiModel,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.8,
        max_tokens: 1800,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    })
    const text = await response.text()
    if (!response.ok) {
      const error = new Error(`xAI HTTP ${response.status}: ${text.slice(0, 400)}`)
      error.status = response.status
      throw error
    }
    const payload = JSON.parse(text)
    return parseJson(payload?.choices?.[0]?.message?.content || '')
  } finally {
    clearTimeout(timer)
  }
}

function newest(rows) {
  const map = new Map()
  const sorted = [...rows].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
  for (const row of sorted) if (!map.has(row.profile_id)) map.set(row.profile_id, row)
  return map
}

async function inChunks(table, columns, column, values, size = 90) {
  const out = []
  for (let i = 0; i < values.length; i += size) {
    const { data, error } = await db.from(table).select(columns).in(column, values.slice(i, i + size))
    if (error) throw new Error(`${table}: ${error.message}`)
    out.push(...(data || []))
  }
  return out
}

function providerFacts(profile, attorney, consultant) {
  const row = attorney || consultant || {}
  if (attorney) {
    return {
      role: 'attorney',
      display_name: profile?.full_name || null,
      years_experience: row.years_experience ?? null,
      languages: Array.isArray(row.languages) ? row.languages : [],
      specialties: Array.isArray(row.specialties) ? row.specialties : [],
      education: row.education || null,
      jurisdictions: row.jurisdictions || null,
      practice_areas: row.practice_areas || null,
      credential_type: row.credential_type || null,
      public_bar_number: row.show_bar_number === false ? null : (row.bar_number || null),
      bar_state: row.bar_state || null,
    }
  }
  return {
    role: 'consultant',
    display_name: profile?.full_name || consultant?.full_name || null,
    years_experience: row.years_experience ?? null,
    languages: Array.isArray(row.languages) ? row.languages : [],
    specialties: Array.isArray(row.specialties) ? row.specialties : [],
    education: row.education || null,
    jurisdictions: row.jurisdictions || null,
    practice_areas: row.practice_areas || null,
    subjects: row.subjects || null,
    industries: row.industries || null,
    registration_verified: Boolean(row.registration_number),
  }
}

function validateDraft(draft, role, seen) {
  const clean = {
    tagline: compact(draft?.tagline),
    intro: compact(draft?.intro),
    bio: String(draft?.bio || '').trim(),
  }
  const errors = []
  const introWords = compact(clean.intro).split(' ').filter(Boolean).length
  const bioWords = compact(clean.bio).split(' ').filter(Boolean).length
  if (clean.tagline.length < 35 || clean.tagline.length > 120) errors.push(`tagline length ${clean.tagline.length}`)
  if (/^i will\b/i.test(clean.tagline)) errors.push('tagline looks like a gig title')
  if (/\b(expert|dedicated|passionate|top[- ]?notch)\b/i.test(clean.tagline)) errors.push('generic tagline adjective')
  if (introWords < 30 || introWords > 100) errors.push(`intro words ${introWords}`)
  if (bioWords < 110 || bioWords > 280) errors.push(`bio words ${bioWords}`)
  const all = `${clean.tagline}\n${clean.intro}\n${clean.bio}`.toLowerCase()
  for (const phrase of GENERIC_BANNED) if (all.includes(phrase)) errors.push(`generic phrase:${phrase}`)
  if (role === 'consultant' && /\b(attorney|lawyer|solicitor)\b/i.test(all)) errors.push('consultant relabelled as lawyer')
  if (/\b(100%|guarantee(?:d)?|approval rate|success rate|win rate)\b/i.test(all)) errors.push('unsupported outcome language')

  const taglineKey = normalize(clean.tagline)
  const introKey = opening(clean.intro, 10)
  const bioKey = opening(clean.bio, 12)
  if (seen.taglines.has(taglineKey)) errors.push('duplicate tagline')
  if (introKey && seen.intros.has(introKey)) errors.push('duplicate intro opening')
  if (bioKey && seen.bios.has(bioKey)) errors.push('duplicate bio opening')
  return { ok: errors.length === 0, errors, clean, keys: { taglineKey, introKey, bioKey } }
}

async function loadEstate() {
  const { data: gigs, error: gigError } = await db.from('gigs')
    .select('id,provider_id,provider_type,title,category,subcategory,jurisdiction,tags,status')
    .eq('status', 'active')
    .order('id')
  if (gigError) throw gigError
  const providerIds = [...new Set((gigs || []).map((gig) => gig.provider_id).filter(Boolean))]
  if (providerIds.length !== EXPECTED_PROVIDERS) throw new Error(`Expected ${EXPECTED_PROVIDERS} active providers, got ${providerIds.length}`)

  const [profiles, attorneys, consultants] = await Promise.all([
    inChunks('profiles', 'id,full_name,bio,role,status,updated_at', 'id', providerIds),
    inChunks('attorneys', 'id,profile_id,tagline,intro,bio,languages,years_experience,education,specialties,practice_areas,jurisdictions,credential_type,bar_number,show_bar_number,bar_state,created_at', 'profile_id', providerIds),
    inChunks('consultants', 'id,profile_id,full_name,tagline,intro,bio,languages,years_experience,education,specialties,practice_areas,jurisdictions,subjects,industries,registration_number,created_at', 'profile_id', providerIds),
  ])

  const gigsByProvider = new Map()
  for (const gig of gigs || []) {
    const list = gigsByProvider.get(gig.provider_id) || []
    list.push({
      title: gig.title,
      category: gig.category,
      subcategory: gig.subcategory,
      jurisdiction: gig.jurisdiction,
      tags: Array.isArray(gig.tags) ? gig.tags : [],
    })
    gigsByProvider.set(gig.provider_id, list)
  }

  return {
    providerIds,
    profileById: new Map(profiles.map((profile) => [profile.id, profile])),
    attorneyByProfile: newest(attorneys),
    consultantByProfile: newest(consultants),
    gigsByProvider,
  }
}

async function ensureSnapshots(estate) {
  const { data: existing, error } = await db.from('admin_audit_log')
    .select('target_table,target_id')
    .eq('action_type', 'bulk_profile_copy_v2_snapshot')
    .eq('reason', SNAPSHOT_REASON)
  if (error) throw error
  const done = new Set((existing || []).map((row) => `${row.target_table}:${row.target_id}`))

  for (const providerId of estate.providerIds) {
    const profile = estate.profileById.get(providerId)
    const attorney = estate.attorneyByProfile.get(providerId)
    const consultant = estate.consultantByProfile.get(providerId)
    const row = attorney || consultant
    const table = attorney ? 'attorneys' : 'consultants'
    if (!profile || !row) throw new Error(`Missing provider role row ${providerId}`)
    const key = `${table}:${row.id}`
    if (done.has(key)) continue
    const { error: insertError } = await db.from('admin_audit_log').insert({
      id: crypto.randomUUID(),
      admin_id: null,
      action_type: 'bulk_profile_copy_v2_snapshot',
      target_table: table,
      target_id: row.id,
      payload_snapshot: {
        profile_id: providerId,
        role_record: row,
        public_profile_bio: profile.bio || null,
      },
      reason: SNAPSHOT_REASON,
      created_at: new Date().toISOString(),
    })
    if (insertError) throw insertError
    done.add(key)
  }

  if (done.size !== EXPECTED_PROVIDERS) throw new Error(`Profile v2 snapshot gate failed: ${done.size}/${EXPECTED_PROVIDERS}`)
}

async function rewriteProvider(providerId, estate, seen, index) {
  const profile = estate.profileById.get(providerId)
  const attorney = estate.attorneyByProfile.get(providerId)
  const consultant = estate.consultantByProfile.get(providerId)
  const roleRow = attorney || consultant
  if (!profile || !roleRow) throw new Error(`Missing provider record ${providerId}`)
  const table = attorney ? 'attorneys' : 'consultants'
  const role = attorney ? 'attorney' : 'consultant'
  const facts = providerFacts(profile, attorney, consultant)
  const services = estate.gigsByProvider.get(providerId) || []

  let lastErrors = []
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const archetype = ARCHETYPES[(index + attempt - 1) % ARCHETYPES.length]
    const recentTaglines = [...seen.taglines].slice(-25).join(' | ')
    const recentBioOpenings = [...seen.bios].slice(-25).join(' | ')
    const user = [
      `Assigned profile archetype: ${archetype}`,
      'Write this as one distinct human practitioner profile, not as a standardized company bio.',
      recentTaglines ? `Do not duplicate these normalized taglines already used in this estate: ${recentTaglines}` : '',
      recentBioOpenings ? `Do not reuse these existing bio-opening keys: ${recentBioOpenings}` : '',
      lastErrors.length ? `Fix these prior validation failures: ${lastErrors.join('; ')}` : '',
      `VERIFIED PROVIDER FACTS:\n${json(facts)}`,
      `ACTIVE MARKETPLACE SERVICE PORTFOLIO:\n${json(services)}`,
      `CURRENT PROFILE COPY FOR FACT/TONE REFERENCE ONLY — DO NOT COPY ITS TEMPLATE:\n${json({ tagline: roleRow.tagline || null, intro: roleRow.intro || null, bio: roleRow.bio || profile.bio || null })}`,
    ].filter(Boolean).join('\n\n')

    let draft
    try {
      draft = await postXai(PROFILE_SYSTEM, user)
    } catch (error) {
      if (attempt === 5) throw error
      await sleep(attempt * 1200)
      continue
    }
    const checked = validateDraft(draft, role, seen)
    if (!checked.ok) {
      lastErrors = checked.errors
      continue
    }

    seen.taglines.add(checked.keys.taglineKey)
    if (checked.keys.introKey) seen.intros.add(checked.keys.introKey)
    if (checked.keys.bioKey) seen.bios.add(checked.keys.bioKey)
    try {
      const { data: updated, error: roleError } = await db.from(table).update({
        tagline: checked.clean.tagline,
        intro: checked.clean.intro,
        bio: checked.clean.bio,
      }).eq('id', roleRow.id).select('*').single()
      if (roleError) throw roleError

      const { error: profileError } = await db.from('profiles').update({
        bio: checked.clean.bio,
        updated_at: new Date().toISOString(),
      }).eq('id', providerId)
      if (profileError) throw profileError

      const { error: auditError } = await db.from('admin_audit_log').insert({
        id: crypto.randomUUID(),
        admin_id: null,
        action_type: 'bulk_profile_copy_v2_applied',
        target_table: table,
        target_id: roleRow.id,
        payload_snapshot: {
          profile_id: providerId,
          archetype,
          role_record: updated,
          public_profile_bio: checked.clean.bio,
        },
        reason: APPLIED_REASON,
        created_at: new Date().toISOString(),
      })
      if (auditError) throw auditError
      console.log(`[marketplace-profile-v2] ${index + 1}/${EXPECTED_PROVIDERS}: ${providerId}`)
      return
    } catch (error) {
      seen.taglines.delete(checked.keys.taglineKey)
      if (checked.keys.introKey) seen.intros.delete(checked.keys.introKey)
      if (checked.keys.bioKey) seen.bios.delete(checked.keys.bioKey)
      throw error
    }
  }
  throw new Error(`Profile ${providerId} validation failed: ${lastErrors.join('; ')}`)
}

async function runPool(items, worker, concurrency = 3) {
  let cursor = 0
  const failures = []
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (true) {
      const index = cursor++
      if (index >= items.length) return
      try { await worker(items[index], index) }
      catch (error) {
        failures.push({ item: items[index], error })
        console.error(`[marketplace-profile-v2] failed item ${index + 1}:`, error?.message || error)
      }
    }
  }))
  return failures
}

async function finalAudit(estate) {
  const taglines = new Set()
  const introOpenings = new Set()
  const bioOpenings = new Set()
  const problems = []

  for (const providerId of estate.providerIds) {
    const attorney = estate.attorneyByProfile.get(providerId)
    const consultant = estate.consultantByProfile.get(providerId)
    const table = attorney ? 'attorneys' : 'consultants'
    const roleRow = attorney || consultant
    const { data: current, error } = await db.from(table).select('tagline,intro,bio').eq('id', roleRow.id).single()
    if (error) throw error
    const checked = validateDraft(current, attorney ? 'attorney' : 'consultant', { taglines, intros: introOpenings, bios: bioOpenings })
    if (!checked.ok) problems.push(`${providerId}:${checked.errors.join(',')}`)
    taglines.add(checked.keys.taglineKey)
    if (checked.keys.introKey) introOpenings.add(checked.keys.introKey)
    if (checked.keys.bioKey) bioOpenings.add(checked.keys.bioKey)
  }

  const { count: appliedCount, error: appliedError } = await db.from('admin_audit_log')
    .select('*', { count: 'exact', head: true })
    .eq('action_type', 'bulk_profile_copy_v2_applied')
    .eq('reason', APPLIED_REASON)
  if (appliedError) throw appliedError
  const { count: snapshotCount, error: snapshotError } = await db.from('admin_audit_log')
    .select('*', { count: 'exact', head: true })
    .eq('action_type', 'bulk_profile_copy_v2_snapshot')
    .eq('reason', SNAPSHOT_REASON)
  if (snapshotError) throw snapshotError

  if (appliedCount !== EXPECTED_PROVIDERS) problems.push(`applied profiles:${appliedCount}`)
  if (snapshotCount !== EXPECTED_PROVIDERS) problems.push(`snapshot profiles:${snapshotCount}`)
  if (taglines.size !== EXPECTED_PROVIDERS) problems.push(`unique taglines:${taglines.size}`)
  if (bioOpenings.size !== EXPECTED_PROVIDERS) problems.push(`unique bio openings:${bioOpenings.size}`)
  if (problems.length) throw new Error(`Profile v2 final audit failed: ${problems.join(' | ')}`)

  console.log('[marketplace-profile-v2] FINAL AUDIT PASS', {
    providers: EXPECTED_PROVIDERS,
    unique_taglines: taglines.size,
    unique_intro_openings: introOpenings.size,
    unique_bio_openings: bioOpenings.size,
    snapshots: snapshotCount,
  })
}

async function main() {
  const estate = await loadEstate()
  await ensureSnapshots(estate)

  const { data: applied, error } = await db.from('admin_audit_log')
    .select('target_table,target_id,payload_snapshot')
    .eq('action_type', 'bulk_profile_copy_v2_applied')
    .eq('reason', APPLIED_REASON)
  if (error) throw error
  const done = new Set((applied || []).map((row) => `${row.target_table}:${row.target_id}`))

  const seen = { taglines: new Set(), intros: new Set(), bios: new Set() }
  for (const row of applied || []) {
    const role = row?.payload_snapshot?.role_record || {}
    if (role.tagline) seen.taglines.add(normalize(role.tagline))
    if (role.intro) seen.intros.add(opening(role.intro, 10))
    if (role.bio) seen.bios.add(opening(role.bio, 12))
  }

  const pending = estate.providerIds.filter((providerId) => {
    const attorney = estate.attorneyByProfile.get(providerId)
    const consultant = estate.consultantByProfile.get(providerId)
    const row = attorney || consultant
    const table = attorney ? 'attorneys' : 'consultants'
    return !done.has(`${table}:${row.id}`)
  })
  console.log(`[marketplace-profile-v2] pending ${pending.length}; already complete ${done.size}`)
  const failures = await runPool(pending, (providerId, index) => rewriteProvider(providerId, estate, seen, index), 3)
  if (failures.length) throw new Error(`${failures.length} profile v2 rewrites failed; rerun safely resumes completed rows`)

  await finalAudit(estate)
}

main().catch((error) => {
  console.error('[marketplace-profile-v2] FATAL', error)
  process.exit(1)
})
