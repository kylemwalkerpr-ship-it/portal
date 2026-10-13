import os,json,urllib.request,pathlib,hashlib
root=pathlib.Path('/tmp/yqaa-public-snapshot');root.mkdir()
columns='chunk_key,source_key,site,repository,source_url,title,section_title,chunk_index,jurisdiction,topic_tags,body,content_hash,authority_tier,fetched_at,lastmod'
count=0
with (root/'chunks.jsonl').open('w') as out:
 while True:
  url=os.environ['SNAPSHOT_URL'].rstrip('/')+'/rest/v1/yqaa_knowledge_chunks?select='+columns+'&order=chunk_key.asc&limit=500&offset='+str(count)
  req=urllib.request.Request(url,headers={'apikey':os.environ['SNAPSHOT_KEY'],'Authorization':'Bearer '+os.environ['SNAPSHOT_KEY']})
  with urllib.request.urlopen(req,timeout=45) as r: rows=json.load(r)
  if not rows:break
  for row in rows:out.write(json.dumps(row,separators=(',',':'))+'\n')
  count+=len(rows)
  if len(rows)<500:break
if count<1500:raise RuntimeError('Public snapshot unexpectedly undersized')
data=(root/'chunks.jsonl').read_bytes()
(root/'manifest.json').write_text(json.dumps({'count':count,'sha256':hashlib.sha256(data).hexdigest(),'public_knowledge_only':True}))
print(json.dumps({'count':count,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}))
