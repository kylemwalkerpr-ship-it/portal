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
  const amounts = moneyCents(body)
  if (!amounts.includes(counterCents)) return false
  // Require a disposition tied to this monetary proposal, not a generic pricing keyword.
  const latestScopedQuote = [...quotes].reverse().find(quote => quote.scope_hash === scopeHash)
  const affirmative = String(body || '').split(/(?<=[!?])\s+|\.(?!\d)\s*/).filter(sentence => !/\?|\b(?:not|never|cannot|(?:can|could|would|will|won|don|didn|isn|wasn|aren|hasn|haven)[’']t|unable|unapproved|might|maybe|could|would|may|probably|possibly|perhaps|potentially|tentatively|subject to|as long as|so long as|if|unless|assuming|once|until|after|provided|depending|pending)\b/i.test(sentence))
  // Bind the disposition directly to the amount; incidental scope/total words cannot qualify.
  const firmPrice = /\b(?:(?:i|we)\s+(?:can|will)\s+(?:offer|lock|hold|keep|do|put)\s+(?:(?:it|this|that|this scope|this work|the scope|the work|the price|the quote|the total)\s+)?(?:together\s+)?(?:in\s+)?(?:at|for)\s+|(?:approved|quoted)\s+(?:total|price|amount)\s+(?:is|remains?|stays?)\s+|(?:total|price|quote|scope|work)\s+(?:still\s+)?(?:remains?|stays?|is|comes to)\s+)((?:\$\s*|USD\s+)\d+(?:,\d{3})*(?:\.\d{1,2})?)(?!\d|\.\d)/gi
  // A following fragment can qualify the price too; inspect the entire reply for authority conditions.
  const authorityCondition = /\b(?:provider|human)\b/i.test(body) && /\b(?:approv\w*|confirm\w*|review\w*|agre\w*|permission|authori[sz]\w*)\b/i.test(body)
  const holdsQuote = !authorityCondition && affirmative.some(sentence => [...sentence.matchAll(firmPrice)].some(match => moneyCents(match[1]).includes(Number(latestScopedQuote?.cents))))
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
