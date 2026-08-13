/**
 * Brief-stage model policy — OpenAI ChatGPT is the ONLY model family
 * responsible for the Research/Plan brief.
 *
 * GPT-5.6 Sol (flagship) and GPT-5.6 Terra (balanced) are the only two
 * acceptable brief models. Everything else — 'auto', a legacy drafting
 * provider id ('baseten-deepseek', 'nvidia-glm', 'glm-fast'…), or junk — is
 * coerced to GPT-5.6 Terra on the OpenAI provider. This is the single choke
 * point so a stale client or provider-id leak can never make a non-OpenAI
 * model draft the brief (2026-08: the route forwarded body.aiProvider
 * verbatim, so a stray 'auto' or 'baseten-*' value silently sent the brief
 * through the open-source drafting cascade instead of ChatGPT).
 */
export function resolveBriefAiProvider(
  rawProvider: string,
): { aiProvider: 'openai'; model: 'gpt-5.6-sol' | 'gpt-5.6-terra' } {
  const pin = String(rawProvider || '').trim().toLowerCase()
  // Bare 'gpt-5.6' maps to the flagship alias (gpt-5.6-sol), matching the
  // provider layer's gptAliasModel convention.
  if (pin === 'gpt-5.6-sol' || pin === 'gpt-5.6') {
    return { aiProvider: 'openai', model: 'gpt-5.6-sol' }
  }
  return { aiProvider: 'openai', model: 'gpt-5.6-terra' }
}
