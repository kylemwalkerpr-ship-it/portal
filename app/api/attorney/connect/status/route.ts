import { requireAttorney } from '@/lib/attorneyAuth'
import { getPlatformSettings } from '@/lib/platformConfig'

export async function GET() {
  const { ctx, error, status } = await requireAttorney()
  if (!ctx) return Response.json({ error }, { status })

  let [{ data: attorney, error: attorneyErr }, settings] = await Promise.all([
    ctx.db
      .from('attorneys')
      .select('stripe_account_id, stripe_onboarding_complete, stripe_bypass')
      .eq('id', ctx.attorneyId)
      .single(),
    getPlatformSettings(),
  ])
  if (attorneyErr && /stripe_bypass|schema cache|column/i.test(attorneyErr.message)) {
    const fallback = await ctx.db
      .from('attorneys')
      .select('stripe_account_id, stripe_onboarding_complete')
      .eq('id', ctx.attorneyId)
      .single()
    attorney = fallback.data ? { ...fallback.data, stripe_bypass: false } : null
  }

  const onboardingComplete = Boolean(attorney?.stripe_onboarding_complete)
  const bypassed = Boolean(attorney?.stripe_bypass)
  const feePercent = Number(
    (settings as Record<string, unknown>).attorney_platform_fee_percent ?? 25,
  )

  return Response.json({
    has_account: Boolean(attorney?.stripe_account_id),
    onboarding_complete: onboardingComplete,
    bypassed,
    // `effective` is what the UI should gate on: an attorney is good to send
    // offers if Connect is complete OR an admin has bypassed them.
    effective_onboarded: onboardingComplete || bypassed,
    attorney_platform_fee_percent: Number.isFinite(feePercent) ? feePercent : 25,
  })
}
