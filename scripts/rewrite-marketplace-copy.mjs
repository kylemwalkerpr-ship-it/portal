import { createClient } from '@supabase/supabase-js'

const RUN_TAG = 'fiverr-grade-copy-v1-2026-09-09'
const PRE_GIG_TAG = 'Pre-Fiverr-grade marketplace copy rewrite snapshot 2026-09-09'
const PRE_PROFILE_REASON = 'Pre-Fiverr-grade marketplace profile rewrite snapshot 2026-09-09'
const APPLIED_GIG_TAG = `Fiverr-grade marketplace copy rewrite applied ${RUN_TAG}`
const APPLIED_PROFILE_REASON = `Fiverr-grade marketplace profile copy rewrite applied ${RUN_TAG}`
const EXPECTED_GIGS = 217
const EXPECTED_PROVIDERS = 70

if (process.env.MARKETPLACE_COPY_REWRITE !== '1') {
  console.log('[marketplace-copy] disabled; no-op')
  process.exit(0)
}

const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_JWT || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
if (!supabaseUrl || !serviceKey) throw new Error('Missing Supabase production credentials')
const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

const XAI_KEY = String(process.env.XAI_API_KEY || '').trim()
const XAI_MODEL = String(process.env.XAI_MODEL || 'grok-4.6').trim()
const ENTRIM_KEY = String(process.env.ENTRIM_API_KEY || '').trim()
const ENTRIM_BASE = String(process.env.ENTRIM_BASE_URL || 'https://api.entrim.ai/v1').replace(/\/$/, '')
const ENTRIM_MODEL = String(process.env.ENTRIM_MARKETPLACE_MODEL || 'Qwen/Qwen3.6-27B').trim()
if (!XAI_KEY && !ENTRIM_KEY) throw new Error('No rewrite model configured')

const BANNED = [
  'faceless form shop', 'you are in the right listing',
  'this package starts with your problem and ends with a written roadmap',
  'scoped marketplace package', 'credential details stay on the listing',
  'this draft remains hidden', 'offering scoped', 'recommended $',
  'marketplace tiers commonly target', 'see requirements on this gig',
  'attorney review review', 'review independent review', 'review written findings',
  'review packet audit', 'filing application review', 'application filing review',
]

const STYLE = [
  'Open with the exact document or filing the buyer wants reviewed, then state the concrete deliverable.',
  'Open with a decision the buyer is trying to make and show what the written work will clarify.',
  'Open with the evidence or file problem, then move quickly to what is checked and returned.',
  'Open with the buyer type and filing stage; keep provider credentials for later.',
  'Lead with the deliverable and active-tier turnaround, then explain the process.',
  'Lead with the highest-risk point this service is designed to catch without implying the buyer has that problem.',
  'Use a practitioner voice: what I review, what you receive, what I need from you.',
  'Start with a concrete scope boundary and make the value obvious before mentioning credentials.',
  'Use a document-first angle and short sentences; let verified provider facts add trust later.',
  'Lead with the outcome of the work: a clearer filing plan, evidence list, edited document or risk memo—not an approval promise.',
  'Start with a specific buyer question this service answers and answer it immediately.',
  'Use a premium professional-services tone: precise, calm and specific, with no sales hype.',
]

const PROFILE_STYLE = [
  'Lead with the client problems this provider handles most often, then establish credentials.',
  'Lead with role, jurisdiction and practical focus; keep the tone warm and concise.',
  'Open with the buyer who benefits most, then explain how the provider works.',
  'Open with the strongest verified specialty and use active, plain language.',
  'Lead with process and communication style, then add verified experience as proof.',
  'Open with a concrete service area and jurisdiction rather than a generic professional introduction.',
  'Use a confident practitioner voice without superlatives; make the profile sound individually written.',
  'Lead with the active Marketplace service mix, then explain working style and client fit.',
]

