// Shared byte/canonical/signature rules. Server-only: no trust from request data.
export const deny = () => { throw Error('Privacy authorization denied') }
export const exact = (v, fields) => v && Object.getPrototypeOf(v) === Object.prototype && Object.keys(v).sort().join() === [...fields].sort().join()
const b64 = x => Buffer.from(x).toString('base64url')
export const hash = v => typeof v === 'string' && /^[A-Za-z0-9_-]{43}$/.test(v) && b64(Buffer.from(v,'base64url')) === v
export const payload = token => {
 if (typeof token !== 'string' || token.length > 16384 || token.split('.').length !== 3) deny()
 const part=token.split('.')[1], text=Buffer.from(part,'base64url').toString('utf8'), p=JSON.parse(text)
 if(b64(text)!==part || JSON.stringify(p)!==text) deny()
 return p
}
export async function signWire(typ,kid,p,privateJwk) {
 const key=await crypto.subtle.importKey('jwk',privateJwk,{name:'ECDSA',namedCurve:'P-256'},false,['sign'])
 const bytes=b64(JSON.stringify({alg:'ES256',typ,kid}))+'.'+b64(JSON.stringify(p))
 return bytes+'.'+b64(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,new TextEncoder().encode(bytes)))
}
export async function currentSigner(manifest, privateJwk, kid, expiresAt=Math.floor(Date.now()/1000)+120) {
 const now=Math.floor(Date.now()/1000), keys=manifest?.proofKeys ?? manifest?.keys
 if(!Array.isArray(keys) || keys.length<1 || keys.length>4 || new Set(keys.map(k=>k?.kid)).size!==keys.length || keys.some(k=>!exact(k,['kid','publicJwk','notBefore','notAfter','revoked']) || typeof k.kid!=='string' || !/^[A-Za-z0-9_-]{1,128}$/.test(k.kid))) deny()
 const selected=keys.find(k=>k.kid===kid)
 if(!selected || selected.revoked!==false || !Number.isSafeInteger(selected.notBefore) || !Number.isSafeInteger(selected.notAfter) || selected.notBefore>now || selected.notAfter<=expiresAt ||
 selected.publicJwk?.kty!=='EC' || selected.publicJwk.crv!=='P-256' || 'd' in selected.publicJwk) deny()
 const publicKey=await crypto.subtle.importKey('jwk',selected.publicJwk,{name:'ECDSA',namedCurve:'P-256'},false,['verify'])
 if(privateJwk) {
  const proof=await signWire('q02-capability',kid,{nonce:crypto.randomUUID()},privateJwk)
  const [a,b,s]=proof.split('.')
  if(!await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},publicKey,Buffer.from(s,'base64url'),new TextEncoder().encode(a+'.'+b))) deny()
 }
 return selected
}
export async function verifyWire(token,typ,manifest,expected) {
 if(typeof token!=='string' || token.length>8192) deny()
 const parts=token.split('.'); if(parts.length!==3) deny()
 const [a,b,s]=parts, header=JSON.parse(Buffer.from(a,'base64url').toString('utf8')), p=payload(token)
 if(b64(JSON.stringify(header))!==a || !exact(header,['alg','typ','kid']) || header.alg!=='ES256' || header.typ!==typ || !exact(p,Object.keys(expected)) || JSON.stringify(Object.keys(p).sort().map(k=>p[k]))!==JSON.stringify(Object.keys(expected).sort().map(k=>expected[k])) || p.exp<=Math.floor(Date.now()/1000)) deny()
 const entry=await currentSigner(manifest,null,header.kid,p.exp)
 const key=await crypto.subtle.importKey('jwk',entry.publicJwk,{name:'ECDSA',namedCurve:'P-256'},false,['verify'])
 const sig=Buffer.from(s,'base64url')
 if(b64(sig)!==s || sig.length!==64 || !await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,sig,new TextEncoder().encode(a+'.'+b))) deny()
 return p
}
export async function boundedLinkJson(req) {
 if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers.get('content-type')??'')) deny()
 const len=req.headers.get('content-length'); if(len!==null && (!/^\d+$/.test(len) || Number(len)>65536)) deny()
 const reader=req.body?.getReader(); if(!reader) deny()
 let size=0; const chunks=[]
 try { for(;;) { const {done,value}=await reader.read(); if(done) break; size+=value.byteLength; if(size>65536) deny(); chunks.push(value) } }
 finally { await reader.cancel().catch(()=>{}); reader.releaseLock() }
 const text=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)),value=JSON.parse(text)
 // Canonical request JSON rejects duplicate fields and ambiguous encodings.
 if(JSON.stringify(value)!==text) deny()
 return value
}
export const linkResponse=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store, private','Pragma':'no-cache','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff',Vary:'Cookie, Origin'}})
