/*!
 * YouSafe unified auth entry links (apex / usa / legal / any estate site).
 *
 * Usage (static sites, no build step, no Clerk on the page):
 *   <script src="https://portal.yousafeconsultancy.com/ys-auth.js" defer></script>
 *   <a href="https://portal.yousafeconsultancy.com/sign-in" data-ys-auth="sign-in">Sign in</a>
 *   <a href="https://portal.yousafeconsultancy.com/sign-up" data-ys-auth="sign-up"
 *      data-ys-intent="client" data-ys-return-to="https://portal.yousafeconsultancy.com/dashboard">Join</a>
 *
 * On click it sends the visitor to the ONE canonical YouSafe sign-in/sign-up
 * document with `return_to` = the current page (or data-ys-return-to), plus
 * any ?service= / ?gig= context already on the page. It also upgrades legacy
 * lane links (/sign-in/student, /sign-up/attorney, ...) the same way. The plain
 * href keeps working without JavaScript. No cookies, no third-party code.
 */
(function () {
  'use strict'
  var PORTAL = 'https://portal.yousafeconsultancy.com'
  var LANE_INTENT = { student: 'client', client: 'client', attorney: 'attorney', consultant: 'consultant', provider: 'provider' }
  var CONTEXT_KEYS = ['service', 'gig', 'vertical', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']

  function parse(href) {
    try { return new URL(href, window.location.href) } catch (e) { return null }
  }

  function modeFor(anchor) {
    var explicit = anchor.getAttribute('data-ys-auth')
    if (explicit === 'sign-in' || explicit === 'sign-up') return { mode: explicit, intent: anchor.getAttribute('data-ys-intent') }
    var url = parse(anchor.getAttribute('href') || '')
    if (!url || url.origin !== PORTAL) return null
    var parts = url.pathname.split('/').filter(Boolean)
    if (parts[0] !== 'sign-in' && parts[0] !== 'sign-up' && parts[0] !== 'login' && parts[0] !== 'register') return null
    var mode = parts[0] === 'sign-up' || parts[0] === 'register' ? 'sign-up' : 'sign-in'
    return { mode: mode, intent: mode === 'sign-up' ? (LANE_INTENT[parts[1]] || url.searchParams.get('intent')) : null }
  }

  function canonicalHref(anchor, info) {
    var target = new URL('/' + info.mode, PORTAL)
    var returnTo = anchor.getAttribute('data-ys-return-to') || window.location.href
    target.searchParams.set('return_to', returnTo)
    if (info.intent) target.searchParams.set('intent', info.intent)
    var here = new URL(window.location.href)
    for (var i = 0; i < CONTEXT_KEYS.length; i++) {
      var value = here.searchParams.get(CONTEXT_KEYS[i])
      if (value && !target.searchParams.has(CONTEXT_KEYS[i])) target.searchParams.set(CONTEXT_KEYS[i], value)
    }
    return target.toString()
  }

  document.addEventListener('click', function (event) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    var node = event.target
    while (node && node.nodeName !== 'A') node = node.parentNode
    if (!node || !node.getAttribute) return
    var info = modeFor(node)
    if (!info) return
    event.preventDefault()
    window.location.assign(canonicalHref(node, info))
  }, true)
})()
