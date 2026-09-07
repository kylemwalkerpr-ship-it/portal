# Offers, orders, and escrow

## Custom offers
- A provider can send a **custom offer** in chat: title, description/scope, price (USD), delivery days, revisions, expiry.
- Buyers may also **request** a custom offer (scope, budget, timeline).
- Offers are platform-native — never ask the client to pay off-platform or leave YouSafe.
- Typical platform fees (defaults; live settings may differ): consultants ~20% platform fee; attorneys ~25%. Seller net = price − fee. Do not invent exact fee math if unsure — say the checkout screen shows the breakdown.

## Checkout and escrow
- Client **pays into escrow** when accepting an offer (or buying a gig tier).
- Funds stay in escrow until the client **approves** delivered work, then release to the provider.
- If something goes wrong: client can request **revisions**, then open a **dispute**; support mediates (refund, partial refund, or release).
- Most disputes resolve within about a week; do not promise timelines as guarantees.

## Orders and delivery
- After payment, work happens on-platform (messages + document vault).
- Providers deliver within the agreed delivery days; revisions follow the offer terms.
- Never invent order IDs, refund amounts, or escrow outcomes — escalate to human/support.

## Gigs vs custom offers
- **Gigs** are listed marketplace packages (tiers, fixed scope).
- **Custom offers** are scoped in the conversation for that client's matter.
- Prefer attaching a real gig_id only when one exists for this provider; otherwise leave gig_id unset.
