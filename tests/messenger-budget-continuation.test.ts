import {firstBudgetLimitExplanation} from '@/lib/messengerBudgetContinuation'
const args: any = {
  pricing: {status:'budget_too_low',intent:{categoryId:'education'}, budget:{currency:'usd',maxCents:100}},
  adaptive: {channel:'dm',recommended_action:'HOLD_VALUE',eligible_actions:['HOLD_VALUE'],approval_required:false,approved_price_cents:null,downscope_options:[],scope:{depth:'partial'}},
  companion: {escalate:false},latestClientText:'My maximum is USD 1. What could realistically fit?',
  frustrated:false,budgetGapAlreadyExplained:false,legalEvidenceMissing:false,highStakes:false,
}

test('explains a first impossible budget without promising a smaller paid scope or a requested handoff', () => {
  const reply=firstBudgetLimitExplanation(args)
  expect(reply).toContain('USD 1.00')
  expect(reply).toContain('I can’t offer the full paid work at that amount')
  expect(reply).not.toMatch(/offer (?:created|approved)|your (?:booking|order) is confirmed/i)
  expect(reply).toContain('I haven’t requested their review yet')
})
test.each([
  {pricing:{...args.pricing,intent:{categoryId:'legal-services'}}}, {adaptive:{...args.adaptive,eligible_actions:['HOLD_VALUE','ESCALATE_PROVIDER']}}, {companion:{escalate:true}}, {companion:null}, {companion:{escalate:false,posture:'HANDOFF_SUPPORT'}}, {highStakes:true}, {frustrated:true}, {budgetGapAlreadyExplained:true}, {legalEvidenceMissing:true},
  {adaptive:{...args.adaptive,approval_required:true}}, {adaptive:{...args.adaptive,approved_price_cents:500}},
  {adaptive:{...args.adaptive,downscope_options:[{price_cents:100}]}},
  {latestClientText:'Please ask the provider to review this personally.'},
])('preserves actual handoff, approval, repetition and viable quote authorities: %j', override=>{
 expect(firstBudgetLimitExplanation({...args,...override})).toBeNull()
})
