import { APPROVE_MAIN_PROMPT } from '@/lib/seoFactory/approveConfirm'
import { readFileSync } from 'fs'
import { resolve } from 'path'

describe('Approve → main in-app confirm', () => {
  it('exposes the Approve → main prompt string', () => {
    expect(APPROVE_MAIN_PROMPT).toMatch(/Approve this content for main/)
  })

  it('does not export a native-confirm helper (automation-invisible)', () => {
    const src = readFileSync(resolve(__dirname, '../lib/seoFactory/approveConfirm.ts'), 'utf8')
    expect(src).toMatch(/export const APPROVE_MAIN_PROMPT/)
    expect(src).not.toMatch(/export function confirm/)
    expect(src).not.toMatch(/confirmApproveToMain/)
  })

  it('ApproveConfirmModal is a DOM dialog with stable test ids', () => {
    const src = readFileSync(resolve(__dirname, '../components/design/approve-confirm-modal.tsx'), 'utf8')
    expect(src).toMatch(/role=["']dialog["']/)
    expect(src).toMatch(/data-testid=["']studio-approve-confirm["']/)
    expect(src).toMatch(/data-testid=["']studio-approve-confirm-ok["']/)
    expect(src).toMatch(/data-testid=["']studio-approve-confirm-cancel["']/)
    expect(src).toMatch(/APPROVE_MAIN_PROMPT/)
  })

  it('footer + editor toolbar open the modal sync on click (no native confirm)', () => {
    const studio = readFileSync(resolve(__dirname, '../components/design/admin-content-studio.tsx'), 'utf8')
    const editor = readFileSync(resolve(__dirname, '../components/design/admin-inline-editor.tsx'), 'utf8')
    expect(studio).toMatch(/ApproveConfirmModal/)
    expect(studio).toMatch(/setApproveConfirmOpen\(true\)/)
    expect(studio).not.toMatch(/confirmApproveToMain/)
    expect(editor).toMatch(/ApproveConfirmModal/)
    expect(editor).toMatch(/setApproveConfirmOpen\(true\)/)
    expect(editor).not.toMatch(/confirmApproveToMain/)
    const approveConfirmBlock = studio.slice(
      studio.indexOf("if (!opts?.skipConfirm && action === 'approve')"),
      studio.indexOf("if (!opts?.skipConfirm && (action === 'regenerate'"),
    )
    expect(approveConfirmBlock).toMatch(/setApproveConfirmOpen\(true\)/)
    expect(approveConfirmBlock).not.toMatch(/window\.confirm/)
  })
})
