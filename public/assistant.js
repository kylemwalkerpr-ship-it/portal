/**
 * YouSafe Assistant — system-wide SuperGrok embed.
 * Canonical assistant surface for YouSafe and every sister site.
 */
(function () {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  if (window.__youSafeAssistantMounted) return
  window.__youSafeAssistantMounted = true

  var cfg = Object.assign({
    apiUrl: 'https://portal.yousafeconsultancy.com/api/chat',
    supportApiUrl: 'https://support.yousafeconsultancy.com/api/chat/widget',
    primary: '#3C3B6E',
    primaryHover: '#2d2a5e',
    greeting: "Hi, I'm the YouSafe AI Assistant. I can help with the exact page you're viewing and with services across the YouSafe network. Ask me anything, or ask for a human when you need one.",
    storageKey: 'yousafe.assistant.history.v2',
    openKey: 'yousafe.assistant.open.v2',
    supportKey: 'yousafe.assistant.support.v2',
    contactKey: 'yousafe.assistant.contact.v2',
    maxPersisted: 30,
    pollMs: 5000,
  }, window.YOUSAFE_ASSISTANT_CONFIG || {})

  function load(key, fallback) {
    try {
      var raw = localStorage.getItem(key)
      return raw ? JSON.parse(raw) : fallback
    } catch (_) { return fallback }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)) } catch (_) {}
  }
  function esc(value) {
    return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  }
  function visiblePageText() {
    try {
      var root = document.querySelector('main, article, [role="main"]') || document.body
      if (!root) return ''
      var clone = root.cloneNode(true)
      var excluded = clone.querySelectorAll('script,style,noscript,nav,footer,header,form,button,[aria-hidden="true"]')
      for (var i = 0; i < excluded.length; i++) excluded[i].remove()
      return String(clone.innerText || clone.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 7000)
    } catch (_) { return '' }
  }
  function visibleHeadings() {
    try {
      var nodes = document.querySelectorAll('h1,h2,h3')
      var out = []
      for (var i = 0; i < nodes.length && out.length < 24; i++) {
        var text = String(nodes[i].textContent || '').replace(/\s+/g, ' ').trim()
        if (text) out.push(text.slice(0, 180))
      }
      return out.join(' | ').slice(0, 2500)
    } catch (_) { return '' }
  }
  function originContext() {
    return {
      surface: cfg.surface || 'public-site-chat',
      url: location.href,
      origin: location.origin,
      hostname: location.hostname,
      pathname: location.pathname,
      title: document.title,
      referrer: document.referrer || null,
      locale: document.documentElement.lang || navigator.language || null,
      headings: visibleHeadings(),
      pageText: visiblePageText(),
    }
  }

  var history = (load(cfg.storageKey, []) || []).slice(-cfg.maxPersisted)
  var open = load(cfg.openKey, false) === true
  var support = load(cfg.supportKey, null)
  var contact = load(cfg.contactKey, null)
  var sending = false
  var error = ''
  var pollTimer = null

  function persist() { save(cfg.storageKey, history.slice(-cfg.maxPersisted)) }
  function inLive() {
    return !!(support && support.conversationId && support.status !== 'resolved' && support.status !== 'closed')
  }

  var style = document.createElement('style')
  style.textContent = [
    '@keyframes ysapulse{0%,60%,100%{opacity:.25;transform:translateY(0)}30%{opacity:1;transform:translateY(-2px)}}',
    '.ysa-launcher{position:fixed;right:20px;bottom:max(20px,env(safe-area-inset-bottom));width:56px;height:56px;border:0;border-radius:50%;background:' + cfg.primary + ';color:#fff;box-shadow:0 12px 28px rgba(15,23,42,.25);cursor:pointer;z-index:2147483600;font-size:24px}',
    '.ysa-launcher:hover{background:' + cfg.primaryHover + '}',
    '.ysa-panel{position:fixed;right:20px;bottom:max(88px,calc(68px + env(safe-area-inset-bottom)));width:380px;max-width:calc(100vw - 40px);height:580px;max-height:calc(100dvh - 120px);background:#fff;border:1px solid #e5e7eb;border-radius:16px;box-shadow:0 24px 64px rgba(15,23,42,.22);overflow:hidden;display:flex;flex-direction:column;z-index:2147483600;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#111827}',
    '.ysa-head{padding:14px 16px;background:' + cfg.primary + ';color:#fff;display:flex;align-items:center;gap:10px}.ysa-avatar{width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.18);display:flex;align-items:center;justify-content:center;font-weight:800}.ysa-title{flex:1}.ysa-name{font-size:14px;font-weight:800}.ysa-sub{font-size:11px;opacity:.86}.ysa-head button{border:0;background:rgba(255,255,255,.13);color:#fff;border-radius:8px;cursor:pointer;padding:6px 9px}',
    '.ysa-stream{flex:1;overflow:auto;padding:16px;background:#f9fafb;display:flex;flex-direction:column;gap:10px}.ysa-row{display:flex;flex-direction:column;align-items:flex-start}.ysa-row.user{align-items:flex-end}.ysa-label{font-size:10px;color:#9ca3af;margin-bottom:3px;font-weight:700;text-transform:uppercase}.ysa-bubble{max-width:84%;padding:10px 13px;border-radius:12px;font-size:14px;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere;background:#f3f4f6;border:1px solid #e5e7eb}.ysa-row.user .ysa-bubble{background:' + cfg.primary + ';color:#fff;border-color:' + cfg.primary + '}.ysa-row.agent .ysa-bubble{background:#dcfce7;color:#14532d;border-color:#86efac}.ysa-row.system .ysa-bubble{background:#fef3c7;color:#78350f;border-color:#fcd34d}',
    '.ysa-error{font-size:12px;color:#b91c1c;background:#fee2e2;border-radius:9px;padding:8px 10px}.ysa-human{padding:7px 12px;text-align:center}.ysa-human button{border:1px dashed #cbd5e1;background:#fff;color:' + cfg.primary + ';border-radius:999px;padding:6px 13px;font-weight:700;cursor:pointer}.ysa-compose{border-top:1px solid #e5e7eb;padding:10px 12px;display:flex;gap:8px;align-items:flex-end}.ysa-input{flex:1;min-height:38px;max-height:120px;resize:none;border:1px solid #d1d5db;border-radius:10px;padding:9px 11px;font:14px inherit}.ysa-send{height:38px;border:0;border-radius:10px;background:' + cfg.primary + ';color:#fff;padding:0 14px;font-weight:800;cursor:pointer}.ysa-send:disabled{opacity:.5}',
    '@media(max-width:480px){.ysa-launcher{right:12px}.ysa-panel{right:10px;bottom:max(78px,calc(58px + env(safe-area-inset-bottom)));width:calc(100vw - 20px);height:calc(100dvh - 100px);max-height:calc(100dvh - 100px)}}',
  ].join('\n')
  document.head.appendChild(style)

  var launcher = document.createElement('button')
  launcher.type = 'button'
  launcher.className = 'ysa-launcher'
  launcher.setAttribute('aria-label', 'Open YouSafe AI Assistant')
  launcher.textContent = '💬'

  var panel = document.createElement('section')
  panel.className = 'ysa-panel'
  panel.setAttribute('role', 'dialog')
  panel.setAttribute('aria-label', 'YouSafe AI Assistant')
  panel.innerHTML = '<div class="ysa-head"><div class="ysa-avatar">AI</div><div class="ysa-title"><div class="ysa-name">YouSafe AI Assistant</div><div class="ysa-sub">SuperGrok · context aware</div></div><button class="ysa-reset" type="button" title="New conversation">Reset</button><button class="ysa-close" type="button" title="Close">×</button></div><div class="ysa-stream"></div><div class="ysa-human"><button type="button">Talk to a human →</button></div><div class="ysa-compose"><textarea class="ysa-input" rows="1" placeholder="Type a message…"></textarea><button class="ysa-send" type="button">Send</button></div>'
  document.body.appendChild(launcher)
  document.body.appendChild(panel)

  var stream = panel.querySelector('.ysa-stream')
  var input = panel.querySelector('.ysa-input')
  var sendButton = panel.querySelector('.ysa-send')
  var humanButton = panel.querySelector('.ysa-human button')

  function render() {
    panel.style.display = open ? 'flex' : 'none'
    launcher.textContent = open ? '×' : '💬'
    var visible = history.length ? history : [{ role: 'assistant', content: cfg.greeting }]
    var html = ''
    for (var i = 0; i < visible.length; i++) {
      var item = visible[i]
      var label = item.role === 'assistant' ? 'YouSafe AI' : item.role === 'agent' ? (item.senderName || 'Support') : item.role === 'system' ? 'YouSafe' : ''
      html += '<div class="ysa-row ' + esc(item.role) + '">' + (label ? '<div class="ysa-label">' + esc(label) + '</div>' : '') + '<div class="ysa-bubble">' + esc(item.content) + '</div></div>'
    }
    if (sending) html += '<div class="ysa-row assistant"><div class="ysa-bubble">Thinking…</div></div>'
    if (error) html += '<div class="ysa-error">' + esc(error) + '</div>'
    stream.innerHTML = html
    stream.scrollTop = stream.scrollHeight
    sendButton.disabled = sending || !input.value.trim()
    humanButton.style.display = inLive() ? 'none' : 'inline-block'
  }

  function mergeRemote(remote) {
    if (!Array.isArray(remote)) return
    var seen = {}
    history.forEach(function (m) { if (m.id) seen[m.id] = true })
    remote.forEach(function (m) {
      if (!m || !m.id || seen[m.id] || m.sender_type === 'visitor') return
      history.push({ id: m.id, role: m.sender_type === 'agent' ? 'agent' : m.sender_type === 'system' ? 'system' : 'assistant', content: m.body || '', senderName: m.sender_name || null, ts: m.created_at ? new Date(m.created_at).getTime() : Date.now() })
    })
    persist()
  }

  async function pollSupport() {
    if (!inLive()) return
    try {
      var res = await fetch(cfg.supportApiUrl + '/' + encodeURIComponent(support.conversationId))
      if (!res.ok) return
      var data = await res.json()
      mergeRemote(data.messages || [])
      if (data.conversation && data.conversation.status) support.status = data.conversation.status
      if (data.queue) support.queue = data.queue
      save(cfg.supportKey, support)
      render()
    } catch (_) {}
  }
  function startPolling() {
    if (pollTimer) clearInterval(pollTimer)
    if (inLive()) { pollSupport(); pollTimer = setInterval(pollSupport, cfg.pollMs) }
  }

  async function send(textOverride, requestAgent) {
    var text = String(textOverride != null ? textOverride : input.value).trim()
    if (!text || sending) return
    history.push({ role: 'user', content: text, ts: Date.now() })
    persist()
    if (textOverride == null) input.value = ''
    sending = true
    error = ''
    render()
    try {
      if (inLive()) {
        var liveRes = await fetch(cfg.supportApiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text, conversationId: support.conversationId, topic: support.topic || location.hostname, visitor: contact }) })
        var liveData = await liveRes.json()
        if (!liveRes.ok) throw new Error(liveData.error || 'Support is unreachable')
        mergeRemote(liveData.messages || [])
      } else {
        var turns = history.filter(function (m) { return m.role === 'user' || m.role === 'assistant' }).map(function (m) { return { role: m.role, content: m.content } })
        var res = await fetch(cfg.apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: turns, requestAgent: !!requestAgent, visitor: contact, topic: cfg.topic || location.hostname, origin: originContext() }) })
        var data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Assistant is unreachable (' + res.status + ')')
        if (data.handoff && data.handoff.conversationId) {
          support = { conversationId: data.handoff.conversationId, status: data.handoff.status || 'waiting_for_agent', queue: data.handoff.queue || null, topic: location.hostname }
          save(cfg.supportKey, support)
          history.push({ role: 'system', content: data.reply || "I'm connecting you to live support.", ts: Date.now() })
          startPolling()
        } else if (data.reply) {
          history.push({ role: 'assistant', content: data.reply, ts: Date.now() })
        }
        persist()
      }
    } catch (e) {
      error = e && e.message ? e.message : 'Something went wrong.'
    } finally {
      sending = false
      render()
    }
  }

  launcher.addEventListener('click', function () { open = !open; save(cfg.openKey, open); render(); if (open) startPolling() })
  panel.querySelector('.ysa-close').addEventListener('click', function () { open = false; save(cfg.openKey, false); render() })
  panel.querySelector('.ysa-reset').addEventListener('click', function () { history = []; support = null; error = ''; persist(); save(cfg.supportKey, null); render() })
  sendButton.addEventListener('click', function () { send() })
  humanButton.addEventListener('click', function () { send("I'd like to talk to a human support agent.", true) })
  input.addEventListener('input', render)
  input.addEventListener('keydown', function (event) { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send() } })

  render()
  if (open) startPolling()
})()
