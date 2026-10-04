import concurrent.futures, hashlib, html, http.client, json, os, random, re, socket, ssl, time
import urllib.error, urllib.parse, urllib.request
import certifi
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from pathlib import Path
from datetime import datetime, timezone

OUT = Path(os.environ.get('YQAA_KB_OUT', str(Path.cwd() / '.yqaa-kb-crawl'))).resolve()
OUT.mkdir(parents=True, exist_ok=True)
TIMEOUT = 18
MAX_WORKERS = 12
MAX_PAGES = 1800
UA = 'YouSafeYQAAKnowledgeBot/3.0 (+public knowledge indexing)'
SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
ASSET_RE = re.compile(r'\.(?:png|jpe?g|gif|webp|svg|ico|css|js|mjs|map|woff2?|ttf|eot|mp4|webm|mov|mp3|wav|pdf|zip|xml|json)$', re.I)
COMMON_DENY = re.compile(r'^/(?:api|_next|admin|internal)(?:/|$)', re.I)
PRIVATE = re.compile(r'^/(?:dashboard|orders?|messages?|inbox|wallet|account|settings|checkout|billing|profile|student|attorney|consultant|client)(?:/|$)', re.I)

SITES = [
    {'id':'main','base':'https://yousafeconsultancy.com','repo':'kylemwalkerpr-ship-it/yousafe-consultancy','jur':None,'seeds':['/','/services','/shop','/blog','/about','/faqs','/ai/','/llms.txt','/assistant-knowledge.json']},
    {'id':'usa','base':'https://usa.yousafeconsultancy.com','repo':'kylemwalkerpr-ship-it/yousafe-consultancy','jur':'United States','seeds':['/','/ai/','/llms.txt']},
    {'id':'canada','base':'https://ca.yousafeconsultancy.com','repo':'kylemwalkerpr-ship-it/yousafe-consultancy','jur':'Canada','seeds':['/','/ai/','/llms.txt']},
    {'id':'uk','base':'https://uk.yousafeconsultancy.com','repo':'kylemwalkerpr-ship-it/yousafe-consultancy','jur':'United Kingdom','seeds':['/','/ai/','/llms.txt']},
    {'id':'australia','base':'https://au.yousafeconsultancy.com','repo':'kylemwalkerpr-ship-it/yousafe-consultancy','jur':'Australia','seeds':['/','/ai/','/llms.txt']},
    {'id':'caseworks','base':'https://legal.yousafeconsultancy.com','repo':'kylemwalkerpr-ship-it/caseworks','jur':None,'seeds':['/','/library/','/articles/','/topics/','/tracks/','/glossary/','/templates/','/llms.txt','/llms-full.txt']},
    {'id':'market','base':'https://market.yousafeconsultancy.com','repo':'kylemwalkerpr-ship-it/portal','jur':None,'seeds':['/','/marketplace','/marketplace/categories','/gigs','/categories','/providers','/shop']},
    {'id':'portal','base':'https://portal.yousafeconsultancy.com','repo':'kylemwalkerpr-ship-it/portal','jur':None,'seeds':['/']},
    {'id':'support','base':'https://support.yousafeconsultancy.com','repo':'kylemwalkerpr-ship-it/support-saas','jur':None,'seeds':['/']},
]
TOPICS = [
    ('immigration', r'\b(immigration|visa|uscis|ircc|ukvi|home affairs|green card|permanent residence|work permit|study permit|subclass|f-?1)\b'),
    ('student', r'\b(student|university|college|admission|study permit|student visa|f-?1|sop|statement of purpose)\b'),
    ('housing', r'\b(housing|tenant|tenancy|landlord|lease|rent|deposit|eviction)\b'),
    ('legal', r'\b(legal|law|lawyer|attorney|court|statute|rights|appeal|dispute)\b'),
    ('career', r'\b(job|career|resume|cv|linkedin|employment|interview)\b'),
    ('credential', r'\b(credential|wes|assessment|degree equivalen|transcript)\b'),
    ('settlement', r'\b(settlement|arrival|banking|phone|transport|health insurance|integration)\b'),
    ('marketplace', r'\b(marketplace|provider|consultant|attorney|gig|service package|book|order)\b'),
    ('support', r'\b(support|help|ticket|contact|refund|complaint)\b'),
    ('pricing', r'\b(price|pricing|cost|fee|payment|checkout|refund)\b'),
    ('policy', r'\b(privacy|terms|policy|refund policy|cookies|consent)\b'),
]
JURS = [
    ('United States', r'\b(united states|u\.?s\.?a?\.?|american|uscis|f-?1|green card)\b'),
    ('Canada', r'\b(canada|canadian|ircc|pgwp|study permit)\b'),
    ('United Kingdom', r'\b(united kingdom|britain|british|ukvi|gov\.uk)\b'),
    ('Australia', r'\b(australia|australian|home affairs|subclass\s*\d+)\b'),
]

