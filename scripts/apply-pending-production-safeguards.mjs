import fs from 'node:fs'

function replaceOnce(path, before, after) {
  const source = fs.readFileSync(path, 'utf8')
  const first = source.indexOf(before)
  if (first < 0) throw new Error(`${path}: expected fragment not found`)
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`${path}: expected fragment occurs more than once`)
  fs.writeFileSync(path, source.slice(0, first) + after + source.slice(first + before.length))
}

// File Shop: meaningful cover alt text.
replaceOnce(
  'app/shop/FilesShop.tsx',
  '<img src={product.cover} alt="" width={1200} height={1600} />',
  '<img src={product.cover} alt={`${product.title} file cover`} width={1200} height={1600} />',
)

// File Shop: concise SERP titles for the two Bing-flagged immigration packs.
replaceOnce(
  'app/shop/[slug]/page.tsx',
  "const SHOP_CANONICAL = 'https://market.yousafeconsultancy.com/shop'\n",
  "const SHOP_CANONICAL = 'https://market.yousafeconsultancy.com/shop'\n\nconst SHOP_SEO_TITLES: Record<string, string> = {\n  'us-f1-student-visa-ds160-i20-pack': 'F-1 Visa DS-160 + I-20 Prep Pack | YouSafe',\n  'canada-study-permit-complete-pack': 'Canada Study Permit Prep Pack | YouSafe',\n}\n",
)
replaceOnce(
  'app/shop/[slug]/page.tsx',
  '  const title = `${product.name} | YouSafe File Shop`',
  '  const title = SHOP_SEO_TITLES[slug] ?? `${product.name} | YouSafe File Shop`',
)

// Legacy Marketplace namespace: redirect on every served host, not a stale host allowlist.
replaceOnce(
  'next.config.ts',
  "const legacyMarketplaceRedirects = ['market.yousafeconsultancy.com', 'portal.yousafeconsultancy.com'].map((host) => ({\n  source: '/marketplace/:path*',\n  has: [{ type: 'host' as const, value: host }],\n  destination: 'https://market.yousafeconsultancy.com/:path*',\n  permanent: true,\n}))",
  "const legacyMarketplaceRedirects = [{\n  source: '/marketplace/:path*',\n  destination: 'https://market.yousafeconsultancy.com/:path*',\n  permanent: true,\n}]",
)

// Production deploy: make npm deploy fail closed outside the official main workflow.
const packagePath = 'package.json'
const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'))
if (pkg.scripts?.deploy !== 'opennextjs-cloudflare deploy') {
  throw new Error(`package.json: unexpected deploy command ${JSON.stringify(pkg.scripts?.deploy)}`)
}
pkg.scripts.deploy = 'node scripts/deploy-production.mjs'
fs.writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`)

fs.writeFileSync('scripts/deploy-production.mjs', `import { spawnSync } from 'node:child_process'\n\nconst required = {\n  GITHUB_ACTIONS: 'true',\n  GITHUB_REF: 'refs/heads/main',\n  GITHUB_WORKFLOW: 'Deploy YouSafe Portal',\n}\n\nconst mismatches = Object.entries(required).filter(([key, value]) => process.env[key] !== value)\n\nif (mismatches.length > 0) {\n  console.error('\\nProduction deploy blocked.\\n')\n  console.error('YouSafe production is GitHub-main-only. Do not deploy from a local shell, ChatGPT Work, Codex, Cloudflare dashboard, or direct Wrangler/OpenNext command.')\n  console.error('Commit the work to a branch, pass CI, merge it to main, and let the Deploy YouSafe Portal GitHub Action publish that exact commit.')\n  console.error('\\nMissing official workflow context:')\n  for (const [key, expected] of mismatches) {\n    console.error(\`  \${key} must equal \${JSON.stringify(expected)}\`)\n  }\n  process.exit(78)\n}\n\nconsole.log(\`GitHub-only deploy gate passed for \${process.env.GITHUB_SHA || 'current main commit'}.\`)\n\nconst command = process.platform === 'win32' ? 'npx.cmd' : 'npx'\nconst result = spawnSync(command, ['opennextjs-cloudflare', 'deploy'], {\n  cwd: process.cwd(),\n  env: process.env,\n  stdio: 'inherit',\n})\n\nif (result.error) {\n  console.error(result.error)\n  process.exit(1)\n}\n\nprocess.exit(result.status ?? 1)\n`)

fs.writeFileSync('AGENTS.md', `# YouSafe Portal agent rules\n\n## Production source of truth\n\n\`main\` on \`kylemwalkerpr-ship-it/portal\` is the only production source of truth.\n\nFor every coding agent, ChatGPT Work session, Codex session, local terminal session, and automation:\n\n- Never run \`wrangler deploy\`, \`wrangler versions deploy\`, \`opennextjs-cloudflare deploy\`, or any equivalent direct Cloudflare publish command outside the repository's official GitHub Actions deployment workflow.\n- Never publish code directly from the Cloudflare dashboard or replace the active Worker from a working directory that is not the exact \`main\` commit.\n- Never treat the active Cloudflare Worker bundle as an editable source branch. If emergency recovery is needed, inspect it read-only, reconstruct the smallest missing delta on a Git branch, validate it, and merge through GitHub.\n- Production code changes must follow: branch -> PR -> required repository checks -> merge to \`main\` -> \`.github/workflows/deploy.yml\`.\n- A failed production deployment is fixed in GitHub and rerun from GitHub. Do not bypass a red workflow with a direct provider deployment.\n- Cloudflare CLI use is limited to operations already encoded inside the official GitHub workflow (for example secret synchronization). It is not an alternate release path.\n\nThe repository's \`npm run deploy\` command is deliberately guarded and exits unless it is running inside the \`Deploy YouSafe Portal\` GitHub Actions workflow on \`refs/heads/main\`.\n\n## Branch discipline\n\nKeep branches short-lived. Once a PR is merged or deliberately superseded, delete its branch. Do not continue new work on historical recovery/fix branches. Start new work from current \`main\`.\n\nBefore deleting a branch that is not fully contained in \`main\`, preserve its tip as an archive tag or explicitly confirm that its unique work is intentionally discarded. This keeps \`main\` authoritative without losing recoverability.\n`)

console.log('Applied pending production safeguards.')
