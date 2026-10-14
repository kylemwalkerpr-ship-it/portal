/** Pure acceptance assertions: no credentials, network, or fixture writes. */
function moneyCents(body) {
  return [...String(body || '').matchAll(/(?:\$\s*|\bUSD\s+)(\d+(?:,\d{3})*(?:\.\d{1,2})?)(?!\d|\.\d)/gi)]
    .map((match) => Math.round(Number(match[1].replaceAll(',', '')) * 100))
}

/** A current-turn offer must be visible to the client and bound to its durable commit. */
function currentCommittedOffer(evidence, { metadata, counterCents, scopeHash, priceCents }) {
  if (!evidence) return false
  const { conversationId, triggerMessageId, replyMessageId, providerId, clientId, commit, offer, card, visibleCard } = evidence
  if (![conversationId, triggerMessageId, replyMessageId, providerId, clientId].every(id => typeof id === 'string' && id.length > 0)) return false
  if (providerId === clientId || triggerMessageId === replyMessageId) return false
  if (commit?.conversation_id !== conversationId || commit.trigger_message_id !== triggerMessageId || commit.reply_message_id !== replyMessageId) return false
  if (!offer?.id || commit.offer_id !== offer.id || metadata.ai_last_offer_id !== offer.id || metadata.ai_last_message_id !== replyMessageId || metadata.ai_last_trigger_message_id !== triggerMessageId) return false
  if (offer.chat_id !== conversationId || offer.sender_id !== providerId || offer.recipient_id !== clientId || offer.status !== 'pending') return false
  if (!Number.isInteger(priceCents) || priceCents <= 0 || offer.price !== priceCents || metadata.ai_last_approved_price_cents !== priceCents) return false
  if (card?.conversation_id !== conversationId || card.sender_id !== providerId || card.type !== 'offer' || card.ref_offer_id !== offer.id) return false
  if (card.metadata?.ai_generated !== true || card.metadata?.pricing_guarded !== true || card.metadata?.price !== priceCents || card.metadata?.pricing_scope_hash !== scopeHash) return false
  if (!card.id || visibleCard?.id !== card.id || visibleCard.type !== 'offer' || visibleCard.ref_offer_id !== offer.id || visibleCard.metadata?.price !== priceCents) return false
  if (visibleCard.offer?.id !== offer.id || visibleCard.offer?.price_cents !== priceCents || visibleCard.offer?.status !== 'pending' || visibleCard.offer?.currency !== offer.currency) return false
  if (typeof offer.currency !== 'string' || !/^[a-z]{3}$/i.test(offer.currency)) return false
  if (card.metadata.currency !== offer.currency || visibleCard.metadata?.currency !== offer.currency || String(metadata.ai_memory?.last_offer?.currency || '').toLowerCase() !== offer.currency.toLowerCase()) return false
  const negotiation = metadata.ai_memory?.negotiation
  // These live acceptance negotiations narrow to exactly three documents.
  if (metadata.ai_last_scope_hash !== scopeHash || negotiation?.scope_current?.scope_hash !== scopeHash || negotiation.scope_current.units?.unit !== 'document' || negotiation.scope_current.units?.qty !== 3) return false
  return (negotiation.client_counters || []).some(counter => counter.message_id === triggerMessageId && Number(counter.cents) === counterCents)
}

