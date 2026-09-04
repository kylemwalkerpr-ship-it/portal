import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import {
  buildTopicGraph,
  queryTopicGraph,
  type TopicDocument,
} from '@/lib/seoFactory/topicGraph'

/**
 * POST /api/content-studio/topics/analyze
 * Local topical graph from content_jobs or posted documents. Optional persist.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const persist = Boolean(body.persist)
    let docs: TopicDocument[] = []
    if (Array.isArray(body.documents) && body.documents.length) {
      docs = (body.documents as TopicDocument[]).slice(0, 80)
    } else {
      const { data } = await auth.db
        .from('content_jobs')
        .select('id, title, topic, content, canonical_url, primary_keyword, content_type')
        .order('updated_at', { ascending: false })
        .limit(40)
      docs = (data || []).map((j: Record<string, unknown>) => ({
        id: String(j.id),
        url: String(j.canonical_url || j.id),
        title: String(j.title || j.topic || 'untitled'),
        description: String(j.primary_keyword || ''),
        bodyText: String(j.content || '').slice(0, 12_000),
        category: String(j.content_type || ''),
      }))
    }

    const graph = buildTopicGraph(docs)
    const query = queryTopicGraph(graph)

    if (persist && graph.nodes.length) {
      const now = new Date().toISOString()
      await auth.db.from('seo_topic_nodes').upsert(
        graph.nodes.map((n) => ({ ...n, computed_at: now })),
        { onConflict: 'id' },
      )
      await auth.db.from('seo_topic_edges').upsert(
        graph.edges.map((e) => ({ ...e, computed_at: now })),
        { onConflict: 'source,target,relationship' },
      )
    }

    return NextResponse.json({
      ok: true,
      pages: docs.length,
      nodeCount: graph.nodes.length,
      edgeCount: graph.edges.length,
      persisted: persist,
      query,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'topic analyze failed'
    return NextResponse.json({ error: message.slice(0, 240) }, { status: 502 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }
    const type = request.nextUrl.searchParams.get('type')
    let q = auth.db.from('seo_topic_nodes').select('id, label, type, weight').order('weight', { ascending: false }).limit(100)
    if (type) q = q.eq('type', type)
    const { data: nodes, error } = await q
    if (error) return NextResponse.json({ error: error.message.slice(0, 240) }, { status: 502 })
    const { data: edges } = await auth.db.from('seo_topic_edges').select('source, target, relationship, weight').limit(400)
    return NextResponse.json({ ok: true, nodes: nodes || [], edges: edges || [] })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'topic graph read failed'
    return NextResponse.json({ error: message.slice(0, 240) }, { status: 502 })
  }
}
