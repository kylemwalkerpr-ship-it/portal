"""Export only the finalized public knowledge projection, never customer data."""
import hashlib,json,os,pathlib,urllib.request

root=pathlib.Path(os.environ.get('YQAA_SNAPSHOT_DIR','/tmp/yqaa-typesense-snapshot'))
root.mkdir(parents=True,exist_ok=True)
columns='chunk_key,source_key,site,repository,source_url,title,section_title,jurisdiction,topic_tags,body,authority_tier,fetched_at,lastmod'
base=os.environ['NEXT_PUBLIC_SUPABASE_URL'].rstrip('/')
key=os.environ.get('SUPABASE_SERVICE_ROLE_JWT') or os.environ['SUPABASE_SERVICE_ROLE_KEY']
headers={'apikey':key,'Authorization':'Bearer '+key}
def get(resource):
    with urllib.request.urlopen(urllib.request.Request(base+'/rest/v1/'+resource,headers=headers),timeout=45) as r:
        return json.load(r)
def completed_run():
    rows=get('yqaa_knowledge_ingestion_runs?select=run_id&status=eq.completed&order=started_at.desc&limit=1')
    if not rows:raise RuntimeError('no_completed_knowledge_run')
    return rows[0]['run_id']
run=completed_run();count=0
with (root/'chunks.jsonl').open('w') as out:
    while True:
        rows=get('yqaa_knowledge_chunks?select='+columns+'&order=chunk_key.asc&limit=500&offset='+str(count))
        if not rows:break
        for row in rows:out.write(json.dumps(row,separators=(',',':'))+'\n')
        count+=len(rows)
        if len(rows)<500:break
if count<1500 or completed_run()!=run:raise RuntimeError('snapshot_incomplete_or_changed')
digest=hashlib.sha256((root/'chunks.jsonl').read_bytes()).hexdigest()
(root/'manifest.json').write_text(json.dumps({'count':count,'sha256':digest,'run_id':run,'public_knowledge_only':True}))
print(json.dumps({'count':count,'sha256':digest}))
