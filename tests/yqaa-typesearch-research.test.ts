import { researchYqaaPublicWeb } from '@/lib/yqaaWebResearch'
import { searchYqaaTypesearch } from '@/lib/yqaaTypesearch'
import { callSystemSuperGrokWebSearch } from '@/lib/superGrokAssistant'
jest.mock('@opennextjs/cloudflare', () => ({getCloudflareContext:()=>({env:{}})}))
jest.mock('@/lib/yqaaTypesearch',()=>({searchYqaaTypesearch:jest.fn()}))
jest.mock('@/lib/superGrokAssistant',()=>({callSystemSuperGrokWebSearch:jest.fn(async()=>({webSearchCalls:0,text:'',citations:[]}))}))
const excerpt='Official public requirements are published for study permit applicants on this website.'
describe('TypeSearch public research integration',()=>{
  beforeEach(()=>jest.clearAllMocks())
  it('sanitizes queries and restricts accepted evidence to the official jurisdiction',async()=>{
    ;(searchYqaaTypesearch as jest.Mock).mockResolvedValue([
      {url:'https://www.canada.ca/guide',title:'Study permit',excerpt},
      {url:'https://www.uscis.gov/guide',title:'Wrong country',excerpt},
      {url:'https://canada.ca.attacker.example/guide',title:'Wrong host',excerpt},
      {url:'https://user:secret@www.canada.ca/guide',title:'Credentialed URL',excerpt},
    ])
    const rows=await researchYqaaPublicWeb('Canada study permit requirements jane@example.com','portal.yousafeconsultancy.com')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({sourceKey:'typesearch:web_search',sourceUrl:'https://www.canada.ca/guide',jurisdiction:'Canada'})
    expect(rows[0].body).toContain('not the complete page')
    const [query,domains]=(searchYqaaTypesearch as jest.Mock).mock.calls[0]
    expect(query).not.toContain('jane@example.com')
    expect(domains).toContain('canada.ca')
    expect(callSystemSuperGrokWebSearch).not.toHaveBeenCalled()
  })
  it('keeps the existing provider path when search finds no evidence',async()=>{
    ;(searchYqaaTypesearch as jest.Mock).mockResolvedValue([])
    expect(await researchYqaaPublicWeb('public service listing')).toEqual([])
    expect(callSystemSuperGrokWebSearch).toHaveBeenCalledTimes(1)
  })
})
