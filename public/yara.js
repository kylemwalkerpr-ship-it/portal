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
 *       apiUrl: 'https://portal.yousafeconsultancy.com/api/chat',  // override
 *       supportApiUrl: 'https://support.yousafeconsultancy.com/api/chat/widget',
 *       primary: '#3C3B6E',
 *       greeting: "Hi! ..."
 *     }
 *   </script>
 *   <script src="https://portal.yousafeconsultancy.com/yara.js" defer></script>
 *
 * Conversation persists across navigations via localStorage. When the user
 * asks for a human (or clicks "Talk to a human"), the widget hands off to
 * the support team's queue at support.yousafeconsultancy.com and keeps the
 * conversation in the same panel.
 */
(function () {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  if (window.__yaraWidgetMounted) return
  window.__yaraWidgetMounted = true

  var cfg = Object.assign(
    {
      apiUrl: 'https://portal.yousafeconsultancy.com/api/chat',
      supportApiUrl: 'https://support.yousafeconsultancy.com/api/chat/widget',
      primary: '#3C3B6E',
      primaryHover: '#2d2a5e',
      greeting:
        "Hi, I'm Yara. Ask me about YouSafe services, the portal, checkout, legal-panel inquiries, documents, refunds, or getting help from a real person. Tell me what you're trying to do and I'll point you to the right next step.",
      storageKey: 'yousafe.chat.history.v1',
      openKey: 'yousafe.chat.open.v1',
      supportKey: 'yousafe.chat.support.v1',
      maxPersisted: 30,
      pollMs: 5000,
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
    } catch (e) { /* localStorage may be disabled */ }
  }

  var history = (load(cfg.storageKey, []) || []).slice(-cfg.maxPersisted)
  var open = load(cfg.openKey, false) === true
  var support = load(cfg.supportKey, null)
  var sending = false
  var error = null
  var pollTimer = null

  function persist() {
    save(cfg.storageKey, history.slice(-cfg.maxPersisted))
  }
  function persistSupport() {
    save(cfg.supportKey, support)
  }
  function inLive() {
    return Boolean(
      support && support.conversationId && support.status !== 'resolved' && support.status !== 'closed'
    )
  }

  var style = document.createElement('style')
  style.textContent = [
    '@keyframes yarapulse {',
    '  0%, 60%, 100% { opacity: 0.25; transform: translateY(0); }',
    '  30% { opacity: 1; transform: translateY(-2px); }',
    '}',
    '.yara-launcher{position:fixed;right:20px;bottom:20px;width:56px;height:56px;border-radius:50%;background:' + cfg.primary + ';color:#fff;border:none;cursor:pointer;box-shadow:0 12px 28px rgba(15,23,42,.25);display:flex;align-items:center;justify-content:center;font-size:24px;z-index:2147483600;font-family:inherit;transition:background .15s,transform .15s}',
    '.yara-launcher:hover{background:' + cfg.primaryHover + '}',
    '.yara-panel{position:fixed;right:20px;bottom:88px;width:380px;max-width:calc(100vw - 40px);height:580px;max-height:calc(100vh - 120px);background:#fff;border:1px solid #E5E7EB;border-radius:16px;box-shadow:0 24px 64px rgba(15,23,42,.22);display:flex;flex-direction:column;overflow:hidden;z-index:2147483600;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#111827}',
    '.yara-header{padding:14px 16px;border-bottom:1px solid #E5E7EB;background:' + cfg.primary + ';color:#fff;display:flex;align-items:center;gap:12px}',
    '.yara-avatar{width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.18);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px}',
    '.yara-title{flex:1;min-width:0}',
    '.yara-title-name{font-size:14px;font-weight:700}',
    '.yara-title-sub{font-size:11px;opacity:.85}',
    '.yara-reset{background:rgba(255,255,255,.12);border:none;color:#fff;cursor:pointer;font-size:11px;font-weight:600;padding:6px 10px;border-radius:8px;font-family:inherit}',
    '.yara-stream{flex:1;overflow-y:auto;padding:16px;background:#F9FAFB;display:flex;flex-direction:column;gap:10px}',
    '.yara-row{display:flex;flex-direction:column}',
    '.yara-row.user{align-items:flex-end}',
    '.yara-row.assistant,.yara-row.agent,.yara-row.system{align-items:flex-start}',
    '.yara-sender{font-size:10px;color:#9CA3AF;margin-bottom:3px;font-weight:600;text-transform:uppercase;letter-spacing:.04em}',
    '.yara-bubble{max-width:82%;padding:10px 13px;border-radius:12px;font-size:14px;line-height:1.5;white-space:pre-wrap;word-wrap:break-word}',
    '.yara-bubble.user{background:' + cfg.primary + ';color:#fff}',
    '.yara-bubble.assistant{background:#F3F4F6;color:#111827;border:1px solid #E5E7EB}',
    '.yara-bubble.agent{background:#DCFCE7;color:#14532D;border:1px solid #86EFAC}',
    '.yara-bubble.system{background:#FEF3C7;color:#78350F;border:1px solid #FCD34D}',
    '.yara-typing{padding:10px 14px;border-radius:12px;background:#F3F4F6;border:1px solid #E5E7EB;color:#6B7280;font-size:13px;display:inline-flex;gap:6px;align-items:center}',
    '.yara-dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:#9CA3AF;animation:yarapulse 1.2s ease-in-out infinite}',
    '.yara-error{font-size:12px;color:#DC2626;background:rgba(220,38,38,.08);border:1px solid rgba(220,38,38,.25);border-radius:10px;padding:8px 12px;align-self:flex-start;max-width:90%}',
    '.yara-cta-row{padding:8px 12px 0;display:flex;justify-content:center}',
    '.yara-cta{background:transparent;border:1px dashed #D1D5DB;border-radius:999px;padding:5px 14px;cursor:pointer;font-size:12px;font-weight:600;color:' + cfg.primary + ';font-family:inherit}',
    '.yara-cta:disabled{opacity:.6;cursor:not-allowed}',
    '.yara-composer{border-top:1px solid #E5E7EB;padding:10px 12px;background:#fff;display:flex;gap:8px;align-items:flex-end}',
    '.yara-textarea{flex:1;resize:none;max-height:120px;min-height:38px;border:1px solid #D1D5DB;border-radius:10px;padding:9px 12px;font-size:14px;font-family:inherit;outline:none;background:#fff;color:#111827;line-height:1.4}',
    '.yara-send{height:38px;padding:0 14px;background:' + cfg.primary + ';color:#fff;border:none;border-radius:10px;cursor:pointer;font-weight:700;font-size:13px;font-family:inherit}',
    '.yara-send:disabled{opacity:.5;cursor:not-allowed}',
    '@media(max-width:480px){.yara-panel{right:10px;bottom:78px;width:calc(100vw - 20px);height:calc(100vh - 100px)}}',
  ].join('\n')
  document.head.appendChild(style)

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
    '  <div class="yara-avatar yara-avatar-icon">Y</div>' +
    '  <div class="yara-title">' +
    '    <div class="yara-title-name">Yara · YouSafe assistant</div>' +
    '    <div class="yara-title-sub">AI assistant online</div>' +
    '  </div>' +
    '  <button class="yara-reset" type="button" title="Start a new conversation">Reset</button>' +
    '</div>' +
    '<div class="yara-stream"></div>' +
    '<div class="yara-cta-row" style="display:none"><button class="yara-cta" type="button">Talk to a human →</button></div>' +
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
  var ctaRow = panel.querySelector('.yara-cta-row')
  var ctaBtn = panel.querySelector('.yara-cta')
  var avatarEl = panel.querySelector('.yara-avatar-icon')
  var titleEl = panel.querySelector('.yara-title-name')
  var subEl = panel.querySelector('.yara-title-sub')

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  }

  function statusLabel() {
    if (!inLive()) return 'AI assistant online'
    var s = support && support.status
    if (s === 'assigned') return 'Live agent connected'
    if (s === 'waiting_for_agent') {
      var pos = support && support.queue && support.queue.position
      var wait = support && support.queue && support.queue.estimatedWaitMinutes
      if (pos && wait) return 'In live queue · #' + pos + ' · ~' + wait + ' min'
      if (pos) return 'In live queue · #' + pos
      return 'In live queue'
    }
    return 'AI assistant online'
  }

  function senderLabel(role, name) {
    if (role === 'user') return ''
    if (role === 'agent') return name ? escapeHtml(name) + ' · Support' : 'Support team'
    if (role === 'system') return 'YouSafe'
    return 'Yara'
  }

  function render() {
    launcher.textContent = open ? '×' : '💬'
    launcher.setAttribute('aria-label', open ? 'Close chat' : 'Open chat')
    panel.style.display = open ? 'flex' : 'none'

    var live = inLive()
    avatarEl.textContent = live ? '🛟' : 'Y'
    titleEl.textContent = live ? 'Live support' : 'Yara · YouSafe assistant'
    subEl.textContent = statusLabel()
    ctaRow.style.display = live ? 'none' : 'flex'
    ctaBtn.disabled = sending

    var visible = history.length > 0 ? history : [{ role: 'assistant', content: cfg.greeting }]
    var html = ''
    for (var i = 0; i < visible.length; i++) {
      var m = visible[i]
      var label = senderLabel(m.role, m.senderName)
      html +=
        '<div class="yara-row ' + m.role + '">' +
        (label ? '<div class="yara-sender">' + label + '</div>' : '') +
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
    textarea.placeholder = live ? 'Message support…' : 'Type a message…'
  }

  function toggle(next) {
    open = typeof next === 'boolean' ? next : !open
    save(cfg.openKey, open)
    render()
    if (open) {
      setTimeout(function () { textarea.focus() }, 50)
      maybeStartPolling()
    } else {
      stopPolling()
    }
  }

  function remoteRoleToLocal(senderType) {
    if (senderType === 'visitor') return 'user'
    if (senderType === 'agent') return 'agent'
    if (senderType === 'system') return 'system'
    if (senderType === 'ai') return 'assistant'
    return null
  }

  function mergeRemoteMessages(remote) {
    if (!Array.isArray(remote) || remote.length === 0) return false
    var seen = {}
    for (var i = 0; i < history.length; i++) {
      if (history[i].id) seen[history[i].id] = 1
    }
    var lastTs = 0
    for (var j = 0; j < history.length; j++) {
      if (history[j].ts && history[j].ts > lastTs) lastTs = history[j].ts
    }
    var added = false
    for (var k = 0; k < remote.length; k++) {
      var r = remote[k]
      if (!r || !r.id || seen[r.id]) continue
      var ts = r.created_at ? new Date(r.created_at).getTime() : Date.now()
      if (ts <= lastTs) continue
      var role = remoteRoleToLocal(r.sender_type)
      if (!role || role === 'user') continue
      history.push({
        id: r.id, role: role, content: r.body || '',
        senderName: r.sender_name || null, ts: ts,
      })
      added = true
    }
    if (added) persist()
    return added
  }

  async function pullSupport() {
    if (!inLive()) return
    try {
      var res = await fetch(cfg.supportApiUrl + '/' + encodeURIComponent(support.conversationId))
      if (!res.ok) return
      var data = await res.json()
      var changed = mergeRemoteMessages(data.messages || [])
      var newStatus = data.conversation && data.conversation.status
      var newQueue = data.queue
      var statusChanged = newStatus && newStatus !== support.status
      var queueChanged = JSON.stringify(newQueue || null) !== JSON.stringify(support.queue || null)
      if (newStatus) support.status = newStatus
      if (newQueue) support.queue = newQueue
      if (statusChanged || queueChanged) persistSupport()
      if (changed || statusChanged || queueChanged) render()
    } catch (e) { /* polling errors are non-fatal */ }
  }

  function maybeStartPolling() {
    stopPolling()
    if (!inLive()) return
    pullSupport()
    pollTimer = setInterval(pullSupport, cfg.pollMs)
  }
  function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
  }

  async function sendToYara(opts) {
    var apiHistory = []
    for (var i = 0; i < history.length; i++) {
      var h = history[i]
      if (h.role === 'user' || h.role === 'assistant') {
        apiHistory.push({ role: h.role, content: h.content })
      }
    }
    var res = await fetch(cfg.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: apiHistory,
        requestAgent: !!(opts && opts.requestAgent),
        topic: cfg.topic || document.location.hostname,
        pageContext: {
          url: document.location.href,
          origin: document.location.origin,
          hostname: document.location.hostname,
          pathname: document.location.pathname,
          title: document.title,
          referrer: document.referrer || null,
          surface: cfg.surface || document.location.hostname,
        },
      }),
    })
    var data = {}
    try { data = await res.json() } catch (e) { /* */ }
    if (!res.ok) throw new Error(data.error || 'Assistant unreachable (' + res.status + ')')
    return data
  }

  async function sendToSupport(text) {
    var res = await fetch(cfg.supportApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        conversationId: support.conversationId,
        topic: support.topic || 'website',
      }),
    })
    var data = {}
    try { data = await res.json() } catch (e) { /* */ }
    if (!res.ok) throw new Error(data.error || 'Support unreachable (' + res.status + ')')
    return data
  }

  async function send(overrideText, opts) {
    var text = (typeof overrideText === 'string' ? overrideText : textarea.value).trim()
    if (!text || sending) return

    history.push({ role: 'user', content: text, ts: Date.now() })
    persist()
    if (typeof overrideText !== 'string') textarea.value = ''
    sending = true
    error = null
    render()

    try {
      if (inLive()) {
        var data = await sendToSupport(text)
        if (Array.isArray(data.messages)) mergeRemoteMessages(data.messages)
        if (data.conversation && data.conversation.status) support.status = data.conversation.status
        if (data.queue) support.queue = data.queue
        persistSupport()
        return
      }

      var resp = await sendToYara(opts)
      if (resp.handoff && resp.handoff.conversationId) {
        support = {
          conversationId: resp.handoff.conversationId,
          status: resp.handoff.status || 'waiting_for_agent',
          queue: resp.handoff.queue || null,
          apiUrl: resp.handoff.apiUrl || cfg.supportApiUrl,
          topic: 'website',
          openedAt: Date.now(),
        }
        if (support.apiUrl && support.apiUrl !== cfg.supportApiUrl) cfg.supportApiUrl = support.apiUrl
        persistSupport()
        var msg = resp.reply || "I'm connecting you to a live support agent."
        history.push({ role: 'system', content: msg, ts: Date.now() })
        persist()
        maybeStartPolling()
      } else if (resp.reply) {
        history.push({ role: 'assistant', content: resp.reply, ts: Date.now() })
        persist()
      }
    } catch (e) {
      error = (e && e.message) ? e.message : 'Something went wrong.'
    } finally {
      sending = false
      render()
    }
  }

  function reset() {
    history = []
    support = null
    error = null
    persist()
    persistSupport()
    stopPolling()
    render()
  }

  launcher.addEventListener('click', function () { toggle() })
  sendBtn.addEventListener('click', function () { send() })
  resetBtn.addEventListener('click', reset)
  ctaBtn.addEventListener('click', function () {
    if (sending) return
    send("I'd like to talk to a human support agent.", { requestAgent: true })
  })
  textarea.addEventListener('input', render)
  textarea.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  })

  render()
  if (open && inLive()) maybeStartPolling()
})()
