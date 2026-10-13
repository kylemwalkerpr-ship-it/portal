import { searchYqaaTypesearch } from '@/lib/yqaaTypesearch'
jest.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: () => ({ env: {} }) }))
const article = {url:'https://www.canada.ca/guide',title:'Study permit guidance',read:{probability:0.9},highlights:['Canada publishes current requirements for study permit applications on its official public website.']}
const result = {found:true,incomplete:false,results:[article]}
describe('bounded TypeSearch article evidence', () => {
  const original=global.fetch
  beforeEach(() => {process.env.TYPESEARCH_API_KEY='test-only'})
  afterEach(() => {delete process.env.TYPESEARCH_API_KEY;global.fetch=original;jest.useRealTimers()})
  it('requires a server key before making any request',async () => {
    delete process.env.TYPESEARCH_API_KEY;global.fetch=jest.fn() as typeof fetch
    expect(await searchYqaaTypesearch('study permit',undefined)).toEqual([])
    expect(global.fetch).not.toHaveBeenCalled()
  })
  it('requests bounded, fresh article confirmation with official domain filters',async () => {
    global.fetch=jest.fn(async () => Response.json(result)) as typeof fetch
    expect(await searchYqaaTypesearch('study permit',['canada.ca'])).toEqual([{url:article.url,title:article.title,excerpt:article.highlights[0]}])
    const [url,init]=(global.fetch as jest.Mock).mock.calls[0]
    expect(url).toBe('https://api.typesearch.ai/v1/search')
    expect(init.redirect).toBe('manual')
    expect(JSON.parse(init.body)).toMatchObject({mode:'normal',highlights:true,include_domains:['canada.ca'],max_results:3,max_tokens:2000,fresh:true,days:null})
  })
  it.each([401,403,302,503])('falls back on HTTP %i',async status => {
    global.fetch=jest.fn(async () => new Response(null,{status})) as typeof fetch
    expect(await searchYqaaTypesearch('study permit',undefined)).toEqual([])
  })
  it.each([{...article,read:null},{...article,read:{probability:0.5}},{...article,highlights:[]}])('rejects unconfirmed or excerpt-free articles',async row => {
    global.fetch=jest.fn(async () => Response.json({...result,results:[row]})) as typeof fetch
    expect(await searchYqaaTypesearch('study permit',undefined)).toEqual([])
  })
  it.each([{...result,incomplete:true},{...result,cached_at:'2026-10-12T00:00:00Z'}])('rejects incomplete or cached output',async data => {
    global.fetch=jest.fn(async () => Response.json(data)) as typeof fetch
    expect(await searchYqaaTypesearch('study permit',undefined)).toEqual([])
  })
  it('caps the returned verbatim excerpt at 25 words',async () => {
    global.fetch=jest.fn(async () => Response.json({...result,results:[{...article,highlights:['public '.repeat(60)]}]})) as typeof fetch
    expect((await searchYqaaTypesearch('study permit',undefined))[0].excerpt.split(' ')).toHaveLength(25)
  })
  it('bounds cancellation even if transport ignores it',async () => {
    jest.useFakeTimers();global.fetch=jest.fn(() => new Promise(() => {})) as typeof fetch
    const work=searchYqaaTypesearch('study permit',undefined)
    await jest.advanceTimersByTimeAsync(1801)
    expect(await work).toEqual([])
  })
  it('rejects an oversized response',async () => {
    global.fetch=jest.fn(async () => new Response('x'.repeat(100001))) as typeof fetch
    expect(await searchYqaaTypesearch('study permit',undefined)).toEqual([])
  })
})
