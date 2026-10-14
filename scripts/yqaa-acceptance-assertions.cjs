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
  const holdsQuote = amounts.includes(quoteCents) && /\b(approved|remain\w*|stay\w*|hold\w*|quoted|total|scope)\b/i.test(body)
  const pending = /\b(provider|human)\b/i.test(body) && /\b(pending|review|approval|confirm\w*)\b/i.test(body) && metadata.ai_provider_attention_requested === true
  const accepted = /\b(accept\w*|agreed|confirmed|approved)\b/i.test(body) && quotes.some((quote) => Number(quote.cents) === counterCents && quote.scope_hash === scopeHash)
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
