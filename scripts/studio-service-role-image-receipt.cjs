const { readFileSync, writeFileSync } = require('node:fs')

const DIGEST = /^sha256:[a-f0-9]{64}$/
const COMPONENT = '[a-z0-9]+(?:(?:[._]|__|-)[a-z0-9]+)*'
const DOMAIN_LABEL = '[a-z0-9](?:[a-z0-9-]*[a-z0-9])?'
const REGISTRY = `(?:${DOMAIN_LABEL}(?:\\.${DOMAIN_LABEL})*|\\[[0-9a-fA-F:]+\\])(?::[0-9]{1,5})?`
const REPOSITORY = `(?:${REGISTRY}\\/)?${COMPONENT}(?:\\/${COMPONENT})*`
const IMAGE_REFERENCE = new RegExp(`^${REPOSITORY}(?::[A-Za-z0-9_][A-Za-z0-9_.-]{0,127})?(?:@sha256:[a-f0-9]{64})?$`)
const REPO_DIGEST = new RegExp(`^${REPOSITORY}@sha256:[a-f0-9]{64}$`)
const CONTEXT_FIELDS = ['commit', 'cliVersion', 'runId', 'runAttempt']

function hasValidRegistryPort(reference) {
  const firstComponent = reference.split('/')[0]
  const portMatch = firstComponent.match(/^(?:\[[0-9a-fA-F:]+\]|[^:]+):([0-9]+)$/)
  if (!portMatch) return true
  const port = Number(portMatch[1])
  return port >= 1 && port <= 65535
}

function isImageReference(reference) {
  return IMAGE_REFERENCE.test(reference) && hasValidRegistryPort(reference)
}

function isRepositoryDigest(value) {
  return REPO_DIGEST.test(value) && hasValidRegistryPort(value.slice(0, value.lastIndexOf('@')))
}

function assertAllowlistedFields(value, allowed, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`)
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw new Error(`image receipt ${label} contains a non-allowlisted field`)
  }
  for (const key of allowed) {
    if (!Object.hasOwn(value, key)) throw new Error(`image receipt ${label} omitted a required field`)
  }
}

function buildImageReceipt(projection, context) {
  assertAllowlistedFields(projection, ['containers', 'images'], 'projection')
  assertAllowlistedFields(context, CONTEXT_FIELDS, 'context')
  if (!projection || !Array.isArray(projection.containers) || projection.containers.length === 0) {
    throw new Error('no Supabase stack containers were found; refusing to write an empty image receipt')
  }
  if (!Array.isArray(projection.images)) throw new Error('image inspect inventory is missing')
  if (typeof context.commit !== 'string' || !/^[a-f0-9]{40}$/.test(context.commit) ||
      typeof context.cliVersion !== 'string' || context.cliVersion !== '2.98.2' ||
      typeof context.runId !== 'string' || !/^\d+$/.test(context.runId) ||
      typeof context.runAttempt !== 'string' || !/^\d+$/.test(context.runAttempt)) {
    throw new Error('image receipt context has invalid field types or values')
  }

  const imageById = new Map()
  for (const image of projection.images) {
    assertAllowlistedFields(image, ['id', 'repoDigests'], 'image')
    if (typeof image.id !== 'string' || !DIGEST.test(image.id)) throw new Error('image inspect result has no valid immutable image ID')
    if (imageById.has(image.id)) throw new Error('duplicate image identity in image inspect projection')
    if (!Array.isArray(image.repoDigests) || image.repoDigests.some((digest) => typeof digest !== 'string' || !isRepositoryDigest(digest))) {
      throw new Error('image inspect result has an invalid repository digest projection')
    }
    imageById.set(image.id, [...image.repoDigests].sort())
  }

  const seenNames = new Set()
  const normalized = projection.containers.map((container) => {
    assertAllowlistedFields(container, ['name', 'image', 'imageId'], 'container')
    const name = typeof container.name === 'string' ? container.name.replace(/^\//, '') : ''
    if (!/^[a-zA-Z0-9_.-]+$/.test(name)) throw new Error('container has a missing or invalid name')
    if (seenNames.has(name)) throw new Error(`duplicate container identity: ${name}`)
    seenNames.add(name)
    if (typeof container.image !== 'string' || !isImageReference(container.image)) throw new Error(`container ${name} has an invalid image reference`)
    if (typeof container.imageId !== 'string' || !DIGEST.test(container.imageId)) throw new Error(`container ${name} has no valid immutable image ID`)
    if (!imageById.has(container.imageId)) throw new Error(`container ${name} has no matching image inspect result`)
    const repoDigests = imageById.get(container.imageId)
    return {
      name,
      image: container.image,
      imageId: container.imageId,
      repoDigests,
      repoDigestStatus: repoDigests.length ? 'available' : 'unavailable',
      ...(repoDigests.length ? {} : { repoDigestNote: 'Docker reported no repository digest for this image; the immutable image ID is retained.' }),
    }
  }).sort((left, right) => left.name.localeCompare(right.name))

  return {
    schemaVersion: 1,
    commit: context.commit,
    cliVersion: context.cliVersion,
    runId: context.runId,
    runAttempt: context.runAttempt,
    containers: normalized,
  }
}

module.exports = { buildImageReceipt }

if (require.main === module) {
  const [projectionPath, receiptPath] = process.argv.slice(2)
  if (!projectionPath || !receiptPath) throw new Error('usage: node studio-service-role-image-receipt.cjs projection.json receipt.json')
  const projection = JSON.parse(readFileSync(projectionPath, 'utf8'))
  const receipt = buildImageReceipt(projection, {
    commit: process.env.GITHUB_SHA,
    cliVersion: process.env.SUPABASE_CLI_VERSION,
    runId: process.env.GITHUB_RUN_ID,
    runAttempt: process.env.GITHUB_RUN_ATTEMPT,
  })
  const json = `${JSON.stringify(receipt, null, 2)}\n`
  writeFileSync(receiptPath, json, { mode: 0o600 })
  process.stdout.write(json)
}
