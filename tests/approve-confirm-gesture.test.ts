import { APPROVE_MAIN_PROMPT, confirmApproveToMain } from '@/lib/seoFactory/approveConfirm'

describe('confirmApproveToMain', () => {
  const g = globalThis as typeof globalThis & { window?: Window & typeof globalThis }

  afterEach(() => {
    delete g.window
  })

  it('exposes the modal Approve → main prompt string', () => {
    expect(APPROVE_MAIN_PROMPT).toMatch(/Approve this content for main/)
  })

  it('calls window.confirm synchronously (safe inside a click turn)', () => {
    const confirm = jest.fn(() => true)
    g.window = { confirm } as unknown as Window & typeof globalThis
    expect(confirmApproveToMain()).toBe(true)
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(confirm).toHaveBeenCalledWith(APPROVE_MAIN_PROMPT)
  })

  it('returns false when the operator cancels', () => {
    g.window = { confirm: () => false } as unknown as Window & typeof globalThis
    expect(confirmApproveToMain()).toBe(false)
  })

  it('returns true when window is unavailable (SSR)', () => {
    delete g.window
    expect(confirmApproveToMain()).toBe(true)
  })
})
