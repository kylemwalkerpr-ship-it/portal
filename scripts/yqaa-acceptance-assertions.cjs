/** Pure acceptance assertions: no credentials, network, or fixture writes. */
function moneyCents(body) {
  return [...String(body || '').matchAll(/(?:\$\s*|\bUSD\s+)(\d+(?:,\d{3})*(?:\.\d{1,2})?)(?!\d|\.\d)/gi)]
    .map((match) => Math.round(Number(match[1].replaceAll(',', '')) * 100))
}

function counterofferAcknowledged(body, { quoteCents, counterCents, scopeHash, metadata }) {
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
  const firmPrice = /\b(?:(?:i|we)\s+(?:can|will)\s+(?:offer|lock|hold|keep|do|put)\s+(?:(?:it|this|that|this scope|this work|the scope|the work|the price|the quote|the total|the offer)\s+)?(?:together\s+)?(?:in\s+)?(?:at|for)\s+|(?:i|we)\s+(?:can|will)\s+(?:keep|hold)\s+(?:this|that|the)\s+(?:narrowed\s+)?(?:scope|work|quote|price)\s+(?:as-is\s*)?(?:—[^—.!?]{1,240}—\s*)?(?:at|for)\s+|(?:the\s+)?figure\s+(?:i|we)\s+can\s+put\s+(?:on\s+the\s+offer|in\s+front\s+of\s+you)\s+is\s+|(?:approved|quoted)\s+(?:total|price|amount)\s+(?:is|remains?|stays?)\s+|(?:total|price|quote|scope|work)\s+(?:still\s+)?(?:remains?|stays?|is|comes to)\s+)((?:\$\s*|USD\s+)\d+(?:,\d{3})*(?:\.\d{1,2})?)(?!\d|\.\d)/gi
  // A following fragment can qualify the price too; inspect the entire reply for authority conditions.
  const authorityCondition = (/\b(?:provider|human)\b/i.test(body) && /\b(?:approv\w*|confirm\w*|review\w*|agre\w*|permission|authori[sz]\w*)\b/i.test(body)) || /\b(?:contingent(?:\s+on)?|on condition that|subject to|condition(?:al|ed) on|dependent on|provided that|only (?:if|when|after|once))\b/i.test(body)
  // Recognize a first-person commitment to a scoped object, rather than
  // enumerating each adjective the model may use. A second subject or
  // conjunction cannot bridge this commitment to an unrelated price.
  const scopedCommitment = /\b(?:(?:i|we)\s+(?:can|will)\s+(?:offer|lock|hold|keep|do|put(?:\s+through)?)|(?:i(?:[’']m|\s+am)|we(?:[’']re|\s+are))\s+(?:offering|locking|holding|keeping|doing|putting(?:\s+through)?)|(?:i|we)[’']ll\s+(?:offer|lock|hold|keep|do|put(?:\s+through)?))\s+([a-z0-9’'-]+(?:\s+[a-z0-9’'-]+){0,14})\s+(?:at|for)\s+((?:\$\s*|USD\s+)\d+(?:,\d{3})*(?:\.\d{1,2})?)(?!\d|\.\d)/gi
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
  const pending = /\b(provider|human)\b/i.test(body) && /\b(pending|review|approval|confirm\w*)\b/i.test(body) && metadata.ai_provider_attention_requested === true
  const accepted = !authorityCondition && affirmative.some(sentence => moneyCents(sentence).includes(counterCents) && /\b(accept\w*|agreed|confirmed|approved)\b/i.test(sentence)) && quotes.some((quote) => Number(quote.cents) === counterCents && quote.scope_hash === scopeHash)
  // A claimed acceptance must be backed by an actual quote at that amount.
  if (/\b(?:accept(?:ed)?|agreed|confirmed)\s+(?:your\s+)?(?:offer\s+(?:of\s+)?)?\$\s*/i.test(body) && !accepted) return false
  return holdsQuote || pending || accepted
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
module.exports = { moneyCents, counterofferAcknowledged, runIndependentCategories }
