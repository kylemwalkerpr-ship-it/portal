























DO $$
BEGIN
  
  
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'seo_interlinks_status_check'
  ) THEN
    ALTER TABLE public.seo_interlinks DROP CONSTRAINT seo_interlinks_status_check;
  END IF;
EXCEPTION WHEN undefined_table THEN
  
  NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='seo_interlinks'
  ) THEN
    ALTER TABLE public.seo_interlinks
      ADD CONSTRAINT seo_interlinks_status_check
      CHECK (status IN ('planned', 'applied', 'rejected', 'manual', 'paused', 'awaiting_gate'))
      NOT VALID;
    
    
    UPDATE public.seo_interlinks SET status='planned' WHERE status IS NULL OR status NOT IN ('planned','applied','rejected','manual','paused','awaiting_gate');
    ALTER TABLE public.seo_interlinks VALIDATE CONSTRAINT seo_interlinks_status_check;
  END IF;
END $$;



ALTER TABLE public.seo_interlinks
  ADD COLUMN IF NOT EXISTS gate_state TEXT,
  ADD COLUMN IF NOT EXISTS gate_reason TEXT,
  ADD COLUMN IF NOT EXISTS gate_actor TEXT,
  ADD COLUMN IF NOT EXISTS gate_updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_seo_interlinks_gate_state ON public.seo_interlinks (gate_state);
CREATE INDEX IF NOT EXISTS idx_seo_interlinks_status ON public.seo_interlinks (status);


CREATE TABLE IF NOT EXISTS public.seo_backlink_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain TEXT NOT NULL,                       
  target_url TEXT,                            
  title TEXT,                                 
  kind TEXT NOT NULL DEFAULT 'media' CHECK (kind IN
    ('media', 'gov', 'edu', 'ngo', 'industry_blog', 'partner', 'directory', 'forum')),
  lane TEXT NOT NULL DEFAULT 'editorial' CHECK (lane IN
    ('editorial',                  
     'guest_post',                 
     'resource_page',              
     'directory',                  
     'podcast_interview',          
     'broken_outreach',            
     'community',                  
     'partner'                     
    )),
  authority_score NUMERIC(5,2) NOT NULL DEFAULT 50.0,  
  traffic_estimate NUMERIC(12,0),                       
  contact_name TEXT,
  contact_email TEXT,
  contact_handle TEXT,                                 
  countries TEXT[] NOT NULL DEFAULT '{}',               
  stages TEXT[] NOT NULL DEFAULT '{}',                   
  topics TEXT[] NOT NULL DEFAULT '{}',                  
  rationale TEXT,                                       
  status TEXT NOT NULL DEFAULT 'identified' CHECK (status IN
    ('identified', 'researching', 'qualified', 'drafting', 'sent', 'awaiting_reply', 'responded', 'won', 'lost', 'skipped')),))
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_touched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  won_at TIMESTAMPTZ,
  lost_at TIMESTAMPTZ,
  won_backlink_url TEXT,                                
  notes TEXT,
  
  dedupe_key TEXT UNIQUE
);

CREATE INDEX IF NOT EXISTS idx_backlink_targets_status ON public.seo_backlink_targets (status, last_touched_at DESC);
CREATE INDEX IF NOT EXISTS idx_backlink_targets_lane ON public.seo_backlink_targets (lane, status);
CREATE INDEX IF NOT EXISTS idx_backlink_targets_authority ON public.seo_backlink_targets (authority_score DESC);
CREATE INDEX IF NOT EXISTS idx_backlink_targets_countries ON public.seo_backlink_targets USING GIN (countries);
CREATE INDEX IF NOT EXISTS idx_backlink_targets_stages ON public.seo_backlink_targets USING GIN (stages);


CREATE TABLE IF NOT EXISTS public.seo_backlink_outreach (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id UUID NOT NULL REFERENCES public.seo_backlink_targets(id) ON DELETE CASCADE,
  
  channel TEXT NOT NULL DEFAULT 'email' CHECK (channel IN
    ('email', 'linkedin_dm', 'twitter_dm', 'twitter_reply', 'contact_form', 'phone', 'in_person')),
  direction TEXT NOT NULL DEFAULT 'outbound' CHECK (direction IN
    ('outbound',                    
     'inbound',                     
     'internal'                     
    )),
  subject TEXT,
  message_body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'drafted' CHECK (status IN
    ('drafted', 'queued', 'sent', 'bounced', 'responded', 'replied_positive', 'replied_negative', 'replied_neutral',))
     'follow_up_due', 'follow_up_sent', 'won', 'lost', 'withdrawn')),
  drafted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  first_reply_at TIMESTAMPTZ,
  follow_up_due_at TIMESTAMPTZ,
  follow_up_count INT NOT NULL DEFAULT 0,
  replied_summary TEXT,
  reply_text TEXT,
  lost_reason TEXT,
  operator_id TEXT,                                       
  source_brief JSONB DEFAULT '{}',                        
  created_at TIMESTAMPTZ NOT NULL DEFAULT now())
);

