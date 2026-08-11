// Quick probe: test the deployed suggest-brief endpoint
const TOPIC = 'dependent visa uk'
const REGION = 'UK'

async function main() {
  console.log('Testing deployed suggest-brief...')
  const res = await fetch('https://portal.yousafeconsultancy.com/api/content-studio/suggest-brief', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic: TOPIC, region: REGION, contentType: 'article', primaryKeyword: 'uk dependent visa' }),
  })
  const text = await res.text()
  console.log('Status:', res.status)
  console.log('Body (first 500 chars):', text.slice(0, 500))
  try {
    const json = JSON.parse(text)
    console.log('Parsed OK. Keys:', Object.keys(json).join(', '))
    if (json.error) console.log('ERROR:', json.error)
  } catch(e) {
    console.log('NOT JSON parseable:', e.message)
  }
}

main().catch(e => console.error(e))
