import { requireAttorney } from '@/lib/attorneyAuth'

export async function GET() {
  const { ctx, error, status } = await requireAttorney()
  if (!ctx) return Response.json({ error }, { status })

  const { data: attorney } = await ctx.db
    .from('attorneys')
    .select('stripe_account_id, stripe_onboarding_complete')
    .eq('id', ctx.attorneyId)
    .single()

  return Response.json({
    has_account: Boolean(attorney?.stripe_account_id),
    onboarding_complete: Boolean(attorney?.stripe_onboarding_complete),
  })
}
