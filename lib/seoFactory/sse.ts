/**
 * Minimal SSE (Server-Sent Events) reader shared by the studio's streaming
 * consumers. The server emits `data: {json}\n\n` frames terminated by a
 * `data: [DONE]\n\n` sentinel; this helper reassembles chunk boundaries and
 * invokes `onEvent` with each parsed JSON object, in order.
 */

/** Map a dropped stream / parse error into a studio-facing sentence. */
export function describeGenerationFailure(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err || 'Generation failed')
  const name = err instanceof Error ? err.name : ''
  if (
    name === 'AbortError' ||
    /Failed to fetch|network|connection was lost|Load failed|ERR_NETWORK|the user aborted/i.test(raw)
  ) {
    return 'The live connection dropped while drafting. Open Draft to check for a checkpointed job, then retry.'
  }
  if (/Unexpected (token|end of JSON|EOF)|JSON\.parse/i.test(raw)) {
    return 'The draft stream was interrupted. Open Draft to check for a checkpointed job, then retry.'
  }
  return raw.replace(/\s+/g, ' ').trim().slice(0, 280) || 'Generation failed'
}

export async function consumeSseStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: Record<string, unknown>) => void,
): Promise<void> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  const consumeChunk = (chunk: string) => {
    const dataLine = chunk.split(/\r?\n/).find((line) => line.startsWith('data:'))
    if (!dataLine) return
    const payload = dataLine.slice(5).trim()
    if (!payload || payload === '[DONE]') return
    let event: Record<string, unknown>
    try {
      event = JSON.parse(payload) as Record<string, unknown>
    } catch {
      return // skip malformed frames
    }
    onEvent(event) // callback throws propagate to the caller
  }

  while (true) {
    const { value, done } = await reader.read()
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done })
    const chunks = buffer.split(/\r?\n\r?\n/)
    buffer = chunks.pop() || ''
    for (const chunk of chunks) consumeChunk(chunk)
    if (done) break
  }
  if (buffer.trim()) consumeChunk(buffer)
}
