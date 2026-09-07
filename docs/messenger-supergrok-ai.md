# Messenger SuperGrok AI closer (Part B)

Site-aware DM auto-replies for provider↔client threads, using the same
SuperGrok auth path as Content Studio.

## Auth hydration (primary = portal SuperGrok)

`lib/messengerAi.ts` → `resolveMessengerGrokAuth()` resolves credentials in this order:

1. **SuperGrok OAuth / vault tokens** already used by Content Studio  
   (`ensureSuperGrokAccessToken()` → `ai_settings` device-login tokens).  
   **This is primary.** If Content Studio Grok works, messenger AI works — no separate pasted XAI key required.
2. **AI Key Vault** pasted grok key (`buildVaultEnvOverrides()` → `XAI_API_KEY` from `ai_provider_keys`).
3. **Env fallback only:** `XAI_API_KEY` or `GROK_API_KEY` (Worker / `.env.local`).

Optional model / base URL overrides (also consulted from vault overlay):

```bash
XAI_API_KEY=          # fallback only when OAuth + vault key absent
GROK_API_KEY=         # alias accepted by resolveMessengerGrokAuth
XAI_MODEL=grok-4.6
XAI_BASE_URL=https://api.x.ai/v1
MESSENGER_AI_MODEL=   # optional override for DM auto-replies
```

Do **not** commit secrets. A missing env key is OK when SuperGrok OAuth is connected in Content Studio → Configure.

## Site knowledge

Each auto-reply injects a context pack from `lib/messengerSiteKnowledge.ts`:

| Source | What |
|---|---|
| `content/messenger-kb/*.md` | Curated platform / FAQ / escrow / YMYL policy snippets |
| Live `attorneys` or `consultants` row | Tagline, bio, jurisdictions/specialties for the thread provider |
| Live `gigs` rows | Provider’s non-archived gigs (title, price, pitch) |

Chunks are ranked with simple keyword scoring against the latest client message (v1 — no embeddings required). The system prompt instructs the model to answer from site knowledge, disclose AI, avoid inventing legal outcomes, and escalate when unsure.

Maintain the KB by editing markdown under `content/messenger-kb/` (or adding `.json` arrays of `{id,title,body}`).

## Migration

Apply `supabase/migrations/20260907_conversation_ai_mode.sql` (adds `conversations.metadata` for `ai_mode`).

## Manual test (DM)

1. Confirm SuperGrok is connected in **Content Studio → Configure** (no need to paste a messenger-only key).
2. Apply migration if needed.
3. As client, send a product question in a provider DM with `ai_mode=auto` (default), e.g. “How does escrow work on YouSafe?”
4. Expect an AI reply that (a) discloses it is an AI assistant and (b) answers from site KB (escrow / FAQ facts).
5. Ask about the provider’s services — reply should reflect live gigs/bio when present.
6. As provider, click **Take over** (or send a human message) → `ai_mode=paused`.
7. Click **Resume AI** → `ai_mode=auto`; next client message triggers AI again.
8. Admin Master Chats shows AI badge + Take over / Resume.
9. Optional: `POST /api/messages/conversations/:id/ai-reply` with provider/admin session.

## Unit tests

```bash
npx jest tests/messenger-ai-mode.test.ts
```

Covers `ai_mode` helpers, auth preference (OAuth > vault > env), and non-empty KB loader.
