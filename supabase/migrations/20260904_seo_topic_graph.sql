-- Phase 4 topical graph (local entities). Recompute after article updates.

CREATE TABLE IF NOT EXISTS public.seo_topic_nodes (
  id text PRIMARY KEY,
  label text NOT NULL,
  type text NOT NULL,
  weight numeric NOT NULL DEFAULT 0,
  computed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.seo_topic_edges (
  source text NOT NULL,
  target text NOT NULL,
  relationship text NOT NULL,
  weight numeric NOT NULL DEFAULT 0,
  computed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source, target, relationship)
);

ALTER TABLE public.seo_topic_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seo_topic_edges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "seo_topic_nodes full access" ON public.seo_topic_nodes;
CREATE POLICY "seo_topic_nodes full access" ON public.seo_topic_nodes FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "seo_topic_edges full access" ON public.seo_topic_edges;
CREATE POLICY "seo_topic_edges full access" ON public.seo_topic_edges FOR ALL USING (true) WITH CHECK (true);
