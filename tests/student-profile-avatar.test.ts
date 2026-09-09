import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('student profile photo matches attorney/consultant chrome', () => {
  const student = read('components/design/student.jsx')
  const settings = read('components/design/student-settings.jsx')
  const studentData = read('app/api/student/data/route.ts')
  const studentAuth = read('lib/student.ts')
  const attorney = read('components/design/attorney.jsx')
  const consultant = read('components/design/consultant.jsx')
  const admin = read('components/design/admin.jsx')

  test('dashboard chrome uploads through /api/profile/avatar and renders the photo', () => {
    expect(student).toContain("from '@/lib/imageResize'")
    expect(student).toContain('resizeAvatarFile')
    expect(student).toContain("fetch('/api/profile/avatar'")
    expect(student).toContain('avatarSrc={profileData.avatar_url || undefined}')
    expect(student).toContain("src={profileData.avatar_url || undefined}")
    expect(student).toContain("profileData.avatar_url ? 'Change photo' : 'Upload profile photo'")
    expect(student).not.toContain('Student avatar upload is ready for profile storage wiring.')
  })

  test('student data and settings keep the same avatar_url as the chrome', () => {
    expect(studentAuth).toContain('avatar_url')
    expect(studentData).toContain('avatar_url:')
    expect(settings).toContain('resizeAvatarFile')
    expect(settings).toContain('onAvatarChange')
    expect(student).toContain('onAvatarChange={(url) => setProfileData')
  })

  test('attorneys, consultants and admins keep a photo on the UserMenu and sidebar', () => {
    expect(attorney).toContain('avatarSrc={headshotUrl}')
    expect(attorney).toContain('src={headshotUrl}')
    expect(consultant).toContain('avatarSrc={profileAvatarUrl}')
    expect(consultant).toContain('src={profileAvatarUrl}')
    expect(admin).toContain('avatarSrc={adminProfile.avatar_url || undefined}')
    expect(admin).toContain("src={adminProfile.avatar_url || undefined}")
    expect(admin).toContain("adminProfile.avatar_url ? 'Change photo' : 'Upload profile photo'")
  })
})
