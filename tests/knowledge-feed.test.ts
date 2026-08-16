import { fetchFeedText } from '@/lib/seoEngine/knowledge'

describe('fetchFeedText (Google News rate-limit resilience)', () => {
  const realFetch = global.fetch
  afterEach(() => {
    global.fetch = realFetch
  })

  it('returns the body on a clean 200', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '<rss><item>ok</item></rss>',
    }) as unknown as typeof fetch
    const text = await fetchFeedText('https://x/feed')
    expect(text).toContain('<rss>')
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('retries once on 429 then succeeds', async () => {
    global.fetch = (jest.fn()
      .mockResolvedValueOnce({ ok: false, status: 429, text: async () => '' })
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => '<rss/>' })) as unknown as typeof fetch
    const text = await fetchFeedText('https://x/feed')
    expect(text).toBe('<rss/>')
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })

  it('retries once on an empty 200 then succeeds', async () => {
    global.fetch = (jest.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => '' })
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => '<rss/>' })) as unknown as typeof fetch
    const text = await fetchFeedText('https://x/feed')
    expect(text).toBe('<rss/>')
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })

  it('throws on a persistent non-OK without retrying 4xx', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => '',
    }) as unknown as typeof fetch
    await expect(fetchFeedText('https://x/feed')).rejects.toThrow('HTTP 404')
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('throws after two empty bodies', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '',
    }) as unknown as typeof fetch
    await expect(fetchFeedText('https://x/feed')).rejects.toThrow('Empty feed body')
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })
})