const GIG_SYSTEM = `You are the senior copy editor for YouSafe Marketplace. Rewrite one professional-service listing using the conversion principles of strong Fiverr gigs: concise literal titles, buyer-intent-first openings, concrete deliverables, scan-friendly copy, service-specific FAQs and a credible seller voice. Wording must be ORIGINAL; never copy or closely paraphrase a competitor.

FACTUAL/YMYL RULES:
- PRIVACY RULE: Never include professional credential identifiers (bar/licence/registration/SRA/RCIC/MARN/regulator IDs) in gig titles, pitches, descriptions, FAQs, package text, requirements, tags, SEO titles/descriptions, or provider narrative copy. Generic credential type and jurisdiction are OK. Exact IDs belong only in the controlled bio-card field.
- Use ONLY facts in the payload. Never invent results, approval rates, client counts, credentials, licence/registration numbers, jurisdictions, languages, years, employers, education, filing deadlines, processing times or guarantees.
- Legal/immigration copy must never promise approval. Keep any scope disclaimer short and secondary.
- Call someone an attorney/lawyer/solicitor only when provider facts support it. Never relabel a consultant as one.
- Do not add government forms/programs absent from supplied title, requirements, tags, specialties or taxonomy.
- State price, delivery or revisions only from active tier data.

OUTPUT RULES:
- title: starts "I will"; aim 35–68 chars; one clear action + concrete service object; no provider name/credential; no noun pile or repeated "review".
- tagline: 55–120 chars; buyer outcome + concrete deliverable/focus; no generic expertise claim.
- pitch: 90–230 chars; first-person practitioner voice; specific service + one verified trust/process signal.
- description: 220–380 words; 2–4 short natural sections and at most one compact bullet list. First two sentences must be unique to this exact service. Cover what is reviewed/prepared, what buyer receives, who it fits, and a concise provider/scope note. Do not use a rigid repeated template.
- faq: 4–6 objects with question and answer; at least 3 exact-service questions; at most one generic scope/guarantee question; direct factual answers.
- tags: 5–8 buyer-search phrases grounded in facts. No names, credential-number tags, "yousafe-panel" or keyword junk.
- seo_title: 45–62 chars; search intent; no "I will", provider name or stuffing.
- seo_description: 135–160 chars; accurate service + audience/jurisdiction + concrete deliverable; no guarantees.
- Do NOT output slug. Published URLs are immutable.

Never use or lightly paraphrase the estate boilerplate: "faceless form shop", "you are in the right listing", "this package starts with your problem and ends with a written roadmap", "scoped marketplace package", "credential details stay on the listing", "this draft remains hidden", "offering scoped", "marketplace tiers commonly target", "see requirements on this gig".
Return one JSON object only with: title, tagline, pitch, description, faq, tags, seo_title, seo_description.`

const PROFILE_SYSTEM = `You are the senior seller-profile editor for YouSafe Marketplace. Write an ORIGINAL Fiverr-grade professional profile from verified facts only.
- PRIVACY RULE: Never include professional credential identifiers (bar/licence/registration/SRA/RCIC/MARN/regulator IDs) in gig titles, pitches, descriptions, FAQs, package text, requirements, tags, SEO titles/descriptions, or provider narrative copy. Generic credential type and jurisdiction are OK. Exact IDs belong only in the controlled bio-card field.
- Never invent credentials, licence numbers, results, client counts, approval rates, languages, jurisdictions, years, education or employers.
- Never guarantee outcomes or turn a consultant into an attorney/lawyer.
- tagline: 50–110 chars, specialty + buyer/outcome; no superlatives or generic "expert/professional/dedicated".
- intro: 2–3 sentences, 45–90 words; practical focus + client/work type.
- bio: 180–320 words, first person, 3–5 natural paragraphs, no mandatory headings. Explain service focus, working style/process, verified differentiators and ideal fit. Do not repeat gig descriptions.
Avoid "passionate about", "dedicated professional", "tailored to your needs", "comprehensive solutions", "faceless form shop" and "you are in the right place/listing".
Return one JSON object only with: tagline, intro, bio.`

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const compact = (v) => String(v ?? '').replace(/\s+/g, ' ').trim()
const normalize = (v) => compact(v).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
const opening = (v, n = 12) => normalize(v).split(' ').filter(Boolean).slice(0, n).join(' ')
const banned = (v) => BANNED.find((p) => compact(v).toLowerCase().includes(p)) || null
const json = (v) => JSON.stringify(v, null, 2)

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

async function post(url, key, body) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 150_000)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const text = await res.text()
    if (!res.ok) {
      const error = new Error(`AI HTTP ${res.status}: ${text.slice(0, 400)}`)
      error.status = res.status
      throw error
    }
    return JSON.parse(text)
  } finally {
    clearTimeout(timer)
  }
}

