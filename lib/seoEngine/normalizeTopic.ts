/** Leaf normalizer — safe to import from client components. Do not pull planner. */
export function normalizePlannerTopic(term: string): string {
  return String(term || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
