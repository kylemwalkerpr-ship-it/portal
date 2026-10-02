/** Admin toast text after a one-click decision: what changed for the applicant. */
export function decisionSummary(
  action: 'approve' | 'decline' | string,
  d: { role?: string | null; profileStatus?: string | null; clerkMirrored?: boolean; email?: string | null } | null | undefined,
): string {
  const verb = action === 'approve' ? 'approved' : 'rejected'
  const parts = [`Application ${verb}`]
  if (d && d.profileStatus) parts.push(`profile ${d.role ? d.role + ' / ' : ''}${d.profileStatus}`)
  if (d && typeof d.clerkMirrored === 'boolean') parts.push(d.clerkMirrored ? 'Clerk updated' : 'Clerk not updated')
  if (d && d.email) parts.push(d.email === 'sent' ? 'applicant emailed' : `email ${d.email}`)
  return parts.join(' · ') + '.'
}

export const OPEN_DECISION_STATUSES: readonly string[] = ['pending', 'waitlist', 'needs_info']
