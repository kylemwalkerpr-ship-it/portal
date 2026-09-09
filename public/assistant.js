/**
 * YouSafe Quick Assistance Agent (YQAA) — canonical system-wide assistant embed.
 * Shared across YouSafe and sister sites.
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
    greeting: "Hi — I'm **YQAA**, the **YouSafe Quick Assistance Agent**. I can help with the page you're viewing, explain YouSafe services and processes, point you to verified resources, match your intent to relevant Marketplace services, or connect you with a person when needed.",
    storageKey: 'yousafe.assistant.history.v3',
    openKey: 'yousafe.assistant.open.v3',
    supportKey: 'yousafe.assistant.support.v3',
    contactKey: 'yousafe.assistant.contact.v3',
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
  function safeHref(value) {
    try {
      var url = new URL(String(value || ''), location.href)
      if (url.protocol === 'https:') return url.href
      if ((url.hostname === 'localhost' || url.hostname === '127.0.0.1') && url.protocol === 'http:') return url.href
    } catch (_) {}
    return ''
  }
  function formatEmphasis(text) {
    return esc(text)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/==([^=]+)==/g, '<span class="ysa-accent">$1</span>')
  }
  function inlineRich(raw) {
    var text = String(raw || '')
    var out = ''
    var last = 0
    var token = /\[([^\]]{1,220})\]\((https:\/\/[^)\s]+)\)|(https:\/\/[^\s<]+)/g
    var match
    while ((match = token.exec(text))) {
      out += formatEmphasis(text.slice(last, match.index))
      var href = safeHref(match[2] || match[3])
      if (!href) {
        out += formatEmphasis(match[0])
      } else {
        var label = match[1] || (new URL(href)).hostname.replace(/^www\./, '')
        out += '<a class="ysa-link" href="' + esc(href) + '" target="_blank" rel="noopener noreferrer">' + formatEmphasis(label) + '</a>'
      }
      last = token.lastIndex
    }
    out += formatEmphasis(text.slice(last))
    return out
  }
  function richText(raw) {
    var lines = String(raw || '').replace(/\r/g, '').split('\n')
    var html = ''
    var list = null
    function closeList() {
      if (!list) return
      html += '</' + list + '>'
      list = null
    }
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i]
      var trimmed = line.trim()
      if (!trimmed) { closeList(); continue }
      var h = trimmed.match(/^(#{1,3})\s+(.+)$/)
      if (h) {
        closeList()
        var level = Math.min(3, h[1].length + 2)
        html += '<h' + level + '>' + inlineRich(h[2]) + '</h' + level + '>'
        continue
      }
      var bullet = trimmed.match(/^[-•]\s+(.+)$/)
      if (bullet) {
        if (list !== 'ul') { closeList(); list = 'ul'; html += '<ul>' }
        html += '<li>' + inlineRich(bullet[1]) + '</li>'
        continue
      }
      var numbered = trimmed.match(/^\d+[.)]\s+(.+)$/)
      if (numbered) {
        if (list !== 'ol') { closeList(); list = 'ol'; html += '<ol>' }
        html += '<li>' + inlineRich(numbered[1]) + '</li>'
        continue
      }
      closeList()
      html += '<p>' + inlineRich(trimmed) + '</p>'
    }
    closeList()
    return html
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
  var failure = null
  var lastFailedRequest = null
  var pollTimer = null
  var maxVisualHeight = 0
  var progressStartedAt = 0
  var progressTimer = null
  var progressAttempt = 1
  var progressManualRetry = false
  var progressInterrupted = false

  var PROGRESS_STAGES = [
    { after: 0, text: 'Thinking about your question' },
    { after: 2200, text: 'Checking YouSafe knowledge' },
    { after: 5200, text: 'Researching the most relevant details' },
    { after: 9000, text: 'Preparing your answer' },
    { after: 13500, text: 'Typing your response' },
    { after: 22000, text: 'Still working on your answer' },
  ]

  function persist() { save(cfg.storageKey, history.slice(-cfg.maxPersisted)) }
  function inLive() {
    return !!(support && support.conversationId && support.status !== 'resolved' && support.status !== 'closed')
  }
  function currentProgressStage() {
    var elapsed = Math.max(0, Date.now() - progressStartedAt)
    var stage = PROGRESS_STAGES[0]
    for (var i = 0; i < PROGRESS_STAGES.length; i++) {
      if (elapsed >= PROGRESS_STAGES[i].after) stage = PROGRESS_STAGES[i]
      else break
    }
    return { text: stage.text, elapsedMs: elapsed }
  }
  function startProgress(manualRetry) {
    stopProgress()
    progressStartedAt = Date.now()
    progressAttempt = 1
    progressManualRetry = !!manualRetry
    progressInterrupted = false
    progressTimer = window.setInterval(function () {
      if (sending) render()
      else stopProgress()
    }, 1000)
  }
  function stopProgress() {
    if (progressTimer) window.clearInterval(progressTimer)
    progressTimer = null
  }
  function noteAutomaticRetry() {
    progressAttempt += 1
    progressInterrupted = true
    render()
  }
  function progressMarkup() {
    var state = currentProgressStage()
    var seconds = Math.max(1, Math.round(state.elapsedMs / 1000))
    var mainText = progressInterrupted
      ? 'First attempt interrupted — retrying automatically'
      : progressManualRetry
        ? 'Retrying your request'
        : state.text
    var meta = progressInterrupted
      ? 'Attempt ' + progressAttempt + ' · YQAA is still working'
      : (state.elapsedMs >= 6000 ? 'Working · ' + seconds + 's' : 'YQAA is working')
    return '<div class="ysa-progress" role="status" aria-live="polite"><div class="ysa-progress-line"><span class="ysa-progress-dots" aria-hidden="true"><i></i><i></i><i></i></span><strong>' + esc(mainText) + '…</strong></div><div class="ysa-progress-meta">' + esc(meta) + '</div></div>'
  }

  var style = document.createElement('style')
  style.textContent = [
    '.ysa-launcher{position:fixed;right:20px;bottom:max(20px,env(safe-area-inset-bottom));width:58px;height:58px;border:0;border-radius:50%;background:' + cfg.primary + ';color:#fff;box-shadow:0 14px 34px rgba(15,23,42,.28);cursor:pointer;z-index:2147483600;font-size:23px}',
    '.ysa-launcher:hover{background:' + cfg.primaryHover + '}',
    '.ysa-panel{position:fixed;right:20px;bottom:max(90px,calc(70px + env(safe-area-inset-bottom)));width:390px;max-width:calc(100vw - 40px);height:600px;max-height:calc(100dvh - 120px);background:#fff;border:1px solid rgba(60,59,110,.14);border-radius:20px;box-shadow:0 28px 72px rgba(15,23,42,.24);overflow:hidden;display:flex;flex-direction:column;z-index:2147483600;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#111827}',
    '.ysa-head{padding:14px 16px;background:' + cfg.primary + ';color:#fff;display:flex;align-items:center;gap:11px;flex:0 0 auto}.ysa-avatar{width:38px;height:38px;flex:0 0 38px;border-radius:50%;background:rgba(255,255,255,.17);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:850;letter-spacing:.02em}.ysa-title{flex:1;min-width:0}.ysa-name{font-size:15px;font-weight:850;letter-spacing:-.01em;line-height:1.15}.ysa-sub{font-size:11px;opacity:.84;margin-top:2px}.ysa-head button{border:0;background:rgba(255,255,255,.13);color:#fff;border-radius:9px;cursor:pointer;padding:7px 10px;min-height:36px;font-weight:650}',
    '.ysa-stream{flex:1 1 auto;min-height:0;overflow:auto;padding:16px;background:linear-gradient(180deg,#fafbff 0%,#f7f8fb 100%);display:flex;flex-direction:column;gap:12px;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}.ysa-row{display:flex;flex-direction:column;align-items:flex-start}.ysa-row.user{align-items:flex-end}.ysa-label{font-size:10px;color:#8b93a7;margin-bottom:4px;font-weight:800;text-transform:uppercase;letter-spacing:.055em}.ysa-bubble{max-width:88%;padding:11px 14px;border-radius:14px;font-size:14px;line-height:1.52;overflow-wrap:anywhere;background:#fff;border:1px solid #e2e5ec;box-shadow:0 1px 2px rgba(15,23,42,.03)}.ysa-bubble p{margin:0 0 10px}.ysa-bubble p:last-child{margin-bottom:0}.ysa-bubble strong{font-weight:800;color:#161a2d}.ysa-bubble em{font-style:italic}.ysa-bubble h3,.ysa-bubble h4,.ysa-bubble h5{margin:10px 0 6px;color:#252657;line-height:1.28}.ysa-bubble h3:first-child,.ysa-bubble h4:first-child,.ysa-bubble h5:first-child{margin-top:0}.ysa-bubble ul,.ysa-bubble ol{margin:6px 0 10px;padding-left:22px}.ysa-bubble li{margin:5px 0}.ysa-link{color:#3736a3;font-weight:750;text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:2px}.ysa-accent{color:#38378f;font-weight:800}.ysa-row.user .ysa-bubble{background:' + cfg.primary + ';color:#fff;border-color:' + cfg.primary + ';box-shadow:none;white-space:pre-wrap}.ysa-row.user .ysa-bubble strong{color:#fff}.ysa-row.agent .ysa-bubble{background:#ecfdf3;color:#14532d;border-color:#a7f3d0}.ysa-row.system .ysa-bubble{background:#fff8e7;color:#713f12;border-color:#fde68a}',
    '.ysa-progress{min-width:220px}.ysa-progress-line{display:flex;align-items:center;gap:9px}.ysa-progress-line strong{font-weight:750;color:#292b48}.ysa-progress-meta{margin-top:5px;font-size:11px;color:#7d8497}.ysa-progress-dots{display:inline-flex;align-items:center;gap:3px;flex:0 0 auto}.ysa-progress-dots i{display:block;width:6px;height:6px;border-radius:50%;background:' + cfg.primary + ';opacity:.28;animation:ysa-progress-pulse 1.15s infinite ease-in-out}.ysa-progress-dots i:nth-child(2){animation-delay:.16s}.ysa-progress-dots i:nth-child(3){animation-delay:.32s}@keyframes ysa-progress-pulse{0%,70%,100%{opacity:.25;transform:translateY(0)}35%{opacity:1;transform:translateY(-2px)}}@media(prefers-reduced-motion:reduce){.ysa-progress-dots i{animation:none;opacity:.65}}',
    '.ysa-cta{display:block;box-sizing:border-box;width:min(88%,330px);margin-top:7px;padding:12px 13px;border:1px solid rgba(60,59,110,.18);border-radius:13px;background:#fff;color:#1f2340;text-decoration:none;box-shadow:0 6px 18px rgba(60,59,110,.07)}.ysa-cta:hover{border-color:rgba(60,59,110,.38);transform:translateY(-1px)}.ysa-cta-kicker{display:block;font-size:9px;font-weight:850;letter-spacing:.08em;text-transform:uppercase;color:#777fa0;margin-bottom:4px}.ysa-cta strong{display:block;color:' + cfg.primary + ';font-size:14px;margin-bottom:3px}.ysa-cta span:last-child{font-size:11px;color:#697086}',
    '.ysa-error{font-size:12px;color:#8f1d1d;background:#fff1f1;border:1px solid #fecaca;border-radius:12px;padding:10px 11px}.ysa-error-actions{display:flex;gap:7px;margin-top:8px}.ysa-retry,.ysa-error-human{border:0;border-radius:9px;min-height:34px;padding:0 11px;font:700 12px inherit;cursor:pointer}.ysa-retry{background:' + cfg.primary + ';color:#fff}.ysa-error-human{background:#fff;color:' + cfg.primary + ';border:1px solid #d8dbea}.ysa-human{padding:7px 12px;text-align:center;flex:0 0 auto;background:#fff}.ysa-human button{border:1px dashed #cbd5e1;background:#fff;color:' + cfg.primary + ';border-radius:999px;padding:8px 14px;font-weight:750;cursor:pointer;min-height:40px}.ysa-compose{border-top:1px solid #e5e7eb;padding:10px 12px;display:flex;gap:8px;align-items:flex-end;flex:0 0 auto;background:#fff}.ysa-input{box-sizing:border-box;flex:1;min-width:0;min-height:40px;max-height:120px;resize:none;border:1px solid #d1d5db;border-radius:11px;padding:9px 11px;font-family:inherit;font-size:14px;line-height:1.35;color:#111827;background:#fff;-webkit-text-size-adjust:100%}.ysa-send{height:40px;flex:0 0 auto;border:0;border-radius:10px;background:' + cfg.primary + ';color:#fff;padding:0 15px;font-weight:800;cursor:pointer}.ysa-send:disabled{opacity:.5}',
    '@media(max-width:768px){html.ysa-assistant-open,html.ysa-assistant-open body{overflow:hidden!important;overscroll-behavior:none}.ysa-launcher{right:12px}.ysa-panel{left:8px;right:8px;top:8px;bottom:auto;width:auto;max-width:none;height:calc(100dvh - 16px);max-height:none;border-radius:20px}.ysa-head{padding:12px}.ysa-name{font-size:14px}.ysa-sub{font-size:10px}.ysa-stream{padding:14px}.ysa-bubble{max-width:92%;font-size:15px;line-height:1.48}.ysa-cta{width:92%;max-width:none}.ysa-human{padding:6px 10px}.ysa-compose{padding:8px 10px max(8px,env(safe-area-inset-bottom))}.ysa-input{min-height:44px;font-size:16px;line-height:1.35;padding:10px 12px}.ysa-send{height:44px;min-width:66px}.ysa-panel.ysa-keyboard-open .ysa-head{padding:8px 10px}.ysa-panel.ysa-keyboard-open .ysa-avatar{width:30px;height:30px;flex-basis:30px}.ysa-panel.ysa-keyboard-open .ysa-sub{display:none}.ysa-panel.ysa-keyboard-open .ysa-stream{padding:10px 12px;gap:8px}.ysa-panel.ysa-keyboard-open .ysa-human{padding:4px 10px}.ysa-panel.ysa-keyboard-open .ysa-compose{padding-bottom:8px}}',
  ].join('\n')
  document.head.appendChild(style)

  var launcher = document.createElement('button')
  launcher.type = 'button'
  launcher.className = 'ysa-launcher'
  launcher.setAttribute('aria-label', 'Open YQAA')
  launcher.textContent = '✦'

  var panel = document.createElement('section')
  panel.className = 'ysa-panel'
  panel.setAttribute('role', 'dialog')
  panel.setAttribute('aria-label', 'YouSafe Quick Assistance Agent')
  panel.innerHTML = '<div class="ysa-head"><div class="ysa-avatar">YQ</div><div class="ysa-title"><div class="ysa-name">YouSafe Quick Assistance Agent</div><div class="ysa-sub">YQAA · AI-powered support</div></div><button class="ysa-reset" type="button" title="Start a new conversation">New chat</button><button class="ysa-close" type="button" title="Close">×</button></div><div class="ysa-stream" aria-live="polite"></div><div class="ysa-human"><button type="button">Talk to a human →</button></div><div class="ysa-compose"><textarea class="ysa-input" rows="1" placeholder="Ask YQAA…"></textarea><button class="ysa-send" type="button">Send</button></div>'
  document.body.appendChild(launcher)
  document.body.appendChild(panel)

  var stream = panel.querySelector('.ysa-stream')
  var input = panel.querySelector('.ysa-input')
  var sendButton = panel.querySelector('.ysa-send')
  var humanButton = panel.querySelector('.ysa-human button')

  function isMobileAssistant() {
    return !!(window.matchMedia && window.matchMedia('(max-width: 768px)').matches)
  }
  function setPanelImportant(prop, value) {
    panel.style.setProperty(prop, value, 'important')
  }
  function clearMobilePanelLayout() {
    ;['left', 'right', 'top', 'bottom', 'width', 'max-width', 'height', 'max-height', 'border-radius'].forEach(function (prop) {
      panel.style.removeProperty(prop)
    })
    panel.classList.remove('ysa-keyboard-open')
  }
  function syncVisualViewport() {
    if (!isMobileAssistant()) {
      clearMobilePanelLayout()
      return
    }
    var vv = window.visualViewport
    var height = Math.max(1, Math.round(vv ? vv.height : window.innerHeight || document.documentElement.clientHeight || 1))
    var top = Math.max(0, Math.round(vv ? vv.offsetTop : 0))
    var inputFocused = document.activeElement === input
    if (!inputFocused) maxVisualHeight = Math.max(maxVisualHeight, height)
    if (!maxVisualHeight) maxVisualHeight = height
    var keyboardOpen = inputFocused && maxVisualHeight - height > 80
    panel.classList.toggle('ysa-keyboard-open', keyboardOpen)
    if (keyboardOpen) {
      setPanelImportant('left', '0px'); setPanelImportant('right', '0px'); setPanelImportant('top', top + 'px')
      setPanelImportant('bottom', 'auto'); setPanelImportant('width', 'auto'); setPanelImportant('max-width', 'none')
      setPanelImportant('height', height + 'px'); setPanelImportant('max-height', height + 'px'); setPanelImportant('border-radius', '0px')
    } else {
      var inset = 8
      setPanelImportant('left', inset + 'px'); setPanelImportant('right', inset + 'px'); setPanelImportant('top', (top + inset) + 'px')
      setPanelImportant('bottom', 'auto'); setPanelImportant('width', 'auto'); setPanelImportant('max-width', 'none')
      setPanelImportant('height', Math.max(1, height - inset * 2) + 'px'); setPanelImportant('max-height', Math.max(1, height - inset * 2) + 'px'); setPanelImportant('border-radius', '20px')
    }
  }
  function scheduleViewportSync() {
    syncVisualViewport()
    window.setTimeout(syncVisualViewport, 60)
    window.setTimeout(syncVisualViewport, 240)
  }
  function resizeInput() {
    if (!input) return
    input.style.height = 'auto'
    input.style.height = Math.min(120, Math.max(44, input.scrollHeight || 44)) + 'px'
  }
  function marketplaceCard(rec) {
    if (!rec || !rec.url) return ''
    var href = safeHref(rec.url)
    if (!href) return ''
    var name = rec.subcategoryName || rec.categoryName || 'YouSafe Marketplace'
    return '<a class="ysa-cta" href="' + esc(href) + '" target="_blank" rel="noopener noreferrer"><span class="ysa-cta-kicker">Matched to your inquiry</span><strong>Explore ' + esc(name) + ' →</strong><span>Browse relevant services in YouSafe Marketplace</span></a>'
  }
  function render() {
    panel.style.display = open ? 'flex' : 'none'
    launcher.textContent = open ? '×' : '✦'
    document.documentElement.classList.toggle('ysa-assistant-open', open && isMobileAssistant())
    if (open) syncVisualViewport()
    else panel.classList.remove('ysa-keyboard-open')

    var visible = history.length ? history : [{ role: 'assistant', content: cfg.greeting }]
    var html = ''
    for (var i = 0; i < visible.length; i++) {
      var item = visible[i]
      var label = item.role === 'assistant' ? 'YQAA' : item.role === 'agent' ? (item.senderName || 'Support') : item.role === 'system' ? 'YouSafe' : ''
      var body = item.role === 'user' ? esc(item.content) : richText(item.content)
      html += '<div class="ysa-row ' + esc(item.role) + '">' + (label ? '<div class="ysa-label">' + esc(label) + '</div>' : '') + '<div class="ysa-bubble">' + body + '</div>' + marketplaceCard(item.marketplaceRecommendation) + '</div>'
    }
    if (sending) html += '<div class="ysa-row assistant"><div class="ysa-label">YQAA</div><div class="ysa-bubble">' + progressMarkup() + '</div></div>'
    if (failure) {
      html += '<div class="ysa-error"><strong>' + esc(failure.message || 'That response could not be completed.') + '</strong><div class="ysa-error-actions">' + (failure.retryable ? '<button class="ysa-retry" type="button">Retry</button>' : '') + '<button class="ysa-error-human" type="button">Ask a human</button></div></div>'
    }
    stream.innerHTML = html
    stream.scrollTop = stream.scrollHeight
    sendButton.disabled = sending || !input.value.trim()
    humanButton.style.display = inLive() ? 'none' : 'inline-block'
  }
  function closeAssistant() {
    open = false
    save(cfg.openKey, false)
    if (document.activeElement === input) input.blur()
    render()
    scheduleViewportSync()
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
  function wait(ms) { return new Promise(function (resolve) { window.setTimeout(resolve, ms) }) }
  async function fetchJsonWithNetworkRecovery(url, options) {
    var lastError = null
    for (var attempt = 0; attempt < 2; attempt++) {
      var controller = typeof AbortController !== 'undefined' ? new AbortController() : null
      var timer = controller ? window.setTimeout(function () { controller.abort() }, 70000) : null
      try {
        var res = await fetch(url, Object.assign({}, options, controller ? { signal: controller.signal } : {}))
        var data = await res.json().catch(function () { return {} })
        if (timer) window.clearTimeout(timer)
        return { res: res, data: data }
      } catch (err) {
        if (timer) window.clearTimeout(timer)
        lastError = err
        if (attempt === 0) {
          noteAutomaticRetry()
          await wait(650)
        }
      }
    }
    throw lastError || new Error('Network request failed')
  }

  async function send(textOverride, requestAgent, retryExisting) {
    var text = String(textOverride != null ? textOverride : input.value).trim()
    if (!text || sending) return
    if (!retryExisting) {
      history.push({ role: 'user', content: text, ts: Date.now() })
      persist()
    }
    if (textOverride == null) {
      input.value = ''
      resizeInput()
    }
    sending = true
    failure = null
    startProgress(!!retryExisting)
    render()
    try {
      if (inLive()) {
        var live = await fetchJsonWithNetworkRecovery(cfg.supportApiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text, conversationId: support.conversationId, topic: support.topic || location.hostname, visitor: contact }) })
        if (!live.res.ok) throw Object.assign(new Error(live.data.error || 'Support is temporarily unreachable'), { retryable: true })
        mergeRemote(live.data.messages || [])
      } else {
        var turns = history.filter(function (m) { return m.role === 'user' || m.role === 'assistant' }).map(function (m) { return { role: m.role, content: m.content } })
        var result = await fetchJsonWithNetworkRecovery(cfg.apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: turns, requestAgent: !!requestAgent, visitor: contact, topic: cfg.topic || location.hostname, origin: originContext() }) })
        var data = result.data
        if (!result.res.ok) throw Object.assign(new Error(data.error || 'YQAA is temporarily unavailable.'), { retryable: data.retryable !== false, marketplaceRecommendation: data.marketplaceRecommendation || null })
        if (data.handoff && data.handoff.conversationId) {
          support = { conversationId: data.handoff.conversationId, status: data.handoff.status || 'waiting_for_agent', queue: data.handoff.queue || null, topic: location.hostname }
          save(cfg.supportKey, support)
          history.push({ role: 'system', content: data.reply || "I'm connecting you to live support.", ts: Date.now() })
          startPolling()
        } else if (data.reply) {
          history.push({ role: 'assistant', content: data.reply, marketplaceRecommendation: data.marketplaceRecommendation || null, ts: Date.now() })
        }
        persist()
      }
      lastFailedRequest = null
    } catch (e) {
      var networkMessage = e && e.name === 'AbortError' ? 'The response took too long to complete.' : (e && e.message ? e.message : 'The connection was interrupted.')
      failure = { message: networkMessage, retryable: !e || e.retryable !== false }
      lastFailedRequest = { text: text, requestAgent: !!requestAgent }
    } finally {
      sending = false
      stopProgress()
      render()
    }
  }
  function retryLast() {
    if (!lastFailedRequest || sending) return
    send(lastFailedRequest.text, lastFailedRequest.requestAgent, true)
  }

  launcher.addEventListener('click', function () {
    if (open) { closeAssistant(); return }
    open = true
    save(cfg.openKey, true)
    render(); scheduleViewportSync(); startPolling()
  })
  panel.querySelector('.ysa-close').addEventListener('click', closeAssistant)
  panel.querySelector('.ysa-reset').addEventListener('click', function () {
    history = []; support = null; failure = null; lastFailedRequest = null
    stopProgress()
    persist(); save(cfg.supportKey, null); render()
  })
  sendButton.addEventListener('click', function () { send() })
  humanButton.addEventListener('click', function () { send("I'd like to talk to a human support agent.", true) })
  stream.addEventListener('click', function (event) {
    var target = event.target
    if (target && target.closest && target.closest('.ysa-retry')) retryLast()
    if (target && target.closest && target.closest('.ysa-error-human')) send("I'd like to talk to a human support agent.", true)
  })
  input.addEventListener('input', function () { resizeInput(); render() })
  input.addEventListener('focus', scheduleViewportSync)
  input.addEventListener('blur', scheduleViewportSync)
  input.addEventListener('keydown', function (event) { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send() } })

  window.addEventListener('resize', syncVisualViewport, { passive: true })
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', syncVisualViewport, { passive: true })
    window.visualViewport.addEventListener('scroll', syncVisualViewport, { passive: true })
  }

  resizeInput()
  render()
  scheduleViewportSync()
  if (open) startPolling()
})()