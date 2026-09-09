import { writeMessengerThreadParam, isMessengerMobileViewport, MESSENGER_MOBILE_MQ } from '@/lib/messaging/threadUrl'

type FakeWindow = {
  location: { href: string; pathname: string; search: string; hash: string }
  history: { replaceState: jest.Mock }
  matchMedia?: (query: string) => { matches: boolean }
}

function installWindow(href: string, extras: Partial<FakeWindow> = {}): FakeWindow {
  const url = new URL(href)
  const fake: FakeWindow = {
    location: {
      href: url.href,
      pathname: url.pathname,
      search: url.search,
      hash: url.hash,
    },
    history: {
      replaceState: jest.fn((_s: unknown, _t: string, next: string) => {
        const resolved = new URL(next, url.origin)
        fake.location.href = resolved.href
        fake.location.pathname = resolved.pathname
        fake.location.search = resolved.search
        fake.location.hash = resolved.hash
      }),
    },
    ...extras,
  }
  ;(global as any).window = fake
  return fake
}

describe('writeMessengerThreadParam', () => {
  afterEach(() => {
    delete (global as any).window
  })

  test('sets thread on the dashboard messages URL', () => {
    const win = installWindow('https://portal.yousafeconsultancy.com/dashboard?page=messages')
    writeMessengerThreadParam('conv-1')
    expect(win.history.replaceState).toHaveBeenCalledTimes(1)
    expect(win.location.search).toContain('thread=conv-1')
    expect(win.location.search).toContain('page=messages')
  })

  test('clears thread when returning to the list', () => {
    const win = installWindow('https://portal.yousafeconsultancy.com/dashboard?page=messages&thread=conv-1')
    writeMessengerThreadParam(null)
    expect(win.history.replaceState).toHaveBeenCalledTimes(1)
    expect(win.location.search).toBe('?page=messages')
  })

  test('does not replaceState when the URL is already correct', () => {
    const win = installWindow('https://portal.yousafeconsultancy.com/dashboard?page=messages&thread=conv-1')
    writeMessengerThreadParam('conv-1')
    expect(win.history.replaceState).not.toHaveBeenCalled()
    writeMessengerThreadParam(null)
    expect(win.history.replaceState).toHaveBeenCalledTimes(1)
    writeMessengerThreadParam(null)
    expect(win.history.replaceState).toHaveBeenCalledTimes(1)
  })
})

describe('isMessengerMobileViewport', () => {
  afterEach(() => {
    delete (global as any).window
  })

  test('matches the shared phone breakpoint', () => {
    installWindow('https://portal.yousafeconsultancy.com/dashboard?page=messages', {
      matchMedia: (query: string) => ({ matches: query === MESSENGER_MOBILE_MQ }),
    } as Partial<FakeWindow>)
    expect(isMessengerMobileViewport()).toBe(true)
  })

  test('is false on desktop', () => {
    installWindow('https://portal.yousafeconsultancy.com/dashboard?page=messages', {
      matchMedia: () => ({ matches: false }),
    } as Partial<FakeWindow>)
    expect(isMessengerMobileViewport()).toBe(false)
  })
})
