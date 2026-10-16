import { ok, fail } from '@/lib/apiEnvelope'
import { getPaymentSettingsForApi } from '@/lib/fiverr'
import { requirePortalUser } from '@/lib/portalAuth'
import { getSupabaseAdminClient } from '@/lib/supabase'
import { PAYMENT_CAPABILITIES } from '@/lib/payments/registry'
import { listPaymentProviders } from '@/lib/payments'
import { getPaymentSettings } from '@/lib/payments/settings'
import { isPaymentSettingsOwner, parsePaymentSettingsPatch, type PaymentSettingsPatch } from '@/lib/payments/adminSettings'
import { sendPaymentSettingsAlert } from '@/lib/payments/adminNotifications'

const ANONYMOUS_ACTOR = '00000000-0000-0000-0000-000000000000'
const OPEN_STATUSES = ['created', 'submitted', 'pending', 'refund_requested']

function changesWithBeforeAfter(currentSettings: Awaited<ReturnType<typeof getPaymentSettings>>, patch: PaymentSettingsPatch) {
  return {
    providerChanges: patch.providerChanges.map((change) => {
      const before = currentSettings.providers.find((row) => row.provider === change.provider)
      return { provider: change.provider, before: before ?? null, after: { ...before, ...change } }
    }),
    methodChanges: patch.methodChanges.map((change) => {
      const before = currentSettings.methods.find((row) => row.provider === change.provider && row.method === change.method)
      return { provider: change.provider, method: change.method, before: before ?? null, after: { ...before, ...change } }
    }),
    globalChanges: Object.keys(patch.globalChanges).length ? {
      before: currentSettings.global,
      after: { ...currentSettings.global, ...patch.globalChanges },
    } : {},
  }
}

async function writeRejectedAttempt(args: {
  db: ReturnType<typeof getSupabaseAdminClient>
  actorProfileId: string
  actorRole: string
  reason: string
  target?: string
  detail: string
}) {
  try {
    const { error } = await args.db.from('payment_settings_audit').insert({
      actor_profile_id: args.actorProfileId,
      actor_role: args.actorRole,
      action: 'payment_settings_patch_rejected',
      target: args.target || 'payment settings',
      before: null,
      after: { error: args.detail },
      reason: args.reason || 'Rejected request',
    })
    if (error) console.error('[payment-settings] rejected attempt audit failed')
  } catch {
    console.error('[payment-settings] rejected attempt audit failed')
  }
  await sendPaymentSettingsAlert({
    db: args.db,
    actorProfileId: args.actorProfileId,
    actorRole: args.actorRole,
    action: 'rejected',
    reason: args.reason || args.detail,
    target: args.target,
    diff: { rejected: true, detail: args.detail },
  })
}

async function loadProviderHealth(db: ReturnType<typeof getSupabaseAdminClient>, providers: string[]) {
  const now = new Date().toISOString()
  const health = await Promise.all(providers.map(async (provider) => {
    const [open, refundWindow, latest, incidents] = await Promise.all([
      db.from('payment_attempts').select('id', { count: 'exact', head: true }).eq('gateway', provider).in('status', OPEN_STATUSES),
      db.from('payment_attempts').select('id', { count: 'exact', head: true }).eq('gateway', provider).eq('status', 'completed').gt('refund_window_expires_at', now),
      db.from('payment_attempts').select('completed_at').eq('gateway', provider).eq('status', 'completed').order('completed_at', { ascending: false }).limit(1).maybeSingle(),
      db.from('payment_incidents').select('id', { count: 'exact', head: true }).eq('gateway', provider).eq('resolved', false),
    ])
    const tablesAvailable = !open.error && !refundWindow.error && !latest.error && !incidents.error
    return [provider, {
      openPayments: tablesAvailable ? (open.count ?? 0) + (refundWindow.count ?? 0) : null,
      lastSuccessfulPaymentAt: !latest.error ? latest.data?.completed_at ?? null : null,
      openIncidents: !incidents.error ? incidents.count ?? 0 : null,
    }] as const
  }))
  return Object.fromEntries(health)
}

async function pesapalReadiness(db: ReturnType<typeof getSupabaseAdminClient>) {
  const { data, error } = await db
    .from('payment_attempts')
    .select('id')
    .eq('gateway', 'pesapal')
    .eq('status', 'completed')
    .eq('is_test', true)
    .limit(1)
    .maybeSingle()
  return {
    credentialsPresent: Boolean(process.env.PESAPAL_CONSUMER_KEY && process.env.PESAPAL_CONSUMER_SECRET),
    notificationRegistered: Boolean(process.env.PESAPAL_IPN_ID),
    ownerTestPaymentCompleted: !error && Boolean(data),
  }
}

