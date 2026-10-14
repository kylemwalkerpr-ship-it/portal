const { navigateOwnedPage } = require('../scripts/yqaa-browser-navigation.cjs')
test('retries a redirect-aborted read navigation exactly once', async () => {
  const page = {goto:jest.fn().mockRejectedValueOnce(new Error('net::ERR_ABORTED')).mockResolvedValueOnce('loaded')}
  const delay = jest.fn().mockResolvedValue(undefined)
  await expect(navigateOwnedPage(page,'https://portal.example/messenger',delay)).resolves.toBe('loaded')
  expect(page.goto).toHaveBeenCalledTimes(2)
  expect(delay).toHaveBeenCalledWith(750)
})
test('does not retry other failures or repeat a persistent abort', async () => {
  const page = {goto:jest.fn().mockRejectedValue(new Error('net::ERR_ABORTED'))}
  await expect(navigateOwnedPage(page,'https://portal.example/messenger',async()=>{})).rejects.toThrow('net::ERR_ABORTED')
  expect(page.goto).toHaveBeenCalledTimes(2)
  page.goto.mockReset().mockRejectedValue(new Error('access denied'))
  await expect(navigateOwnedPage(page,'https://portal.example/messenger',async()=>{})).rejects.toThrow('access denied')
  expect(page.goto).toHaveBeenCalledTimes(1)
})
