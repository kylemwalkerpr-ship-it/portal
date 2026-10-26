// Offline regression for the native harness invocation. Native SQL tests remain
// authoritative for command-tag suppression and error propagation.
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import test from 'node:test'
import assert from 'node:assert/strict'
const source = readFileSync(new URL('./test-yqaa-q02-postgres.mjs', import.meta.url), 'utf8')
const declaration = source.match(/^const psqlArgs = .+$/m)?.[0]
assert.ok(declaration, 'native harness must declare shared psql arguments')
const args = vm.runInNewContext(`${declaration}; psqlArgs`, { socket: '/synthetic/socket', port: '55439' })
test('quiet mode suppresses command tags without suppressing errors', () => {
  assert.ok(args.includes('-q'))
  assert.ok(!args.includes('--set=VERBOSITY=terse'))
  assert.ok(args.includes('-At'))
})
test('connection isolation, startup isolation and fail-fast SQL remain enforced', () => {
  assert.ok(args.includes('-X'))
  assert.equal(args[args.indexOf('-h') + 1], '/synthetic/socket')
  assert.equal(args[args.indexOf('-v') + 1], 'ON_ERROR_STOP=1')
  assert.equal((source.match(/PGOPTIONS: '-c plpgsql.variable_conflict=error'/g) || []).length, 2)
})
test('sync and async psql use the same quiet arguments', () => {
  assert.match(source, /command\('psql', \[\.\.\.psqlArgs, '-c', text\]\)/)
  assert.match(source, /spawn\('psql', \[\.\.\.psqlArgs, '-c', text\]/)
  assert.match(source, /r\.error \|\| r\.status !== 0/)
})
test('native parser proof covers SET, transactions and both error paths', () => {
  assert.match(source, /JSON\.parse\(sql\(query\)\.trim\(\)\)/)
  assert.match(source, /JSON\.parse\(asyncParser\.stdout\.trim\(\)\)/)
  assert.match(source, /assert\.notEqual\(asyncError\.code,0\)/)
  assert.match(source, /assert\.equal\(asyncError\.stdout\.trim\(\),''\)/)
})
