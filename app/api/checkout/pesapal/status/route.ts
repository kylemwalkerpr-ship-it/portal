/** P2 callback/status reconciliation is intentionally not part of this branch. */
export async function GET() {
  return Response.json({
    status: 'pending',
    confirmed: false,
    message: 'Server-side Pesapal status reconciliation is not built yet. Do not retry payment until support confirms the result.',
  }, { status: 501, headers: { 'cache-control': 'no-store' } })
}
