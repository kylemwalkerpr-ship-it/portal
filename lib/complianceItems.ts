// Single source of truth for the compliance checklist.
// Used by the compliance page UI AND the AI guidance endpoint so
// the assistant can only explain real items, not invent new ones.

export type ComplianceStatus = 'ok' | 'pending' | 'missing' | 'paused'

export interface ComplianceItem {
  id: string
  label: string
  status: ComplianceStatus
  // One short human line shown under the label in the UI.
  detail: string
  // Where the seller goes to fix this item. Null = admin-controlled.
  actionHref: string | null
  actionLabel: string | null
}

export interface ComplianceSnapshot {
  items: ComplianceItem[]
  // role drives the prompt the AI uses for explanations — attorneys
  // need bar/jurisdiction guidance, consultants need ICCRC/OISC/etc.
  role: 'attorney' | 'consultant'
}
