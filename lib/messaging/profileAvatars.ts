/**
 * Seller photos live on attorneys.headshot_url and consultants.avatar_url /
 * headshot_url. Messenger historically only read profiles.avatar_url, so
 * counterparts without a dual-written profile photo rendered as initials.
 */

type ProfileLike = {
  id?: string | null
  avatar_url?: string | null
  role?: string | null
}

export async function syncProfileAvatar(
  db: { from: (table: string) => any },
  profileId: string,
  url: string | null,
): Promise<void> {
  try {
    await db.from('profiles').update({ avatar_url: url }).eq('id', profileId)
  } catch {
    // Messenger still has the seller-table fallback below.
  }
}

export async function fillMissingProfileAvatars<T extends ProfileLike>(
  db: { from: (table: string) => any },
  profiles: T[],
): Promise<T[]> {
  const missing = profiles.filter((profile) => profile?.id && !profile.avatar_url)
  if (!missing.length) return profiles

  try {
    const attorneyIds = missing
      .filter((profile) => profile.role === 'attorney')
      .map((profile) => profile.id as string)
    const consultantIds = missing
      .filter((profile) => profile.role === 'consultant')
      .map((profile) => profile.id as string)

    const [attorneysRes, consultantsRes] = await Promise.all([
      attorneyIds.length
        ? db.from('attorneys').select('profile_id, headshot_url').in('profile_id', attorneyIds)
        : Promise.resolve({ data: [] as any[] }),
      consultantIds.length
        ? db.from('consultants').select('profile_id, avatar_url, headshot_url').in('profile_id', consultantIds)
        : Promise.resolve({ data: [] as any[] }),
    ])

    const byId = new Map<string, string>()
    for (const row of attorneysRes.data ?? []) {
      if (row?.profile_id && row.headshot_url) byId.set(row.profile_id, row.headshot_url)
    }
    for (const row of consultantsRes.data ?? []) {
      const url = row?.avatar_url || row?.headshot_url
      if (row?.profile_id && url) byId.set(row.profile_id, url)
    }
    if (!byId.size) return profiles

    return profiles.map((profile) => {
      if (profile?.id && !profile.avatar_url && byId.has(profile.id)) {
        return { ...profile, avatar_url: byId.get(profile.id) || null }
      }
      return profile
    })
  } catch {
    return profiles
  }
}
