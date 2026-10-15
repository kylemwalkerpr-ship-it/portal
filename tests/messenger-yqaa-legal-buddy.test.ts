import {
  enforceCompanionEscalation,
  applyPricingGuardDecision,
  resolveMessengerDraft,
  polishMessengerDraft,
  applyAdaptiveOfferAuthority,
  providerFailureCategory,
  insufficientEvidenceHandoffReply,
  insufficientEvidenceOrientationReply,
  canUseSafeFirstLegalOrientation,
  usefulFirstLegalOrientationReply,
  counterNeedsProviderReviewReply,
  explicitCounterReviewDraft,
  loadMessengerLegalEvidence,
  messengerNeedsLegalEvidence,
  yqaaOfferIdempotencyKey,
} from '@/lib/messengerAi'
import { guardMessengerOffer, lowBudgetEscalationReply } from '@/lib/messengerPricingAuthority'

jest.mock('@/lib/yqaaKnowledgeDb', () => ({
  loadYqaaEvidence: jest.fn(async () => ({
    chunks: [
      {
        id: 'kb:pr-marriage',
        chunkKey: 'kb:pr-marriage',
        sourceKey: 'repo://kb',
        title: 'Permanent residence via marriage — official overview',
        body: 'Spousal sponsorship generally requires a genuine relationship, sponsor eligibility, and an application with supporting civil documents.',
        source: 'https://www.canada.ca/en/immigration-refugees-citizenship.html',
        sourceUrl: 'https://www.canada.ca/en/immigration-refugees-citizenship.html',
        site: 'canada',
        jurisdiction: 'Canada',
        topicTags: [],
        authorityTier: 5,
        score: 7,
      },
    ],
    source: 'database',
    retrievalConfidence: 0.8,
    freshEnough: true,
    jurisdictions: ['Canada'],
    sites: ['canada'],
  })),
}))

jest.mock('@/lib/yqaaWebResearch', () => ({
  yqaaNeedsFreshWebResearch: jest.fn(() => false),
  researchYqaaPublicWeb: jest.fn(async () => []),
}))

describe('legal-buddy evidence wiring', () => {
  test('orientation queries request evidence, small talk does not', () => {
    expect(messengerNeedsLegalEvidence('How does PR through marriage in Beaver Harbor work? What are my options?')).toBe(true)
    expect(messengerNeedsLegalEvidence('what are the going rates for an spousal sponsorship file?')).toBe(true)
    expect(messengerNeedsLegalEvidence('hey, are you there?')).toBe(false)
    expect(messengerNeedsLegalEvidence('')).toBe(false)
  })

  test('legal orientation query produces a GROUNDED LEGAL / PUBLIC EVIDENCE appendix', async () => {
    const block = await loadMessengerLegalEvidence('How does PR through marriage work here? What are my options?')
    expect(block).toBeTruthy()
    expect(block).toContain('## GROUNDED LEGAL / PUBLIC EVIDENCE')
    expect(block).toContain('Spousal sponsorship generally')
    expect(block).toContain('https://www.canada.ca/en/immigration-refugees-citizenship.html')
  })

  test('non-orientation text yields no evidence block', async () => {
    expect(await loadMessengerLegalEvidence('hey')).toBeNull()
  })
})