function counterofferAcknowledged(body, { quoteCents, counterCents, scopeHash, metadata, committedOffer }) {
  if (!Number.isInteger(quoteCents) || quoteCents <= 0 || !Number.isInteger(counterCents) || counterCents <= 0 || !scopeHash) return false
  const negotiation = metadata?.ai_memory?.negotiation
  const quotes = negotiation?.quotes_made || []
  if (!quotes.some((quote) => Number(quote.cents) === quoteCents && quote.scope_hash === scopeHash)) return false
  if (!(negotiation?.client_counters || []).some((counter) => Number(counter.cents) === counterCents)) return false
  if (!metadata.ai_last_pricing_status) return false
  // Match rendered emphasis as ordinary text, without changing monetary values.
  body = String(body || '').replace(/\*\*([^*\n]+)\*\*/g, '$1')
  const amounts = moneyCents(body)
  if (!amounts.includes(counterCents)) return false
  // Require a disposition tied to this monetary proposal, not a generic pricing keyword.
  const latestScopedQuote = [...quotes].reverse().find(quote => quote.scope_hash === scopeHash)
  const affirmative = String(body || '').split(/(?<=[!?])\s+|\.(?!\d)\s*/).filter(sentence => !/\?|\b(?:not|never|cannot|(?:can|could|would|will|won|don|didn|isn|wasn|aren|hasn|haven)[’']t|unable|unapproved|might|maybe|could|would|may|probably|possibly|perhaps|potentially|tentatively|subject to|as long as|so long as|if|unless|assuming|once|until|after|provided|depending|pending)\b/i.test(sentence))
  // Bind the disposition directly to the amount; incidental scope/total words cannot qualify.
  const firmPrice = /\b(?:(?:i|we)\s+(?:can|will)\s+(?:offer|send|lock|hold|keep|do|put)\s+(?:(?:it|this|that|this scope|this work|the scope|the work|the price|the quote|the total|the offer)\s+)?(?:together\s+)?(?:in\s+)?(?:at|for)\s+|(?:i|we)\s+(?:can|will)\s+(?:keep|hold)\s+(?:this|that|the)\s+(?:narrowed\s+)?(?:scope|work|quote|price)\s+(?:as-is\s*)?(?:—[^—.!?]{1,240}—\s*)?(?:at|for)\s+|(?:the\s+)?figure\s+(?:i|we)\s+can\s+put\s+(?:on\s+the\s+offer|in\s+front\s+of\s+you)\s+is\s+|(?:approved|quoted)\s+(?:total|price|amount)\s+(?:is|remains?|stays?)\s+|(?:total|price|quote|scope|work)\s+(?:still\s+)?(?:remains?|stays?|is|comes to)\s+)((?:\$\s*|USD\s+)\d+(?:,\d{3})*(?:\.\d{1,2})?)(?!\d|\.\d)/gi
  // A following fragment can qualify the price too; inspect the entire reply for authority conditions.
  const authorityCondition = (/\b(?:provider|human)\b/i.test(body) && /\b(?:approv\w*|confirm\w*|review\w*|agre\w*|permission|authori[sz]\w*)\b/i.test(body)) || /\b(?:contingent(?:\s+on)?|on condition that|subject to|condition(?:al|ed) on|dependent on|provided that|only (?:if|when|after|once))\b/i.test(body)
  // Recognize a first-person commitment to a scoped object, rather than
  // enumerating each adjective the model may use. A second subject or
  // conjunction cannot bridge this commitment to an unrelated price.
  const scopedCommitment = /\b(?:(?:i|we)\s+(?:can|will)\s+(?:offer|send|lock|hold|keep|do|put(?:\s+through)?)|(?:i(?:[’']m|\s+am)|we(?:[’']re|\s+are))\s+(?:offering|locking|holding|keeping|doing|putting(?:\s+through)?)|(?:i|we)[’']ll\s+(?:offer|send|lock|hold|keep|do|put(?:\s+through)?))\s+([a-z0-9’'-]+(?:\s+[a-z0-9’'-]+){0,14})\s+(?:at|for)\s+((?:\$\s*|USD\s+)\d+(?:,\d{3})*(?:\.\d{1,2})?)(?!\d|\.\d)/gi
  const holdsScopedQuote = sentence => [...sentence.matchAll(scopedCommitment)].some(match => {
    const object = match[1]
    // Keep the object grammar closed: unknown qualifiers, subjects and
    // connectors cannot manufacture a price commitment from another clause.
    const objectWords = new Set('a an it this that the my your our same current scoped narrowed narrower approved quoted on-platform three 3 three-document doc docs document documents checklist packet package bundle scope work offer quote price total organization organisation organizing organising application essay university study planning partial limited basic full document-only as-is together'.split(' '))
    const words = object.toLowerCase().split(/\s+/)
    if (!words.every(word => objectWords.has(word) || word.split('-').every(part => objectWords.has(part)))) return false
    if (words.slice(1).some(word => /^(?:a|an|it|this|that|the|my|your|our)$/.test(word))) return false
    const firstNoun = words.findIndex(word => /^(?:scope|work|offer|quote|price|total|packet|package|bundle|checklist|doc|docs|document|documents|organization|organisation|organizing|organising)$/.test(word))
    if (firstNoun >= 0 && words.slice(firstNoun + 1).some(word => /^(?:approved|quoted)$/.test(word))) return false
    if (!/^(?:it|this|that)$/i.test(object) && !/\b(?:scope|work|offer|quote|price|total|packet|package|bundle|checklist|documents?|organi[sz](?:ation|ing))\b/i.test(object)) return false
    return moneyCents(match[2]).includes(Number(latestScopedQuote?.cents))
  })
  const holdsQuote = !authorityCondition && affirmative.some(sentence =>
    [...sentence.matchAll(firmPrice)].some(match => moneyCents(match[1]).includes(Number(latestScopedQuote?.cents))) || holdsScopedQuote(sentence))
  const replyCurrencyMismatch = [
    ...[...body.matchAll(/\b(USD|CAD|EUR|GBP|AUD)\s*\$?\s*\d/gi)].map(match => match[1]),
    ...[...body.matchAll(/\b\d+(?:\.\d+)?\s*(USD|CAD|EUR|GBP|AUD)\b/gi)].map(match => match[1]),
  ].some(currency => currency.toLowerCase() !== committedOffer?.offer?.currency?.toLowerCase())

  const committedPrice = !authorityCondition && !replyCurrencyMismatch && currentCommittedOffer(committedOffer, { metadata, counterCents, scopeHash, priceCents: Number(latestScopedQuote?.cents) }) && affirmative.some(sentence => {
    if (!/(?<![\w-])(?:(?:three|3)[- ](?:(?:application-essay|study-planning|application|essay|study|planning)[- ]{1}){0,2}documents?)\b/i.test(sentence)) return false
    if (/\b(?:zero|no|six|four|five|two|one|[024-9])\s+(?:application\s+)?documents?\b/i.test(sentence)) return false
    // The price must immediately follow the commitment, not another subject.
    const direct = /\b(?:i can meet you at|(?:the )?fixed price i can send is|(?:the )?scoped work i can put through is)\s+((?:\$\s*|USD\s+)\d+(?:\.\d{1,2})?)(?!\d|\.\d)/gi
    return [...sentence.matchAll(direct)].some(match => moneyCents(match[1]).includes(Number(latestScopedQuote?.cents)))
  })
  const pending = /\b(provider|human)\b/i.test(body) && /\b(pending|review|approval|confirm\w*)\b/i.test(body) && metadata.ai_provider_attention_requested === true
  const accepted = !authorityCondition && affirmative.some(sentence => moneyCents(sentence).includes(counterCents) && /\b(accept\w*|agreed|confirmed|approved)\b/i.test(sentence)) && quotes.some((quote) => Number(quote.cents) === counterCents && quote.scope_hash === scopeHash)
  // A claimed acceptance must be backed by an actual quote at that amount.
  if (/\b(?:accept(?:ed)?|agreed|confirmed)\s+(?:your\s+)?(?:offer\s+(?:of\s+)?)?\$\s*/i.test(body) && !accepted) return false
  return holdsQuote || committedPrice || pending || accepted
}

/** Failures in a negotiation stop its dependent steps, but not a separate category/attention fixture. */
async function runIndependentCategories(categories, { negotiation, attention, onFailure, signal }) {
  let passed = true
  for (const category of categories) {
    for (const [name, run] of [['negotiation', negotiation], ['provider_attention', attention]]) {
      signal?.throwIfAborted()
      try { await run(category) }
      catch (error) {
        signal?.throwIfAborted()
        passed = false
        onFailure(category, name, error)
      }
    }
  }
  return passed
}
module.exports = { moneyCents, currentCommittedOffer, counterofferAcknowledged, runIndependentCategories }
