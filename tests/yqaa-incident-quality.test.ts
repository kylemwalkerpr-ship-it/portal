const { usefulFirstOrientation, moneyValues } = require('../scripts/yqaa-incident-quality.cjs')
describe('incident first-turn quality', () => {
  test('rejects the disclosure-and-handoff answer even though it identifies YQAA', () => {
    expect(usefulFirstOrientation('Hey — I’m **YQAA**, the **YouSafe Quick Assistance Agent**, helping you connect with Synthetic Replay Provider. I’m AI-powered. I don’t have enough reliable information here to answer that safely. I’m bringing Synthetic Replay Provider into the conversation to review it with you.')).toBe(false)
  })
  test('accepts useful bounded orientation with a focused clarification instead of an eligibility claim', () => {
    expect(usefulFirstOrientation('I’m YQAA, an AI assistant. It makes sense to compare the routes before spending on a full service. You can organize the residence and relationship documents you already have, then ask which public pathway requirements need checking. I cannot determine personal eligibility from this chat. When you say CA, do you mean Canada?')).toBe(true)
  })
})

test('recognizes the unchanged incident budget wording without assuming a currency', () => { expect(moneyValues('I could maybe do 50 dollars to 100 at most for a consult')).toEqual([50, 100]) })