export async function GET() {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)

  const settings = await getPaymentSettingsForApi()
  const legacySettings = {
    minimum_offer_amount_cents: settings.minimum_offer_amount_cents,
    maximum_offer_amount_cents: settings.maximum_offer_amount_cents,
    minimum_gig_price_cents: settings.minimum_gig_price_cents,
    maximum_gig_price_cents: settings.maximum_gig_price_cents,
    platform_fee_percent: settings.platform_fee_percent,
    attorney_platform_fee_percent: settings.attorney_platform_fee_percent,
    consultant_fee_percent: settings.consultant_fee_percent,
    primary_currency: settings.primary_currency,
    allowed_currencies: settings.allowed_currencies,
  }

  if (auth.role !== 'admin') return ok(legacySettings)

  try {
    const snapshot = await getPaymentSettings(auth.db)
    const [auditResult, health, readiness] = await Promise.all([
      auth.db.from('payment_settings_audit')
        .select('id, actor_profile_id, actor_role, action, target, before, after, reason, created_at')
        .order('created_at', { ascending: false })
        .limit(100),
      loadProviderHealth(auth.db, PAYMENT_CAPABILITIES.map((item) => item.provider)),
      pesapalReadiness(auth.db),
    ])
    if (auditResult.error) throw new Error(auditResult.error.message)

    const providerRows = new Map(snapshot.providers.map((row) => [row.provider, row]))
    const methodRows = new Map(snapshot.methods.map((row) => [`${row.provider}:${row.method}`, row]))
    return ok({
      ...legacySettings,
      providerSettings: {
        version: snapshot.version,
        canManage: isPaymentSettingsOwner(auth.profileId, auth.role),
        global: snapshot.global,
        providers: PAYMENT_CAPABILITIES.map((capability) => ({
          ...capability,
          settings: providerRows.get(capability.provider) ?? {
            provider: capability.provider, enabled: false, retired: false, test_mode_owner_only: true,
            test_allowlist: [], priority: 100, is_default: false, version: snapshot.version,
          },
          health: health[capability.provider] ?? { openPayments: null, lastSuccessfulPaymentAt: null, openIncidents: null },
          methods: capability.methods.map((method) => ({
            ...method,
            settings: methodRows.get(`${capability.provider}:${method.id}`) ?? {
              provider: capability.provider, method: method.id, enabled: false,
              currencies: null, countries: null, priority: 100, min_amount_minor: null, max_amount_minor: null,
            },
          })),
        })),
        readiness,
        audit: auditResult.data ?? [],
      },
    })
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Payment settings are unavailable.', 503)
  }
}

