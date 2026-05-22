/**
 * GET /api/wallet/diagnose
 * Health check for the NMI wallet stack: env vars, auth, Supabase schema,
 * payment provider connectivity.
 */
import { getClerkUserId } from '@/lib/auth'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { getPaymentProvider } from '@/lib/payments'

function prefix(v: string | undefined) {
  if (!v) return 'MISSING'
  return `${v.slice(0, 12)}…(len=${v.length})`
}

export async function GET() {
  const report: Record<string, unknown> = {}

  // 1. Environment
  report.env = {
    PAYMENT_PROVIDER: process.env.PAYMENT_PROVIDER || 'nmi (default)',
    NMI_SECURITY_KEY: prefix(process.env.NMI_SECURITY_KEY),
    NMI_TOKENIZATION_KEY: prefix(process.env.NMI_TOKENIZATION_KEY),
    NEXT_PUBLIC_SUPABASE_URL: prefix(process.env.NEXT_PUBLIC_SUPABASE_URL),
    SUPABASE_SERVICE_ROLE_KEY: prefix(process.env.SUPABASE_SERVICE_ROLE_KEY),
    CLERK_SECRET_KEY: prefix(process.env.CLERK_SECRET_KEY),
  }

  // 2. Auth
  const clerkUserId = await getClerkUserId()
  report.auth = { clerkUserId: clerkUserId ?? null, hasSession: !!clerkUserId }
  if (!clerkUserId) return Response.json(report)

  // 3. Profile lookup
  const db = createSupabaseAdminClient()
  const { data: profile, error: profileErr } = await db
    .from('profiles')
    .select('id, email, full_name, role, status')
    .eq('clerk_user_id', clerkUserId)
    .single()

  report.profile = {
    ok: !!profile,
    data: profile,
    error: profileErr ? { code: profileErr.code, message: profileErr.message } : null,
  }

  // 4. Schema detection
  const schemaChecks = await Promise.all([
    db.from('student_wallets').select('profile_id').limit(1),
    db.from('student_payment_methods').select('id').limit(1),
    db.from('wallet_transactions').select('id').limit(1),
  ])

  report.schema = {
    student_wallets: schemaChecks[0].error
      ? { ok: false, error: schemaChecks[0].error.message }
      : { ok: true },
    student_payment_methods: schemaChecks[1].error
      ? { ok: false, error: schemaChecks[1].error.message }
      : { ok: true },
    wallet_transactions: schemaChecks[2].error
      ? { ok: false, error: schemaChecks[2].error.message }
      : { ok: true },
  }

  // 5. Payment provider config
  try {
    const config = getPaymentProvider().getClientConfig()
    report.providerConfig = { ok: true, provider: config.provider, mode: config.mode }
  } catch (e) {
    report.providerConfig = {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    }
  }

  // 6. NMI API sanity check (lightweight — just validate the key works)
  if (process.env.NMI_SECURITY_KEY) {
    try {
      const res = await fetch('https://secure.nmi.com/api/query.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          security_key: process.env.NMI_SECURITY_KEY,
          limit: '1',
        }),
      })
      const text = await res.text()
      const hasXml = text.includes('<?xml') || text.includes('<nm_response')
      report.nmiApi = { ok: res.ok && hasXml, status: res.status, hasXml }
    } catch (e) {
      report.nmiApi = { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  } else {
    report.nmiApi = { ok: false, error: 'NMI_SECURITY_KEY not set' }
  }

  return Response.json(report)
}
