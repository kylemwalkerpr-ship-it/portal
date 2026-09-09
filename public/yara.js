/**
 * Legacy embed compatibility alias.
 *
 * All first-party YouSafe surfaces now load /assistant.js directly. This file
 * remains temporarily so cached/external embeds do not break during rollout.
 */
(function () {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  if (window.__youSafeAssistantMounted) return
  var script = document.createElement('script')
  script.src = 'https://portal.yousafeconsultancy.com/assistant.js?v=ysa-launcher-still-2'
  script.async = true
  script.defer = true
  script.dataset.yousafeAssistant = '1'
  document.body.appendChild(script)
})()