export async function PATCH(request: Request) {
  const auth = await requirePortalUser()
  const db = 'error' in auth ? getSupabaseAdminClient() : auth.db
  const actorProfileId = 'error' in auth ? ANONYMOUS_ACTOR : auth.profileId
  const actorRole = 'error' in auth ? 'unauthenticated' : auth.role
  const body = await request.json().catch(() => ({}))
  const reason = body && typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : ''
  const target = Array.isArray(body?.providerChanges) && typeof body.providerChanges[0]?.provider === 'string'
    ? String(body.providerChanges[0].provider).slice(0, 80)
    : 'payment settings'

  if ('error' in auth) {
    await writeRejectedAttempt({ db, actorProfileId, actorRole, reason, target, detail: auth.error })
    return fail(auth.error, auth.status)
  }
  if (auth.role !== 'admin' || !isPaymentSettingsOwner(auth.profileId, auth.role)) {
    await writeRejectedAttempt({ db, actorProfileId, actorRole, reason, target, detail: 'Owner admin access is required.' })
    return fail('Forbidden', 403)
  }

  const parsed = parsePaymentSettingsPatch(body)
  if (parsed.ok === false) {
    await writeRejectedAttempt({ db, actorProfileId, actorRole, reason, target, detail: parsed.error })
    return fail(parsed.error, 400)
  }

  const patch = parsed.value
  let currentSettings: Awaited<ReturnType<typeof getPaymentSettings>>
  try {
    currentSettings = await getPaymentSettings(db)
  } catch {
    const detail = 'Payment settings could not be read safely.'
    await writeRejectedAttempt({ db, actorProfileId, actorRole, reason: patch.reason, target, detail })
    return fail(detail, 503)
  }
  const providerSettings = new Map(currentSettings.providers.map((provider) => [provider.provider, provider]))
  const invalidDefault = patch.providerChanges.find((change) => change.is_default === true && (
    !listPaymentProviders().includes(change.provider)
    || !PAYMENT_CAPABILITIES.find((capability) => capability.provider === change.provider)?.methods.some((method) => method.id === 'card')
    || (change.enabled ?? providerSettings.get(change.provider)?.enabled) !== true
    || (change.retired ?? providerSettings.get(change.provider)?.retired) === true
  ))
  if (invalidDefault) {
    const detail = 'The default must be an enabled, non-retired provider with a server adapter.'
    await writeRejectedAttempt({ db, actorProfileId, actorRole, reason: patch.reason, target: invalidDefault.provider, detail })
    return fail(detail, 400)
  }

  const defaultBeingDisabled = patch.providerChanges.find((change) => change.enabled === false
    && providerSettings.get(change.provider)?.is_default && change.is_default !== false)
  if (defaultBeingDisabled) {
    const detail = 'Select another default card provider or clear the current default before disabling it.'
    await writeRejectedAttempt({ db, actorProfileId, actorRole, reason: patch.reason, target: defaultBeingDisabled.provider, detail })
    return fail(detail, 400)
  }

  for (const change of patch.providerChanges.filter((provider) => provider.retired === true)) {
    if (change.enabled !== false) {
      const detail = 'A provider must be disabled before it can be retired.'
      await writeRejectedAttempt({ db, actorProfileId, actorRole, reason: patch.reason, target: change.provider, detail })
      return fail(detail, 400)
    }
    const now = new Date().toISOString()
    const [open, refundWindow] = await Promise.all([
      db.from('payment_attempts').select('id', { count: 'exact', head: true }).eq('gateway', change.provider).in('status', OPEN_STATUSES),
      db.from('payment_attempts').select('id', { count: 'exact', head: true }).eq('gateway', change.provider).eq('status', 'completed').gt('refund_window_expires_at', now),
    ])
    if (open.error || refundWindow.error) {
      const detail = 'Open payment count is unavailable; provider retirement was blocked.'
      await writeRejectedAttempt({ db, actorProfileId, actorRole, reason: patch.reason, target: change.provider, detail })
      return fail(detail, 503)
    }
    if ((open.count ?? 0) + (refundWindow.count ?? 0) > 0) {
      const detail = 'Provider retirement is blocked while payments remain open or refundable.'
      await writeRejectedAttempt({ db, actorProfileId, actorRole, reason: patch.reason, target: change.provider, detail })
      return fail(detail, 409)
    }
  }

  const pesapalModeChange = patch.providerChanges.find((change) => change.provider === 'pesapal' && change.test_mode_owner_only === false)
  if (pesapalModeChange) {
    const ready = await pesapalReadiness(db)
    if (!ready.credentialsPresent || !ready.notificationRegistered || !ready.ownerTestPaymentCompleted) {
      const detail = 'Pesapal owner-only mode can be turned off only after credentials, notification registration and a completed owner test payment are confirmed.'
      await writeRejectedAttempt({ db, actorProfileId, actorRole, reason: patch.reason, target: 'pesapal', detail })
      return fail(detail, 409)
    }
  }

  const { data, error } = await db.rpc('apply_payment_settings_patch', {
    p_expected_version: patch.expectedVersion,
    p_actor_profile_id: auth.profileId,
    p_actor_role: auth.role,
    p_reason: patch.reason,
    p_provider_changes: patch.providerChanges,
    p_method_changes: patch.methodChanges,
    p_global_changes: patch.globalChanges,
    p_actor_ip: null,
    p_actor_user_agent: request.headers.get('user-agent')?.slice(0, 500) ?? null,
  })

  if (error) {
    const conflict = /payment_settings_version_conflict/.test(error.message || '')
    const retirementConflict = /open or refundable payment attempts/i.test(error.message || '')
    await writeRejectedAttempt({
      db,
      actorProfileId,
      actorRole,
      reason: patch.reason,
      target,
      detail: conflict ? 'Settings changed in another session.' : retirementConflict ? 'Provider retirement was blocked by an open or refundable payment.' : 'The settings update failed validation or could not be saved.',
    })
    return fail(conflict ? 'Payment settings changed in another session. Refresh and try again.' : retirementConflict ? 'Provider retirement is blocked while payments remain open or refundable.' : 'Payment settings could not be saved.', conflict || retirementConflict ? 409 : 400)
  }

  await sendPaymentSettingsAlert({
    db,
    actorProfileId: auth.profileId,
    actorRole: auth.role,
    action: 'changed',
    reason: patch.reason,
    diff: changesWithBeforeAfter(currentSettings, patch),
    target,
  })
  return ok({ version: Number(data) || patch.expectedVersion + 1, saved: true })
}
