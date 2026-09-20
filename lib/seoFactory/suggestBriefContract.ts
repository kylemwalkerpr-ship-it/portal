// Public suggest-brief contract boundary. The research/persistence implementation
// remains in suggestBriefContractCore; final ownership is re-resolved with the
// model-selected slug before an immutable contract is created or attached.
export * from './suggestBriefContractCore'

import * as core from './suggestBriefContractCore'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { assertPlanRepoConsistency, resolveOwner, type OwnerPlan } from './ownership'
import { assertBroadCreateDestinationAllowed } from './broadCreateFreeze'

function norm(value: unknown): string {
  return String(value || '').trim().replace(/\/+$/, '').toLowerCase()
}

function slugFromPlan(plan: OwnerPlan, fallback: string): string {
  try {
    const segments = new URL(plan.canonicalUrl).pathname.split('/').filter(Boolean)
    const last = segments[segments.length - 1]
    if (last) return decodeURIComponent(last)
  } catch { /* fall through to requested slug */ }
  return String(fallback || '').trim().replace(/^\/+|\/+$/g, '')
}

export async function finalizeSuggestBriefContract(
  input: Parameters<typeof core.finalizeSuggestBriefContract>[0],
): ReturnType<typeof core.finalizeSuggestBriefContract> {
  const requestedSlug = String(input.targetSlug || '').trim().replace(/^\/+|\/+$/g, '')
  if (!requestedSlug) throw new Error('writing contract target slug is required before final ownership is sealed')

  const finalPlan = await resolveOwner({
    primaryKeyword: input.primaryKeyword,
    contentType: input.contentType,
    region: input.region,
    indexable: true,
    slug: requestedSlug,
  })
  assertPlanRepoConsistency(finalPlan)

  // A slug may change path/canonical within the reserved estate, but it must not
  // silently move the opportunity to a different host/repository after research.
  if (norm(finalPlan.host) !== norm(input.session.plan.host) || norm(finalPlan.repo) !== norm(input.session.plan.repo)) {
    throw new Error(`writing contract target drift: final slug resolves to ${finalPlan.repo}/${finalPlan.host}, reserved ${input.session.plan.repo}/${input.session.plan.host}`)
  }

  await assertBroadCreateDestinationAllowed(finalPlan, { primaryKeyword: input.primaryKeyword })

  const authoritativeSlug = slugFromPlan(finalPlan, requestedSlug)
  const db = createSupabaseAdminClient()
  const targetUpdate = await db
    .from('content_jobs')
    .update({
      target_repo: finalPlan.repo,
      owner_host: finalPlan.host,
      canonical_url: finalPlan.canonicalUrl,
      content_path: finalPlan.filePath,
      slug: authoritativeSlug,
    })
    .eq('id', input.session.reservation.jobId)
    .eq('opportunity_id', input.session.reservation.identity.id)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle()
  if (targetUpdate.error || !targetUpdate.data?.id) {
    throw new Error(`writing contract final target could not be bound to its reserved job: ${targetUpdate.error?.message || 'reservation changed'}`)
  }

  return core.finalizeSuggestBriefContract({
    ...input,
    targetSlug: authoritativeSlug,
    session: { ...input.session, plan: finalPlan },
  })
}
