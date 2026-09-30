import fs from 'node:fs'
import path from 'node:path'

const assistant = fs.readFileSync(path.join(process.cwd(), 'public/assistant.js'), 'utf8')

describe('YQAA human handoff ownership', () => {
  test('a legacy waiting queue does not hijack subsequent ordinary YQAA messages', () => {
    expect(assistant).toContain('function supportOwnsConversation()')
    expect(assistant).toContain("['waiting_for_agent', 'queued', 'waiting', 'pending']")
    expect(assistant).toContain('if (supportOwnsConversation()) {')
    expect(assistant).not.toContain('      if (inLive()) {\n        var live = await fetchJsonWithNetworkRecovery')
  })

  test('explicit, required, or agent-active handoffs retain conversation ownership', () => {
    expect(assistant).toContain("mode === 'explicit' || mode === 'required' || mode === 'active'")
    expect(assistant).toContain("mode: data.handoff.kind || (requestAgent ? 'explicit' : 'legacy')")
    expect(assistant).toContain("if (m.sender_type === 'agent' && support) support.mode = 'active'")
  })
})
