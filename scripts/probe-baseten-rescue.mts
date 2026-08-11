/**
 * Live probe · Baseten DeepSeek V4 Flash thinking-off rescue.
 *
 * The unit tests (tests/baseten-deepseek-hardening.test.ts) mock fetch, so
 * they prove the rescue LOGIC runs — this script proves the real 0731 endpoint
 * actually emits prose when thinking is disabled, which was the production
 * failure ("baseten-deepseek returned empty content" during post-depth refine).
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/probe-baseten-rescue.mts
 *
 * Exits 0 if the thinking-off run produced visible prose, 1 otherwise.
 * Never prints the API key.
 */
import { getBasetenProvider, refreshAiVault } from '../lib/contentAiProvider'

type Provider = NonNullable<ReturnType<typeof getBasetenProvider>>

interface ProbeResult {
  thinking: boolean
  status: number
  ms: number
  finishReason: string | null
  contentChars: number
  reasoningChars: number
  preview: string
  err?: string
}

async function post(p: Provider, thinking: boolean): Promise<ProbeResult> {
  const body: Record<string, unknown> = {
    model: p.model,
    messages: [
      { role: 'system', content: 'Write a concise factual answer.' },
      { role: 'user', content: 'In 3 sentences, what is a skilled independent (Subclass 189) visa?' },
    ],
    max_tokens: 600,
    chat_template_kwargs: { enable_thinking: thinking },
  }
  const started = Date.now()
  const res = await fetch(`${p.baseURL.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.apiKey}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  })
  const ms = Date.now() - started
  if (!res.ok) {
    const err = await res.text().catch(() => '')
    return { thinking, status: res.status, ms, finishReason: null, contentChars: 0, reasoningChars: 0, preview: '', err: err.slice(0, 200) }
  }
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string; reasoning_content?: string }; finish_reason?: string }>
  }
  const choice = json.choices?.[0]
  return {
    thinking,
    status: res.status,
    ms,
    finishReason: choice?.finish_reason ?? null,
    contentChars: typeof choice?.message?.content === 'string' ? choice.message.content.length : 0,
    reasoningChars: typeof choice?.message?.reasoning_content === 'string' ? choice.message.reasoning_content.length : 0,
    preview: typeof choice?.message?.content === 'string' ? choice.message.content.slice(0, 90) : '',
  }
}

async function main() {
  await refreshAiVault()
  const p = getBasetenProvider()
  if (!p) {
    console.log('PROBE SKIPPED — no BASETEN_API_KEY configured (env or AI vault).')
    process.exit(1)
  }
  console.log(`Probing ${p.model} @ ${p.baseURL}\n`)

  const on = await post(p, true)
  console.log(`[thinking ON ] status=${on.status} content=${on.contentChars} reasoning=${on.reasoningChars} finish=${on.finishReason} ${on.ms}ms${on.err ? ` err=${on.err}` : ''}`)

  // If thinking ON already produced prose, the rescue path is not the blocker.
  if (on.contentChars > 0) {
    console.log(`\nPASS — model emits prose with thinking ON; rescue not needed.`)
    console.log(`preview: ${on.preview}…`)
    process.exit(0)
  }

  const off = await post(p, false)
  console.log(`[thinking OFF] status=${off.status} content=${off.contentChars} reasoning=${off.reasoningChars} finish=${off.finishReason} ${off.ms}ms${off.err ? ` err=${off.err}` : ''}`)

  if (off.contentChars > 0) {
    console.log(`\nPASS — thinking-off rescue produces prose (${off.contentChars} chars).`)
    console.log(`preview: ${off.preview}…`)
    process.exit(0)
  }

  console.log(`\nFAIL — neither run produced prose. The 0731 endpoint is not honoring the flag; rescue will keep failing.`)
  process.exit(1)
}

main().catch((e) => {
  console.error('PROBE ERROR:', e instanceof Error ? e.message : e)
  process.exit(1)
})
