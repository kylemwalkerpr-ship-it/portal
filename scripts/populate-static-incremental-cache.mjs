#!/usr/bin/env node
/**
 * Publish OpenNext's prerender (incremental) cache as Workers Static Assets.
 *
 * `open-nextjs-cloudflare deploy` normally runs the official
 * `populateStaticAssetsIncrementalCache` hook for us, which is a purely local
 * `fs.cpSync(.open-next/cache -> .open-next/assets/cdn-cgi/_next_cache)`.
 * YouSafe deploys through raw `wrangler deploy` instead (see
 * scripts/deploy-production.mjs), so the official GitHub workflow runs this
 * script between the OpenNext build and the deploy to keep the exact same
 * bytes in the Worker's assets directory.
 *
 * Contract:
 *   - fails closed when `.open-next/cache` is missing/empty after a build;
 *   - replaces the destination so a removed prerender cannot keep serving
 *     from a previous build;
 *   - verifies the copied tree exists and contains cache entries.
 *
 * This is a local filesystem copy only: no network access, no Cloudflare API
 * call, no credentials, no paid-plan infrastructure.
 *
 * Usage:
 *   node scripts/populate-static-incremental-cache.mjs
 *   node scripts/populate-static-incremental-cache.mjs \
 *     --source .open-next/cache \
 *     --destination .open-next/assets/cdn-cgi/_next_cache
 */

import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import process from 'node:process'

const DEFAULT_SOURCE = join('.open-next', 'cache')
const DEFAULT_DESTINATION = join('.open-next', 'assets', 'cdn-cgi', '_next_cache')

const USAGE = `Usage: node scripts/populate-static-incremental-cache.mjs [options]

Copies the OpenNext prerender cache into the Worker static-assets directory as
cdn-cgi/_next_cache (the read-only static-assets incremental cache).

Options:
  --source <dir>       Prerender cache directory (default: ${DEFAULT_SOURCE})
  --destination <dir>  Static-assets cache directory (default: ${DEFAULT_DESTINATION})
  -h, --help           Show this help
`

function parseArgs(argv) {
  const parsed = { source: DEFAULT_SOURCE, destination: DEFAULT_DESTINATION, help: false }

  const readValue = (flag, inline) => {
    if (inline !== undefined && inline !== '') return inline
    const next = argv.shift()
    if (next === undefined) throw new Error(`${flag} requires a directory value`)
    return next
  }

  while (argv.length > 0) {
    const arg = argv.shift()
    if (arg === '-h' || arg === '--help') {
      parsed.help = true
    } else if (arg === '--source') {
      parsed.source = readValue(arg, undefined)
    } else if (arg.startsWith('--source=')) {
      parsed.source = readValue('--source', arg.slice('--source='.length))
    } else if (arg === '--destination') {
      parsed.destination = readValue(arg, undefined)
    } else if (arg.startsWith('--destination=')) {
      parsed.destination = readValue('--destination', arg.slice('--destination='.length))
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return parsed
}

function fail(message) {
  console.error(`[static-incremental-cache] ERROR: ${message}`)
  process.exit(1)
}

function isDirectory(target) {
  return existsSync(target) && statSync(target).isDirectory()
}

/** Count every non-directory entry (files and symlinks) under `dir`. */
function countEntries(dir) {
  let count = 0
  const stack = [dir]
  while (stack.length > 0) {
    const current = stack.pop()
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const fullPath = join(current, entry.name)
      if (entry.isDirectory()) {
        stack.push(fullPath)
      } else {
        count += 1
      }
    }
  }
  return count
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(USAGE)
    return
  }

  const source = resolve(args.source)
  const destination = resolve(args.destination)
  const assetsRoot = dirname(dirname(destination))

  if (!isDirectory(source)) {
    fail(
      `prerender cache directory is missing or not a directory: ${relative(process.cwd(), source)}. ` +
        'Run the OpenNext build before populating the static incremental cache.',
    )
  }
  if (source === destination) {
    fail(`source and destination are the same directory: ${relative(process.cwd(), source)}`)
  }
  if (!isDirectory(assetsRoot)) {
    fail(
      `Worker static-assets directory is missing or not a directory: ${relative(process.cwd(), assetsRoot)}. ` +
        'The OpenNext build must emit assets before the deploy.',
    )
  }

  const sourceEntries = countEntries(source)
  if (sourceEntries === 0) {
    fail(
      `prerender cache directory is empty: ${relative(process.cwd(), source)}. ` +
        'Refusing to publish an empty static incremental cache.',
    )
  }

  rmSync(destination, { recursive: true, force: true })
  mkdirSync(dirname(destination), { recursive: true })
  cpSync(source, destination, { recursive: true, force: true })

  if (!isDirectory(destination)) {
    fail(`destination was not created: ${relative(process.cwd(), destination)}`)
  }

  const destinationEntries = countEntries(destination)
  if (destinationEntries === 0) {
    fail(`destination contains no cache entries: ${relative(process.cwd(), destination)}`)
  }
  if (destinationEntries !== sourceEntries) {
    fail(
      `destination is incomplete: copied ${destinationEntries} of ${sourceEntries} cache entries into ` +
        `${relative(process.cwd(), destination)}`,
    )
  }

  console.log(
    `[static-incremental-cache] Published ${destinationEntries} cache entries: ` +
      `${relative(process.cwd(), source)} -> ${relative(process.cwd(), destination)}`,
  )
}

try {
  main()
} catch (error) {
  console.error(`[static-incremental-cache] ERROR: ${error instanceof Error ? error.message : error}`)
  console.error(USAGE)
  process.exit(1)
}
