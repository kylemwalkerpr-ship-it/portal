/**
 * Draft-speed bench for Run BiOS models. Same ~500-word visa explainer prompt.
 * Skips Opus / Sonnet / Pro / GLM 5.2 / Kimi (cost). Does not ship content.
 */
const MODELS = [
  { id: 'deepseek-v4-flash', listIn: 0.10, listOut: 0.25, extra: { reasoning_effort: 'low' } as Record<string, unknown> },
  { id: 'minimax-m3', listIn: 0.30, listOut: 1.20, extra: { reasoning_effort: 'low' } },
  { id: 'qwen3.5-397b-a17b', listIn: 0.50, listOut: 3.40, extra: { reasoning_effort: 'low' } },
  { id: 'bios-adaptive', listIn: 0.14, listOut: 0.28, extra: { reasoning_effort: 'low' } },
  { id: 'glm-5.3-flash', listIn: 0.15, listOut: 0.50, extra: { reasoning_effort: 'low' } },
]

const SYSTEM =
  'You write immigration explainers. Markdown. H1, four H2s, short FAQ. Student visa / Student Route only. About 500 words. No outcome promises.'
const USER =
  'Write a compact explainer: UK student visa requirements for an African applicant in 2026. Cite gov.uk. Include CAS, funds, and TB testing.'

async function one(apiKey: string, model: string, extra: Record<string, unknown>, timeoutMs: number) {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), timeoutMs)
  const started = Date.now()
  try {
    const res = await fetch('https://api.runbios.ai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      signal: ac.signal,
      body: JSON.stringify({
        model,
        stream: false,
        max_tokens: 4096,
        temperature: 0.5,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: USER },
        ],
        ...extra,
      }),
    })
    const ms = Date.now() - started
    const raw = await res.text()
    if (!res.ok) {
      return { model, ok: false, ms, error: `${res.status} ${raw.slice(0, 180)}` }
    }
    const json = JSON.parse(raw) as {
      choices?: Array<{ message?: { content?: string }; finish_reason?: string }>
      usage?: { prompt_tokens?: number; completion_tokens?: number }
    }
    const msg = json.choices?.[0]?.message as { content?: string; reasoning_content?: string } | undefined
    const text = String(msg?.content || '').trim()
    const reasonChars = String(msg?.reasoning_content || '').length
    const words = text.split(/\s+/).filter(Boolean).length
    const hasH1 = /^#\s+/m.test(text)
    const h2s = (text.match(/^##\s+/gm) || []).length
    const usage = json.usage || {}
    const estUsd =
      ((usage.prompt_tokens || 0) * MODELS.find((m) => m.id === model)!.listIn +
        (usage.completion_tokens || 0) * MODELS.find((m) => m.id === model)!.listOut) /
      1_000_000
    return {
      model,
      ok: text.length > 200,
      ms,
      words,
      chars: text.length,
      finish: json.choices?.[0]?.finish_reason || null,
      prompt_tokens: usage.prompt_tokens ?? null,
      completion_tokens: usage.completion_tokens ?? null,
      estUsd: Number(estUsd.toFixed(6)),
      reasonChars,
      structure: { h1: hasH1, h2s },
      preview: text.slice(0, 180).replace(/\s+/g, ' '),
    }
  } catch (e) {
    return {
      model,
      ok: false,
      ms: Date.now() - started,
      error: e instanceof Error ? e.message.slice(0, 200) : String(e),
    }
  } finally {
    clearTimeout(t)
  }
}

async function main() {
  const key = process.env.RUNBIOS_API_KEY?.trim()
  if (!key) {
    console.error('RUNBIOS_API_KEY is not set')
    process.exit(1)
  }
  const rows = []
  for (const m of MODELS) {
    const timeout = m.id === 'glm-5.3-flash' ? 180_000 : 90_000
    console.error(`→ ${m.id} (timeout ${timeout / 1000}s)`)
    const row = await one(key, m.id, m.extra, timeout)
    console.log(JSON.stringify(row))
    rows.push(row)
  }
  const ok = rows.filter((r) => r.ok)
  ok.sort((a, b) => (a.ms || 9e9) - (b.ms || 9e9))
  console.log(JSON.stringify({ ranking_by_latency: ok.map((r) => ({ model: r.model, ms: r.ms, words: r.words, estUsd: r.estUsd })) }))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
