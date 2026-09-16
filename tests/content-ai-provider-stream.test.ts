/**
 * Commissioned-path streaming safety — provider-agnostic guards.
 *
 * The retired `describe.skip` NVIDIA suite that once lived at this path was
 * purged in P3 (2026-09-16). Correction round 1 restores ONLY the
 * provider-agnostic protections that still apply to the commissioned
 * first-party DeepSeek stream (`deepseek-v41-flash` → `openAiCompatibleStream`):
 *
 *   - an abandoned consumer cancels the upstream provider body;
 *   - a caller AbortSignal aborts the in-flight provider fetch;
 *   - continuation restarts (new frontmatter / new H1) are rejected;
 *   - a genuine continuation append is accepted;
 *   - opening frontmatter stays safe when fences arrive split across deltas
 *     and when a whole frontmatter block arrives in one chunk;
 *   - a later frontmatter restart after real prose stays rejected.
 *
 * No NVIDIA/Baseten/RunBiOS/Entrim/OpenAI cascade test or transport is
 * resurrected, and nothing here replaces or mocks the registry selector/gate:
 * every case drives the public `generateContentTextStream` door with the
 * commissioned `deepseek-v41-flash` pin.
 */
jest.mock('@/lib/aiKeyVault', () => ({
  buildVaultEnvOverrides: jest.fn(async () => ({})),
}))

import {
  generateContentTextStream,
  setVaultOverlay,
  type ContentAiOptions,
  type ContentAiStreamEvent,
} from '@/lib/contentAiProvider'

const DEEPSEEK_PIN = 'deepseek-v41-flash'
const DEEPSEEK_HOST = 'api.deepseek.com'
const ENV_KEYS = [
  'DEEPSEEK_API_KEY',
  'XAI_API_KEY',
  'CONTENT_AI_STREAM_RETRY',
  'CONTENT_AI_ALL_PROVIDERS',
] as const
const savedEnv: Record<string, string | undefined> = {}
const originalFetch = global.fetch

beforeAll(() => {
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key]
})

beforeEach(() => {
  for (const key of ENV_KEYS) delete process.env[key]
  process.env.DEEPSEEK_API_KEY = 'test-deepseek-key'
  setVaultOverlay(null)
})

afterEach(() => {
  global.fetch = originalFetch
  setVaultOverlay(null)
  for (const key of ENV_KEYS) {
    if (savedEnv[key] == null) delete process.env[key]
    else process.env[key] = savedEnv[key]
  }
})

const deltaChunk = (content: string) =>
  `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`
const finishChunk = (reason: string) =>
  `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: reason }] })}\n\n`
const DONE_CHUNK = 'data: [DONE]\n\n'

const sseResponse = (body: string) =>
  new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })

/** Long enough that a truncated attempt is a real draft, not a reasoning-only burn. */
const REAL_PROSE =
  'The opening half of this article establishes the topic in enough genuine prose that the continuation guard must treat it as a real draft rather than a reasoning-only burn.'

function pinStream(opts: Partial<ContentAiOptions> = {}): ContentAiOptions {
  return {
    aiProvider: DEEPSEEK_PIN,
    system: 'Write an article.',
    prompt: 'Draft the article.',
    maxTokens: 1200,
    skipQualityContract: true,
    ...opts,
  }
}

async function collect(opts: ContentAiOptions): Promise<ContentAiStreamEvent[]> {
  const events: ContentAiStreamEvent[] = []
  for await (const event of generateContentTextStream(opts)) events.push(event)
  return events
}

const deltaText = (events: ContentAiStreamEvent[]) =>
  events
    .filter((event): event is { type: 'delta'; text: string } => event.type === 'delta')
    .map((event) => event.text)
    .join('')

const doneEvent = (events: ContentAiStreamEvent[]) => {
  const last = events.at(-1)
  return last && last.type === 'done' ? last : null
}

const restarted = (events: ContentAiStreamEvent[]) =>
  events.some(
    (event) => event.type === 'provider' && event.provider.includes('restart detected'),
  )

const userMessage = (body: Record<string, unknown>) => {
  const messages = Array.isArray(body.messages)
    ? (body.messages as Array<{ role?: string; content?: string }>)
    : []
  return messages.find((message) => message.role === 'user')?.content || ''
}