describe('legal-buddy escalation reply', () => {
  test('first general legal-orientation reply stays useful unless a hard safety gate applies', () => {
    const request = {
      isFirstYqaaReply: true,
      isLegalOrientation: true,
      highStakes: false,
      frustrated: false,
      explicitProviderReviewRequest: false,
      budgetGapAlreadyExplained: false,
      explicitBuyIntent: false,
      companionReasons: ['jev_requires_handoff'],
    }
    expect(canUseSafeFirstLegalOrientation(request)).toBe(true)
    expect(canUseSafeFirstLegalOrientation({ ...request, isFirstYqaaReply: false })).toBe(false)
    expect(canUseSafeFirstLegalOrientation({ ...request, isLegalOrientation: false })).toBe(false)
    expect(canUseSafeFirstLegalOrientation({ ...request, highStakes: true })).toBe(false)
    expect(canUseSafeFirstLegalOrientation({ ...request, explicitProviderReviewRequest: true })).toBe(false)
    expect(canUseSafeFirstLegalOrientation({ ...request, explicitBuyIntent: true })).toBe(false)
    expect(canUseSafeFirstLegalOrientation({ ...request, companionReasons: ['jev_requires_handoff', 'client_frustration_or_exit'] })).toBe(false)
  })

  test('empathetic handoff names the provider and never leaks floors', () => {
    const reply = lowBudgetEscalationReply('Morganne A. Foley')
    expect(reply).toContain('Morganne A. Foley')
    expect(reply.toLowerCase()).not.toContain('revenue-safe')
    expect(reply).not.toMatch(/\$\s*\d/)
    expect(reply).toMatch(/hear|circles|straight answer/i)
  })

  test('thin legal retrieval stays useful and personal for a low-risk orientation request', () => {
    const firstTurn = 'Hello Mrs. Foley! My name is Taylor and I have plans to move to Beaver Harbor in the new few years. I believe I have a couple of options available as far as permanent residency status. I was hoping to maybe get some insight as the best way to do this and the most cost effective. I will have a home and utilities paid for when I do get there and I have a safety net option of marriage due to my fiance. He is working on his ancestry forms and his father is already a citizen in CA. I am very new and happened to find you via the provinces public directory.'
    const args = {
      latestClientText: firstTurn,
      recentClientContext: '',
      providerLabel: 'Ms Foley',
    }
    const reply = insufficientEvidenceOrientationReply(args)
    const { usefulFirstOrientation } = require('../scripts/yqaa-incident-quality.cjs')
    expect(reply).toContain('Taylor')
    expect(reply).toContain('Beaver Harbor')
    expect(reply).toMatch(/residency routes|residence routes/i)
    expect(reply).toMatch(/marriage|family connection/i)
    expect(reply).toMatch(/compare|prepare/i)
    expect(reply).toContain('Where are you a citizen now, and where do you expect to apply?')
    expect(reply).not.toMatch(/rough budget range|concrete offer|I’m an AI/i)
    expect(reply).not.toMatch(/I’ve asked Ms Foley|I have asked Ms Foley|verified Marketplace pricing|insufficient evidence/i)
    expect(usefulFirstOrientation(reply)).toBe(true)

    const disclosed = insufficientEvidenceOrientationReply({ ...args, disclose: true })
    expect(disclosed).toMatch(/^Hi Taylor — I’m \*\*YQAA\*\*, an AI assistant here to help you get oriented\./)
    expect(usefulFirstOrientation(disclosed)).toBe(true)
    expect(usefulFirstLegalOrientationReply(reply)).toBe(true)
    expect(usefulFirstLegalOrientationReply('I’m YQAA, an AI assistant. I can help you work through this one step at a time. Happy to keep this moving. We can compare your residency routes and prepare documents to get started.')).toBe(false)
  })

  test('rates and a stated budget get a scoped next step without inventing a price', () => {
    const rates = insufficientEvidenceOrientationReply({
      latestClientText: 'What are the going rates for help?',
      recentClientContext: 'My name is Taylor. I am planning to move in a few years and want to compare residency options.',
      providerLabel: 'Ms Foley',
    })
    expect(rates).toContain('Taylor')
    expect(rates).toMatch(/That’s a fair question/i)
    expect(rates).toMatch(/map your routes.*prepare an application/i)
    expect(rates).not.toMatch(/budget|\$\s*\d|\bUSD\s+\d/i)

    const budget = insufficientEvidenceOrientationReply({
      latestClientText: 'I could maybe do 50 dollars to 100 at most for a consult.',
      recentClientContext: 'My name is Taylor. I want to compare residency options and gather documents.',
      providerLabel: 'Ms Foley',
      budget: { minCents: 5000, maxCents: 10000, currency: 'usd', sourceText: '', messageId: 'budget-turn', confidence: 'explicit' },
    })
    expect(budget).toContain('USD 100.00')
    expect(budget).toMatch(/before I tell you whether that fits.*confirm the consult price/i)
    expect(budget).not.toMatch(/approved price|offer created/i)
  })

  test('counter-review copy names the client amount and does not claim provider approval', () => {
    const reply = counterNeedsProviderReviewReply(13950, 'usd')
    expect(reply).toContain('USD 139.50')
    expect(reply).toMatch(/counter for the same work/i)
    expect(reply).toMatch(/sent it to your provider to have a look/i)
    expect(reply).toMatch(/I’ll let you know when I hear back/i)
    expect(reply).not.toMatch(/the provider,\s+your provider/i)
    expect(reply).not.toMatch(/approved|accepted|discount|agree to a different price/i)
  })

  test('missing evidence handoff is explicit and names the human provider', () => {
    const reply = insufficientEvidenceHandoffReply('Avery')
    expect(reply).toContain('Avery')
    expect(reply).toContain('asked')
    expect(reply).toContain('what would you most like their help with first?')
    expect(reply).not.toMatch(/^\s*\d\./m)
    expect(reply).not.toContain('I don’t have enough reliable information')
    expect(reply).not.toMatch(/verified Marketplace pricing|server-approved numbers|insufficient evidence/i)
  })

  test('evidence handoff acknowledges the stated budget without approving a price', () => {
    const reply = insufficientEvidenceHandoffReply('Avery', {
      minCents:null, maxCents:45000, currency:'cad', sourceText:'', messageId:null, confidence:'explicit',
    })
    expect(reply).toContain('CAD 450.00')
    expect(reply).toContain('kept your CAD 450.00 budget in mind')
    expect(reply).toContain('Avery')
    expect(reply).not.toMatch(/discount|offer created|approved price/i)
    expect(reply).not.toContain('You and the provider can agree what work it covers')
  })

  test('server escalation overrides a model decline and removes its offer', () => {
    expect(enforceCompanionEscalation(
      { reply: 'Here is my answer.', escalate: false, offer: { title: 'Offer' } },
      { escalate: true },
    )).toMatchObject({ escalate: true, offer: null })
  })

  test('offer idempotency key is bound to the conversation and triggering message', () => {
    expect(yqaaOfferIdempotencyKey('conversation-1', 'message-9')).toBe('yqaa:conversation-1:message-9')
    expect(yqaaOfferIdempotencyKey('conversation-1', null)).toBeNull()
    expect(yqaaOfferIdempotencyKey('conversation-1', 'message-10')).not.toBe(
      yqaaOfferIdempotencyKey('conversation-1', 'message-9'),
    )
  })
})

