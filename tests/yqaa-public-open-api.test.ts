import fs from 'node:fs'
import path from 'node:path'

// Every "Live chat" / "Start chat" trigger on the YouSafe sister sites opens
// YQAA through this public API instead of shipping its own chat modal.
const assistant = fs.readFileSync(path.join(process.cwd(), 'public/assistant.js'), 'utf8')

describe('YQAA public open API', () => {
  test('exposes window.YQAA / window.YouSafeAssistant with open, close, toggle and isOpen', () => {
    expect(assistant).toContain('window.YQAA = publicApi')
    expect(assistant).toContain('window.YouSafeAssistant = publicApi')
    for (const method of ['open:', 'close:', 'toggle:', 'isOpen:']) expect(assistant).toContain(method)
  })

  test('listens for yqaa:open / yqaa:close / yqaa:toggle events', () => {
    expect(assistant).toContain("window.addEventListener('yqaa:open', publicApi.open)")
    expect(assistant).toContain("window.addEventListener('yqaa:close', publicApi.close)")
    expect(assistant).toContain("window.addEventListener('yqaa:toggle', toggleAssistant)")
  })

  test('declarative triggers: data-yqaa-open or href="#yqaa" open the panel', () => {
    expect(assistant).toContain(`closest('[data-yqaa-open],a[href="#yqaa"]')`)
    expect(assistant).toContain('event.preventDefault()')
    // A page handler that already opened YQAA (and prevented default) wins.
    expect(assistant).toContain('event.defaultPrevented')
  })

  test('honours an open request queued before the script loaded, then announces readiness', () => {
    const tail = assistant.slice(assistant.indexOf('if (window.__yqaaOpenRequested)'))
    expect(tail).toContain('window.__yqaaOpenRequested = false')
    expect(tail).toContain('publicApi.open()')
    expect(assistant).toContain("new Event('yqaa:ready')")
    // The queued request is honoured only after the first render built the DOM.
    expect(assistant.indexOf('if (window.__yqaaOpenRequested)')).toBeGreaterThan(assistant.lastIndexOf('  render()\n'))
  })

  test('open() is idempotent so a double trigger never closes the panel', () => {
    expect(assistant).toContain('open: function () { if (!open) openAssistant(); return true }')
  })
})