describe('content AI · commissioned DeepSeek streaming safety', () => {
  it('cancels the upstream provider body when the consumer abandons the stream', async () => {
    const cancelSpy = jest.fn()
    const encoder = new TextEncoder()
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(deltaChunk('Part one.')))
        // Intentionally never closes — a real provider keeps streaming.
      },
      cancel: cancelSpy,
    })

    global.fetch = jest.fn(async (input) => {
      expect(String(input)).toContain(DEEPSEEK_HOST)
      return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
    }) as unknown as typeof fetch

    const seen: ContentAiStreamEvent[] = []
    for await (const event of generateContentTextStream(pinStream())) {
      seen.push(event)
      if (event.type === 'delta') break
    }

    expect(seen.some((event) => event.type === 'delta')).toBe(true)
    // reader.cancel() must propagate to the fetch body so the socket is
    // released instead of buffering the rest of the generation.
    expect(cancelSpy).toHaveBeenCalledTimes(1)
  })

  it('aborts the in-flight provider fetch when the caller signal fires', async () => {
    let fetchSignal: AbortSignal | null = null
    const encoder = new TextEncoder()

    global.fetch = jest.fn(async (_input, init) => {
      fetchSignal = (init?.signal as AbortSignal) ?? null
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(deltaChunk('one')))
        },
      })
      return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
    }) as unknown as typeof fetch

    const controller = new AbortController()
    for await (const event of generateContentTextStream(pinStream({ signal: controller.signal }))) {
      if (event.type === 'delta') break
    }

    expect(fetchSignal).not.toBeNull()
    expect(fetchSignal!.aborted).toBe(false)

    controller.abort()
    // The caller's abort must bridge to the provider fetch's own signal so
    // the upstream request is torn down.
    expect(fetchSignal!.aborted).toBe(true)
  })

  it('rejects a continuation that restarts with a new frontmatter block after real prose', async () => {
    let call = 0
    global.fetch = jest.fn(async () => {
      call++
      if (call === 1) {
        return sseResponse(deltaChunk(`${REAL_PROSE}\n\n`) + finishChunk('length') + DONE_CHUNK)
      }
      return sseResponse(
        deltaChunk('---\ntitle: Restarted Article\n---\n\n# Restarted Article\n\nFresh restart prose.\n\n') +
          DONE_CHUNK,
      )
    }) as unknown as typeof fetch

    const events = await collect(pinStream())

    expect(call).toBe(2)
    expect(restarted(events)).toBe(true)
    const done = doneEvent(events)
    expect(done).not.toBeNull()
    expect(done!.text).toBe(REAL_PROSE)
    expect(done!.text).not.toContain('Restarted Article')
    expect(deltaText(events)).not.toContain('Restarted Article')
  })

  it('rejects a continuation that opens with a new H1 when the prior draft already has one', async () => {
    let call = 0
    const opening = `---\ntitle: Original Draft\n---\n\n# Original Draft\n\n${REAL_PROSE}\n\n`
    global.fetch = jest.fn(async () => {
      call++
      if (call === 1) {
        return sseResponse(deltaChunk(opening) + finishChunk('length') + DONE_CHUNK)
      }
      return sseResponse(
        deltaChunk('# Completely New Article') + deltaChunk('\n\n## Replacement Section') + DONE_CHUNK,
      )
    }) as unknown as typeof fetch

    const events = await collect(pinStream())

    expect(call).toBe(2)
    expect(restarted(events)).toBe(true)
    const done = doneEvent(events)
    expect(done).not.toBeNull()
    expect(done!.text).toContain('Original Draft')
    expect(done!.text).not.toContain('Completely New Article')
  })

  it('accepts a genuine continuation that appends prose without a restart', async () => {
    let call = 0
    const bodies: Array<Record<string, unknown>> = []
    global.fetch = jest.fn(async (_input, init) => {
      call++
      bodies.push(JSON.parse(String(init?.body || '{}')) as Record<string, unknown>)
      if (call === 1) {
        return sseResponse(deltaChunk(REAL_PROSE) + finishChunk('length') + DONE_CHUNK)
      }
      return sseResponse(
        deltaChunk('The second half continues the article naturally and closes it out.') +
          finishChunk('stop') +
          DONE_CHUNK,
      )
    }) as unknown as typeof fetch

    const events = await collect(pinStream())

    expect(call).toBe(2)
    expect(restarted(events)).toBe(false)
    expect(userMessage(bodies[1])).toContain('CONTINUE WRITING THE DRAFT')
    expect(userMessage(bodies[1])).toContain('The opening half of this article')
    const done = doneEvent(events)
    expect(done).not.toBeNull()
    expect(done!.text).toBe(
      `${REAL_PROSE}\n\nThe second half continues the article naturally and closes it out.`,
    )
  })

  it('streams a draft whose frontmatter fences arrive split across deltas', async () => {
    let call = 0
    global.fetch = jest.fn(async () => {
      call++
      return sseResponse(
        deltaChunk('---') +
          deltaChunk('title: Split Frontmatter Draft') +
          deltaChunk('content_type: blog_post') +
          deltaChunk('---') +
          deltaChunk('# Split Frontmatter Draft\n\n') +
          deltaChunk('Body prose begins here and continues past the scaffolding.\n\n') +
          finishChunk('stop') +
          DONE_CHUNK,
      )
    }) as unknown as typeof fetch

    const events = await collect(pinStream())

    expect(call).toBe(1)
    expect(restarted(events)).toBe(false)
    const done = doneEvent(events)
    expect(done).not.toBeNull()
    expect(done!.text).toContain('title: Split Frontmatter Draft')
    expect(done!.text).toContain('# Split Frontmatter Draft')
    expect(done!.text).toContain('Body prose begins here')
  })

  it('streams a whole frontmatter block delivered in a single delta', async () => {
    let call = 0
    global.fetch = jest.fn(async () => {
      call++
      return sseResponse(
        deltaChunk(
          '---\ntitle: One Chunk Draft\nprimaryKeyword: one chunk\ncontentType: blog_post\nownerHost: legal\n---\n',
        ) +
          deltaChunk('# One Chunk Draft\n\nBody prose arrives after the single-chunk frontmatter.\n\n') +
          finishChunk('stop') +
          DONE_CHUNK,
      )
    }) as unknown as typeof fetch

    const events = await collect(pinStream())

    expect(call).toBe(1)
    expect(restarted(events)).toBe(false)
    const done = doneEvent(events)
    expect(done).not.toBeNull()
    expect(done!.text).toContain('contentType: blog_post')
    expect(done!.text).toContain('Body prose arrives after the single-chunk frontmatter')
  })
})
