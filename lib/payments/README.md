# Payment-provider abstraction

The portal reaches every payment gateway through **one interface**,
`PaymentProvider` (`types.ts`). No commerce code imports a gateway SDK
directly. This exists so that if a gateway terminates the account — as Stripe
did — switching is a small, contained change, never an estate-wide rewrite.

## The swap procedure (what to do if a gateway is terminated)

1. **Write one adapter file** in `providers/` implementing `PaymentProvider`
   (`getClientConfig`, `charge`, `refund`). Use `providers/nmi.ts` as the
   model.
2. **Register it** — add one line to the `PROVIDERS` map in `index.ts`.
3. **Flip the env var** — set `PAYMENT_PROVIDER` to the new adapter's id.
4. **Set the new gateway's secrets** on the Worker.

No checkout UI, cart, or API-route code changes. The UI reads its behaviour
(`mode`, keys) at runtime from `GET /api/payments/config`, so the swap takes
effect on the next request — for a config-only change, without a rebuild.

If you need a moment to wire a replacement, set `PAYMENT_PROVIDER=manual`:
orders are recorded as `pending` for manual invoicing instead of failing.

## Files

| File | Role |
|---|---|
| `types.ts` | The `PaymentProvider` interface + shared types. The contract. |
| `index.ts` | The registry + `getPaymentProvider()` — the one switch point. |
| `providers/nmi.ts` | NMI adapter — Collect.js tokenization + Payment API. |
| `providers/manual.ts` | Manual-invoice adapter — interim/fallback, no gateway. |

## Active provider: NMI

NMI is a gateway; card data is tokenized client-side by Collect.js and never
touches our server (PCI-DSS SAQ A). The merchant account behind NMI is
underwritten separately — that account, not this code, is what an acquirer
can terminate; if that happens, follow the swap procedure above.

### Required environment

Set on the Cloudflare Worker (`wrangler versions secret put` for secrets;
`wrangler.toml [vars]` for the rest):

| Name | Kind | Notes |
|---|---|---|
| `PAYMENT_PROVIDER` | var | `nmi` (or `manual`). Selects the adapter. |
| `NMI_SECURITY_KEY` | **secret** | NMI private API key. Server only — never client-side. |
| `NMI_TOKENIZATION_KEY` | var | NMI public tokenization key. Safe in the browser; served via `/api/payments/config`. |
| `NMI_API_URL` | var (optional) | Defaults to `https://secure.nmi.com/api/transact.php`. Set only if your reseller issued a white-label gateway URL. |

## Using it in commerce code

```ts
import { getPaymentProvider } from '@/lib/payments'

const result = await getPaymentProvider().charge({
  token,              // single-use token from the client
  amountCents,        // resolved server-side from an authoritative catalogue
  currency: 'USD',
  items,
  customer: { email },
  metadata: { orderId },
})
if (result.ok) { /* fulfil */ }
```

Never trust a client-supplied amount — always resolve prices server-side
before calling `charge()`.
