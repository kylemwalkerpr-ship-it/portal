export function chargeRefundConflict(metadata: Record<string, unknown>, amountCents: number, requestedCents: number): boolean {
  return Boolean(metadata.refunded_at) || Number(metadata.refunded_cents || 0) + requestedCents > amountCents
}
