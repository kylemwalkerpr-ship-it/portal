/**
 * Login via Clerk sign-in token → Content Studio → Draft tab →
 * Click Admissions Consultant → Audit → Fix All → Audit again.
 */
import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '..', '.env.local');
try {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const eq = line.indexOf('=');
    if (eq > 0) process.env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
} catch {}

const PORTAL = 'https://portal.yousafeconsultancy.com';
const ADMIN_ID = 'user_3DDUel4TxmYmI0GaYxoKAsxzBTm';

async function getToken() {
  const res = await fetch('https://api.clerk.com/v1/sign_in_tokens', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: ADMIN_ID, expires_in_seconds: 1800 }),
  });
  const d = await res.json();
  if (!d.token) throw new Error('Clerk token failed: ' + JSON.stringify(d));
  return d.token;
}

async function waitForScore(page, maxSec = 90) {
  for (let i = 0; i < maxSec / 5; i++) {
    await page.waitForTimeout(5000);
    const body = await page.textContent('body');
    if (body?.includes('Score') && !body.toLowerCase().includes('fixing')) {
      return body;
    }
  }
  return await page.textContent('body');
}

async function main() {
  const token = await getToken();
  console.log('✓ Clerk token acquired');

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  try {
    // 1. Auth
    console.log('1. Auth...');
    await page.goto(`${PORTAL}/sign-in/student?__clerk_ticket=${token}&return_to=/dashboard/admin/content`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(8000);
    console.log('  URL:', page.url());

    // 2. Go to Content Studio (should already be there)
    await page.goto(PORTAL + '/dashboard/admin/content?tab=draft', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(4000);
    await page.screenshot({ path: 'scripts/fa-02-studio.png' });

    // 3. Click Draft tab
    const draftTab = page.locator('button:has-text("Draft"), button:has-text("III"), [role="tab"]:has-text("Draft")').first();
    if (await draftTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await draftTab.click();
      await page.waitForTimeout(3000);
      console.log('3. Clicked Draft tab');
    }
    await page.screenshot({ path: 'scripts/fa-03-drafts.png' });

    // 4. Click Admissions Consultant - use force to bypass dialog interception
    console.log('4. Opening Admissions Consultant...');
    const admEl = page.locator('div:has-text("Admissions Consultant")').first();
    await admEl.click({ force: true, timeout: 5000 });
    await page.waitForTimeout(4000);
    await page.screenshot({ path: 'scripts/fa-04-dialog.png' });

    // Verify dialog opened
    const dialog = page.locator('[role="dialog"]');
    const dialogVisible = await dialog.isVisible({ timeout: 3000 }).catch(() => false);
    console.log('  Dialog opened:', dialogVisible);

    // 5. Click Audit inside the dialog
    console.log('5. Clicking Audit...');
    const auditBtn = dialog.locator('button:has-text("Audit")').first();
    await auditBtn.waitFor({ state: 'visible', timeout: 5000 });
    await auditBtn.click();
    await page.waitForTimeout(12000);
    await page.screenshot({ path: 'scripts/fa-05-audit.png' });

    let body = await page.textContent('body');
    const scoreMatch = body?.match(/Score\s+(\d+\/\d+)/);
    const blockerMatch = body?.match(/(\d+)\s+blocker/);
    const warningMatch = body?.match(/(\d+)\s+warning/);
    console.log(`  Audit: Score=${scoreMatch?.[1] || '?'} Blockers=${blockerMatch?.[1] || '?'} Warnings=${warningMatch?.[1] || '?'}`);
    console.log('  SCHEMA_FAQ:', body?.includes('SCHEMA_FAQ') || body?.includes('Missing FAQPage') ? '⚠ YES' : '✓ clear');
    console.log('  TOC dups:', body?.includes('toc_duplicates') || body?.includes('duplicate entr') ? '⚠ YES' : '✓ clear');

    // 6. Click Fix All inside the dialog
    console.log('6. Clicking Fix All...');
    const fixBtn = dialog.locator('button:has-text("Fix All")').first();
    if (await fixBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await fixBtn.click();
      body = await waitForScore(page, 120);
      await page.screenshot({ path: 'scripts/fa-06-fixed.png' });

      const fixScore = body?.match(/Score\s+(\d+\/\d+)/);
      const fixBlocker = body?.match(/(\d+)\s+blocker/);
      console.log(`  After Fix: Score=${fixScore?.[1] || '?'} Blockers=${fixBlocker?.[1] || '?'}`);
      console.log('  SCHEMA_FAQ:', body?.includes('SCHEMA_FAQ') || body?.includes('Missing FAQPage') ? '⚠ YES' : '✓ clear');
      console.log('  Applied:', body?.match(/auto-fixed:\s*([^\n]+)/)?.[1]?.trim() || 'none');
    } else {
      console.log('  Fix All not visible — may already be ship-ready');
    }

    // 7. Click Audit again
    console.log('7. Verification audit...');
    await page.waitForTimeout(2000);
    const auditBtn2 = dialog.locator('button:has-text("Audit")').first();
    if (await auditBtn2.isVisible({ timeout: 3000 }).catch(() => false)) {
      await auditBtn2.click();
      await page.waitForTimeout(12000);
      await page.screenshot({ path: 'scripts/fa-07-verify.png' });

      body = await page.textContent('body');
      console.log('  ✓ Final Score:', body?.match(/Score\s+(\d+\/\d+)/)?.[0] || 'not found');
      console.log('  Blockers:', body?.match(/\d+\s+blocker/)?.[0] || 'none');
      console.log('  Warnings:', body?.match(/\d+\s+warning/)?.[0] || 'none');
      console.log('  SCHEMA_FAQ:', body?.includes('SCHEMA_FAQ') || body?.includes('Missing FAQPage') ? '⚠ STILL PRESENT' : '✓ CLEARED');
      console.log('  TOC dups:', body?.includes('toc_duplicates') || body?.includes('duplicate entr') ? '⚠ STILL PRESENT' : '✓ CLEARED');
      console.log('  Ship-ready:', body?.includes('ship-ready') || body?.includes('ready') ? '✓ yes' : 'check screenshot');
    }

    console.log('\n✅ Done.');
  } catch (e) {
    console.error('ERROR:', e.message);
    await page.screenshot({ path: 'scripts/fa-error.png', fullPage: true }).catch(() => {});
  } finally {
    await browser.close();
  }
}

main();
