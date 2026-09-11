import { getManifest, listManifestSlugs } from '../lib/templatePdfManifests'

describe('template PDF manifest field integrity', () => {
  test('every explicit buyer-facing manifest has unique field IDs', () => {
    const collisions: string[] = []

    for (const slug of listManifestSlugs()) {
      const manifest = getManifest(slug)
      if (!manifest) {
        collisions.push(`${slug}: missing manifest`)
        continue
      }

      const counts = new Map<string, number>()
      for (const section of manifest.sections) {
        for (const field of section.fields) {
          counts.set(field.id, (counts.get(field.id) ?? 0) + 1)
        }
      }

      const duplicateIds = [...counts.entries()]
        .filter(([, count]) => count > 1)
        .map(([id, count]) => `${id} x${count}`)

      if (duplicateIds.length > 0) {
        collisions.push(`${slug}: ${duplicateIds.join(', ')}`)
      }
    }

    expect(collisions).toEqual([])
  })
})
