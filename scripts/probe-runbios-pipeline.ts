/**
 * RETIRED (P3, 2026-09-16): this probe executed the retired Run BiOS
 * GLM 5.3 Flash transport end-to-end (discover → brief → factory pipeline).
 * After the P2 commission flip, Content Studio executes exactly two
 * commissioned providers:
 *
 *   - grok               (Grok 4.6, retained xAI transport)
 *   - deepseek-v41-flash (DeepSeek V4.1 Flash, first-party api.deepseek.com)
 *
 * Run BiOS pins are legacy and fail closed with ProviderSelectionRequiredError
 * before any provider request. This file is kept only as a fail-closed
 * tombstone: it never contacts a provider and always exits non-zero. It is
 * retained because `tests/provider-registry-boundary.test.ts` pins the
 * approved P3 dead-code inventory by path.
 */
const RETIRED_PIN = 'runbios-glm-53-flash'

console.error(
  `probe-runbios-pipeline is retired: "${RETIRED_PIN}" is a legacy, non-executable provider pin. ` +
    'Content Studio executes only the commissioned providers grok and deepseek-v41-flash.',
)
process.exit(1)
