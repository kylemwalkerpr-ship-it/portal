/**
 * Load archived conversations independently of the default inbox list.
 * The default list explicitly excludes archived rows, even when its counts.archived > 0.
 */
export async function fetchArchivedConversationsPage<T = any>(
  page: number,
  fetcher: typeof fetch = fetch,
): Promise<{ conversations: T[]; hasMore: boolean }> {
  const params = new URLSearchParams({
    filter: 'archived',
    page: String(page),
    page_size: '50',
  })
  const response = await fetcher(`/api/messages/conversations?${params.toString()}`, {
    credentials: 'same-origin',
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(body?.error?.message || body?.error || `Failed to load archived conversations (${response.status})`)
  }
  if (!Array.isArray(body?.conversations)) {
    throw new Error('Archived conversations response is invalid.')
  }
  return { conversations: body.conversations as T[], hasMore: Boolean(body.has_more) }
}
