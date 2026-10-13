#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const root = process.cwd()
const file = path.resolve(process.argv[2] || 'docs/yqaa/companion/gold-set.json')
const source = fs.readFileSync(path.join(root, 'lib/yqaaOfflineEvaluator.ts'), 'utf8')
const compiled = ts.transpile(source, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 })
const module = { exports: {} }
new Function('exports', 'module', compiled)(module.exports, module)
const input = JSON.parse(fs.readFileSync(file, 'utf8'))
const cases = Array.isArray(input.cases) ? input.cases : []
const result = module.exports.evaluateYqaaGoldSet(cases, Number(input.minimumPerStratum) || 5, input.strata)
process.stdout.write(`${JSON.stringify({ datasetVersion: input.datasetVersion, source: file, result }, null, 2)}\n`)
if (!cases.length) process.exitCode = 2
