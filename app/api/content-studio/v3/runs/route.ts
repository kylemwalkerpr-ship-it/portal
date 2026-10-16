import { NextResponse } from 'next/server'

/** Production remains unavailable until the reviewed canonical A1 identity and authority binding is installed. */
export async function POST() {
  return NextResponse.json({ error: 'RUNTIME_NOT_ACTIVE' }, { status: 503, headers: { 'cache-control': 'no-store' } })
}
