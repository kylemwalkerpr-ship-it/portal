export async function GET() {
  return Response.json({
    worker: 'yousafe-portal',
    timestamp: new Date().toISOString(),
    stripeSecret: !!process.env.STRIPE_SECRET_KEY,
    supabaseRole: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    build: process.env.BUILD_ID ?? null,
  })
}
