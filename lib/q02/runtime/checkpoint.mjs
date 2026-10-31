// The checkpoint binding must retain an append-only journal OUTSIDE the shared
// application database/backups. This client never accepts a caller's ready flag.
import { authorityDigest } from './live-authority.mjs'
const deny = () => { throw Error('Privacy authorization denied') }
const verifiedCheckpoints = new WeakSet()
const b64 = x => Buffer.from(x).toString('base64url')
const exact = (x,k) => x && Object.keys(x).sort().join() === [...k].sort().join()
const decode = x => {
  if (typeof x !== 'string' || !/^[A-Za-z0-9_-]+$/.test(x)) deny()
  const b=Buffer.from(x,'base64url'); if(b64(b)!==x) deny(); return b
}
export async function verifyCheckpoint(token, { trust, tenant, nonce, now = Math.floor(Date.now()/1000) }) {
  try {
    if (typeof token!=='string' || token.length>4096 || !trust?.publicJwk || 'd' in trust.publicJwk) deny()
    const [a,b,c,...rest]=token.split('.'); if(rest.length) deny()
    const parse=x=>{const p=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(decode(x)));if(b64(JSON.stringify(p))!==x) deny();return p}
    const h=parse(a), p=parse(b)
    if (!exact(h,['alg','typ','kid']) || h.alg!=='ES256' || h.typ!=='q02-checkpoint+jwt' || h.kid!==trust.kid ||
        !exact(p,['v','iss','aud','tenant','nonce','generation','highWater','headDigest','iat','exp']) || p.v!==1 ||
        p.iss!==trust.issuer || p.aud!==trust.audience || p.tenant!==tenant || p.nonce!==nonce ||
        ![p.iat,p.exp,p.highWater].every(Number.isSafeInteger) || p.highWater<0 || p.iat>now || p.exp<=now || p.exp-p.iat>10 ||
        ![p.generation,p.headDigest,nonce].every(x=>typeof x==='string' && /^[A-Za-z0-9_-]{43}$/.test(x)) ||
        trust.revoked!==false || trust.notBefore>now || trust.notAfter<=p.exp) deny()
    const key=await crypto.subtle.importKey('jwk',trust.publicJwk,{name:'ECDSA',namedCurve:'P-256'},false,['verify'])
    if(decode(c).length!==64 || !await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,decode(c),new TextEncoder().encode(`${a}.${b}`))) deny()
    const checkpoint = Object.freeze({generation:p.generation,highWater:p.highWater,headDigest:p.headDigest,
      evidenceDigest:await authorityDigest(token),nonceDigest:await authorityDigest(nonce),verifiedAt:now*1000})
    verifiedCheckpoints.add(checkpoint)
    return checkpoint
  } catch { deny() }
}
export function isVerifiedCheckpoint(value) { return !!value && verifiedCheckpoints.has(value) }
export function createCheckpointClient({ binding, trust }) {
  const request = async (tenant, action, body={}) => {
    if (typeof binding?.getByName!=='function') deny()
    const nonce=b64(crypto.getRandomValues(new Uint8Array(32)))
    const stub=binding.getByName(tenant)
    if(action==='read') return verifyCheckpoint((await stub.read(tenant,nonce)).proof,{trust,tenant,nonce})
    if(action==='append') return verifyCheckpoint((await stub.append(tenant,nonce,
      {generation:body.expected?.generation,highWater:body.expected?.highWater,headDigest:body.expected?.headDigest},body.event)).proof,{trust,tenant,nonce})
    deny()
  }
  return Object.freeze({
    async reconcile(client, tenant) {
      // The DB fence is already held. Only committed journal rows may be sent.
      // An ahead/conflicting external head is a restore alarm, never overwritten.
      let checkpoint=await request(tenant,'read')
      const {rows}=await client.query('select q02_runtime.journal($1,$2) as journal',[tenant,checkpoint.highWater])
      const journal=rows[0]?.journal
      if(!journal || checkpoint.generation!==journal.generation || checkpoint.highWater>journal.highWater ||
         checkpoint.headDigest!==journal.anchor) deny()
      for(const event of journal.events) {
        const next=await request(tenant,'append',{expected:checkpoint,event})
        if(next.generation!==checkpoint.generation || next.highWater!==checkpoint.highWater+1 || next.headDigest!==event.digest) deny()
        checkpoint=next
      }
      if(checkpoint.highWater!==journal.highWater || checkpoint.headDigest!==journal.headDigest) deny()
      return checkpoint
    },
  })
}
