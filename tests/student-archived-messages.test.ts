import fs from 'node:fs'
import path from 'node:path'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ArchivedView from '../components/messaging/ArchivedView'
import { fetchArchivedConversationsPage } from '../lib/messaging/archivedConversations'

const inbox = fs.readFileSync(path.join(process.cwd(), 'components/messaging/UnifiedInbox.tsx'), 'utf8')
const route = fs.readFileSync(path.join(process.cwd(), 'app/api/messages/conversations/route.ts'), 'utf8')
const makeResponse = (body: unknown, ok = true, status = 200) => ({
  ok, status, json: async () => body,
}) as Response
const props = {
  open: true,
  onClose: jest.fn(),
  onUnarchive: jest.fn(),
  conversations: [{
    id: 'archive-1',
    archived_at: '2026-10-01T10:00:00Z',
    last_message_at: '2026-10-01T10:00:00Z',
    counterpart: { name: 'Ada Example' },
    last_message: 'The requested assignment is ready.',
  }],
}

describe('student Archived messages regression', () => {
  test('queries archived conversations rather than default unarchived inbox, including page 2', async () => {
    const fetcher = jest.fn(async () => makeResponse({
      conversations: [{ id: 'archive-51', archived_at: '2026-10-01' }],
      has_more: true,
    }))
    const page = await fetchArchivedConversationsPage(2, fetcher as unknown as typeof fetch)
    expect(fetcher).toHaveBeenCalledWith(
      '/api/messages/conversations?filter=archived&page=2&page_size=50',
      { credentials: 'same-origin' },
    )
    expect(page).toEqual({ conversations: [{ id: 'archive-51', archived_at: '2026-10-01' }], hasMore: true })
  })

  test('empty archived page is valid (does not invent messages)', async () => {
    const page = await fetchArchivedConversationsPage(1,
      jest.fn(async () => makeResponse({ conversations: [], has_more: false })) as unknown as typeof fetch)
    expect(page).toEqual({ conversations: [], hasMore: false })
  })

  test('rejected API response raises a visible failure, not an empty archive', async () => {
    await expect(fetchArchivedConversationsPage(1,
      jest.fn(async () => makeResponse({ error: { message: 'Not authorized' } }, false, 401)) as unknown as typeof fetch
    )).rejects.toThrow('Not authorized')
  })

  test('malformed API response raises an error', async () => {
    await expect(fetchArchivedConversationsPage(1,
      jest.fn(async () => makeResponse({ counts: { archived: 2 } })) as unknown as typeof fetch
    )).rejects.toThrow('response is invalid')
  })

  test('archived dialog renders a real API name, preview, unarchive control and accessible title', () => {
    const html = renderToStaticMarkup(React.createElement(ArchivedView, props))
    expect(html).toContain('role="dialog"')
    expect(html).toContain('Archived messages')
    expect(html).toContain('Ada Example')
    expect(html).toContain('The requested assignment is ready.')
    expect(html).toContain('Unarchive')
  })

  test('dialog distinguishes loading, empty and error states and offers retry', () => {
    const loading = renderToStaticMarkup(React.createElement(ArchivedView, { ...props, conversations: [], loading: true }))
    expect(loading).toContain('Loading archived conversations')
    expect(loading).not.toContain('No archived chats.')
    const empty = renderToStaticMarkup(React.createElement(ArchivedView, { ...props, conversations: [] }))
    expect(empty).toContain('No archived chats.')
    const failure = renderToStaticMarkup(React.createElement(ArchivedView, {
      ...props, conversations: [], error: 'Request failed', onRetry: jest.fn(),
    }))
    expect(failure).toContain('Request failed')
    expect(failure).toContain('Retry')
    expect(failure).not.toContain('No archived chats.')
  })

  test('supports pagination and pending restoration safely', () => {
    const html = renderToStaticMarkup(React.createElement(ArchivedView, {
      ...props, hasMore: true, onLoadMore: jest.fn(), restoringId: 'archive-1',
    }))
    expect(html).toContain('Load more archived conversations')
    expect(html).toContain('Restoring')
    expect(html).toContain('disabled=""')
  })

  test('integration keeps archived query independent of active inbox, restores and refreshes both lists', () => {
    expect(inbox).toContain('fetchArchivedConversationsPage<any>(nextPage)')
    expect(inbox).toContain('if (showArchived) void loadArchived(1)')
    expect(inbox).toContain('conversations={archivedConversations}')
    expect(inbox).toContain('if (!response.ok) throw new Error')
    expect(inbox).toContain('Promise.all([loadList(true), loadArchived(1)])')
    expect(route).toContain("filter === 'archived'")
    expect(route).toContain("conversations.filter(c => !c.archived_at && c.status !== 'archived')")
  })
})