def now_iso():
    return datetime.now(timezone.utc).isoformat()

def sha(value):
    return hashlib.sha256(value.encode('utf-8', 'ignore')).hexdigest()

# Transient network failures (TCP resets from the CDN edge, read timeouts,
# 429/5xx) used to drop pages from a single crawl and push per-site coverage
# under the sync guard's minimums (e.g. run 37168209895: usa 435 -> 408 from
# "Connection reset by peer"). Retry those with backoff; permanent 4xx still
# fail immediately so a real removal is still reflected in coverage.
FETCH_ATTEMPTS = 4
RETRY_HTTP_STATUS = {408, 425, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524}

def _is_transient(exc):
    if isinstance(exc, urllib.error.HTTPError):
        return exc.code in RETRY_HTTP_STATUS
    if isinstance(exc, (ConnectionError, TimeoutError, socket.timeout, http.client.IncompleteRead, http.client.RemoteDisconnected)):
        return True
    if isinstance(exc, urllib.error.URLError):
        reason = exc.reason
        return isinstance(reason, (ConnectionError, TimeoutError, socket.timeout, OSError))
    return False

def _retry_delay(exc, attempt):
    retry_after = None
    if isinstance(exc, urllib.error.HTTPError):
        try:
            retry_after = float(exc.headers.get('Retry-After') or '')
        except (TypeError, ValueError):
            retry_after = None
    base = retry_after if retry_after is not None else 1.5 * (2 ** (attempt - 1))
    return min(base, 15.0) + random.uniform(0, 0.75)

def fetch(url, accept='text/html,application/xhtml+xml,application/xml,text/xml;q=0.9,*/*;q=0.5'):
    for attempt in range(1, FETCH_ATTEMPTS + 1):
        try:
            return _fetch_once(url, accept)
        except Exception as exc:
            if attempt >= FETCH_ATTEMPTS or not _is_transient(exc):
                raise
            time.sleep(_retry_delay(exc, attempt))

def _fetch_once(url, accept):
    request = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': accept})
    with urllib.request.urlopen(request, timeout=TIMEOUT, context=SSL_CONTEXT) as response:
        raw = response.read()
        ctype = response.headers.get('content-type', '')
        match = re.search(r'charset=([^;\s]+)', ctype, re.I)
        enc = match.group(1).strip('"\'') if match else 'utf-8'
        try:
            text = raw.decode(enc, errors='replace')
        except Exception:
            text = raw.decode('utf-8', errors='replace')
        return response.geturl(), int(response.status), dict(response.headers.items()), text

def safe_url(raw, site):
    try:
        absolute = urllib.parse.urljoin(site['base'] + '/', raw)
        parsed = urllib.parse.urlsplit(absolute)
        base = urllib.parse.urlsplit(site['base'])
        if parsed.scheme != 'https' or parsed.hostname != base.hostname:
            return None
        path = re.sub(r'/+', '/', parsed.path or '/')
        if path.lower().endswith('.json') and path != '/assistant-knowledge.json':
            return None
        if (ASSET_RE.search(path) and path != '/assistant-knowledge.json') or COMMON_DENY.search(path):
            return None
        if site['id'] in {'market', 'portal', 'support'} and PRIVATE.search(path):
            return None
        if site['id'] == 'portal' and re.match(r'^/(?:sign-in|sign-up)(?:/|$)', path, re.I):
            return None
        return urllib.parse.urlunsplit(('https', parsed.netloc, path, '', ''))
    except Exception:
        return None

class PageParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.skip = 0
        self.in_title = False
        self.in_heading = False
        self.heading_parts = []
        self.title_parts = []
        self.sections = []
        self.current_heading = ''
        self.current = []
        self.links = []
        self.noindex = False
        self.description = ''

    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        attrs = dict(attrs)
        if tag in {'script', 'style', 'noscript', 'svg', 'nav', 'footer'}:
            self.skip += 1
            return
        if self.skip:
            return
        if tag == 'title':
            self.in_title = True
        if tag in {'h1', 'h2', 'h3', 'h4'}:
            self.flush()
            self.in_heading = True
            self.heading_parts = []
        if tag == 'a' and attrs.get('href'):
            self.links.append(attrs['href'])
        if tag == 'meta':
            name = (attrs.get('name') or '').lower()
            value = attrs.get('content') or ''
            if name == 'robots' and 'noindex' in value.lower():
                self.noindex = True
            if name == 'description' and not self.description:
                self.description = value.strip()
        if tag in {'p', 'li', 'div', 'section', 'article', 'td', 'tr', 'br'}:
            self.current.append('\n')

    def handle_endtag(self, tag):
        tag = tag.lower()
        if tag in {'script', 'style', 'noscript', 'svg', 'nav', 'footer'}:
            if self.skip:
                self.skip -= 1
            return
        if self.skip:
            return
        if tag == 'title':
            self.in_title = False
        if tag in {'h1', 'h2', 'h3', 'h4'} and self.in_heading:
            self.current_heading = ' '.join(self.heading_parts).strip()
            self.in_heading = False
        if tag in {'p', 'li', 'div', 'section', 'article', 'td', 'tr'}:
            self.current.append('\n')

    def handle_data(self, data):
        if self.skip:
            return
        value = ' '.join(data.split())
        if not value:
            return
        if self.in_title:
            self.title_parts.append(value)
        elif self.in_heading:
            self.heading_parts.append(value)
        else:
            self.current.append(value + ' ')

    def flush(self):
        value = ''.join(self.current)
        value = re.sub(r'[ \t]+', ' ', value)
        value = re.sub(r'\n\s+', '\n', value)
        value = re.sub(r'\n{3,}', '\n\n', value).strip()
        if value:
            self.sections.append((self.current_heading, value))
        self.current = []

    def finish(self):
        self.flush()
        return {
            'title': ' '.join(self.title_parts).strip(),
            'description': self.description,
            'sections': self.sections,
            'links': self.links,
            'noindex': self.noindex,
        }

def parse_sitemap(xml_text):
    pages = []
    child_sitemaps = []
    try:
        root = ET.fromstring(xml_text)
        for node in root.iter():
            if not node.tag.lower().endswith('loc'):
                continue
            loc = (node.text or '').strip()
            if not loc:
                continue
            if loc.lower().split('?')[0].endswith('.xml'):
                child_sitemaps.append(loc)
            else:
                pages.append((loc, None))
    except Exception:
        for raw in re.findall(r'<loc>\s*([^<]+?)\s*</loc>', xml_text, re.I):
            loc = html.unescape(raw.strip())
            if loc.lower().split('?')[0].endswith('.xml'):
                child_sitemaps.append(loc)
            else:
                pages.append((loc, None))
    return pages, child_sitemaps

