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
    archiveKey: 'yousafe.assistant.archive.v1',
    maxPersisted: 30,
    maxArchived: 5,
    pollMs: 5000,
    botName: 'YQAA',
    botTitle: 'YouSafe Assistant',
    privacyUrl: 'https://usa.yousafeconsultancy.com/privacy-policy/',
  }, window.YOUSAFE_ASSISTANT_CONFIG || {})
  var customGreeting = !!(window.YOUSAFE_ASSISTANT_CONFIG && window.YOUSAFE_ASSISTANT_CONFIG.greeting)

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
  if (!contact || typeof contact !== 'object' || !contact.email) contact = null
  var archive = load(cfg.archiveKey, [])
  if (!Array.isArray(archive)) archive = []
  var view = contact ? 'chat' : 'intake'
  var transcriptIndex = -1
  var confirmOpen = false
  var stickToBottom = true
  var forceScroll = true
  var unseen = false
  var lastStreamHtml = ''
  var lastHistoryHtml = ''
  var lastRenderedCount = 0
  var lastLauncherOpen = null
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
  function supportOwnsConversation() {
    if (!inLive()) return false
    var mode = String((support && support.mode) || '').toLowerCase()
    if (mode === 'explicit' || mode === 'required' || mode === 'active') return true
    // Legacy automatic handoffs may still be sitting in localStorage after the
    // routing repair. While they are only waiting in a queue, keep YQAA usable.
    var status = String((support && support.status) || '').toLowerCase()
    return ['waiting_for_agent', 'queued', 'waiting', 'pending'].indexOf(status) === -1
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
      if (sending) tickProgress()
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
  var P = cfg.primary
  var ORB = 'radial-gradient(circle at 30% 25%,#8b89f0 0%,' + P + ' 55%,#17163a 100%)'
  var AVATAR_SVG = '<svg viewBox="0 0 40 40" aria-hidden="true" focusable="false"><path d="M20 6.5v4.2" stroke="#fff" stroke-width="2" stroke-linecap="round"/><circle cx="20" cy="6" r="2" fill="#9ef0c9"/><rect x="8.5" y="11.5" width="23" height="18" rx="9" fill="#fff"/><circle cx="15.8" cy="20.5" r="2.3" fill="#24235a"/><circle cx="24.2" cy="20.5" r="2.3" fill="#24235a"/><path d="M16.5 25.2c2.1 1.4 4.9 1.4 7 0" stroke="#24235a" stroke-width="1.6" stroke-linecap="round" fill="none"/></svg>'
  var ICON_NEW = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>'
  var ICON_CLOCK = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/></svg>'
  var ICON_CLOSE = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>'
  var ICON_SEND = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>'
  var ICON_DOWN = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>'

  var style = document.createElement('style')
  style.textContent = [
    '.ysa-launcher{position:fixed;right:20px;bottom:max(20px,env(safe-area-inset-bottom));width:62px;height:62px;padding:0;border:0;border-radius:50%;background:' + ORB + ';color:#fff;box-shadow:0 16px 38px rgba(23,22,58,.38),inset 0 1px 0 rgba(255,255,255,.35);cursor:pointer;z-index:2147483600;display:flex;align-items:center;justify-content:center;transition:none;transform:none}',
    '.ysa-launcher::before{content:"";position:absolute;inset:-5px;border-radius:50%;border:2px solid rgba(139,137,240,.5);animation:ysa-halo 2.8s ease-in-out infinite;pointer-events:none}@keyframes ysa-halo{0%,100%{opacity:.2}50%{opacity:.9}}.ysa-launcher svg{width:36px;height:36px;display:block}.ysa-launcher .ysa-dot{position:absolute;right:3px;bottom:4px;width:13px;height:13px;border-radius:50%;background:#22c55e;border:2px solid #fff}.ysa-launcher:hover{box-shadow:0 20px 46px rgba(23,22,58,.5),inset 0 1px 0 rgba(255,255,255,.4)}.ysa-launcher.ysa-is-open::before{display:none}.ysa-launcher.ysa-is-open svg{width:26px;height:26px}@media(prefers-reduced-motion:reduce){.ysa-launcher::before{animation:none;opacity:.5}}',
    '.ysa-launcher.ysa-launcher-away,[hidden].ysa-launcher{display:none!important;pointer-events:none!important}',
    'body:has(.ys-market-chat-overlay) .ysa-launcher,body:has(.ys-market-chat-overlay) .ysa-panel,body:has(.ys-market-chat-composer) .ysa-launcher,body:has(.ys-market-chat-composer) .ysa-panel,body:has(.ys-chatscreen[data-mobile-view="chat"]) .ysa-launcher,body:has(.ys-chatscreen[data-mobile-view="chat"]) .ysa-panel,body:has([data-ysa-hide-launcher="true"]) .ysa-launcher,body:has([data-ysa-hide-launcher="true"]) .ysa-panel{display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important}',
    '.ysa-panel{position:fixed;right:20px;bottom:max(94px,calc(74px + env(safe-area-inset-bottom)));width:400px;max-width:calc(100vw - 40px);height:640px;max-height:calc(100dvh - 120px);background:#fff;border:1px solid rgba(60,59,110,.12);border-radius:24px;box-shadow:0 32px 80px rgba(23,22,58,.28),0 2px 6px rgba(23,22,58,.06);overflow:hidden;display:flex;flex-direction:column;z-index:2147483600;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#111827;margin:0;padding:0;box-sizing:border-box;text-align:left;line-height:1.4}.ysa-panel *,.ysa-panel *::before,.ysa-panel *::after{box-sizing:border-box}.ysa-panel button{text-transform:none;letter-spacing:normal}.ysa-panel [hidden]{display:none!important}',
    '.ysa-head{padding:14px 12px 14px 16px;background:linear-gradient(135deg,#17163a 0%,' + P + ' 100%);color:#fff;display:flex;align-items:center;gap:8px;flex:0 0 auto}.ysa-avatar{width:40px;height:40px;flex:0 0 40px;margin-right:3px;border-radius:50%;background:' + ORB + ';box-shadow:0 0 0 2px rgba(255,255,255,.18),0 6px 16px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;position:relative}.ysa-avatar svg{width:27px;height:27px}.ysa-avatar .ysa-dot{position:absolute;right:-1px;bottom:-1px;width:11px;height:11px;border-radius:50%;background:#22c55e;border:2px solid #1f1e4a}.ysa-title{flex:1;min-width:0}.ysa-name{font-size:15.5px;font-weight:850;letter-spacing:-.01em;line-height:1.15}.ysa-sub{font-size:11.5px;opacity:.8;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ysa-iconbtn{border:0;background:rgba(255,255,255,.12);color:#fff;border-radius:11px;cursor:pointer;width:36px;height:36px;flex:0 0 36px;display:inline-flex;align-items:center;justify-content:center;padding:0}.ysa-iconbtn:hover{background:rgba(255,255,255,.24)}.ysa-iconbtn svg{width:18px;height:18px}',
    '.ysa-intake{flex:1 1 auto;min-height:0;overflow:auto;padding:26px 22px 20px;background:radial-gradient(120% 55% at 50% 0%,#eef0ff 0%,#fff 62%);display:flex;flex-direction:column;gap:14px;margin:0}.ysa-hero{text-align:center;margin-bottom:4px}.ysa-orb{width:70px;height:70px;margin:0 auto 12px;border-radius:50%;background:' + ORB + ';display:flex;align-items:center;justify-content:center;position:relative;box-shadow:0 14px 30px rgba(60,59,110,.35)}.ysa-orb svg{width:44px;height:44px}.ysa-orb .ysa-dot{position:absolute;right:3px;bottom:4px;width:14px;height:14px;border-radius:50%;background:#22c55e;border:2px solid #fff}.ysa-hero h2{margin:0 0 6px;font-size:20px;font-weight:850;color:#17163a;letter-spacing:-.02em}.ysa-hero p{margin:0;font-size:13.5px;line-height:1.55;color:#5b6275}.ysa-field{display:flex;flex-direction:column;gap:6px}.ysa-field span{font-size:12px;font-weight:750;color:#374151}.ysa-field input{width:100%;box-sizing:border-box;min-height:46px;border:1px solid #d6d9e6;border-radius:12px;padding:11px 13px;font-size:16px;font-family:inherit;color:#111827;background:#fff}.ysa-field input:focus{outline:none;border-color:#6d6bd8;box-shadow:0 0 0 4px rgba(109,107,216,.15)}.ysa-form-error{color:#b42318;font-size:12.5px;min-height:16px;margin-top:-6px}.ysa-primary{min-height:48px;border:0;border-radius:14px;background:linear-gradient(135deg,' + P + ',#5b59c9);color:#fff;font-weight:800;font-size:15px;font-family:inherit;cursor:pointer;box-shadow:0 10px 24px rgba(60,59,110,.28)}.ysa-primary:hover{filter:brightness(1.07)}.ysa-note{margin:0;font-size:11.5px;color:#6b7280;line-height:1.45;text-align:center}.ysa-note a{color:' + P + '}',
    '.ysa-streamwrap{position:relative;flex:1 1 auto;min-height:0;display:flex;flex-direction:column}',
    '.ysa-stream{flex:1 1 auto;min-height:0;overflow:auto;padding:18px 14px 14px;background:#f6f7fb;display:flex;flex-direction:column;gap:14px;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;position:relative}.ysa-row{display:flex;align-items:flex-end;gap:8px}.ysa-row.user{justify-content:flex-end}.ysa-col{display:flex;flex-direction:column;align-items:flex-start;min-width:0;max-width:86%}.ysa-row.user .ysa-col{align-items:flex-end}.ysa-mini{width:28px;height:28px;flex:0 0 28px;margin-bottom:18px;border-radius:50%;background:' + ORB + ';display:flex;align-items:center;justify-content:center;box-shadow:0 3px 8px rgba(23,22,58,.18)}.ysa-mini svg{width:19px;height:19px}.ysa-mini-agent{background:#16a34a;color:#fff;font-size:10px;font-weight:800}.ysa-label{font-size:10px;color:#8b93a7;margin:0 0 4px 4px;font-weight:800;text-transform:uppercase;letter-spacing:.055em}.ysa-time{font-size:10px;color:#a0a6b8;margin:4px 6px 0}.ysa-bubble{max-width:100%;box-sizing:border-box;padding:11px 14px;border-radius:18px 18px 18px 6px;font-size:14px;line-height:1.55;overflow-wrap:anywhere;background:#fff;border:1px solid #e6e8f0;box-shadow:0 2px 8px rgba(23,22,58,.05)}.ysa-bubble p{margin:0 0 10px}.ysa-bubble p:last-child{margin-bottom:0}.ysa-bubble strong{font-weight:800;color:#161a2d}.ysa-bubble em{font-style:italic}.ysa-bubble h3,.ysa-bubble h4,.ysa-bubble h5{margin:10px 0 6px;color:#252657;line-height:1.28}.ysa-bubble h3:first-child,.ysa-bubble h4:first-child,.ysa-bubble h5:first-child{margin-top:0}.ysa-bubble ul,.ysa-bubble ol{margin:6px 0 10px;padding-left:22px}.ysa-bubble li{margin:5px 0}.ysa-link{color:#3736a3;font-weight:750;text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:2px}.ysa-accent{color:#38378f;font-weight:800}.ysa-row.user .ysa-bubble{border-radius:18px 18px 6px 18px;background:linear-gradient(135deg,' + P + ',#5b59c9);color:#fff;border-color:transparent;box-shadow:0 6px 16px rgba(60,59,110,.25);white-space:pre-wrap}.ysa-row.user .ysa-bubble strong{color:#fff}.ysa-row.agent .ysa-bubble{background:#ecfdf3;color:#14532d;border-color:#a7f3d0}.ysa-row.system .ysa-bubble{background:#fff8e7;color:#713f12;border-color:#fde68a}',
    '.ysa-chips{display:flex;flex-wrap:wrap;gap:8px;margin:-4px 0 0 36px}.ysa-chip{border:1px solid #d9dcf0;background:#fff;color:' + P + ';border-radius:999px;padding:8px 12px;font-weight:650;font-size:12.5px;font-family:inherit;cursor:pointer;box-shadow:0 1px 3px rgba(23,22,58,.05)}.ysa-chip:hover{background:#f1f1ff;border-color:#bfc2ec}',
    '.ysa-jump{position:absolute;left:50%;bottom:12px;transform:translateX(-50%);display:inline-flex;align-items:center;gap:6px;border:0;border-radius:999px;background:#17163a;color:#fff;padding:8px 14px;font-weight:700;font-size:12.5px;font-family:inherit;cursor:pointer;box-shadow:0 8px 22px rgba(23,22,58,.35);z-index:1}.ysa-jump svg{width:15px;height:15px}',
    '.ysa-progress{min-width:200px}.ysa-progress-line{display:flex;align-items:center;gap:9px}.ysa-progress-line strong{font-weight:750;color:#292b48}.ysa-progress-meta{margin-top:5px;font-size:11px;color:#7d8497}.ysa-progress-dots{display:inline-flex;align-items:center;gap:3px;flex:0 0 auto}.ysa-progress-dots i{display:block;width:6px;height:6px;border-radius:50%;background:' + P + ';opacity:.28;animation:ysa-progress-pulse 1.15s infinite ease-in-out}.ysa-progress-dots i:nth-child(2){animation-delay:.16s}.ysa-progress-dots i:nth-child(3){animation-delay:.32s}@keyframes ysa-progress-pulse{0%,70%,100%{opacity:.25;transform:translateY(0)}35%{opacity:1;transform:translateY(-2px)}}@media(prefers-reduced-motion:reduce){.ysa-progress-dots i{animation:none;opacity:.65}}',
    '.ysa-cta{display:block;box-sizing:border-box;width:min(100%,330px);margin-top:7px;padding:12px 13px;border:1px solid rgba(60,59,110,.18);border-radius:14px;background:#fff;color:#1f2340;text-decoration:none;box-shadow:0 6px 18px rgba(60,59,110,.07)}.ysa-cta:hover{border-color:rgba(60,59,110,.38)}.ysa-cta-kicker{display:block;font-size:9px;font-weight:850;letter-spacing:.08em;text-transform:uppercase;color:#777fa0;margin-bottom:4px}.ysa-cta strong{display:block;color:' + P + ';font-size:14px;margin-bottom:3px}.ysa-cta span:last-child{font-size:11px;color:#697086}',
    '.ysa-error{font-size:12.5px;color:#8f1d1d;background:#fff1f1;border:1px solid #fecaca;border-radius:14px;padding:10px 12px;margin-left:36px}.ysa-error-actions{display:flex;gap:7px;margin-top:8px}.ysa-retry,.ysa-error-human{border:0;border-radius:10px;min-height:34px;padding:0 12px;font-weight:700;font-size:12px;font-family:inherit;cursor:pointer}.ysa-retry{background:' + P + ';color:#fff}.ysa-error-human{background:#fff;color:' + P + ';border:1px solid #d8dbea}',
    '.ysa-history{flex:1 1 auto;min-height:0;overflow:auto;background:#f6f7fb;display:flex;flex-direction:column}.ysa-subbar{position:sticky;top:0;z-index:1;display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid #eceef5;background:#fff}.ysa-subbar strong{flex:1;min-width:0;font-size:14px;color:#1f2340;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ysa-ghost{border:0;background:#f1f2f8;color:' + P + ';border-radius:10px;padding:7px 11px;font-weight:700;font-size:12.5px;font-family:inherit;cursor:pointer}.ysa-hlist{padding:14px;display:flex;flex-direction:column;gap:10px}.ysa-hitem{display:block;width:100%;box-sizing:border-box;text-align:left;border:1px solid #e3e6f0;background:#fff;border-radius:14px;padding:12px 14px;cursor:pointer;font-family:inherit}.ysa-hitem:hover{border-color:#bfc2ec}.ysa-hitem strong{display:block;font-size:13.5px;color:#1f2340;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ysa-hitem span{display:block;margin-top:3px;font-size:11.5px;color:#7d8497}.ysa-empty{padding:40px 24px;text-align:center;color:#7d8497;font-size:13px}.ysa-transcript{padding:16px 14px;display:flex;flex-direction:column;gap:14px}.ysa-closed{align-self:center;font-size:11.5px;color:#7d8497;background:#eceef5;border-radius:999px;padding:5px 12px}',
    '.ysa-human{padding:8px 12px 0;text-align:center;flex:0 0 auto;background:#fff;border-top:1px solid #eef0f5}.ysa-human button{border:1px solid #e0e3f0;background:#f8f8fd;color:' + P + ';border-radius:999px;padding:6px 14px;font-weight:700;font-size:12.5px;font-family:inherit;cursor:pointer;min-height:32px}.ysa-human button:hover{background:#f0f0fb}.ysa-compose{padding:8px 12px 6px;display:flex;gap:8px;align-items:flex-end;flex:0 0 auto;background:#fff}.ysa-inputwrap{flex:1;min-width:0;display:flex;align-items:flex-end;gap:6px;border:1px solid #d6d9e6;border-radius:24px;background:#f8f9fc;padding:3px 4px 3px 15px}.ysa-inputwrap:focus-within{border-color:#8b89f0;box-shadow:0 0 0 4px rgba(109,107,216,.14);background:#fff}.ysa-input{box-sizing:border-box;flex:1;min-width:0;min-height:40px;max-height:120px;resize:none;border:0;outline:none;background:transparent;padding:10px 0;font-family:inherit;font-size:14px;line-height:1.35;color:#111827;-webkit-text-size-adjust:100%}.ysa-send{width:40px;height:40px;flex:0 0 40px;border:0;border-radius:50%;background:linear-gradient(135deg,' + P + ',#5b59c9);color:#fff;padding:0;cursor:pointer;display:flex;align-items:center;justify-content:center}.ysa-send svg{width:18px;height:18px}.ysa-send:disabled{opacity:.38;cursor:default}.ysa-foot{padding:0 14px 9px;background:#fff;text-align:center;font-size:10.5px;color:#9aa1b5;flex:0 0 auto;line-height:1.4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ysa-foot button{border:0;background:none;color:#6f73a3;font:inherit;text-decoration:underline;cursor:pointer;padding:0}',
    '.ysa-sheet{position:absolute;inset:0;background:rgba(15,14,40,.45);display:flex;align-items:flex-end;z-index:3}.ysa-sheet-card{background:#fff;width:100%;box-sizing:border-box;border-radius:22px 22px 0 0;padding:20px 18px max(18px,env(safe-area-inset-bottom));box-shadow:0 -10px 30px rgba(0,0,0,.18)}.ysa-sheet-card h3{margin:0 0 6px;font-size:16px;color:#1f2340}.ysa-sheet-card p{margin:0 0 14px;font-size:13px;color:#5b6275;line-height:1.5}.ysa-sheet-actions{display:flex;gap:8px}.ysa-sheet-actions button{flex:1;min-height:44px;border-radius:12px;font-weight:750;font-size:14px;font-family:inherit;cursor:pointer}.ysa-confirm{border:0;background:' + P + ';color:#fff}.ysa-cancel{border:1px solid #d8dbea;background:#fff;color:#1f2340}',
    '@media(max-width:768px){html.ysa-assistant-open,html.ysa-assistant-open body{overflow:hidden!important;overscroll-behavior:none}.ysa-launcher{right:12px}.ysa-panel{left:8px;right:8px;top:8px;bottom:auto;width:auto;max-width:none;height:calc(100dvh - 16px);max-height:none;border-radius:20px}.ysa-head{padding:12px 10px 12px 12px}.ysa-name{font-size:14.5px}.ysa-sub{font-size:10.5px}.ysa-stream{padding:14px 12px}.ysa-bubble{font-size:15px;line-height:1.5}.ysa-col{max-width:90%}.ysa-human{padding:6px 10px 0}.ysa-compose{padding:8px 10px max(6px,env(safe-area-inset-bottom))}.ysa-input{min-height:44px;font-size:16px;line-height:1.35;padding:11px 0}.ysa-send{width:44px;height:44px;flex-basis:44px}.ysa-panel.ysa-keyboard-open .ysa-head{padding:8px 10px}.ysa-panel.ysa-keyboard-open .ysa-avatar{width:30px;height:30px;flex-basis:30px}.ysa-panel.ysa-keyboard-open .ysa-sub{display:none}.ysa-panel.ysa-keyboard-open .ysa-stream{padding:10px 12px;gap:8px}.ysa-panel.ysa-keyboard-open .ysa-human{display:none}.ysa-panel.ysa-keyboard-open .ysa-foot{display:none}.ysa-panel.ysa-keyboard-open .ysa-compose{padding-bottom:8px}}',
  ].join('\n')
  document.head.appendChild(style)

  var launcher = document.createElement('button')
  launcher.type = 'button'
  launcher.className = 'ysa-launcher'
  launcher.setAttribute('aria-label', 'Open YQAA')

  var panel = document.createElement('section')
  panel.className = 'ysa-panel'
  panel.setAttribute('role', 'dialog')
  panel.setAttribute('aria-label', 'YouSafe Quick Assistance Agent')
  panel.innerHTML =
    '<div class="ysa-head"><div class="ysa-avatar">' + AVATAR_SVG + '<span class="ysa-dot"></span></div><div class="ysa-title"><div class="ysa-name">' + esc(cfg.botName) + '</div><div class="ysa-sub">' + esc(cfg.botTitle) + '</div></div>' +
    '<button class="ysa-iconbtn ysa-past" type="button" title="Past chats" aria-label="Past chats">' + ICON_CLOCK + '</button>' +
    '<button class="ysa-iconbtn ysa-reset" type="button" title="Start a new chat" aria-label="Start a new chat">' + ICON_NEW + '</button>' +
    '<button class="ysa-iconbtn ysa-close" type="button" title="Close" aria-label="Close">' + ICON_CLOSE + '</button></div>' +
    '<form class="ysa-intake" novalidate><div class="ysa-hero"><div class="ysa-orb">' + AVATAR_SVG + '<span class="ysa-dot"></span></div><h2>Hi, I\'m ' + esc(cfg.botName) + '</h2><p>Your YouSafe assistant for services, processes and the page you\'re on. Share your name and email so a person can follow up if you need one.</p></div>' +
    '<label class="ysa-field"><span>Your name</span><input name="ysa_name" type="text" autocomplete="name" maxlength="80" placeholder="e.g. Maria Lopez" required></label>' +
    '<label class="ysa-field"><span>Email</span><input name="ysa_email" type="email" autocomplete="email" inputmode="email" maxlength="160" placeholder="you@example.com" required></label>' +
    '<div class="ysa-form-error" role="alert"></div><button class="ysa-primary" type="submit">Start chat</button>' +
    '<p class="ysa-note">We only use these details to reply to you about this chat. <a href="' + esc(safeHref(cfg.privacyUrl) || '#') + '" target="_blank" rel="noopener noreferrer">Privacy policy</a></p></form>' +
    '<div class="ysa-history" hidden></div>' +
    '<div class="ysa-streamwrap"><div class="ysa-stream" aria-live="polite"></div><button class="ysa-jump" type="button" hidden>New messages ' + ICON_DOWN + '</button></div>' +
    '<div class="ysa-human"><button type="button">Talk to a human →</button></div>' +
    '<div class="ysa-compose"><div class="ysa-inputwrap"><textarea class="ysa-input" rows="1" placeholder="Message YQAA…" aria-label="Message YQAA"></textarea><button class="ysa-send" type="button" aria-label="Send">' + ICON_SEND + '</button></div></div>' +
    '<div class="ysa-foot">AI can make mistakes. <span class="ysa-who"></span></div>' +
    '<div class="ysa-sheet" hidden><div class="ysa-sheet-card" role="alertdialog" aria-label="Start a new chat"><h3>Start a new chat?</h3><p>This chat will close and be kept under Past chats on this device. Your details stay filled in.</p><div class="ysa-sheet-actions"><button class="ysa-cancel" type="button">Keep chatting</button><button class="ysa-confirm" type="button">Start new chat</button></div></div></div>'
  document.body.appendChild(launcher)
  document.body.appendChild(panel)

  var stream = panel.querySelector('.ysa-stream')
  var input = panel.querySelector('.ysa-input')
  var sendButton = panel.querySelector('.ysa-send')
  var humanButton = panel.querySelector('.ysa-human button')
  var humanWrap = panel.querySelector('.ysa-human')
  var composeEl = panel.querySelector('.ysa-compose')
  var footEl = panel.querySelector('.ysa-foot')
  var whoEl = panel.querySelector('.ysa-who')
  var intakeEl = panel.querySelector('.ysa-intake')
  var historyEl = panel.querySelector('.ysa-history')
  var streamWrap = panel.querySelector('.ysa-streamwrap')
  var jumpButton = panel.querySelector('.ysa-jump')
  var sheetEl = panel.querySelector('.ysa-sheet')
  var pastButton = panel.querySelector('.ysa-past')
  var resetButton = panel.querySelector('.ysa-reset')
  var nameInput = intakeEl.querySelector('input[name="ysa_name"]')
  var emailInput = intakeEl.querySelector('input[name="ysa_email"]')
  var formError = intakeEl.querySelector('.ysa-form-error')

  function isMobileAssistant() {
    return !!(window.matchMedia && window.matchMedia('(max-width: 768px)').matches)
  }
  function competingAppChrome() {
    try {
      return !!(
        document.querySelector('.ys-market-chat-overlay') ||
        document.querySelector('.ys-market-chat-composer') ||
        document.querySelector('.ys-chatscreen[data-mobile-view="chat"]') ||
        document.querySelector('[data-ysa-hide-launcher="true"]')
      )
    } catch (_) { return false }
  }
  function hideLauncher(away) {
    launcher.classList.toggle('ysa-launcher-away', !!away)
    if (away) {
      launcher.setAttribute('hidden', '')
      launcher.setAttribute('aria-hidden', 'true')
      launcher.tabIndex = -1
    } else {
      launcher.removeAttribute('hidden')
      launcher.setAttribute('aria-hidden', 'false')
      launcher.tabIndex = 0
    }
  }
  var syncingLauncher = false
  function syncLauncherChrome() {
    if (syncingLauncher) return
    syncingLauncher = true
    try {
      // Park the site FAB only while a real conversation owns the screen.
      // Do not measure page links/buttons and rewrite `bottom` — every
      // marketplace section break has a right-edge CTA, and lifting the
      // bubble off those controls is what made it bounce while scrolling.
      launcher.style.removeProperty('bottom')
      launcher.style.removeProperty('transform')
      if (competingAppChrome()) {
        if (open) {
          open = false
          save(cfg.openKey, false)
          if (document.activeElement === input) input.blur()
          panel.style.display = 'none'
          document.documentElement.classList.remove('ysa-assistant-open')
        }
        hideLauncher(true)
        return
      }
      hideLauncher(false)
    } finally {
      syncingLauncher = false
    }
  }
  var launcherFrame = 0
  function scheduleLauncherChrome() {
    if (launcherFrame) return
    launcherFrame = window.requestAnimationFrame(function () {
      launcherFrame = 0
      syncLauncherChrome()
    })
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
    var focused = document.activeElement
    var inputFocused = focused === input || focused === nameInput || focused === emailInput
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
    if (stickToBottom && view === 'chat') stream.scrollTop = stream.scrollHeight
  }
  function scheduleViewportSync() {
    syncVisualViewport()
    window.setTimeout(syncVisualViewport, 60)
    window.setTimeout(syncVisualViewport, 240)
  }
  function resizeInput() {
    if (!input) return
    input.style.height = 'auto'
    input.style.height = Math.min(120, Math.max(40, input.scrollHeight || 40)) + 'px'
  }
  function marketplaceCard(rec) {
    if (!rec || !rec.url) return ''
    var href = safeHref(rec.url)
    if (!href) return ''
    var name = rec.subcategoryName || rec.categoryName || 'YouSafe Marketplace'
    return '<a class="ysa-cta" href="' + esc(href) + '" target="_blank" rel="noopener noreferrer"><span class="ysa-cta-kicker">Matched to your inquiry</span><strong>Explore ' + esc(name) + ' →</strong><span>Browse relevant services in YouSafe Marketplace</span></a>'
  }
  function firstName() {
    var n = contact && contact.name ? String(contact.name).replace(/[*_=#[\]()]/g, '').trim().split(/\s+/)[0] : ''
    return n.slice(0, 40)
  }
  function greetingText() {
    if (customGreeting) return cfg.greeting
    var first = firstName()
    return (first ? 'Hi **' + first + '**, ' : 'Hi, ') + "I'm **YQAA**, the **YouSafe Quick Assistance Agent**. I can help with the page you're viewing, explain YouSafe services and processes, point you to verified resources, match you to relevant Marketplace services, or connect you with a person when needed."
  }
  function fmtTime(ts) {
    try { return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) } catch (_) { return '' }
  }
  function fmtDate(ts) {
    try { return new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) } catch (_) { return '' }
  }
  function initials(name) {
    var parts = String(name || 'S').trim().split(/\s+/)
    return ((parts[0] || 'S').charAt(0) + (parts.length > 1 ? parts[parts.length - 1].charAt(0) : '')).toUpperCase()
  }
  function messageRow(item) {
    var role = item.role === 'user' ? 'user' : item.role === 'agent' ? 'agent' : item.role === 'system' ? 'system' : 'assistant'
    var label = role === 'assistant' ? cfg.botName : role === 'agent' ? (item.senderName || 'Support') : role === 'system' ? 'YouSafe' : ''
    var body = role === 'user' ? esc(item.content) : richText(item.content)
    var mini = role === 'user' ? '' : role === 'agent'
      ? '<div class="ysa-mini ysa-mini-agent" aria-hidden="true">' + esc(initials(item.senderName)) + '</div>'
      : '<div class="ysa-mini" aria-hidden="true">' + AVATAR_SVG + '</div>'
    var time = item.ts ? '<div class="ysa-time">' + esc(fmtTime(item.ts)) + '</div>' : ''
    return '<div class="ysa-row ' + role + '">' + mini + '<div class="ysa-col">' + (label ? '<div class="ysa-label">' + esc(label) + '</div>' : '') + '<div class="ysa-bubble">' + body + '</div>' + marketplaceCard(item.marketplaceRecommendation) + time + '</div></div>'
  }
  var SUGGESTIONS = [
    { text: 'What services does YouSafe offer?' },
    { text: 'Help me understand this page' },
    { text: 'Find the right service for my case' },
    { text: 'Talk to a human', human: true },
  ]
  function streamHtml() {
    var visible = history.length ? history : [{ role: 'assistant', content: greetingText() }]
    var html = ''
    for (var i = 0; i < visible.length; i++) html += messageRow(visible[i])
    if (!history.length && !sending) {
      html += '<div class="ysa-chips">'
      for (var s = 0; s < SUGGESTIONS.length; s++) html += '<button class="ysa-chip" type="button" data-chip="' + s + '">' + esc(SUGGESTIONS[s].text) + '</button>'
      html += '</div>'
    }
    if (sending) html += '<div class="ysa-row assistant"><div class="ysa-mini" aria-hidden="true">' + AVATAR_SVG + '</div><div class="ysa-col"><div class="ysa-label">' + esc(cfg.botName) + '</div><div class="ysa-bubble">' + progressMarkup() + '</div></div></div>'
    if (failure) {
      html += '<div class="ysa-error"><strong>' + esc(failure.message || 'That response could not be completed.') + '</strong><div class="ysa-error-actions">' + (failure.retryable ? '<button class="ysa-retry" type="button">Retry</button>' : '') + '<button class="ysa-error-human" type="button">Ask a human</button></div></div>'
    }
    return html
  }
  function distanceFromBottom() {
    return stream.scrollHeight - stream.scrollTop - stream.clientHeight
  }
  // Long answers: show the start of the newest reply instead of its end.
  function scrollToLatest() {
    var rows = stream.querySelectorAll('.ysa-row')
    var last = rows[rows.length - 1]
    if (last && !last.classList.contains('user') && last.offsetHeight > stream.clientHeight - 24) {
      stream.scrollTop = Math.max(0, last.offsetTop - 12)
    } else {
      stream.scrollTop = stream.scrollHeight
    }
  }
  function renderStream() {
    var html = streamHtml()
    var grew = history.length > lastRenderedCount
    lastRenderedCount = history.length
    if (html === lastStreamHtml && !forceScroll) return
    // Only follow new content when the reader is already at the bottom (or
    // just sent a message). Otherwise keep their reading position exactly.
    var prevTop = stream.scrollTop
    var follow = forceScroll || stickToBottom
    stream.innerHTML = html
    lastStreamHtml = html
    if (follow) {
      if (grew && !forceScroll) scrollToLatest()
      else stream.scrollTop = stream.scrollHeight
      unseen = false
    } else {
      stream.scrollTop = prevTop
      if (grew) unseen = true
    }
    forceScroll = false
    jumpButton.hidden = !unseen
  }
  function tickProgress() {
    if (!open || view !== 'chat') return
    var node = stream.querySelector('.ysa-progress')
    if (!node) { render(); return }
    var holder = document.createElement('div')
    holder.innerHTML = progressMarkup()
    node.parentNode.replaceChild(holder.firstChild, node)
    lastStreamHtml = streamHtml()
    if (stickToBottom) stream.scrollTop = stream.scrollHeight
  }
  function historyHtml() {
    if (view === 'transcript' && archive[transcriptIndex]) {
      var chat = archive[transcriptIndex]
      var rows = ''
      var msgs = Array.isArray(chat.messages) ? chat.messages : []
      for (var i = 0; i < msgs.length; i++) rows += messageRow(msgs[i])
      return '<div class="ysa-subbar"><button class="ysa-ghost" type="button" data-act="list">← Back</button><strong>' + esc(chat.title || 'Past chat') + '</strong></div><div class="ysa-transcript">' + rows + '<div class="ysa-closed">Chat closed · ' + esc(fmtDate(chat.endedAt)) + '</div></div>'
    }
    var list = ''
    for (var j = 0; j < archive.length; j++) {
      var c = archive[j]
      var count = Array.isArray(c.messages) ? c.messages.length : 0
      list += '<button class="ysa-hitem" type="button" data-act="open" data-i="' + j + '"><strong>' + esc(c.title || 'Past chat') + '</strong><span>' + esc(fmtDate(c.endedAt)) + ' · ' + count + ' message' + (count === 1 ? '' : 's') + '</span></button>'
    }
    return '<div class="ysa-subbar"><button class="ysa-ghost" type="button" data-act="back">← Chat</button><strong>Past chats</strong>' + (archive.length ? '<button class="ysa-ghost" type="button" data-act="clear">Clear</button>' : '') + '</div>' +
      (list ? '<div class="ysa-hlist">' + list + '</div>' : '<div class="ysa-empty">No past chats yet. When you start a new chat, the old one is kept here on this device.</div>')
  }
  function renderHistory() {
    var html = historyHtml()
    if (html === lastHistoryHtml) return
    historyEl.innerHTML = html
    historyEl.scrollTop = 0
    lastHistoryHtml = html
  }
  function updateSendState() {
    sendButton.disabled = sending || !input.value.trim()
  }
  function applyView() {
    var chat = view === 'chat'
    intakeEl.hidden = view !== 'intake'
    historyEl.hidden = !(view === 'history' || view === 'transcript')
    streamWrap.hidden = !chat
    composeEl.hidden = !chat
    footEl.hidden = !chat
    humanWrap.hidden = !chat || inLive() || !history.length
    pastButton.hidden = view === 'intake' || view === 'history' || view === 'transcript'
    resetButton.hidden = view === 'intake'
    sheetEl.hidden = !confirmOpen
    if (contact) {
      whoEl.innerHTML = 'Chatting as ' + esc(firstName() || contact.email) + ' · <button type="button" class="ysa-change">Change</button>'
    } else {
      whoEl.innerHTML = ''
    }
  }
  function render() {
    panel.style.display = open ? 'flex' : 'none'
    if (lastLauncherOpen !== open) {
      launcher.innerHTML = open ? ICON_DOWN : AVATAR_SVG + '<span class="ysa-dot"></span>'
      launcher.classList.toggle('ysa-is-open', open)
      launcher.setAttribute('aria-label', open ? 'Close YQAA' : 'Open YQAA')
      lastLauncherOpen = open
    }
    document.documentElement.classList.toggle('ysa-assistant-open', open && isMobileAssistant())
    if (open) syncVisualViewport()
    else panel.classList.remove('ysa-keyboard-open')
    scheduleLauncherChrome()
    applyView()
    if (!open) { updateSendState(); return }
    if (view === 'chat') renderStream()
    else if (view === 'history' || view === 'transcript') renderHistory()
    updateSendState()
  }
  function closeAssistant() {
    open = false
    confirmOpen = false
    save(cfg.openKey, false)
    var focused = document.activeElement
    if (focused === input || focused === nameInput || focused === emailInput) focused.blur()
    render()
    scheduleViewportSync()
  }
  function openAssistant() {
    open = true
    forceScroll = true
    save(cfg.openKey, true)
    render(); scheduleViewportSync(); startPolling()
    if (!isMobileAssistant()) {
      try { (view === 'intake' ? nameInput : input).focus({ preventScroll: true }) } catch (_) {}
    }
  }
  function archiveCurrent() {
    var firstUser = null
    for (var i = 0; i < history.length; i++) if (history[i].role === 'user') { firstUser = history[i]; break }
    if (!firstUser) return
    archive.unshift({
      id: String(Date.now()),
      title: String(firstUser.content || '').replace(/\s+/g, ' ').slice(0, 80),
      startedAt: history[0].ts || Date.now(),
      endedAt: Date.now(),
      messages: history.slice(-cfg.maxPersisted),
    })
    archive = archive.slice(0, cfg.maxArchived)
    save(cfg.archiveKey, archive)
  }
  function startNewChat() {
    archiveCurrent()
    history = []; support = null; failure = null; lastFailedRequest = null
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
    stopProgress()
    persist(); save(cfg.supportKey, null)
    confirmOpen = false
    view = contact ? 'chat' : 'intake'
    forceScroll = true
    stickToBottom = true
    unseen = false
    render()
  }
  function showFormError(message, field) {
    formError.textContent = message
    try { field.focus() } catch (_) {}
  }
  function mergeRemote(remote) {
    if (!Array.isArray(remote)) return 0
    var seen = {}
    var added = 0
    history.forEach(function (m) { if (m.id) seen[m.id] = true })
    remote.forEach(function (m) {
      if (!m || !m.id || seen[m.id] || m.sender_type === 'visitor') return
      if (m.sender_type === 'agent' && support) support.mode = 'active'
      history.push({ id: m.id, role: m.sender_type === 'agent' ? 'agent' : m.sender_type === 'system' ? 'system' : 'assistant', content: m.body || '', senderName: m.sender_name || null, ts: m.created_at ? new Date(m.created_at).getTime() : Date.now() })
      added++
    })
    if (support) save(cfg.supportKey, support)
    persist()
    return added
  }
  async function pollSupport() {
    if (!inLive()) return
    try {
      var res = await fetch(cfg.supportApiUrl + '/' + encodeURIComponent(support.conversationId))
      if (!res.ok || !support) return
      var data = await res.json()
      var before = support.status
      var added = mergeRemote(data.messages || [])
      if (data.conversation && data.conversation.status) support.status = data.conversation.status
      if (data.queue) support.queue = data.queue
      save(cfg.supportKey, support)
      // Redraw only when something actually changed, so polling never moves
      // the reader's scroll position or clears a text selection.
      if (added || before !== support.status) render()
    } catch (_) {}
  }
  function startPolling() {
    if (pollTimer) clearInterval(pollTimer)
    pollTimer = null
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
    if (!contact) { view = 'intake'; render(); return }
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
    forceScroll = true
    startProgress(!!retryExisting)
    render()
    try {
      if (supportOwnsConversation()) {
        var live = await fetchJsonWithNetworkRecovery(cfg.supportApiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text, conversationId: support.conversationId, topic: support.topic || location.hostname, visitor: contact }) })
        if (!live.res.ok) throw Object.assign(new Error(live.data.error || 'Support is temporarily unreachable'), { retryable: true })
        mergeRemote(live.data.messages || [])
      } else {
        var turns = history.filter(function (m) { return m.role === 'user' || m.role === 'assistant' }).map(function (m) { return { role: m.role, content: m.content } })
        var result = await fetchJsonWithNetworkRecovery(cfg.apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: turns, requestAgent: !!requestAgent, visitor: contact, topic: cfg.topic || location.hostname, origin: originContext() }) })
        var data = result.data
        if (!result.res.ok) throw Object.assign(new Error(data.error || 'YQAA is temporarily unavailable.'), { retryable: data.retryable !== false, marketplaceRecommendation: data.marketplaceRecommendation || null })
        if (data.handoff && data.handoff.conversationId) {
          support = { conversationId: data.handoff.conversationId, status: data.handoff.status || 'waiting_for_agent', queue: data.handoff.queue || null, topic: location.hostname, mode: data.handoff.kind || (requestAgent ? 'explicit' : 'legacy') }
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
    openAssistant()
  })
  panel.querySelector('.ysa-close').addEventListener('click', closeAssistant)
  resetButton.addEventListener('click', function () {
    var hasUserTurn = history.some(function (m) { return m.role === 'user' })
    if (!hasUserTurn) { startNewChat(); return }
    confirmOpen = true
    render()
  })
  pastButton.addEventListener('click', function () {
    view = 'history'
    transcriptIndex = -1
    render()
  })
  sheetEl.querySelector('.ysa-confirm').addEventListener('click', startNewChat)
  sheetEl.querySelector('.ysa-cancel').addEventListener('click', function () { confirmOpen = false; render() })
  sheetEl.addEventListener('click', function (event) { if (event.target === sheetEl) { confirmOpen = false; render() } })
  historyEl.addEventListener('click', function (event) {
    var target = event.target && event.target.closest ? event.target.closest('[data-act]') : null
    if (!target) return
    var act = target.getAttribute('data-act')
    if (act === 'back') { view = contact ? 'chat' : 'intake'; forceScroll = true }
    else if (act === 'list') { view = 'history'; transcriptIndex = -1 }
    else if (act === 'open') { transcriptIndex = Number(target.getAttribute('data-i')) || 0; view = 'transcript' }
    else if (act === 'clear') { archive = []; save(cfg.archiveKey, archive) }
    render()
  })
  intakeEl.addEventListener('submit', function (event) {
    event.preventDefault()
    var name = String(nameInput.value || '').replace(/\s+/g, ' ').trim().slice(0, 80)
    var email = String(emailInput.value || '').trim().toLowerCase().slice(0, 160)
    if (name.length < 2) return showFormError('Please enter your name.', nameInput)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return showFormError('Please enter a valid email address.', emailInput)
    formError.textContent = ''
    contact = { name: name, email: email, phone: null }
    save(cfg.contactKey, contact)
    view = 'chat'
    forceScroll = true
    lastStreamHtml = ''
    render()
    if (!isMobileAssistant()) { try { input.focus({ preventScroll: true }) } catch (_) {} }
  })
  footEl.addEventListener('click', function (event) {
    if (!event.target || !event.target.closest || !event.target.closest('.ysa-change')) return
    nameInput.value = contact ? contact.name || '' : ''
    emailInput.value = contact ? contact.email || '' : ''
    view = 'intake'
    render()
  })
  sendButton.addEventListener('click', function () { send() })
  humanButton.addEventListener('click', function () { send("I'd like to talk to a human support agent.", true) })
  jumpButton.addEventListener('click', function () {
    unseen = false
    jumpButton.hidden = true
    stream.scrollTop = stream.scrollHeight
  })
  stream.addEventListener('scroll', function () {
    stickToBottom = distanceFromBottom() < 40
    if (stickToBottom && unseen) { unseen = false; jumpButton.hidden = true }
  }, { passive: true })
  stream.addEventListener('click', function (event) {
    var target = event.target
    if (!target || !target.closest) return
    if (target.closest('.ysa-retry')) retryLast()
    if (target.closest('.ysa-error-human')) send("I'd like to talk to a human support agent.", true)
    var chip = target.closest('.ysa-chip')
    if (chip) {
      var s = SUGGESTIONS[Number(chip.getAttribute('data-chip'))]
      if (s) send(s.human ? "I'd like to talk to a human support agent." : s.text, !!s.human)
    }
  })
  input.addEventListener('input', function () { resizeInput(); updateSendState() })
  input.addEventListener('focus', scheduleViewportSync)
  input.addEventListener('blur', scheduleViewportSync)
  nameInput.addEventListener('focus', scheduleViewportSync)
  emailInput.addEventListener('focus', scheduleViewportSync)
  input.addEventListener('keydown', function (event) { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); send() } })
  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape' || !open) return
    if (confirmOpen) { confirmOpen = false; render(); return }
    closeAssistant()
  })

  window.addEventListener('resize', syncVisualViewport, { passive: true })
  window.addEventListener('resize', scheduleLauncherChrome, { passive: true })
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', syncVisualViewport, { passive: true })
    window.visualViewport.addEventListener('scroll', syncVisualViewport, { passive: true })
    window.visualViewport.addEventListener('resize', scheduleLauncherChrome, { passive: true })
  }
  if (typeof MutationObserver !== 'undefined') {
    var chromeObserver = new MutationObserver(scheduleLauncherChrome)
    chromeObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-mobile-view', 'data-ysa-hide-launcher'],
    })
  }

  resizeInput()
  render()
  scheduleViewportSync()
  scheduleLauncherChrome()
  if (open) startPolling()
})()
