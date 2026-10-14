import { replayProviderPublicProfile } from '@/lib/messengerProviderVoice'
const metadata = {yqaa_live_acceptance:true,yqaa_foley_taylor_replay:true,yqaa_replay_provider_public_profile:{source_provider_id:'11111111-1111-4111-8111-111111111111',role:'attorney',profile:{bio:'Canadian public profile.',languages:['English'],api_key:'private',available:true,starting_price:1,credential_verified:true}}}
const provider = {role:'attorney',is_test_account:true,is_hidden:true}
test('a replay carries only bounded public descriptive fields, never credentials or commercial authority', () => {
  expect(replayProviderPublicProfile(metadata,provider)).toEqual({bio:'Canadian public profile.',languages:['English']})
})
test.each([{...provider,is_test_account:false},{...provider,is_hidden:false},{...provider,role:'consultant'}])('real or mismatched providers cannot receive a replay profile override', actor => {
  expect(replayProviderPublicProfile(metadata,actor)).toBeNull()
})
test('ordinary conversations cannot opt into a profile override', () => {
  expect(replayProviderPublicProfile({...metadata,yqaa_foley_taylor_replay:false},provider)).toBeNull()
})