def sitemap_inventory(site):
    pages = {}
    sitemap_queue = []
    seen = set()
    try:
        _, _, _, robots = fetch(site['base'] + '/robots.txt', 'text/plain,*/*')
        sitemap_queue += re.findall(r'(?im)^\s*Sitemap:\s*(\S+)', robots)
    except Exception:
        pass
    sitemap_queue += [site['base'] + '/sitemap.xml', site['base'] + '/sitemap_index.xml']
    while sitemap_queue and len(seen) < 100:
        url = sitemap_queue.pop(0)
        if url in seen:
            continue
        seen.add(url)
        try:
            _, _, _, xml_text = fetch(url, 'application/xml,text/xml,*/*')
            rows, children = parse_sitemap(xml_text)
            for raw, lastmod in rows:
                canonical = safe_url(raw, site)
                if canonical:
                    pages.setdefault(canonical, {'discovered_by': ['sitemap'], 'lastmod': lastmod})
            for child in children:
                parsed = urllib.parse.urlsplit(child)
                if parsed.hostname == urllib.parse.urlsplit(site['base']).hostname:
                    sitemap_queue.append(child)
        except Exception:
            pass
    for seed in site['seeds']:
        canonical = safe_url(seed, site)
        if canonical:
            pages.setdefault(canonical, {'discovered_by': ['seed'], 'lastmod': None})
    return pages

def infer_meta(site, url, title, body):
    haystack = (url + ' ' + title + ' ' + body[:8000]).lower()
    jurisdictions = [site['jur']] if site['jur'] else [
        label for label, pattern in JURS if re.search(pattern, haystack, re.I)
    ]
    jurisdiction = jurisdictions[0] if len(jurisdictions) == 1 else (site['jur'] or None)
    topics = [name for name, pattern in TOPICS if re.search(pattern, haystack, re.I)] or ['general']
    tier = 4 if site['id'] in {'main', 'market', 'portal', 'support'} else 3
    if re.search(r'/(?:privacy|terms|refund|polic)', urllib.parse.urlsplit(url).path, re.I):
        tier = 5
    return jurisdiction, jurisdictions, topics, tier

def chunk_text(text, max_chars=2200, overlap=180):
    value = re.sub(r'[ \t]+', ' ', text).strip()
    if len(value) <= max_chars:
        return [value] if value else []
    out = []
    pos = 0
    while pos < len(value):
        end = min(len(value), pos + max_chars)
        if end < len(value):
            floor = pos + int(max_chars * 0.55)
            cut = max(value.rfind('. ', floor, end), value.rfind('\n', floor, end))
            if cut > pos:
                end = cut + 1
        piece = value[pos:end].strip()
        if piece:
            out.append(piece)
        if end >= len(value):
            break
        pos = max(pos + 1, end - overlap)
    return out

