import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dir = path.join(root, 'content/messenger-kb')
const core = ['network-authority', 'brand-identity', 'platform', 'offers-orders-escrow', 'policies-ymyl', 'faq']
const chunks = []
for (const id of core) {
  const raw = fs.readFileSync(path.join(dir, `${id}.md`), 'utf8').trim()
  raw.split(/\n(?=#{1,3}\s+)/).forEach((section, index) => {
    const body = section.trim().slice(0, 4000)
    if (body) chunks.push({ id: `${id}#${index}`, title: body.match(/^#{1,3}\s+(.+)$/m)?.[1]?.trim() || id, body, source: `content/messenger-kb/${id}.md` })
  })
}
const hosts = {main:'yousafeconsultancy.com', usa:'usa.yousafeconsultancy.com', canada:'ca.yousafeconsultancy.com', uk:'uk.yousafeconsultancy.com', australia:'au.yousafeconsultancy.com', caseworks:'legal.yousafeconsultancy.com', market:'market.yousafeconsultancy.com', support:'support.yousafeconsultancy.com'}
const paths = new Set(['/', '/ai/', '/services/', '/resources/'])
for (const row of JSON.parse(fs.readFileSync(path.join(dir, 'network-pages.json'), 'utf8'))) {
  let url
  try { url = new URL(row.sourceUrl) } catch { continue }
  if (url.protocol !== 'https:' || url.hostname !== hosts[row.site] || !paths.has(url.pathname) || !row.body || !row.repository) continue
  chunks.push({id:String(row.id),title:String(row.title),body:String(row.body).slice(0,4000),source:url.toString(),sourceUrl:url.toString(),site:row.site,repository:row.repository})
}
if (!chunks.length || !chunks.some(row => row.site === 'canada')) throw new Error('Runtime knowledge package lacks required public reference material')
const output = JSON.stringify(chunks, null, 2) + '\n'
if (Buffer.byteLength(output) > 160_000) throw new Error('Runtime knowledge package exceeds its bounded payload')
fs.writeFileSync(path.join(dir, 'runtime-public.json'), output)
console.log(`Bundled ${chunks.length} public YQAA reference chunks (${Buffer.byteLength(output)} bytes); no live-freshness claim.`)