async function aiJson(system, user, maxTokens) {
  const providers = []
  if (XAI_KEY) providers.push(async () => {
    const data = await post('https://api.x.ai/v1/chat/completions', XAI_KEY, {
      model: XAI_MODEL,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      temperature: 0.72,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
    })
    return data?.choices?.[0]?.message?.content || ''
  })
  if (ENTRIM_KEY) providers.push(async () => {
    const data = await post(`${ENTRIM_BASE}/chat/completions`, ENTRIM_KEY, {
      model: ENTRIM_MODEL,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      temperature: 0.72,
      max_tokens: maxTokens,
    })
    return data?.choices?.[0]?.message?.content || ''
  })

  let lastError
  for (const provider of providers) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try { return parseJson(await provider()) } catch (error) {
        lastError = error
        const status = Number(error?.status || 0)
        if (attempt === 3 || (status && status < 500 && ![408, 409, 429].includes(status))) break
        await sleep(attempt * 1500)
      }
    }
  }
  throw lastError || new Error('All AI providers failed')
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

function newest(rows) {
  const map = new Map()
  const sorted = [...rows].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
  for (const row of sorted) if (!map.has(row.profile_id)) map.set(row.profile_id, row)
  return map
}

function providerFacts(profile, attorney, consultant) {
  const row = attorney || consultant || {}
  const facts = {
    role: attorney ? 'attorney' : 'consultant',
    display_name: profile?.full_name || consultant?.full_name || null,
    years_experience: row.years_experience ?? null,
    languages: Array.isArray(row.languages) ? row.languages : [],
    specialties: Array.isArray(row.specialties) ? row.specialties : [],
    education: row.education || null,
    jurisdictions: row.jurisdictions || null,
    practice_areas: row.practice_areas || null,
  }
  if (attorney) Object.assign(facts, {
    credential_type: attorney.credential_type || null,
    bar_state: attorney.bar_state || null,
    // Exact bar/licence IDs stay out of model facts — bio-card only.
    credential_verified: Boolean(attorney.bar_number),
    credential_on_file: Boolean(attorney.bar_number),
  })
  else Object.assign(facts, {
    // Exact registration IDs stay out of model facts — bio-card only.
    registration_verified: Boolean(consultant?.registration_number),
    credential_on_file: Boolean(consultant?.registration_number),
    subjects: consultant?.subjects || null,
    industries: consultant?.industries || null,
  })
  return facts
}