def crawl_page(site, url, discovery):
    try:
        final_url, status, headers, raw = fetch(url)
    except Exception as exc:
        return {'url': url, 'error': str(exc)}
    canonical = safe_url(final_url, site)
    if not canonical:
        return {'url': url, 'error': 'redirected_outside_public_scope'}
    content_type = headers.get('Content-Type', headers.get('content-type', '')).lower()
    path = urllib.parse.urlsplit(canonical).path.lower()
    source_kind = 'live_html'
    if 'html' in content_type or '<html' in raw[:1000].lower():
        parser = PageParser()
        try:
            parser.feed(raw)
            parsed = parser.finish()
        except Exception as exc:
            return {'url': url, 'error': 'parse:' + str(exc)}
        if parsed['noindex']:
            return {'url': url, 'error': 'noindex', 'links': []}
    elif path.endswith('.txt') or 'text/plain' in content_type:
        parsed = {
            'title': path.rsplit('/', 1)[-1] or site['id'],
            'description': '',
            'sections': [('', raw.strip())],
            'links': [],
            'noindex': False,
        }
        source_kind = 'live_text'
    elif path == '/assistant-knowledge.json' or 'application/json' in content_type:
        try:
            payload = json.loads(raw)
        except Exception as exc:
            return {'url': url, 'error': 'json_parse:' + str(exc)}
        sections = []
        if isinstance(payload, dict) and isinstance(payload.get('markdown'), str):
            sections = [('', payload['markdown'])]
        elif isinstance(payload, dict) and isinstance(payload.get('sections'), list):
            for row in payload['sections']:
                if isinstance(row, dict) and str(row.get('body') or '').strip():
                    sections.append((str(row.get('title') or ''), str(row.get('body') or '')))
        parsed = {
            'title': 'YouSafe assistant knowledge',
            'description': 'Published YouSafe assistant knowledge feed',
            'sections': sections,
            'links': [],
            'noindex': False,
        }
        source_kind = 'live_json'
    else:
        return {'url': url, 'error': 'non_html'}
    title = parsed['title'] or urllib.parse.urlsplit(canonical).path or site['id']
    full_text = '\n\n'.join((('# ' + heading + '\n') if heading else '') + text for heading, text in parsed['sections']).strip()
    if len(full_text) < 80:
        return {'url': url, 'error': 'too_short', 'links': []}
    jurisdiction, jurisdictions, topics, tier = infer_meta(site, canonical, title, full_text)
    source_key = 'yskb:' + sha(canonical)[:32]
    fetched_at = now_iso()
    page_hash = sha(full_text)
    source = {
        'source_key': source_key, 'site': site['id'], 'repository': site['repo'],
        'base_url': site['base'], 'source_url': canonical,
        'path': urllib.parse.urlsplit(canonical).path or '/', 'title': title[:500],
        'jurisdiction': jurisdiction, 'source_kind': source_kind, 'authority_tier': tier,
        'http_status': status, 'content_hash': page_hash, 'fetched_at': fetched_at,
        'last_seen_at': fetched_at, 'lastmod': discovery.get('lastmod'), 'active': True,
        'metadata': {
            'jurisdictions': jurisdictions, 'description': parsed['description'][:1000],
            'discovered_by': discovery.get('discovered_by', []), 'content_chars': len(full_text)
        }
    }
    chunks = []
    index = 0
    for heading, section_text in parsed['sections']:
        for piece in chunk_text(section_text):
            if len(piece) < 80:
                continue
            body = ((heading + '\n') if heading else '') + piece
            chunks.append({
                'chunk_key': f'{source_key}:{index}', 'source_key': source_key,
                'site': site['id'], 'repository': site['repo'], 'source_url': canonical,
                'title': title[:500], 'section_title': (heading or title)[:500],
                'chunk_index': index, 'jurisdiction': jurisdiction, 'topic_tags': topics,
                'body': body, 'content_hash': sha(body), 'authority_tier': tier,
                'fetched_at': fetched_at, 'lastmod': discovery.get('lastmod'),
                'metadata': {'jurisdictions': jurisdictions, 'page_content_hash': page_hash}
            })
            index += 1
    links = []
    for href in parsed['links']:
        normalized = safe_url(href, site)
        if normalized and normalized != canonical:
            links.append(normalized)
    return {'source': source, 'chunks': chunks, 'links': list(dict.fromkeys(links))}

def crawl_site(site):
    inventory = sitemap_inventory(site)
    queue = list(inventory)
    fetched = set()
    sources, chunks, errors = [], [], []
    for wave in range(4):
        batch = [url for url in queue if url not in fetched][:MAX_PAGES - len(fetched)]
        if not batch:
            break
        print(f"[{site['id']}] wave={wave} fetch={len(batch)} known={len(inventory)}", flush=True)
        with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
            futures = {
                pool.submit(crawl_page, site, url, inventory.get(url, {'discovered_by':['link'], 'lastmod':None})): url
                for url in batch
            }
            for future in concurrent.futures.as_completed(futures):
                url = futures[future]
                fetched.add(url)
                try:
                    result = future.result()
                except Exception as exc:
                    result = {'url': url, 'error': str(exc)}
                if result.get('source'):
                    sources.append(result['source'])
                    chunks.extend(result['chunks'])
                    for link in result.get('links', []):
                        if link not in inventory and len(inventory) < MAX_PAGES:
                            inventory[link] = {'discovered_by':['link'], 'lastmod':None}
                            queue.append(link)
                elif result.get('error') not in {'noindex', 'non_html', 'too_short'}:
                    errors.append({'url': url, 'error': result.get('error')})
    return sources, chunks, errors, len(inventory), len(fetched)

