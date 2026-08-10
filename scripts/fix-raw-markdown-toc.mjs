/**
 * Fix raw-markdown TOCs in factory-shipped caseworks pages.
 *
 * The pre-`85f5a0e` renderer emitted `<li>[Text](#anchor)</li>` verbatim
 * (inline markdown was never converted in list items). This script converts
 * any `[Text](#anchor)` / `[Text](/path)` inside JSX into proper anchors so
 * the shipped page renders a clickable Table of Contents.
 *
 * Usage: node scripts/fix-raw-markdown-toc.mjs <page.tsx> [page.tsx ...]
 * In-place rewrite. Idempotent (already-fixed lines are untouched).
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const INLINE_LINK = /\[([^\]]+)\]\(([^)]+)\)/g

function renderInline(text) {
  return text.replace(INLINE_LINK, (all, label, href) => {
    const labelText = label.replace(/\*\*|__|`/g, '').trim()
    const cleanHref = href.replace(/"/g, '&quot;')
    const external = /^https?:\/\//i.test(cleanHref)
    return external
      ? `<a href="${cleanHref}" target="_blank" rel="noopener noreferrer">${labelText}</a>`
      : `<a href="${cleanHref}">${labelText}</a>`
  })
}

/** Convert raw markdown inside <li> and <p> JSX lines (TOC list items). */
function fixLine(line) {
  if (!/\[[^\]]+\]\([^)]+\)/.test(line)) return line
  const trimmed = line.trim()

  // Only touch list items and paragraphs — never attribute strings / strings
  if (!/^<li>/.test(trimmed) && !/^<p>/.test(trimmed)) return line

  const indent = line.match(/^\s*/)[0]
  if (trimmed.startsWith('<li>')) {
    const inner = trimmed.replace(/^<li>/, '').replace(/<\/li>\s*$/, '')
    const fixed = renderInline(inner)
    return `${indent}<li>${fixed}</li>`
  }
  if (trimmed.startsWith('<p>')) {
    const inner = trimmed.replace(/^<p>/, '').replace(/<\/p>\s*$/, '')
    const fixed = renderInline(inner)
    return `${indent}<p>${fixed}</p>`
  }
  return line
}

for (const file of process.argv.slice(2)) {
  const orig = readFileSync(file, 'utf8')
  const lines = orig.split('\n')
  let changed = 0
  const out = lines.map((line) => {
    const fixed = fixLine(line)
    if (fixed !== line) changed++
    return fixed
  })
  if (changed === 0) {
    console.log(`✓ ${file}: no raw markdown links to fix`)
    continue
  }
  writeFileSync(file, out.join('\n'))
  console.log(`✓ ${file}: fixed ${changed} line(s)`)
  try {
    const rel = file.replace(process.cwd() + '/', '')
    execSync(`git add "${rel}"`, { stdio: 'ignore' })
    console.log(`  staged ${rel}`)
  } catch {
    /* not in a git tree — fine */
  }
}
