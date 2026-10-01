export type AuthLane = 'client' | 'consultant' | 'support' | 'attorney'
export type ProfileRole = AuthLane | 'admin'
export type SelfServiceLane = 'client' | 'consultant' | 'attorney'

export const DEFAULT_AUTH_LANE: AuthLane = 'client'

export function normalizeAuthLane(value: unknown): AuthLane {
  if (value === 'student' || value === 'client') return 'client'
  if (value === 'consultant') return 'consultant'
  if (value === 'support') return 'support'
  if (value === 'attorney') return 'attorney'
  return DEFAULT_AUTH_LANE
}

/** Roles a user may select during self-service signup. Privileged lanes are invite-managed. */
export function normalizeSelfServiceLane(value: unknown): SelfServiceLane | null {
  if (value === 'student' || value === 'client') return 'client'
  if (value === 'consultant' || value === 'attorney') return value
  return null
}

export function laneSegment(lane: AuthLane): string {
  return lane === 'client' ? 'student' : lane
}

export function dashboardForLane(lane: AuthLane): string {
  return `/dashboard?lane=${laneSegment(lane)}`
}

export function signInForLane(lane: AuthLane): string {
  return `/sign-in/${laneSegment(lane)}`
}

export function signUpForLane(lane: AuthLane): string {
  return `/sign-up/${laneSegment(lane)}`
}

export function roleLabel(role: string): string {
  if (role === 'client' || role === 'student') return 'client'
  return role
}
