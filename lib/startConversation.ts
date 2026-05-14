// lib/startConversation.ts - New helper for Fiverr-style gig messaging
export async function startOrGetConversation(clientId: string, sellerId: string, gigId?: string, initialMessage?: string) {
  const { createSupabaseAdminClient } = await import('./supabase');
  const supabase = createSupabaseAdminClient();

  // Try to find existing conversation between these two users
  let { data: existing } = await supabase
    .from('conversations')
    .select('id')
    .or(`and(participant1_id.eq.${clientId},participant2_id.eq.${sellerId}),and(participant1_id.eq.${sellerId},participant2_id.eq.${clientId})`)
    .eq('gig_id', gigId || null)
    .maybeSingle();

  if (existing?.id) return existing.id;

  // Create new conversation
  const { data: newConv, error } = await supabase
    .from('conversations')
    .insert({
      participant1_id: clientId,
      participant2_id: sellerId,
      gig_id: gigId,
      status: 'active',
      title: initialMessage ? initialMessage.substring(0, 80) : 'New conversation',
    })
    .select('id')
    .single();

  if (error) throw error;

  if (initialMessage && newConv) {
    await supabase.from('messages').insert({
      conversation_id: newConv.id,
      sender_id: clientId,
      content: initialMessage,
    });
  }

  return newConv.id;
}
