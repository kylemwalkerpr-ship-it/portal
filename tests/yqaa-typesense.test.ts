import { searchModalYqaaKnowledge } from '@/lib/yqaaTypesense'
jest.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: () => ({ env: {} }) }))

const row = { chunk_key:'public:canada', source_key:'canada', title:'Canada study permit',
  body:'Public study permit orientation', source_url:'https://www.canada.ca/guide', site:'canada',
  jurisdiction:'Canada', repository:'public', topic_tags:['study'], authority_tier:5,
  fetched_at:'2026-10-13T00:00:00Z', lastmod:'', section_title:'Guide', score:6 }
const options={query:'Canada study permit',site:'canada',jurisdiction:'Canada',limit:12}
describe('Modal public knowledge retrieval', () => {
  const original=global.fetch
  beforeEach(() => { process.env.YQAA_TYPESENSE_ENABLED='true'; process.env.YQAA_TYPESENSE_URL='https://example--serve.modal.run'; process.env.YQAA_TYPESENSE_TOKEN='test-only'; })
  afterEach(() => { global.fetch=original; delete process.env.YQAA_TYPESENSE_ENABLED;delete process.env.YQAA_TYPESENSE_URL;delete process.env.YQAA_TYPESENSE_TOKEN; jest.useRealTimers() })
  it('returns validated cited evidence',async () => {
    global.fetch=jest.fn(async () => Response.json({ready:true,chunks:[row]})) as typeof fetch
    expect(await searchModalYqaaKnowledge(options)).toEqual([row])
  })
  it.each([401,403,302,503])('falls back on HTTP %i',async status => {
    global.fetch=jest.fn(async () => new Response(null,{status})) as typeof fetch
    expect(await searchModalYqaaKnowledge(options)).toBeNull()
  })
  it('rejects jurisdiction mismatch',async () => {
    global.fetch=jest.fn(async () => Response.json({ready:true,chunks:[{...row,jurisdiction:'United States'}]})) as typeof fetch
    expect(await searchModalYqaaKnowledge(options)).toBeNull()
  })
  it('rejects uncited evidence',async () => {
    global.fetch=jest.fn(async () => Response.json({ready:true,chunks:[{...row,source_url:'private://record'}]})) as typeof fetch
    expect(await searchModalYqaaKnowledge(options)).toBeNull()
  })
  it('rejects unapproved endpoints without sending credentials',async () => {
    process.env.YQAA_TYPESENSE_URL='https://untrusted.invalid'
    global.fetch=jest.fn() as typeof fetch
    expect(await searchModalYqaaKnowledge(options)).toBeNull();expect(global.fetch).not.toHaveBeenCalled()
  })
  it('bounds a fetch that ignores cancellation',async () => {
    jest.useFakeTimers();global.fetch=jest.fn(() => new Promise(() => {})) as typeof fetch
    const work=searchModalYqaaKnowledge(options);await jest.advanceTimersByTimeAsync(2001)
    expect(await work).toBeNull()
  })
  it('rejects an oversized response',async () => {
    global.fetch=jest.fn(async () => new Response('x'.repeat(250001))) as typeof fetch
    expect(await searchModalYqaaKnowledge(options)).toBeNull()
  })
})