def load_curated_core():
    root = Path(__file__).resolve().parents[1]
    names = [
        'network-authority.md', 'brand-identity.md', 'platform.md',
        'offers-orders-escrow.md', 'policies-ymyl.md', 'faq.md',
    ]
    sources, chunks = [], []
    for name in names:
        path = root / 'content' / 'messenger-kb' / name
        if not path.exists():
            continue
        text = path.read_text(errors='replace').strip()
        if not text:
            continue
        source_url = f"repo://kylemwalkerpr-ship-it/portal/content/messenger-kb/{name}"
        source_key = 'yskb:' + sha(source_url)[:32]
        fetched_at = now_iso()
        page_hash = sha(text)
        title = name.removesuffix('.md').replace('-', ' ').title()
        sources.append({
            'source_key': source_key, 'site': 'core', 'repository': 'kylemwalkerpr-ship-it/portal',
            'base_url': 'repo://kylemwalkerpr-ship-it/portal', 'source_url': source_url,
            'path': f'content/messenger-kb/{name}', 'title': title, 'jurisdiction': None,
            'source_kind': 'curated_core', 'authority_tier': 5, 'http_status': 200,
            'content_hash': page_hash, 'fetched_at': fetched_at, 'last_seen_at': fetched_at,
            'lastmod': None, 'active': True,
            'metadata': {'applies_to': ['main','usa','canada','uk','australia','caseworks','market','portal','support']}
        })
        sections = re.split(r'(?m)^(?=#{1,3}\s+)', text)
        index = 0
        for section in sections:
            section = section.strip()
            if not section:
                continue
            match = re.match(r'^#{1,3}\s+(.+)', section)
            heading = match.group(1).strip() if match else title
            for piece in chunk_text(section):
                chunks.append({
                    'chunk_key': f'{source_key}:{index}', 'source_key': source_key,
                    'site': 'core', 'repository': 'kylemwalkerpr-ship-it/portal',
                    'source_url': source_url, 'title': title, 'section_title': heading[:500],
                    'chunk_index': index, 'jurisdiction': None,
                    'topic_tags': ['platform','policy','support'], 'body': piece,
                    'content_hash': sha(piece), 'authority_tier': 5,
                    'fetched_at': fetched_at, 'lastmod': None,
                    'metadata': {'page_content_hash': page_hash, 'curated': True}
                })
                index += 1
    return sources, chunks

all_sources, all_chunks, coverage = [], [], {}
for site in SITES:
    started = time.time()
    sources, chunks, errors, known, fetched = crawl_site(site)
    all_sources.extend(sources)
    all_chunks.extend(chunks)
    coverage[site['id']] = {
        'sources': len(sources), 'chunks': len(chunks), 'known_urls': known,
        'fetched_urls': fetched, 'errors': errors[:80], 'seconds': round(time.time() - started, 1)
    }
    print(f"[{site['id']}] sources={len(sources)} chunks={len(chunks)} errors={len(errors)}", flush=True)

core_sources, core_chunks = load_curated_core()
all_sources.extend(core_sources)
all_chunks.extend(core_chunks)
coverage['core'] = {'sources': len(core_sources), 'chunks': len(core_chunks), 'known_urls': len(core_sources), 'fetched_urls': len(core_sources), 'errors': [], 'seconds': 0.0}

source_map = {source['source_url']: source for source in all_sources}
chunk_map = {chunk['chunk_key']: chunk for chunk in all_chunks if chunk['source_url'] in source_map}
all_sources = sorted(source_map.values(), key=lambda row: (row['site'], row['source_url']))
all_chunks = sorted(chunk_map.values(), key=lambda row: (row['site'], row['source_url'], row['chunk_index']))
run_id = 'yqaa_kb_' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
manifest = {
    'run_id': run_id, 'generated_at': now_iso(), 'source_count': len(all_sources),
    'chunk_count': len(all_chunks), 'coverage': coverage
}
(OUT / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
with (OUT / 'sources.jsonl').open('w') as handle:
    for row in all_sources:
        handle.write(json.dumps(row, separators=(',', ':')) + '\n')
with (OUT / 'chunks.jsonl').open('w') as handle:
    for row in all_chunks:
        handle.write(json.dumps(row, separators=(',', ':')) + '\n')
print(json.dumps(manifest, indent=2), flush=True)