function validateGig(draft, provider, seen) {
  const clean = {
    title: compact(draft?.title),
    tagline: compact(draft?.tagline),
    pitch: compact(draft?.pitch),
    description: String(draft?.description || '').trim(),
    faq: Array.isArray(draft?.faq) ? draft.faq : [],
    tags: Array.isArray(draft?.tags) ? draft.tags.map(compact).filter(Boolean) : [],
    seo_title: compact(draft?.seo_title),
    seo_description: compact(draft?.seo_description),
  }
  const errors = []
  if (!/^I will\b/i.test(clean.title) || clean.title.length < 25 || clean.title.length > 70) errors.push(`bad title shape/length ${clean.title.length}`)
  if (/\breview\b.*\breview\b/i.test(clean.title) || /\b([a-z]{3,})\s+\1\b/i.test(clean.title)) errors.push('title repeats a noun')
  const firstName = compact(provider.display_name).split(/\s+/)[0]
  if (firstName?.length >= 3 && new RegExp(`\\b${firstName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(clean.title)) errors.push('title contains provider name')
  if (clean.tagline.length < 35 || clean.tagline.length > 140) errors.push(`tagline length ${clean.tagline.length}`)
  if (clean.pitch.length < 60 || clean.pitch.length > 300) errors.push(`pitch length ${clean.pitch.length}`)
  const descriptionWords = compact(clean.description).split(' ').filter(Boolean).length
  if (descriptionWords < 150 || descriptionWords > 500) errors.push(`description words ${descriptionWords}`)
  if (clean.faq.length < 4 || clean.faq.length > 6 || clean.faq.some((f) => !compact(f?.question) || !compact(f?.answer))) errors.push('faq shape/count')
  if (clean.tags.length < 5 || clean.tags.length > 8) errors.push(`tags count ${clean.tags.length}`)
  if (!clean.seo_title || clean.seo_title.length > 65) errors.push(`seo title length ${clean.seo_title.length}`)
  if (clean.seo_description.length < 110 || clean.seo_description.length > 170) errors.push(`seo description length ${clean.seo_description.length}`)
  for (const [field, value] of Object.entries({ ...clean, faq: json(clean.faq), tags: json(clean.tags) })) {
    const hit = banned(value)
    if (hit) errors.push(`${field} banned:${hit}`)
  }
  const keys = { title: normalize(clean.title), pitch: normalize(clean.pitch), opening: opening(clean.description) }
  if (seen.titles.has(keys.title)) errors.push('duplicate title')
  if (seen.pitches.has(keys.pitch)) errors.push('duplicate pitch')
  if (keys.opening && seen.openings.has(keys.opening)) errors.push('duplicate description opening')
  return { ok: errors.length === 0, errors, clean, keys }
}

function validateProfile(draft, seenOpenings) {
  const clean = { tagline: compact(draft?.tagline), intro: compact(draft?.intro), bio: String(draft?.bio || '').trim() }
  const errors = []
  const introWords = clean.intro.split(' ').filter(Boolean).length
  const bioWords = compact(clean.bio).split(' ').filter(Boolean).length
  if (clean.tagline.length < 35 || clean.tagline.length > 130) errors.push(`tagline length ${clean.tagline.length}`)
  if (introWords < 25 || introWords > 120) errors.push(`intro words ${introWords}`)
  if (bioWords < 130 || bioWords > 380) errors.push(`bio words ${bioWords}`)
  for (const [field, value] of Object.entries(clean)) {
    const hit = banned(value)
    if (hit) errors.push(`${field} banned:${hit}`)
    if (/passionate about|dedicated professional|tailored to your needs|comprehensive solutions/i.test(value)) errors.push(`${field} generic boilerplate`)
  }
  const key = opening(clean.bio)
  if (key && seenOpenings.has(key)) errors.push('duplicate profile opening')
  return { ok: errors.length === 0, errors, clean, key }
}

async function verifyRecoveryPoints() {
  const { count: gigCount, error: gigError } = await db.from('gig_version_history').select('*', { count: 'exact', head: true }).eq('change_summary', PRE_GIG_TAG)
  if (gigError) throw gigError
  const { count: attorneyCount, error: attorneyError } = await db.from('admin_audit_log').select('*', { count: 'exact', head: true }).eq('action_type', 'bulk_copy_rewrite_snapshot').eq('target_table', 'attorneys').eq('reason', PRE_PROFILE_REASON)
  if (attorneyError) throw attorneyError
  const { count: consultantCount, error: consultantError } = await db.from('admin_audit_log').select('*', { count: 'exact', head: true }).eq('action_type', 'bulk_copy_rewrite_snapshot').eq('target_table', 'consultants').eq('reason', PRE_PROFILE_REASON)
  if (consultantError) throw consultantError
  if (gigCount !== EXPECTED_GIGS || (attorneyCount || 0) + (consultantCount || 0) !== EXPECTED_PROVIDERS) {
    throw new Error(`Recovery-point gate failed: gigs=${gigCount}, profiles=${(attorneyCount || 0) + (consultantCount || 0)}`)
  }
}

async function loadEstate() {
  const { data: gigs, error } = await db.from('gigs').select('id,provider_id,provider_type,title,slug,tagline,pitch,description,requirements,faq,tags,seo_title,seo_description,category,subcategory,jurisdiction,status,version_number').eq('status', 'active').order('id')
  if (error) throw error
  if ((gigs || []).length !== EXPECTED_GIGS) throw new Error(`Expected ${EXPECTED_GIGS} active gigs, got ${(gigs || []).length}`)
  const providerIds = [...new Set(gigs.map((g) => g.provider_id).filter(Boolean))]
  if (providerIds.length !== EXPECTED_PROVIDERS) throw new Error(`Expected ${EXPECTED_PROVIDERS} active providers, got ${providerIds.length}`)
  const gigIds = gigs.map((g) => g.id)
  const [profiles, attorneys, consultants, tiers] = await Promise.all([
    inChunks('profiles', 'id,full_name,username,bio,role,status', 'id', providerIds),
    inChunks('attorneys', 'id,profile_id,tagline,intro,bio,languages,years_experience,education,specialties,practice_areas,jurisdictions,credential_type,bar_number,show_bar_number,bar_state,created_at', 'profile_id', providerIds),
    inChunks('consultants', 'id,profile_id,full_name,tagline,intro,bio,languages,years_experience,education,specialties,practice_areas,jurisdictions,subjects,industries,registration_number,created_at', 'profile_id', providerIds),
    inChunks('gig_tiers', 'id,gig_id,tier,title,description,price,delivery_days,revisions,features,is_active', 'gig_id', gigIds),
  ])
  const tiersByGig = new Map()
  for (const tier of tiers) if (tier.is_active) {
    const list = tiersByGig.get(tier.gig_id) || []
    list.push(tier)
    tiersByGig.set(tier.gig_id, list)
  }
  return {
    gigs,
    providerIds,
    profileById: new Map(profiles.map((p) => [p.id, p])),
    attorneyByProfile: newest(attorneys),
    consultantByProfile: newest(consultants),
    tiersByGig,
  }
}

async function maxHistory(gigId) {
  const { data, error } = await db.from('gig_version_history').select('version_num').eq('gig_id', gigId).order('version_num', { ascending: false }).limit(1).maybeSingle()
  if (error) throw error
  return Number(data?.version_num || 0)
}

async function stampGig(gig) {
  const { error } = await db.from('gig_version_history').insert({
    id: crypto.randomUUID(),
    gig_id: gig.id,
    version_num: (await maxHistory(gig.id)) + 1,
    changed_by: null,
    changed_by_role: 'system-content-rewrite',
    snapshot: gig,
    change_summary: APPLIED_GIG_TAG,
    created_at: new Date().toISOString(),
  })
  if (error) throw error
}

async function rewriteGig(gig, estate, seen, index) {
  const profile = estate.profileById.get(gig.provider_id)
  const attorney = estate.attorneyByProfile.get(gig.provider_id)
  const consultant = estate.consultantByProfile.get(gig.provider_id)
  const provider = providerFacts(profile, attorney, consultant)
  const tiers = (estate.tiersByGig.get(gig.id) || [])
    .sort((a, b) => ['basic', 'standard', 'premium'].indexOf(a.tier) - ['basic', 'standard', 'premium'].indexOf(b.tier))
    .map((t) => ({ tier: t.tier, title: t.title, price_cents: t.price, delivery_days: t.delivery_days, revisions: t.revisions, features: t.features }))
  const payload = {
    service: {
      current_title: gig.title,
      category: gig.category,
      subcategory: gig.subcategory,
      jurisdiction: gig.jurisdiction,
      current_tags: gig.tags || [],
      current_requirements: String(gig.requirements || '').slice(0, 6000),
      current_description_for_fact_salvage_only: String(gig.description || '').slice(0, 3500),
    },
    provider,
    active_tiers: tiers,
  }

  let lastErrors = []
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const recentTitles = [...seen.titles].slice(-40).join(' | ')
    const user = [
      'Rewrite from these facts; existing prose is evidence only, not a style template.',
      `Style direction: ${STYLE[(index + attempt - 1) % STYLE.length]}`,
      recentTitles ? `Do not duplicate these already-used title keys: ${recentTitles}` : '',
      lastErrors.length ? `Fix previous validation failures: ${lastErrors.join('; ')}` : '',
      `FACT PAYLOAD:\n${json(payload)}`,
    ].filter(Boolean).join('\n\n')
    const checked = validateGig(await aiJson(GIG_SYSTEM, user, 3000), provider, seen)
    if (!checked.ok) { lastErrors = checked.errors; continue }

    // Reserve uniqueness keys before the DB await so parallel workers cannot
    // validate the same title/opening in the same event-loop window.
    seen.titles.add(checked.keys.title)
    seen.pitches.add(checked.keys.pitch)
    if (checked.keys.opening) seen.openings.add(checked.keys.opening)
    try {
      const { data: updated, error } = await db.from('gigs').update({
        title: checked.clean.title,
        tagline: checked.clean.tagline,
        pitch: checked.clean.pitch,
        description: checked.clean.description,
        faq: checked.clean.faq,
        tags: checked.clean.tags,
        seo_title: checked.clean.seo_title,
        seo_description: checked.clean.seo_description,
        version_number: Number(gig.version_number || 0) + 1,
        updated_at: new Date().toISOString(),
      }).eq('id', gig.id).eq('slug', gig.slug).select('*').single()
      if (error) throw error
      if (updated.slug !== gig.slug) throw new Error(`Slug invariant violated: ${gig.id}`)
      await stampGig(updated)
      console.log(`[marketplace-copy] gig ${index + 1}/${EXPECTED_GIGS}: ${updated.slug}`)
      return
    } catch (error) {
      seen.titles.delete(checked.keys.title)
      seen.pitches.delete(checked.keys.pitch)
      if (checked.keys.opening) seen.openings.delete(checked.keys.opening)
      throw error
    }
  }
  throw new Error(`Gig ${gig.id} validation failed: ${lastErrors.join('; ')}`)
}

async function rewriteProfile(providerId, estate, seenOpenings, index) {
  const profile = estate.profileById.get(providerId)
  const attorney = estate.attorneyByProfile.get(providerId)
  const consultant = estate.consultantByProfile.get(providerId)
  const roleRow = attorney || consultant
  if (!profile || !roleRow) throw new Error(`Missing provider role row ${providerId}`)
  const provider = providerFacts(profile, attorney, consultant)
  const table = attorney ? 'attorneys' : 'consultants'
  const services = estate.gigs.filter((g) => g.provider_id === providerId).map((g) => g.title)
  let lastErrors = []

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const user = [
      PROFILE_STYLE[(index + attempt - 1) % PROFILE_STYLE.length],
      lastErrors.length ? `Fix previous validation failures: ${lastErrors.join('; ')}` : '',
      `VERIFIED FACTS:\n${json(provider)}`,
      `ACTIVE SERVICES:\n${json(services)}`,
      `EXISTING COPY FOR FACT/TONE REFERENCE ONLY:\n${json({ tagline: roleRow.tagline || null, intro: roleRow.intro || null, bio: String(roleRow.bio || profile.bio || '').slice(0, 3500) })}`,
    ].filter(Boolean).join('\n\n')
    const checked = validateProfile(await aiJson(PROFILE_SYSTEM, user, 1900), seenOpenings)
    if (!checked.ok) { lastErrors = checked.errors; continue }

    if (checked.key) seenOpenings.add(checked.key)
    try {
      // attorneys / consultants intentionally have no updated_at column.
      const { data: updated, error } = await db.from(table).update({
        tagline: checked.clean.tagline,
        intro: checked.clean.intro,
        bio: checked.clean.bio,
      }).eq('id', roleRow.id).select('*').single()
      if (error) throw error

      const { error: profileError } = await db.from('profiles').update({
        bio: checked.clean.bio,
        updated_at: new Date().toISOString(),
      }).eq('id', providerId)
      if (profileError) throw profileError

      const { error: auditError } = await db.from('admin_audit_log').insert({
        id: crypto.randomUUID(),
        admin_id: null,
        action_type: 'bulk_copy_rewrite_applied',
        target_table: table,
        target_id: roleRow.id,
        payload_snapshot: { profile_id: providerId, role_record: updated, public_profile_bio: checked.clean.bio },
        reason: APPLIED_PROFILE_REASON,
        created_at: new Date().toISOString(),
      })
      if (auditError) throw auditError
      console.log(`[marketplace-copy] profile ${index + 1}/${EXPECTED_PROVIDERS}: ${providerId}`)
      return
    } catch (error) {
      if (checked.key) seenOpenings.delete(checked.key)
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
        console.error(`[marketplace-copy] failed item ${index + 1}:`, error?.message || error)
      }
    }
  }))
  return failures
}

async function finalAudit() {
  const { data: gigs, error } = await db.from('gigs').select('id,slug,title,pitch,description,tagline,seo_title,seo_description,faq,tags').eq('status', 'active')
  if (error) throw error
  const titles = new Set()
  const openings = new Set()
  const problems = []
  for (const gig of gigs || []) {
    const titleKey = normalize(gig.title)
    const openingKey = opening(gig.description)
    if (titles.has(titleKey)) problems.push(`duplicate title:${gig.slug}`)
    titles.add(titleKey)
    if (openingKey && openings.has(openingKey)) problems.push(`duplicate opening:${gig.slug}`)
    if (openingKey) openings.add(openingKey)
    const hit = banned([gig.title, gig.pitch, gig.description, gig.tagline, gig.seo_title, gig.seo_description, json(gig.faq)].join(' '))
    if (hit) problems.push(`boilerplate:${gig.slug}:${hit}`)
    if (String(gig.slug).length > 70 || /-$/.test(String(gig.slug))) problems.push(`slug regression:${gig.slug}`)
  }

  const { count: gigStampCount, error: gigStampError } = await db.from('gig_version_history').select('*', { count: 'exact', head: true }).eq('change_summary', APPLIED_GIG_TAG)
  if (gigStampError) throw gigStampError
  const { count: profileStampCount, error: profileStampError } = await db.from('admin_audit_log').select('*', { count: 'exact', head: true }).eq('action_type', 'bulk_copy_rewrite_applied').eq('reason', APPLIED_PROFILE_REASON)
  if (profileStampError) throw profileStampError

  if ((gigs || []).length !== EXPECTED_GIGS) problems.push(`active gigs:${(gigs || []).length}`)
  if (gigStampCount !== EXPECTED_GIGS) problems.push(`gig stamps:${gigStampCount}`)
  if (profileStampCount !== EXPECTED_PROVIDERS) problems.push(`profile stamps:${profileStampCount}`)
  if (problems.length) throw new Error(`Final audit failed: ${problems.join(' | ')}`)
  console.log('[marketplace-copy] FINAL AUDIT PASS', {
    active_gigs: gigs.length,
    unique_titles: titles.size,
    unique_description_openings: openings.size,
    rewritten_profiles: profileStampCount,
    banned_rows: 0,
  })
}

async function main() {
  await verifyRecoveryPoints()
  const estate = await loadEstate()

  const { data: gigHistory, error: gigHistoryError } = await db.from('gig_version_history').select('gig_id').eq('change_summary', APPLIED_GIG_TAG)
  if (gigHistoryError) throw gigHistoryError
  const doneGigs = new Set((gigHistory || []).map((row) => row.gig_id))

  const { data: profileHistory, error: profileHistoryError } = await db.from('admin_audit_log').select('target_table,target_id').eq('action_type', 'bulk_copy_rewrite_applied').eq('reason', APPLIED_PROFILE_REASON)
  if (profileHistoryError) throw profileHistoryError
  const doneProfiles = new Set((profileHistory || []).map((row) => `${row.target_table}:${row.target_id}`))

  const seen = { titles: new Set(), pitches: new Set(), openings: new Set() }
  for (const gig of estate.gigs) if (doneGigs.has(gig.id)) {
    seen.titles.add(normalize(gig.title))
    seen.pitches.add(normalize(gig.pitch))
    const key = opening(gig.description)
    if (key) seen.openings.add(key)
  }

  const pendingGigs = estate.gigs.filter((gig) => !doneGigs.has(gig.id))
  console.log(`[marketplace-copy] gigs pending ${pendingGigs.length}; already complete ${doneGigs.size}`)
  const gigFailures = await runPool(pendingGigs, (gig, index) => rewriteGig(gig, estate, seen, index), 3)
  if (gigFailures.length) throw new Error(`${gigFailures.length} gig rewrites failed; rerun safely resumes completed rows`)

  const { data: refreshedGigs, error: refreshError } = await db.from('gigs').select('id,provider_id,title').eq('status', 'active')
  if (refreshError) throw refreshError
  estate.gigs = refreshedGigs || []

  const seenProfileOpenings = new Set()
  for (const providerId of estate.providerIds) {
    const attorney = estate.attorneyByProfile.get(providerId)
    const consultant = estate.consultantByProfile.get(providerId)
    const row = attorney || consultant
    const table = attorney ? 'attorneys' : 'consultants'
    if (row && doneProfiles.has(`${table}:${row.id}`)) {
      const key = opening(row.bio)
      if (key) seenProfileOpenings.add(key)
    }
  }

  const pendingProviders = estate.providerIds.filter((providerId) => {
    const attorney = estate.attorneyByProfile.get(providerId)
    const consultant = estate.consultantByProfile.get(providerId)
    const row = attorney || consultant
    const table = attorney ? 'attorneys' : 'consultants'
    return !row || !doneProfiles.has(`${table}:${row.id}`)
  })
  console.log(`[marketplace-copy] profiles pending ${pendingProviders.length}; already complete ${doneProfiles.size}`)
  const profileFailures = await runPool(pendingProviders, (providerId, index) => rewriteProfile(providerId, estate, seenProfileOpenings, index), 3)
  if (profileFailures.length) throw new Error(`${profileFailures.length} profile rewrites failed; rerun safely resumes completed rows`)

  await finalAudit()
}

main().catch((error) => {
  console.error('[marketplace-copy] FATAL', error)
  process.exit(1)
})
