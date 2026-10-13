"""Public-knowledge-only, rebuildable Typesense service on Modal."""
import modal
import os

def validate_snapshot(raw, manifest):
    import hashlib, json, re
    if hashlib.sha256(raw).hexdigest() != manifest['sha256']:
        raise RuntimeError('snapshot_hash_mismatch')
    rows = [json.loads(line) for line in raw.splitlines() if line]
    if len(rows) != manifest['count'] or len(rows) < 1500:
        raise RuntimeError('snapshot_count_mismatch')
    keys = set()
    for row in rows:
        key = row.get('chunk_key')
        if not isinstance(key, str) or not key or key in keys:
            raise RuntimeError('snapshot_duplicate_or_missing_key')
        keys.add(key)
        if not isinstance(row.get('body'), str) or not row['body'].strip() or not re.match(
            r'^(https://|repo://kylemwalkerpr-ship-it/portal/content/messenger-kb/)', row.get('source_url', '')):
            raise RuntimeError('snapshot_source_invalid')
    return rows

def validate_import(raw, count):
    import json
    outcomes = [json.loads(line) for line in raw.splitlines() if line]
    if len(outcomes) != count or any(x.get('success') is not True for x in outcomes):
        raise RuntimeError('snapshot_import_failed')

app = modal.App('yqaa-typesense')
image = modal.Image.from_registry('typesense/typesense:30.2', add_python='3.12').entrypoint([])
image = image.env({'YQAA_SNAPSHOT_VERSION': os.environ.get('YQAA_SNAPSHOT_VERSION', 'initial')})
volume = modal.Volume.from_name('yqaa-typesense-public-snapshots')

@app.function(image=image, cpu=0.5, memory=1024, timeout=300,
              min_containers=0, max_containers=1, scaledown_window=60,
              volumes={'/snapshots': volume.with_mount_options(read_only=True)},
              secrets=[modal.Secret.from_name('yqaa-typesense-search')])
