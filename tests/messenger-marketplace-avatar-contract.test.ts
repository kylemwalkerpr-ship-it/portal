import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('Marketplace Messenger avatar contract', () => {
  const pane = read('components/marketplace/ChatSidePane.tsx')

  test('provider-authored bubbles use the real marketplace provider identity', () => {
    expect(pane).toContain("avatarUrl={!mine ? (attorneyAvatar || undefined) : undefined}")
    expect(pane).toContain("avatarName={!mine ? (attorneyName || 'Specialist') : undefined}")
  })

  test('avatar inputs participate in the memoized message render', () => {
    expect(pane).toContain('[messages, loading, attorneyName, attorneyAvatar]')
  })
})