test('an unapproved explicit counter is acknowledged without waiting on provider generation', async () => {
  const handoff = explicitCounterReviewDraft({ action: 'ESCALATE_PROVIDER', counterSource: 'explicit', counterCents: 13950, currency: 'usd' })
  expect(handoff).toMatchObject({ escalate: true, offer: null })
  expect(handoff?.reply).toContain('USD 139.50')
  expect(handoff?.reply).toContain('counter')
  expect(handoff?.reply).toContain('have a look')
  const generate = jest.fn(async () => { throw new Error('provider_timeout') })
  expect(await resolveMessengerDraft({ handoff, budgetReply: null, generate })).toBe(handoff)
  expect(generate).not.toHaveBeenCalled()
  expect(explicitCounterReviewDraft({ action: 'ACCEPT', counterSource: 'explicit', counterCents: 13950, currency: 'usd' })).toBeNull()
  const approvalRequired = explicitCounterReviewDraft({ action: 'ACCEPT', approvalRequired: true, counterSource: 'explicit', counterCents: 13950, currency: 'usd', providerLabel: 'Ms Foley' })
  expect(approvalRequired).toMatchObject({ escalate: true, offer: null })
  expect(approvalRequired?.reply).toContain('Ms Foley')
  expect(approvalRequired?.reply).toContain('USD 139.50')
  expect(explicitCounterReviewDraft({ action: 'ACCEPT', approvalRequired: true, counterSource: 'budget', counterCents: 13950, currency: 'usd' })).toBeNull()
  expect(explicitCounterReviewDraft({ action: 'ESCALATE_PROVIDER', counterSource: 'budget', counterCents: 13950, currency: 'usd' })).toBeNull()
})

 test('the standing prompt does not assume provider credentials or availability',()=>{
 const fs=require('node:fs'),path=require('node:path')
 const source=fs.readFileSync(path.join(__dirname,'../lib/messengerAi.ts'),'utf8')
 const prompt=source.split('const SYSTEM_PROMPT = `')[1].split('`')[0]
 expect(prompt).not.toContain('with the licensed provider available on this thread')
 expect(prompt).toContain('A role label is not evidence of licensure or availability')
 expect(prompt).toContain('requested/pending')
 expect(prompt).toContain('never default to “I don’t have enough verified Marketplace pricing...” boilerplate')
 expect(prompt).toContain('Avoid generic numbered checklists unless the client asks for one')
 })

 test.each([['model_provider_401','provider_auth'],['model_provider_400','provider_rejected'],['model_provider_408','provider_timeout'],['model_provider_429','provider_rate_limited'],['model_provider_503','provider_unavailable'],['Messenger provider attempt timed out','provider_timeout']])('classifies finite model failure%s without exposing error text',(message,category)=>{expect(providerFailureCategory(new Error(message))).toBe(category)})
 test('classifies a SuperGrok settings lookup failure as unavailable without calling it a model timeout',()=>{const error=Object.assign(new Error('SuperGrok authentication is temporarily unavailable'),{name:'MessengerAuthResolutionError'});expect(providerFailureCategory(error)).toBe('provider_unavailable')})

 test('budget handoff never claims unverified licensure or an already-present provider',()=>{
 const reply=lowBudgetEscalationReply('Synthetic Provider')
 expect(reply).not.toMatch(/licensed|they can see everything|looping in/i)
 expect(reply).toMatch(/request|pending/i)
 })


