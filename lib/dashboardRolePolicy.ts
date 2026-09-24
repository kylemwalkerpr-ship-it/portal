import { normalizeSelfServiceLane, type SelfServiceLane } from '@/lib/roleLanes'

type ProvisionRoleSignals = {
  metadataRole?: unknown
  cookieLane?: unknown
  urlLane?: unknown
}

/** Pick a new profile role only from public self-service lanes. */
export function resolveProvisionedSelfServiceLane({
  metadataRole,
  cookieLane,
  urlLane,
}: ProvisionRoleSignals): SelfServiceLane {
  return normalizeSelfServiceLane(metadataRole)
    ?? normalizeSelfServiceLane(cookieLane)
    ?? normalizeSelfServiceLane(urlLane)
    ?? 'client'
}

/** Keep privileged routes tied to existing database roles and active status. */
export function dashboardRedirectFor({
  role,
  status,
  laneIntent,
}: {
  role: string | null | undefined
  status: string | null | undefined
  laneIntent: string | null | undefined
}): 'support' | 'admin-sign-in' | null {
  if (role === 'support' && status === 'active') return 'support'
  if (laneIntent === 'admin' && role !== 'admin') return 'admin-sign-in'
  return null
}
