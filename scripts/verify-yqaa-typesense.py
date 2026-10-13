"""Verify deployed snapshot readiness and authenticated search without logging prose."""
import json,os,pathlib,re,urllib.request

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs): return None

root=pathlib.Path(os.environ.get('YQAA_SNAPSHOT_DIR','/tmp/yqaa-typesense-snapshot'))
expected=json.loads((root/'manifest.json').read_text())
url=os.environ['YQAA_TYPESENSE_URL'].rstrip('/')
if not re.fullmatch(r'https://[a-z0-9-]+(?:\.[a-z0-9-]+)?\.modal\.run',url):
    raise RuntimeError('unapproved_search_endpoint')
client=urllib.request.build_opener(NoRedirect)
with client.open(url+'/health',timeout=150) as r:health=json.load(r)
if health.get('ready') is not True or health.get('count')!=expected['count'] or health.get('version')!=expected['sha256']:
    raise RuntimeError('deployed_snapshot_mismatch')
request=urllib.request.Request(url+'/search',data=json.dumps({'query':'application documents','limit':3}).encode(),
    headers={'Content-Type':'application/json','Authorization':'Bearer '+os.environ['YQAA_TYPESENSE_TOKEN']})
with client.open(request,timeout=15) as r:search=json.load(r)
if search.get('ready') is not True or not search.get('chunks') or any(not x.get('source_url') for x in search['chunks']):
    raise RuntimeError('deployed_search_failed')
print(json.dumps({'ready':True,'count':health['count'],'version':health['version'],'search_hits':len(search['chunks'])}))