CREATE INDEX IF NOT EXISTS idx_backlink_outreach_target ON public.seo_backlink_outreach (target_id, drafted_at DESC);
CREATE INDEX IF NOT EXISTS idx_backlink_outreach_status ON public.seo_backlink_outreach (status);
CREATE INDEX IF NOT EXISTS idx_backlink_outreach_follow_up ON public.seo_backlink_outreach (follow_up_due_at)
  WHERE follow_up_due_at IS NOT NULL AND status NOT IN ('won','lost','withdrawn');


CREATE OR REPLACE VIEW public.seo_backlink_dashboard AS
SELECT
  t.id,
  t.domain,
  t.target_url,
  t.title,
  t.kind,
  t.lane,
  t.authority_score,
  t.contact_name,
  t.contact_email,
  t.countries,
  t.stages,
  t.topics,
  t.rationale,
  t.status AS target_status,
  t.first_seen_at,
  t.last_touched_at,
  t.won_at,
  t.lost_at,
  t.won_backlink_url,
  COALESCE((
    SELECT jsonb_build_object(
      'id', o.id,
      'channel', o.channel,
      'status', o.status,
      'subject', o.subject,
      'sent_at', o.sent_at,
      'first_reply_at', o.first_reply_at,
      'follow_up_due_at', o.follow_up_due_at,
      'follow_up_count', o.follow_up_count,
      'replied_summary', o.replied_summary
    )
    FROM public.seo_backlink_outreach o
    WHERE o.target_id = t.id
    ORDER BY o.drafted_at DESC LIMIT 1
  ), '{}'::jsonb) AS latest_outreach,
  (
    SELECT count(*)::int
    FROM public.seo_backlink_outreach o
    WHERE o.target_id = t.id
  ) AS outreach_count,
  (
    SELECT count(*)::int
    FROM public.seo_backlink_outreach o
    WHERE o.target_id = t.id AND o.status = 'won'
  ) AS wins
FROM public.seo_backlink_targets t;



