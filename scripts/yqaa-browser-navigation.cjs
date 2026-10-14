/** One read-only retry for a browser navigation cancelled by sign-in's client redirect. */
async function navigateOwnedPage(page, url, delay) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try { return await page.goto(url, { waitUntil:'domcontentloaded', timeout:45000 }) }
    catch (error) {
      if (attempt || !String(error?.message || '').includes('net::ERR_ABORTED')) throw error
      await delay(750)
    }
  }
}
module.exports = { navigateOwnedPage }
