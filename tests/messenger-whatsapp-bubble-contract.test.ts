import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('Messenger WhatsApp-style bubble geometry', () => {
  const bubble = read('components/messaging/MessageBubble.tsx')
  const format = read('lib/messaging/format.ts')

  test('only the terminal message in a same-sender run gets the lower avatar-facing tail', () => {
    expect(bubble).toContain("const tailSide = mine ? 'right' : 'left'")
    expect(bubble).toContain('const showAvatar = isLastInGroup && Boolean(resolvedAvatarUrl || resolvedAvatarName)')
    expect(bubble).toContain('data-bubble-tail={tailSide}')
    expect(bubble).toContain("bottom: 0")
    expect(bubble).toContain("alignSelf: 'flex-end'")
    expect(bubble).not.toContain("const tailClass = isLastInGroup ? (mine ? 'tail-r' : 'tail-l') : ''")
    expect(bubble).not.toContain("alignSelf: 'flex-start'")
  })

  test('grouping stays compact while timestamps remain on every message', () => {
    expect(bubble).toContain("${isLastInGroup ? 'last' : ''}")
    expect(bubble).toContain('{timestamp && (')
    expect(bubble).not.toContain('{isLastInGroup && timestamp && (')
  })

  test('message timestamps are local clock times rather than repeated dates', () => {
    expect(format).toContain("toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })")
    expect(format).not.toContain("return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })")
  })
})