INSERT INTO public.seo_backlink_targets (domain, target_url, title, kind, lane, authority_score, countries, stages, topics, rationale, dedupe_key)
VALUES
  ('uscis.gov', 'https://www.uscis.gov/', 'USCIS (US Citizenship & Immigration Services)', 'gov', 'editorial', 95.0,
   ARRAY['US'], ARRAY['schools','work','visa','settlement','citizenship','family'],
   ARRAY['f-1','h-1b','i-485','n-400','green-card'],
   'Direct policy source. Earned citations in our casework and FAQ content when we cite USCIS forms, processing-time data, and statutory anchors.',
   'uscis.gov'),

  ('travel.state.gov', 'https://travel.state.gov/', 'US Department of State 
   ARRAY['US'], ARRAY['work','visa','settlement','family'],
   ARRAY['h-1b','l-1','k-1','cr-1','ds-160'],
   'Statutory anchor for consular processing. We earn backlinks by maintaining accurate, DS-160 / NVC walkthroughs.',
   'travel.state.gov'),

  ('homeoffice.gov.uk', 'https://www.gov.uk/government/organisations/home-office', 'UK Home Office', 'gov', 'editorial', 92.0,
   ARRAY['UK'], ARRAY['schools','work','visa','settlement','citizenship','family','relatives'],
   ARRAY['skilled-worker','spouse-visa','ilr','life-in-the-uk','graduate-route'],
   'Statutory anchor for UK Immigration Rules + Appendix FM. Citations in our skilled-worker and family visa guides.',
   'homeoffice.gov.uk'),

  ('canada.ca', 'https://www.canada.ca/en/services/immigration-citizenship.html', 'IRCC 
   ARRAY['CA'], ARRAY['schools','work','visa','settlement','citizenship','family','relatives'],
   ARRAY['express-entry','study-permit','pgwp','spousal-sponsorship'],
   'Statutory anchor for IRPA + IRPR. Citations in Express Entry and study permit guides.',
   'canada.ca'),

  ('immi.homeaffairs.gov.au', 'https://immi.homeaffairs.gov.au/', 'Department of Home Affairs (AU)', 'gov', 'editorial', 91.0,
   ARRAY['AU'], ARRAY['schools','work','visa','settlement','citizenship','family','relatives'],
   ARRAY['subclass-189','subclass-190','subclass-491','partner-visa','citizenship-test'],
   'Statutory anchor for Migration Regulations. Citations in skilled + partner visa guides.',
   'immi.homeaffairs.gov.au'),

  ('blog.google', 'https://blog.google/products/search/', 'Google Search Central Blog', 'media', 'editorial', 96.0,
   ARRAY['US','UK','CA','AU'], ARRAY['intent','schools','work','visa'],
   ARRAY['ai-overviews','helpful-content','core-update','structured-data'],
   'Earned citations when we reference Google AI search / SGE guidance in our SEO strategy + E-E-A-T posts.',
   'blog.google'),

  ('developers.google.com', 'https://developers.google.com/search', 'Google Search Central Docs', 'media', 'editorial', 95.0,
   ARRAY['US','UK','CA','AU'], ARRAY['intent','schools','work','visa'],
   ARRAY['structured-data','schema.org','indexing-api','page-experience'],
   'Earned citations when our technical-SEO content covers structured data, indexing API, page experience signals.',
   'developers.google.com'),

  ('searchengineland.com', 'https://searchengineland.com/', 'Search Engine Land', 'media', 'guest_post', 88.0,
   ARRAY['US','UK','CA','AU'], ARRAY['intent','schools','work','visa','settlement','citizenship','family'],
   ARRAY['seo','ai-search','y-my-l','e-e-a-t'],
   'High-authority SEO publication. Guest posts on AI search + programmatic SEO for legal / immigration verticals.',
   'searchengineland.com'),

  ('moz.com', 'https://moz.com/blog', 'Moz Blog', 'media', 'guest_post', 91.0,
   ARRAY['US','UK','CA','AU'], ARRAY['intent'],
   ARRAY['domain-authority','link-graph','on-page-seo'],
   'Industry pillar. Guest posts on link graph, programmatic content, and YMYL compliance.',
   'moz.com'),

  ('ahrefs.com', 'https://ahrefs.com/blog', 'Ahrefs Blog', 'media', 'guest_post', 90.0,
   ARRAY['US','UK','CA','AU'], ARRAY['intent'],
   ARRAY['keyword-research','competitor-analysis','content-gaps'],
   'Industry pillar. Guest posts on keyword research + content gaps for legal / immigration industries.',
   'ahrefs.com'),

  ('ilw.com', 'https://www.ilw.com/', 'Immigration Law Weekly (ilw.com)', 'industry_blog', 'guest_post', 78.0,
   ARRAY['US'], ARRAY['work','visa','settlement','citizenship','family','relatives'],
   ARRAY['uscis-policy','priority-dates','visa-bulletin','administrative-review'],
   'Immigration law community. Guest posts on casework wins, processing times, and our attorney marketplace.',
   'ilw.com'),

  ('rcic.ca', 'https://www.rcic.ca/', 'Regulated Canadian Immigration Consultants Association', 'industry_blog', 'editorial', 75.0,
   ARRAY['CA'], ARRAY['work','visa','settlement','family'],
   ARRAY['rcic','crs','express-entry'],
   'Industry association. Earned citations when we reference CRS changes + RCIC certification in our CA guides.',
   'rcic.ca'),

  ('mara.gov.au', 'https://www.mara.gov.au/', 'MARA 
   ARRAY['AU'], ARRAY['work','visa','citizenship','family','relatives'],
   ARRAY['mara','migration-agent','skilled-occupation-list'],
   'Industry authority. Earned citations when we reference skills lists + MARA-registered agents.',
   'mara.gov.au'),

  ('reddit.com', 'https://www.reddit.com/r/immigration/', 'Reddit r/immigration', 'forum', 'community', 84.0,
   ARRAY['US','UK','CA','AU'], ARRAY['intent','schools','work','visa','settlement','citizenship','family'],
   ARRAY['community','authentic-experience'],
   'Authentic-experience surface 
   'reddit.com')
ON CONFLICT (dedupe_key) DO NOTHING;
