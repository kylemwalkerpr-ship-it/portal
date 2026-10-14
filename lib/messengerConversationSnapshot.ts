/** A committed AI reply can arrive after the first thread read. Refresh stored state, never infer it from prose. */
export async function refreshConversationAfterMessageRead(db:any, conversation:any, messages:any[], profileId:string) {
  if (!messages.some(message => message?.metadata?.ai_generated && !message?.metadata?.ai_typing)) return conversation
  const {data,error}=await db.from('conversations')
    .select('id, participant_a, participant_b, context_kind, context_id, status, last_message_at, created_at, metadata')
    .eq('id',conversation.id).single()
  if (error || !data || data.id !== conversation.id || data.participant_a !== conversation.participant_a || data.participant_b !== conversation.participant_b || ![data.participant_a,data.participant_b].includes(profileId)) throw new Error('Conversation snapshot unavailable')
  return data
}
