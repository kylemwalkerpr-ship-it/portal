/**
 * Tests for the shared SSE stream consumer (lib/seoFactory/sse.ts).
 *
 * The helper reassembles `data: {json}\n\n` frames split across arbitrary
 * chunk boundaries, ignores the `[DONE]` sentinel and malformed frames, and
 * propagates errors thrown by the event callback.
 */
import { consumeSseStream } from '../lib/seoFactory/sse'

function sseBody(frames: string[], chunkSize?: number): ReadableStream<Uint8Array> {
  const full = frames.map((f) => `data: ${f}\n\n`).join('')
  const size = chunkSize ?? full.length
  const chunks: string[] = []
  for (let i = 0; i < full.length; i += size) chunks.push(full.slice(i, i + size))
  const encoded = chunks.map((c) => new TextEncoder().encode(c))
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of encoded) controller.enqueue(c)
      controller.close()
    },
  })
}

describe('consumeSseStream', () => {
  it('emits each JSON frame in order across chunk boundaries', async () => {
    const events: Array<Record<string, unknown>> = []
    await consumeSseStream(
      sseBody(['{"type":"progress","n":1}', '{"type":"progress","n":2}', '{"type":"done"}'], 5),
      (ev) => events.push(ev),
    )
    expect(events).toEqual([
      { type: 'progress', n: 1 },
      { type: 'progress', n: 2 },
      { type: 'done' },
    ])
  })

  it('ignores the [DONE] sentinel and empty payloads', async () => {
    const events: Array<Record<string, unknown>> = []
    await consumeSseStream(
      sseBody(['[DONE]', '{"type":"progress"}', '   ']),
      (ev) => events.push(ev),
    )
    expect(events).toEqual([{ type: 'progress' }])
  })

  it('skips malformed JSON without dropping subsequent frames', async () => {
    const events: Array<Record<string, unknown>> = []
    await consumeSseStream(
      sseBody(['not-json', '{"type":"ok"}']),
      (ev) => events.push(ev),
    )
    expect(events).toEqual([{ type: 'ok' }])
  })

  it('propagates errors thrown by the callback', async () => {
    await expect(
      consumeSseStream(sseBody(['{"type":"error","error":"boom"}']), (ev) => {
        if (ev.type === 'error') throw new Error(String(ev.error))
      }),
    ).rejects.toThrow('boom')
  })

  it('handles a single frame delivered in one chunk with trailing newlines', async () => {
    const events: Array<Record<string, unknown>> = []
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"a":1}\n\n'))
        controller.close()
      },
    })
    await consumeSseStream(body, (ev) => events.push(ev))
    expect(events).toEqual([{ a: 1 }])
  })
})