@modal.concurrent(max_inputs=16)
@modal.web_server(8000, startup_timeout=180)
def serve():
    import hashlib, hmac, json, os, pathlib, re, secrets, subprocess, tempfile, time
    import urllib.request
    from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
    from threading import Thread

    snapshot = pathlib.Path('/snapshots') / os.environ['YQAA_SNAPSHOT_VERSION']
    manifest = json.loads((snapshot / 'manifest.json').read_text())
    raw = (snapshot / 'chunks.jsonl').read_bytes()
    rows = validate_snapshot(raw, manifest)
    key = secrets.token_urlsafe(48)
    token = os.environ['YQAA_SEARCH_TOKEN']
    data = tempfile.mkdtemp(prefix='yqaa-typesense-')
    process = subprocess.Popen(['/opt/typesense-server', '--data-dir=' + data,
        '--api-address=127.0.0.1', '--api-port=8108', '--log-slow-searches-time-ms=-1',
        '--log-slow-requests-time-ms=-1', '--enable-cors=false'],
        env={**os.environ, 'TYPESENSE_API_KEY': key}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    def api(path, body=None, method=None, timeout=60):
        req = urllib.request.Request('http://127.0.0.1:8108/' + path,
            data=body, method=method, headers={'X-TYPESENSE-API-KEY': key, 'Content-Type': 'application/json'})
        with urllib.request.urlopen(req, timeout=timeout) as response:
            return response.read()

    for _ in range(150):
        try:
            if json.loads(api('health', timeout=1)).get('ok'): break
        except Exception:
            if process.poll() is not None: raise RuntimeError('typesense_start_failed')
            time.sleep(.2)
    else: raise RuntimeError('typesense_not_ready')

    fields = [{'name': name, 'type': 'string', 'optional': True,
               'facet': name in ['site', 'jurisdiction'], 'index': name in ['title','section_title','body','site','jurisdiction']}
              for name in ['chunk_key','source_key','site','repository','source_url','title','section_title','jurisdiction','body','fetched_at','lastmod']]
    fields += [{'name':'topic_tags','type':'string[]','optional':True},
               {'name':'authority_tier','type':'int32','optional':True}]
    api('collections', json.dumps({'name':'yqaa_knowledge','fields':fields}).encode(), 'POST')
    allowed = {f['name'] for f in fields}
    ids = set()
    for offset in range(0, len(rows), 500):
        batch=[]
        for row in rows[offset:offset+500]:
            if not row.get('body') or not re.match(r'^(https://|repo://kylemwalkerpr-ship-it/portal/content/messenger-kb/)', row.get('source_url','')):
                raise RuntimeError('snapshot_source_invalid')
            doc = {k: row.get(k) or ([] if k=='topic_tags' else 3 if k=='authority_tier' else '') for k in allowed}
            doc['id']=hashlib.sha256(row['chunk_key'].encode()).hexdigest()
            if doc['id'] in ids: raise RuntimeError('snapshot_duplicate_key')
            ids.add(doc['id']);batch.append(json.dumps(doc,separators=(',',':')))
        result=api('collections/yqaa_knowledge/documents/import?action=create','\n'.join(batch).encode(),'POST')
        validate_import(result, len(batch))
    if json.loads(api('collections/yqaa_knowledge'))['num_documents'] != len(rows):
        raise RuntimeError('index_count_mismatch')

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args): pass
        def answer(self, status, value):
            body=json.dumps(value,separators=(',',':')).encode()
            self.send_response(status);self.send_header('Content-Type','application/json')
            self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
        def do_GET(self):
            if self.path != '/health': return self.answer(404, {'error':'not_found'})
            return self.answer(200, {'ready':True,'count':len(rows),'version':manifest['sha256']})
        def do_POST(self):
            if self.path != '/search':return self.answer(404,{'error':'not_found'})
            if not hmac.compare_digest(self.headers.get('Authorization',''), 'Bearer '+token):
                return self.answer(401,{'error':'unauthorized'})
            try:
                size=int(self.headers.get('Content-Length','0'))
                if size<1 or size>12000:return self.answer(400,{'error':'invalid_request'})
                args=json.loads(self.rfile.read(size));query=args.get('query');limit=args.get('limit',12)
                if not isinstance(query,str) or not query.strip() or len(query)>2000 or type(limit)!=int or not 1<=limit<=24:
                    return self.answer(400,{'error':'invalid_request'})
                jurisdiction=args.get('jurisdiction')
                if jurisdiction not in [None,'United States','Canada','United Kingdom','Australia']:
                    return self.answer(400,{'error':'invalid_jurisdiction'})
                params={'q':query,'query_by':'title,section_title,body,topic_tags','per_page':limit,
                        'exclude_fields':'id','highlight_fields':'none'}
                if jurisdiction:params['filter_by']='jurisdiction:=[`'+jurisdiction+'`,`Global`,``]'
                result=json.loads(api('multi_search',json.dumps({'searches':[{'collection':'yqaa_knowledge',**params}]}).encode(),'POST',timeout=2))
                search=result['results'][0]
                if 'error' in search: return self.answer(503,{'error':'search_unavailable'})
                chunks=[]
                terms=set(re.findall(r'\w+',query.lower()))
                for hit in search.get('hits',[]):
                    doc=hit['document'];doc['body']=doc['body'][:5000]
                    # Independent token coverage, never Typesense's raw relevance score.
                    words=set(re.findall(r'\w+',(doc['title']+' '+doc['body']).lower()))
                    doc['score']=round(8*len(terms & words)/max(1,len(terms)),3)
                    chunks.append(doc)
                return self.answer(200,{'ready':True,'chunks':chunks,'version':manifest['sha256']})
            except Exception:return self.answer(503,{'error':'search_unavailable'})
    server=ThreadingHTTPServer(('0.0.0.0',8000),Handler)
    Thread(target=server.serve_forever,daemon=True).start()
