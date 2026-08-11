import { readFileSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname, '..', '.env.local')
const envContent = readFileSync(envPath, 'utf-8')
for (const line of envContent.split('\n')) {
  const eq = line.indexOf('=')
  if (eq > 0) process.env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim()
}

const clerkKey = process.env.CLERK_SECRET_KEY
if (!clerkKey) { console.error('Missing CLERK_SECRET_KEY'); process.exit(1) }

const res = await fetch('https://api.clerk.com/v1/users?email_address=admin%40yousafeconsultancy.com', {
  headers: { Authorization: `Bearer ${clerkKey}`, 'Content-Type': 'application/json' },
})
const users = await res.json()
if (!users.length) { console.error('No admin user found'); process.exit(1) }

const userId = users[0].id
console.log(`User: ${userId} (${users[0].email_addresses?.[0]?.email_address})`)

// Create a sign-in token
const tokenRes = await fetch('https://api.clerk.com/v1/sign_in_tokens', {
  method: 'POST',
  headers: { Authorization: `Bearer ${clerkKey}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ user_id: userId, expires_in_seconds: 300 }),
})
const tokenData = await tokenRes.json()
if (!tokenData.token) { console.error('No token:', JSON.stringify(tokenData)); process.exit(1) }

writeFileSync('/tmp/admin-clerk-token.txt', tokenData.token)
console.log('Token saved to /tmp/admin-clerk-token.txt')