test('the server-approved scope replaces a model-supplied unrelated gig as well as its price', () => {
 const offer=applyAdaptiveOfferAuthority({title:'Test',price_usd:1,gig_id:'unrelated-gig'} as any,{channel:'dm',approved_price_cents:15500,gig_id:'owned-approved-gig'} as any)
 expect(offer).toMatchObject({price_usd:155,gig_id:'owned-approved-gig'})
 expect(offer.price).toBeUndefined()
})

test('a prose price blocked by missing market data cannot claim a review without escalating', () => {
 const guard=guardMessengerOffer({pricing:{status:'insufficient_market_data'} as any})
 const decision=applyPricingGuardDecision({reply:'It costs $150.',escalate:false,offer:{title:'Unsafe',price_usd:150}},guard)
 expect(decision).toMatchObject({reply:guard.ok?'':guard.reply,escalate:true,offer:null})
})
test('an ordinary missing-budget question clears the offer without requesting a human', () => {
 const guard=guardMessengerOffer({pricing:{status:'need_budget',budget:null,currency:'usd'} as any})
 expect(applyPricingGuardDecision({reply:'It costs $150.',escalate:false,offer:{title:'Unsafe'}},guard)).toMatchObject({escalate:false,offer:null})
})

test('mandatory evidence handoff commits useful reply without waiting for a draft that would be discarded',async()=>{
 const generate=jest.fn(async()=>{throw new Error('provider_timeout')})
 const handoff={reply:insufficientEvidenceHandoffReply('Avery',undefined,'I am moving next year'),escalate:true,offer:null}
 expect(await resolveMessengerDraft({handoff,budgetReply:'budget answer',generate})).toEqual(handoff)
 expect(generate).not.toHaveBeenCalled()
})
test('ordinary conversation still uses and parses the provider draft',async()=>{const generate=jest.fn(async()=>JSON.stringify({reply:'Here is the checklist.',escalate:false,offer:null}));expect(await resolveMessengerDraft({handoff:null,budgetReply:null,generate})).toMatchObject({reply:'Here is the checklist.',escalate:false});expect(generate).toHaveBeenCalledTimes(1)})
test('mandatory handoff with stored budget and no adaptive pricing stays deterministic through polishing',async()=>{
 const budget={maxCents:45000,minCents:null,currency:'cad',sourceText:'',messageId:null,confidence:'explicit'} as any
 const generate=jest.fn(async()=>{throw new Error('provider_timeout')})
 const handoff={reply:insufficientEvidenceHandoffReply('Avery',budget,'I am moving next year'),escalate:true,offer:null}
 const draft=await resolveMessengerDraft({handoff,budgetReply:null,generate})
 const polished=await polishMessengerDraft({input:{reply:draft.reply,allowedAmountsCents:[],approvedPriceCents:15500,includes:['Paid scope']},mandatoryHandoff:true,budget,regenerate:generate})
 expect(polished.reply).toContain('CAD 450.00')
 expect(polished.reply).toContain('what would you most like their help with first?')
 expect(polished.reply).toContain('reply hasn’t come through yet')
 expect(polished.reply).not.toContain('Paid scope')
 expect(draft).toMatchObject({escalate:true,offer:null})
 expect(generate).not.toHaveBeenCalled()
})
