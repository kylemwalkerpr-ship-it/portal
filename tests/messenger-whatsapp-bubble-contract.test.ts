import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('Messenger WhatsApp-style bubble geometry', () => {
  const bubble = read('components/messaging/MessageBubble.tsx')
  const format = read('lib/messaging/format.ts')
  const tokens = read('components/messaging/messenger-tokens.css')

  test('only the terminal message in a same-sender run gets the avatar-facing tail', () => {
    expect(bubble).toContain("const tailClass = isLastInGroup ? (mine ? 'tail-r' : 'tail-l') : ''")
    expect(bubble).toContain('const showAvatar = isLastInGroup && Boolean(resolvedAvatarUrl || resolvedAvatarName)')
    expect(bubble).toContain("alignSelf: 'flex-start'")
    expect(tokens).toContain('position: absolute; top: 0; left: -8px;')
    expect(tokens).toContain('position: absolute; top: 0; right: -8px;')
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
