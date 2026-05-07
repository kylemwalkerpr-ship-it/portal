/**
 * Yara — YouSafe AI assistant embed.
 *
 * Drop-in widget for any page. No build step, no React, no dependencies.
 *
 * Usage on the marketing site (or any HTML page):
 *   <script src="https://portal.yousafeconsultancy.com/yara.js" defer></script>
 *
 * Optional config — set BEFORE the script loads:
 *   <script>
 *     window.YARA_CONFIG = {
 *       apiUrl: 'https://portal.yousafeconsultancy.com/api/chat', // override
 *       primary: '#3C3B6E',                                        // brand colour
 *       greeting: "Hi! ..."                                        // first message
 *     }
 *   </script>
 *   <script src="https://portal.yousafeconsultancy.com/yara.js" defer></script>
 *
 * The widget persists conversation state in localStorage under
 * `yousafe.chat.history.v1` so it survives page navigation.
 */
(function () {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  if (window.__yaraWidgetMounted) return
  window.__yaraWidgetMounted = true

  var cfg = Object.assign(
    {
      apiUrl: 'https://portal.yousafeconsultancy.com/api/chat',
      primary: '#3C3B6E',
      primaryHover: '#2d2a5e',
      greeting:
        "Hi! I'm Yara, the YouSafe assistant. I can answer questions about services, payments, refunds, document uploads, or how the portal works. What can I help you with?",
      storageKey: 'yousafe.chat.history.v1',
      openKey: 'yousafe.chat.open.v1',
      maxPersisted: 30,
    },
    window.YARA_CONFIG || {}
  )

  function load(key, fallback) {
    try {
      var raw = window.localStorage.getItem(key)
      if (!raw) return fallback
      var parsed = JSON.parse(raw)
      return parsed != null ? parsed : fallback
    } catch (e) {
      return fallback
    }
  }
  function save(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value))
    } catch (e) {
      /* localStorage may be disabled */
    }
  }

  var history = (load(cfg.storageKey, []) || []).slice(-cfg.maxPersisted)
  var open = load(cfg.openKey, false) === true
  var sending = false
  var error = null

  function persist() {
    save(cfg.storageKey, history.slice(-cfg.maxPersisted))
  }

  // ── Style injection ────────────────────────────────────────────────────────
  var style = document.createElement('style')
  style.textContent = [
    '@keyframes yarapulse {',
    '  0%, 60%, 100% { opacity: 0.25; transform: translateY(0); }',
    '  30% { opacity: 1; transform: translateY(-2px); }',
    '}',
    '.yara-launcher{position:fixed;right:20px;bottom:20px;width:56px;height:56px;border-radius:50%;background:' + cfg.primary + ';color:#fff;border:none;cursor:pointer;box-shadow:0 12px 28px rgba(15,23,42,.25);display:flex;align-items:center;justify-content:center;font-size:24px;z-index:2147483600;font-family:inherit;transition:background .15s,transform .15s}',
    '.yara-launcher:hover{background:' + cfg.primaryHover + '}',
    '.yara-panel{position:fixed;right:20px;bottom:88px;width:380px;max-width:calc(100vw - 40px);height:560px;max-height:calc(100vh - 120px);background:#fff;border:1px solid #E5E7EB;border-radius:16px;box-shadow:0 24px 64px rgba(15,23,42,.22);display:flex;flex-direction:column;overflow:hidden;z-index:2147483600;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#111827}',
    '.yara-header{padding:14px 16px;border-bottom:1px solid #E5E7EB;background:' + cfg.primary + ';color:#fff;display:flex;align-items:center;gap:12px}',
    '.yara-avatar{width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.18);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px}',
    '.yara-title{flex:1;min-width:0}',
    '.yara-title-name{font-size:14px;font-weight:700}',
    '.yara-title-sub{font-size:11px;opacity:.85}',
    '.yara-reset{background:rgba(255,255,255,.12);border:none;color:#fff;cursor:pointer;font-size:11px;font-weight:600;padding:6px 10px;border-radius:8px;font-family:inherit}',
    '.yara-stream{flex:1;overflow-y:auto;padding:16px;background:#F9FAFB;display:flex;flex-direction:column;gap:10px}',
    '.yara-row{display:flex}',
    '.yara-row.user{justify-content:flex-end}',
    '.yara-row.assistant{justify-content:flex-start}',
    '.yara-bubble{max-width:82%;padding:10px 13px;border-radius:12px;font-size:14px;line-height:1.5;white-space:pre-wrap;word-wrap:break-word}',
    '.yara-bubble.user{background:' + cfg.primary + ';color:#fff}',
    '.yara-bubble.assistant{background:#F3F4F6;color:#111827;border:1px solid #E5E7EB}',
    '.yara-typing{padding:10px 14px;border-radius:12px;background:#F3F4F6;border:1px solid #E5E7EB;color:#6B7280;font-size:13px;display:inline-flex;gap:6px;align-items:center}',
    '.yara-dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:#9CA3AF;animation:yarapulse 1.2s ease-in-out infinite}',
    '.yara-error{font-size:12px;color:#DC2626;background:rgba(220,38,38,.08);border:1px solid rgba(220,38,38,.25);border-radius:10px;padding:8px 12px;align-self:flex-start;max-width:90%}',
    '.yara-composer{border-top:1px solid #E5E7EB;padding:10px 12px;background:#fff;display:flex;gap:8px;align-items:flex-end}',
    '.yara-textarea{flex:1;resize:none;max-height:120px;min-height:38px;border:1px solid #D1D5DB;border-radius:10px;padding:9px 12px;font-size:14px;font-family:inherit;outline:none;background:#fff;color:#111827;line-height:1.4}',
    '.yara-send{height:38px;padding:0 14px;background:' + cfg.primary + ';color:#fff;border:none;border-radius:10px;cursor:pointer;font-weight:700;font-size:13px;font-family:inherit}',
    '.yara-send:disabled{opacity:.5;cursor:not-allowed}',
    '@media(max-width:480px){.yara-panel{right:10px;bottom:78px;width:calc(100vw - 20px);height:calc(100vh - 100px)}}',
  ].join('\n')
  document.head.appendChild(style)

  // ── Build DOM ─────────────────────────────────────────────────────────────
  var launcher = document.createElement('button')
  launcher.type = 'button'
  launcher.className = 'yara-launcher'
  launcher.setAttribute('aria-label', 'Open chat')

  var panel = document.createElement('div')
  panel.className = 'yara-panel'
  panel.setAttribute('role', 'dialog')
  panel.setAttribute('aria-label', 'YouSafe assistant')

  panel.innerHTML =
    '<div class="yara-header">' +
    '  <div class="yara-avatar">Y</div>' +
    '  <div class="yara-title"><div class="yara-title-name">Yara · YouSafe assistant</div><div class="yara-title-sub">Replies in seconds · powered by AI</div></div>' +
    '  <button class="yara-reset" type="button" title="Start a new conversation">Reset</button>' +
    '</div>' +
    '<div class="yara-stream"></div>' +
    '<div class="yara-composer">' +
    '  <textarea class="yara-textarea" rows="1" placeholder="Type a message…"></textarea>' +
    '  <button class="yara-send" type="button">Send</button>' +
    '</div>'

  document.body.appendChild(launcher)
  document.body.appendChild(panel)

  var stream = panel.querySelector('.yara-stream')
  var textarea = panel.querySelector('.yara-textarea')
  var sendBtn = panel.querySelector('.yara-send')
  var resetBtn = panel.querySelector('.yara-reset')

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  function render() {
    launcher.textContent = open ? '×' : '💬'
    launcher.setAttribute('aria-label', open ? 'Close chat' : 'Open chat')
    panel.style.display = open ? 'flex' : 'none'

    var visible = history.length > 0 ? history : [{ role: 'assistant', content: cfg.greeting }]
    var html = ''
    for (var i = 0; i < visible.length; i++) {
      var m = visible[i]
      html +=
        '<div class="yara-row ' + m.role + '">' +
        '<div class="yara-bubble ' + m.role + '">' + escapeHtml(m.content) + '</div>' +
        '</div>'
    }
    if (sending) {
      html +=
        '<div class="yara-row assistant"><div class="yara-typing">' +
        '<span class="yara-dot"></span><span class="yara-dot" style="animation-delay:.15s"></span><span class="yara-dot" style="animation-delay:.3s"></span>' +
        '</div></div>'
    }
    if (error) {
      html += '<div class="yara-error">' + escapeHtml(error) + '</div>'
    }
    stream.innerHTML = html
    stream.scrollTop = stream.scrollHeight

    sendBtn.disabled = sending || textarea.value.trim().length === 0
  }

  function toggle(next) {
    open = typeof next === 'boolean' ? next : !open
    save(cfg.openKey, open)
    render()
    if (open) {
      setTimeout(function () { textarea.focus() }, 50)
    }
  }

  async function send() {
    var text = textarea.value.trim()
    if (!text || sending) return

    history.push({ role: 'user', content: text })
    persist()
    textarea.value = ''
    sending = true
    error = null
    render()

    try {
      var apiHistory = history.map(function (m) { return { role: m.role, content: m.content } })
      // Cross-origin call — visitors on the marketing site are anonymous, so
      // we don't include credentials. Including them would require
      // Access-Control-Allow-Credentials: true on the response and would
      // fail in browsers that block third-party cookies anyway.
      var res = await fetch(cfg.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiHistory }),
      })
      var data = {}
      try { data = await res.json() } catch (e) { /* non-json */ }
      if (!res.ok || !data.reply) {
        throw new Error(data.error || 'Assistant unreachable (' + res.status + ')')
      }
      history.push({ role: 'assistant', content: data.reply })
      persist()
    } catch (e) {
      error = e && e.message ? e.message : 'Something went wrong.'
    } finally {
      sending = false
      render()
    }
  }

  function reset() {
    history = []
    error = null
    persist()
    render()
  }

  launcher.addEventListener('click', function () { toggle() })
  sendBtn.addEventListener('click', send)
  resetBtn.addEventListener('click', reset)
  textarea.addEventListener('input', render)
  textarea.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  })

  render()
})()
