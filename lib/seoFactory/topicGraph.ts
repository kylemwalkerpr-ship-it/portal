/**
 * Phase 4 — local entity / topical graph. No embeddings, no paid NLP APIs.
 */

import { LIFECYCLE_STAGES } from '@/lib/seoEngine/ontology'

export type TopicNodeType = 'entity' | 'topic' | 'cluster' | 'page'

export type TopicRelationship = 'mentions' | 'covers' | 'related' | 'links' | 'ranks_for'

export interface TopicNode {
  id: string
  label: string
  type: TopicNodeType
  weight: number
}

export interface TopicEdge {
  source: string
  target: string
  relationship: TopicRelationship
  weight: number
}

export interface TopicDocument {
  id: string
  url: string
  title: string
  description?: string
  bodyText: string
  headings?: string[]
  category?: string
  clusterIds?: string[]
}

export interface TopicGraph {
  nodes: TopicNode[]
  edges: TopicEdge[]
}

export interface TopicGraphQuery {
  strongTopics: Array<{ label: string; pages: number; weight: number }>
  thinClusters: Array<{ label: string; pages: number }>
  cooccurring: Array<{ a: string; b: string; weight: number }>
  overlappingPages: Array<{ a: string; b: string; shared: number }>
  linkCandidates: Array<{ from: string; to: string; via: string }>
  weakPillars: Array<{ label: string; spokes: number }>
}

function nodeId(type: TopicNodeType, label: string): string {
  return `${type}:${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 72)}`
}

function estateLexicon(): string[] {
  const out = new Set<string>()
  for (const stage of LIFECYCLE_STAGES) {
    out.add(stage.label.toLowerCase())
    for (const cell of Object.values(stage.countries)) {
      for (const kw of cell.seedKeywords) out.add(kw.toLowerCase())
      for (const a of cell.statutoryAnchors) out.add(a.toLowerCase())
    }
  }
  return [...out].filter((s) => s.length >= 4)
}

const LEXICON = estateLexicon()

