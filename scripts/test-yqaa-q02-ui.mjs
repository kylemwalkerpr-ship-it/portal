// Production TSX logic with a minimal React hook adapter; no DOM/browser claim.
// Supply an already installed TypeScript module path; installs nothing.
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { webcrypto } from 'node:crypto'
import vm from 'node:vm'
import test from 'node:test'
import assert from 'node:assert/strict'
const compiler = await import(process.argv[2] ? pathToFileURL(process.argv[2]).href : 'typescript')
const ts = compiler.typescript || compiler.default || compiler
const fileName = 'components/messaging/YqaaPrivacyControls.tsx'
const compiled = ts.transpileModule(readFileSync(new URL(`../${fileName}`, import.meta.url), 'utf8'), {
  fileName, reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
})
assert.equal((compiled.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0)
const empty = { consent: null, facts: [], excluded_source_ids: [] }
const consent = { version: 4, granted: true }
const payload = () => Response.json(empty)
const same = (a, b) => a?.length === b?.length && a.every((v, i) => Object.is(v, b[i]))
function mount(fetcher, props = { conversationId: 'scope' }, componentName = 'default') {
  let index = 0, values = [], effects = [], cleanups = [], tree, updates = 0
  const React = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity) }),
    useState(initial) { const i = index++; if (!(i in values)) values[i] = typeof initial === 'function' ? initial() : initial
      return [values[i], value => { updates++; values[i] = typeof value === 'function' ? value(values[i]) : value }] },
    useRef(initial) { const i = index++; return values[i] ||= { current: initial } },
    useCallback(fn, deps) { const i = index++; if (!values[i] || !same(values[i].deps, deps)) values[i] = { fn, deps }; return values[i].fn },
    useEffect(fn, deps) { const i = index++; if (!values[i] || !same(values[i], deps)) { values[i] = deps; effects.push(fn) } },
    useId() { return `field-${index++}` },
  }
  const exports = {}
  vm.runInNewContext(`${compiled.outputText}\nmodule.exports.FactEditor=FactEditor`, {
    exports, module: { exports }, require: name => name === 'react' ? React : {}, fetch: fetcher, crypto: webcrypto, Date,
  })
  return {
    render() { index = 0; tree = exports[componentName](props); for (const effect of effects.splice(0)) { const cleanup = effect(); if (cleanup) cleanups.push(cleanup) }; return tree },
    unmount() { for (const cleanup of cleanups) cleanup() },
    get updates() { return updates },
  }
}
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve() }
function all(tree) { return !tree || typeof tree !== 'object' ? [] : [tree, ...(tree.children || []).flatMap(all)] }
function text(tree) { return typeof tree === 'string' || typeof tree === 'number' ? String(tree) : (tree?.children || []).map(text).join('') }
function button(tree, label) { const b = all(tree).find(x => x.type === 'button' && text(x) === label); assert.ok(b, `missing ${label}`); return b }
async function ready(h) { h.render(); await flush(); return h.render() }
test('consent is visibly off; unchecked opt-in blocks grant', async () => {
  const h = mount(async () => payload())
  const tree = await ready(h)
  assert.match(text(tree), /YQAA is off until you explicitly consent/)
  assert.equal(button(tree, 'Grant consent').props.disabled, true)
  assert.equal(all(tree).find(x => x.type === 'input').props.checked, false)
  assert.match(text(tree), /Cross-site account linking is unavailable/)
})
test('checked explicit grant posts exact scope epoch and shows confirmed state', async () => {
  let granted = false, posted
  const h = mount(async (url, options) => {
    if (options.method === 'POST') { posted = JSON.parse(options.body); granted = true; return Response.json({}) }
    return Response.json(granted ? { ...empty, consent: { version: 1, granted: true } } : empty)
  })
  let tree = await ready(h)
  all(tree).find(x => x.type === 'input').props.onChange({ target: { checked: true } })
  tree = h.render(); assert.equal(button(tree, 'Grant consent').props.disabled, false)
  await button(tree, 'Grant consent').props.onClick()
  tree = h.render()
  assert.equal(posted.action, 'grant'); assert.equal(posted.explicitOptIn, true); assert.equal(posted.expectedVersion, 0)
  assert.match(posted.requestId, /^[0-9a-f-]{36}$/i)
  assert.match(text(tree), /Consent granted for future messages/)
})
test('withdrawal is offered with current epoch and visibly disables future generation', async () => {
  let withdrawn = false, posted
  const h = mount(async (_url, options) => {
    if (options.method === 'POST') { posted = JSON.parse(options.body); withdrawn = true; return Response.json({}) }
    return Response.json({ ...empty, consent: { ...consent, granted: !withdrawn } })
  })
  const tree = await ready(h)
  await button(tree, 'Withdraw consent and forget memory').props.onClick()
  assert.equal(posted.action, 'withdraw'); assert.equal(posted.expectedVersion, 4)
  assert.match(text(h.render()), /Future YQAA generation is disabled/)
})
test('missing privacy primitive is shown plainly and grant stays unavailable', async () => {
  const h = mount(async () => Response.json({}, { status: 503 }))
  const tree = await ready(h)
  assert.match(text(tree), /Privacy controls are unavailable/)
  assert.equal(button(tree, 'Grant consent').props.disabled, true)
})
test('network uncertainty preserves the request UUID on exact retry', async () => {
  const posts = []
  const h = mount(async (_url, options) => {
    if (options.method === 'POST') { posts.push(JSON.parse(options.body)); if (posts.length === 1) throw Error('network uncertainty'); return Response.json({}) }
    return Response.json({ ...empty, consent })
  })
  let tree = await ready(h)
  await button(tree, 'Forget all derived memory').props.onClick()
  tree = h.render(); assert.match(text(tree), /network uncertainty/)
  await button(tree, 'Forget all derived memory').props.onClick()
  assert.equal(posts.length, 2); assert.equal(posts[0].requestId, posts[1].requestId)
})
test('CAS conflict refreshes state and reports the conflict instead of success', async () => {
  let conflict = false
  const h = mount(async (_url, options) => {
    if (options.method === 'POST') { conflict = true; return Response.json({}, { status: 409 }) }
    return Response.json({ ...empty, consent: { ...consent, version: conflict ? 5 : 4 } })
  })
  const tree = await ready(h)
  await button(tree, 'Forget all derived memory').props.onClick()
  const after = text(h.render())
  assert.match(after, /Memory changed while you were editing/)
  assert.match(after, /Consent version: 5/)
  assert.ok(!after.includes('Derived memory updated.'))
})
test('late response after a thread unmount cannot update its state', async () => {
  let resolve
  const h = mount(() => new Promise(r => { resolve = r }))
  h.render(); h.unmount(); const before = h.updates
  resolve(Response.json({ ...empty, consent })); await flush()
  assert.equal(h.updates, before)
})
test('fact correction and forgetting use the selected fact, with accessible field association', async () => {
  const calls = [], fact = { id: 'fact', value: 'Old', version: 2, fact_key: 'goal', source_message_id: 'source', source_created_at: '2026-10-16T10:00:00Z' }
  const h = mount(async () => payload(), { fact, busy: false, onChange: async (...args) => calls.push(args) }, 'FactEditor')
  let tree = h.render()
  const field = all(tree).find(x => x.type === 'textarea')
  assert.equal(all(tree).find(x => x.type === 'label').props.htmlFor, field.props.id)
  assert.equal(button(tree, 'Save correction').props.disabled, true)
  field.props.onChange({ target: { value: 'Corrected' } }); tree = h.render()
  await button(tree, 'Save correction').props.onClick()
  await button(tree, 'Forget this fact').props.onClick()
  assert.deepEqual(calls, [['correct', fact, 'Corrected'], ['delete', fact]])
})
test('fact pagination remains scoped and exposes older pages', async () => {
  const urls = []
  const h = mount(async (url) => { urls.push(url); return Response.json({ ...empty, consent, has_more: !url.endsWith('page=1') }) })
  let tree = await ready(h)
  assert.equal(button(tree, 'More facts').props.disabled, false)
  await button(tree, 'More facts').props.onClick()
  tree = h.render()
  assert.match(text(tree), /Page 2/)
  assert.equal(button(tree, 'Previous facts').props.disabled, false)
  assert.equal(urls[1], '/api/messages/conversations/scope/privacy/facts?page=1')
})
test('an older privacy refresh cannot overwrite a confirmed withdrawal', async () => {
  let reads = 0, resolveOld, withdrawn = false
  const h = mount(async (_url, options) => {
    if (options.method === 'POST') { withdrawn = true; return Response.json({}) }
    if (++reads === 2) return new Promise(resolve => { resolveOld = resolve })
    return Response.json({ ...empty, consent: { ...consent, granted: !withdrawn } })
  })
  let tree = await ready(h)
  const oldRefresh = button(tree, 'Refresh privacy state').props.onClick()
  await button(tree, 'Withdraw consent and forget memory').props.onClick()
  resolveOld(Response.json({ ...empty, consent }))
  await oldRefresh
  tree = h.render()
  assert.match(text(tree), /YQAA is off until you explicitly consent/)
})
test('repeated clicks cannot start concurrent mutations', async () => {
  let posts = 0, resolvePost
  const h = mount(async (_url, options) => {
    if (options.method === 'POST') { posts++; return new Promise(resolve => { resolvePost = resolve }) }
    return Response.json({ ...empty, consent })
  })
  const tree = await ready(h)
  const first = button(tree, 'Forget all derived memory').props.onClick()
  await button(tree, 'Forget all derived memory').props.onClick()
  assert.equal(posts, 1)
  resolvePost(Response.json({})); await first
})
