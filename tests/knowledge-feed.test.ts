import {
  DEFAULT_SOURCES,
  defaultFeedTimeoutMs,
  fetchFeedText,
  isImmigrationRelevant,
  parseFeed,
  tagItem,
  unwrapFeedLink,
  withTimeout,
  type KnowledgeSource,
} from '@/lib/seoEngine/knowledge'

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

  it('uses a shorter budget for Google News / Trends than gov feeds', () => {
    expect(defaultFeedTimeoutMs('https://news.google.com/rss/search?q=USCIS')).toBe(6_000)
    expect(defaultFeedTimeoutMs('https://trends.google.com/trending/rss?geo=US')).toBe(6_000)
    expect(defaultFeedTimeoutMs('https://www.gov.uk/search/news-and-communications.atom')).toBe(8_000)
  })

  it('fails fast when fetch never resolves (does not hang the ingest tape)', async () => {
    global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch
    const start = Date.now()
    await expect(fetchFeedText('https://news.google.com/rss/search?q=USCIS', { timeoutMs: 250 })).rejects.toThrow(/timed out after 250ms/)
    expect(Date.now() - start).toBeLessThan(1500)
  })

  it('withTimeout rejects even if the inner work ignores AbortSignal', async () => {
    await expect(withTimeout(50, () => new Promise(() => {}), 'source')).rejects.toThrow(/timed out after 50ms/)
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

  it('uses the fallback host when the primary hangs', async () => {
    global.fetch = jest.fn((input: RequestInfo) => {
      const u = String(input)
      if (u.includes('news.google.com')) return new Promise(() => {})
      return Promise.resolve({ ok: true, status: 200, text: async () => '<rss><item>bing</item></rss>' })
    }) as unknown as typeof fetch
    const start = Date.now()
    const text = await fetchFeedText('https://news.google.com/rss/search?q=USCIS', {
      timeoutMs: 250,
      fallbackUrl: 'https://www.bing.com/news/search?q=USCIS+immigration&format=rss',
    })
    expect(text).toContain('bing')
    expect(Date.now() - start).toBeLessThan(2000)
  })

  it('uses the fallback host when the primary returns 404', async () => {
    global.fetch = (jest.fn()
      .mockResolvedValueOnce({ ok: false, status: 404, text: async () => '' })
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => '<rss>fallback</rss>' })) as unknown as typeof fetch
    const text = await fetchFeedText('https://x/feed', { fallbackUrl: 'https://y/feed' })
    expect(text).toContain('fallback')
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })
})

describe('parseFeed + tagItem (Trends store + news fallback)', () => {
  const policyUs: KnowledgeSource = {
    id: 'gnews-uscis',
    label: 'Google News · USCIS',
    kind: 'policy',
    url: 'https://example.com',
    countries: ['US'],
    limit: 8,
  }
  const trendsUs: KnowledgeSource = {
    id: 'google-trends-us',
    label: 'Google Trends (US)',
    kind: 'trend',
    url: 'https://trends.google.com/trending/rss?geo=US',
    countries: ['US'],
    limit: 10,
  }

  it('points gnews sources at Bing first with Google News as fallback', () => {
    const uscis = DEFAULT_SOURCES.find((s) => s.id === 'gnews-uscis')
    expect(uscis?.url).toContain('bing.com/news')
    expect(uscis?.fallbackUrl).toContain('news.google.com')
  })

  it('synthesizes unique Trends links when every item shares the RSS URL', () => {
    const xml = `<rss><item><title>H-1B visa</title><link>https://trends.google.com/trending/rss?geo=US</link></item>
<item><title>diesel fuel</title><link>https://trends.google.com/trending/rss?geo=US</link></item></rss>`
    const items = parseFeed(xml, 10)
    expect(items).toHaveLength(2)
    expect(items[0].link).toContain('q=H-1B')
    expect(items[1].link).toContain('q=diesel')
    expect(items[0].link).not.toBe(items[1].link)
  })

  it('unwraps Bing News tracker URLs to the publisher link', () => {
    const tracked = 'http://www.bing.com/news/apiclick.aspx?ref=FexRss&amp;url=https%3A%2F%2Fwww.uscis.gov%2Fnews'
    expect(unwrapFeedLink(tracked)).toBe('https://www.uscis.gov/news')
    const xml = `<rss><item><title>USCIS form change</title><link>${tracked}</link></item></rss>`
    expect(parseFeed(xml, 5)[0].link).toBe('https://www.uscis.gov/news')
  })

  it('folds hyphenated visa codes so H-1B matches the immigration lexicon', () => {
    expect(isImmigrationRelevant('H-1B visa lottery')).toBe(true)
    expect(tagItem({ title: 'H-1B visa lottery', link: 'https://x/h1b', description: '' }).score).toBeGreaterThan(0)
  })

  it('skips celebrity/sports Trends that are not immigration or SEO', () => {
    const tagged = tagItem({ title: 'diesel fuel', link: 'https://trends.google.com/trending?q=diesel%20fuel', description: '' }, trendsUs)
    expect(tagged.score).toBe(0)
  })

  it('stores official policy items even when the headline omits seed phrases', () => {
    const tagged = tagItem({
      title: 'Thirteen hotels exited and returned to local communities',
      link: 'https://www.gov.uk/government/news/13-asylum-hotels',
      description: '',
    }, policyUs)
    expect(tagged.score).toBeGreaterThan(0)
    expect(tagged.countries).toEqual(['US'])
  })

  it('pulls Trends news-item titles into the description for tagging', () => {
    const xml = `<rss xmlns:ht="https://trends.google.com/trending/rss"><item>
      <title>public charge</title>
      <link>https://trends.google.com/trending/rss?geo=US</link>
      <ht:news_item><ht:news_item_title>USCIS issues new public charge guidance</ht:news_item_title></ht:news_item>
    </item></rss>`
    const [item] = parseFeed(xml, 5)
    expect(item.description).toMatch(/public charge guidance/i)
    expect(tagItem(item, trendsUs).score).toBeGreaterThan(0)
  })
})