export function extractHeadings(md: string): string[] {
  return String(md || '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^#{1,3}\s+/.test(l))
    .map((l) => l.replace(/^#{1,3}\s+/, '').trim())
    .filter(Boolean)
}

/** Proper-noun-ish phrases + lexicon hits in the text. */
export function extractEntities(text: string, extra: string[] = []): string[] {
  const body = String(text || '')
  const found = new Set<string>()
  const proper = body.match(/\b([A-Z][a-zA-Z0-9]+(?:\s+[A-Z][a-zA-Z0-9]+){0,4})\b/g) || []
  for (const p of proper) {
    if (p.length < 3) continue
    if (/^(The|A|An|And|For|With|This|That|From)$/i.test(p)) continue
    found.add(p.trim())
  }
  const lower = body.toLowerCase()
  for (const term of [...LEXICON, ...extra.map((e) => e.toLowerCase())]) {
    if (term.length >= 4 && lower.includes(term)) found.add(term)
  }
  return [...found].slice(0, 40)
}

function addNode(map: Map<string, TopicNode>, type: TopicNodeType, label: string, weight: number) {
  const id = nodeId(type, label)
  const prev = map.get(id)
  if (prev) prev.weight += weight
  else map.set(id, { id, label, type, weight })
  return id
}

function addEdge(list: TopicEdge[], source: string, target: string, relationship: TopicRelationship, weight: number) {
  if (source === target) return
  const hit = list.find((e) => e.source === source && e.target === target && e.relationship === relationship)
  if (hit) hit.weight += weight
  else list.push({ source, target, relationship, weight })
}

export function buildTopicGraph(
  docs: TopicDocument[],
  clusters: Array<{ id: string; label: string; keywords: string[] }> = [],
): TopicGraph {
  const nodes = new Map<string, TopicNode>()
  const edges: TopicEdge[] = []

  for (const cl of clusters) {
    const cid = addNode(nodes, 'cluster', cl.label, cl.keywords.length)
    for (const kw of cl.keywords.slice(0, 12)) {
      const eid = addNode(nodes, 'entity', kw, 1)
      addEdge(edges, cid, eid, 'covers', 1)
    }
  }

  for (const doc of docs) {
    const pageLabel = doc.title || doc.url || doc.id
    const pid = addNode(nodes, 'page', pageLabel, 1)
    const heads = doc.headings?.length ? doc.headings : extractHeadings(doc.bodyText)
    const blob = [doc.title, doc.description, heads.join(' '), doc.bodyText.slice(0, 12_000)].join('\n')
    const entities = extractEntities(blob, clusters.flatMap((c) => c.keywords))
    for (const ent of entities) {
      const eid = addNode(nodes, 'entity', ent, 1)
      addEdge(edges, pid, eid, 'mentions', 1)
    }
    if (doc.category) {
      const tid = addNode(nodes, 'topic', doc.category, 2)
      addEdge(edges, pid, tid, 'covers', 2)
    }
    for (const cid of doc.clusterIds || []) {
      const cluster = clusters.find((c) => c.id === cid)
      if (!cluster) continue
      const nid = addNode(nodes, 'cluster', cluster.label, 1)
      addEdge(edges, pid, nid, 'covers', 2)
    }
    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < Math.min(entities.length, i + 6); j++) {
        addEdge(edges, nodeId('entity', entities[i]), nodeId('entity', entities[j]), 'related', 1)
      }
    }
  }

  return { nodes: [...nodes.values()], edges }
}

export function queryTopicGraph(graph: TopicGraph): TopicGraphQuery {
  const pages = graph.nodes.filter((n) => n.type === 'page')
  const topics = graph.nodes.filter((n) => n.type === 'topic' || n.type === 'cluster')
  const pageMentions = new Map<string, Set<string>>()
  const topicPages = new Map<string, Set<string>>()
  const co = new Map<string, number>()

  for (const e of graph.edges) {
    if (e.relationship === 'mentions' && e.source.startsWith('page:')) {
      if (!pageMentions.has(e.source)) pageMentions.set(e.source, new Set())
      pageMentions.get(e.source)!.add(e.target)
    }
    if (e.relationship === 'covers' && e.source.startsWith('page:')) {
      if (!topicPages.has(e.target)) topicPages.set(e.target, new Set())
      topicPages.get(e.target)!.add(e.source)
    }
    if (e.relationship === 'related' && e.source.startsWith('entity:')) {
      const key = [e.source, e.target].sort().join('|')
      co.set(key, (co.get(key) || 0) + e.weight)
    }
  }

  const strongTopics = topics
    .map((t) => ({ label: t.label, pages: topicPages.get(t.id)?.size || 0, weight: t.weight }))
    .filter((t) => t.pages >= 2 || t.weight >= 3)
    .sort((a, b) => b.pages - a.pages || b.weight - a.weight)
    .slice(0, 20)

  const thinClusters = graph.nodes
    .filter((n) => n.type === 'cluster')
    .map((t) => ({ label: t.label, pages: topicPages.get(t.id)?.size || 0 }))
    .filter((t) => t.pages <= 1)
    .slice(0, 20)

  const cooccurring = [...co.entries()]
    .map(([k, weight]) => {
      const [a, b] = k.split('|')
      return { a, b, weight }
    })
    .sort((x, y) => y.weight - x.weight)
    .slice(0, 30)

  const overlappingPages: TopicGraphQuery['overlappingPages'] = []
  const pageIds = pages.map((p) => p.id)
  for (let i = 0; i < pageIds.length; i++) {
    for (let j = i + 1; j < pageIds.length; j++) {
      const A = pageMentions.get(pageIds[i]) || new Set()
      const B = pageMentions.get(pageIds[j]) || new Set()
      let shared = 0
      for (const x of A) if (B.has(x)) shared++
      if (shared >= 4) overlappingPages.push({ a: pageIds[i], b: pageIds[j], shared })
    }
  }
  overlappingPages.sort((a, b) => b.shared - a.shared)

  const linkCandidates: TopicGraphQuery['linkCandidates'] = []
  for (const [page, ents] of pageMentions) {
    for (const other of pageIds) {
      if (other === page) continue
      const otherEnts = pageMentions.get(other) || new Set()
      for (const ent of ents) {
        if (otherEnts.has(ent)) {
          linkCandidates.push({ from: page, to: other, via: ent })
          break
        }
      }
    }
  }

  const weakPillars = strongTopics
    .filter((t) => t.pages === 1)
    .map((t) => ({ label: t.label, spokes: t.pages }))

  return {
    strongTopics,
    thinClusters,
    cooccurring,
    overlappingPages: overlappingPages.slice(0, 20),
    linkCandidates: linkCandidates.slice(0, 40),
    weakPillars,
  }
}
