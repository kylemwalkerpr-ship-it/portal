import fs from 'node:fs'
import path from 'node:path'

const assistant = fs.readFileSync(path.join(process.cwd(), 'public/assistant.js'), 'utf8')

function fnBody(name: string) {
  const start = assistant.indexOf(`function ${name}(`)
  expect(start).toBeGreaterThan(-1)
  const next = assistant.indexOf('\n  function ', start + 10)
  return assistant.slice(start, next === -1 ? undefined : next)
}

describe('premium assistant widget', () => {
  test('stream re-renders keep the reader position unless they are at the bottom', () => {
    const body = fnBody('renderStream')
    expect(body).toContain('if (html === lastStreamHtml && !forceScroll) return')
    expect(body).toContain('var follow = forceScroll || stickToBottom')
    expect(body).toContain('stream.scrollTop = prevTop')
    expect(body).toContain('if (grew) unseen = true')
  })

  test('the stream tracks whether the reader is pinned to the bottom', () => {
    expect(assistant).toContain('stickToBottom = distanceFromBottom() < 40')
    expect(assistant).toContain('class="ysa-jump"')
  })

  test('progress ticks only replace the progress node and never force a scroll', () => {
    const body = fnBody('tickProgress')
    expect(body).toContain("stream.querySelector('.ysa-progress')")
    expect(body).toContain('if (stickToBottom) stream.scrollTop = stream.scrollHeight')
  })

  test('long replies scroll to the start of the reply', () => {
    const body = fnBody('scrollToLatest')
    expect(body).toContain('last.offsetTop')
  })

  test('render no longer forces the stream to the bottom unconditionally', () => {
    const body = fnBody('render')
    expect(body).not.toMatch(/^\s*stream\.scrollTop = stream\.scrollHeight/m)
  })

  test('name and email are collected first', () => {
    expect(assistant).toContain('class="ysa-intake"')
    expect(assistant).toMatch(/type="email"/)
    expect(assistant).toContain('Please enter your name.')
  })

  test('old chats are archived locally and can be cleared', () => {
    expect(assistant).toContain("archiveKey: 'yousafe.assistant.archive.v1'")
    expect(assistant).toContain('save(cfg.archiveKey, archive)')
    expect(assistant).toContain('ysa-reset')
    expect(assistant).toContain('ysa-past')
  })

  test('host page styles cannot pad or resize the panel', () => {
    expect(assistant).toContain('margin:0;padding:0;box-sizing:border-box')
  })
})
