import { createSupabaseAdminClient, isServiceRoleAchieved } from '@/lib/supabase'
import { handleSourceOwnerRequest } from '@/lib/growthOwner/sourceOwner'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  return handleSourceOwnerRequest(request, {
    secret: process.env.YOUSAFE_GROWTH_SOURCE_OWNER_TOKEN,
    isServiceRoleAvailable: isServiceRoleAchieved,
    createDatabase: createSupabaseAdminClient,
  })
}
