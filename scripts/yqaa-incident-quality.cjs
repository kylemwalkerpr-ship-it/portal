/** Finite incident-quality signals; no private transcript is persisted here. */
function usefulFirstOrientation(reply) {
  const text = String(reply || '').replace(/\*\*/g, '')
  if (/I don[’']t have enough reliable information here to answer that safely/i.test(text)) return false
  const relevant = /\b(pathways?|sponsorship|residen(?:ce|cy)|citizenship|immigration|marriage|documents?|jurisdiction)\b/i.test(text)
  const actionable = /\b(gather|organize|prepare|check|clarify|compare|confirm|which|whether|do you mean)\b/i.test(text)
  return text.trim().length >= 160 && relevant && actionable
}
function moneyValues(text) {
  const values = []
  for (const match of String(text || '').matchAll(/(?:\$|\b(?:usd|cad)\b)\s*(\d+(?:[.,]\d{1,2})?)/gi)) values.push(Number(match[1].replace(',', '.')))
  for (const match of String(text || '').matchAll(/\b(\d+(?:[.,]\d{1,2})?)\s*(?:dollars?|bucks?)(?:\s*(?:to|[-–—])\s*(\d+(?:[.,]\d{1,2})?))?/gi)) {
    values.push(Number(match[1].replace(',', '.')))
    if (match[2]) values.push(Number(match[2].replace(',', '.')))
  }
  return values.filter(Number.isFinite)
}
module.exports = { usefulFirstOrientation, moneyValues }
