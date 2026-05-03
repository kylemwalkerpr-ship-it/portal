import { getClerkUserId } from '@/lib/auth'
import { createSupabaseAdminClient } from '@/lib/supabase'

// Diagnostic endpoint — checks every layer and reports exactly where things break.
// Visit /api/wallet/diagnose while signed in to see a full health report.
export async function GET() {
  const report: Record<string, unknown> = {}

  // 1. Environment variables
  report.env = {
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: prefix(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY),
    STRIPE_SECRET_KEY: prefix(process.env.STRIPE_SECRET_KEY),
    STRIPE_WEBHOOK_SECRET: prefix(process.env.STRIPE_WEBHOOK_SECRET),
    NEXT_PUBLIC_SUPABASE_URL: prefix(process.env.NEXT_PUBLIC_SUPABASE_URL),
    SUPABASE_SERVICE_ROLE_KEY: prefix(process.env.SUPABASE_SERVICE_ROLE_KEY),
    CLERK_SECRET_KEY: prefix(process.env.CLERK_SECRET_KEY),
  }

  // 2. Mode mismatch check (live vs test)
  const pubMode = (process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '').startsWith('pk_live') ? 'live' : 'test'
  const secMode = (process.env.STRIPE_SECRET_KEY ?? '').startsWith('sk_live') ? 'live' : 'test'
  report.stripeMode = { publishable: pubMode, secret: secMode, mismatch: pubMode !== secMode }

  // 3. Auth
  const clerkUserId = await getClerkUserId()
  report.auth = { clerkUserId: clerkUserId ?? null, hasSession: !!clerkUserId }
  if (!clerkUserId) return Response.json(report)

  // 4. Profile lookup with all possible columns
  const db = createSupabaseAdminClient()
  const fullSelect = await db
    .from('profiles')
    .select('id, email, full_name, role, status, stripe_customer_id')
    .eq('clerk_user_id', clerkUserId)
    .single()
  report.profileFullSelect = {
    ok: !!fullSelect.data,
    data: fullSelect.data,
    error: fullSelect.error ? { code: fullSelect.error.code, message: fullSelect.error.message } : null,
  }

  // 5. Profile lookup without optional columns
  const basicSelect = await db
    .from('profiles')
    .select('id, email, full_name, role')
    .eq('clerk_user_id', clerkUserId)
    .single()
  report.profileBasicSelect = {
    ok: !!basicSelect.data,
    data: basicSelect.data,
    error: basicSelect.error ? { code: basicSelect.error.code, message: basicSelect.error.message } : null,
  }

  // 6. Detect schema columns by looking at the error code 42703 (undefined_column)
  const missingStatus = fullSelect.error?.message?.includes('"status"')
  const missingStripeCustId = fullSelect.error?.message?.includes('"stripe_customer_id"')
  report.schema = {
    statusColumn: missingStatus ? 'MISSING' : 'present',
    stripeCustomerIdColumn: missingStripeCustId ? 'MISSING' : 'present',
  }

  // 7. Stripe API check — try creating a Stripe customer
  if (process.env.STRIPE_SECRET_KEY) {
    try {
      const Stripe = (await import('stripe')).default
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
      const acct = await stripe.accounts.retrieve()
      report.stripeAccount = { ok: true, accountId: acct.id, country: acct.country, chargesEnabled: acct.charges_enabled }
    } catch (e) {
      report.stripeAccount = { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  } else {
    report.stripeAccount = { ok: false, error: 'STRIPE_SECRET_KEY not in process.env' }
  }

  // 8. Try creating a SetupIntent for the user
  if (process.env.STRIPE_SECRET_KEY && (basicSelect.data?.email || fullSelect.data?.email)) {
    try {
      const Stripe = (await import('stripe')).default
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
      const profile = fullSelect.data || basicSelect.data
      const customerId = profile?.stripe_customer_id
        ? profile.stripe_customer_id
        : (await stripe.customers.create({
            email: profile?.email,
            name: profile?.full_name ?? undefined,
            metadata: { clerk_user_id: clerkUserId, source: 'diagnose' },
          })).id
      const si = await stripe.setupIntents.create({
        customer: customerId,
        payment_method_types: ['card'],
        usage: 'off_session',
      })
      report.setupIntent = { ok: true, customerId, setupIntentId: si.id }
    } catch (e) {
      report.setupIntent = {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        type: e instanceof Error ? e.constructor.name : typeof e,
      }
    }
  }

  return Response.json(report)
}

function prefix(v: string | undefined) {
  if (!v) return 'MISSING'
  return `${v.slice(0, 12)}…(len=${v.length})`
}
