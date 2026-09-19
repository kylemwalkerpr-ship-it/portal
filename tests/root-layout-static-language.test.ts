import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('root layout static language (CPU experiment)', () => {
  const layout = read('app/layout.tsx')
  const translationProvider = read('components/translation-provider.tsx')
  const languageContext = read('contexts/language-context.tsx')

  test('does not import next/headers or call headers() from the root layout', () => {
    expect(layout).not.toMatch(/from\s+['"]next\/headers['"]/)
    expect(layout).not.toMatch(/import\s*\{[^}]*\bheaders\b[^}]*\}\s*from/)
    expect(layout).not.toMatch(/\bawait\s+headers\s*\(/)
    expect(layout).not.toMatch(/export default async function RootLayout/)
  })

  test('keeps ClerkProvider and TranslationProvider in the root tree', () => {
    expect(layout).toContain("import { ClerkProvider } from '@clerk/nextjs'")
    expect(layout).toContain("import { TranslationProvider } from '@/components/translation-provider'")
    expect(layout).toMatch(/<ClerkProvider[\s>]/)
    expect(layout).toContain('<TranslationProvider>')
    expect(layout).toContain('</TranslationProvider>')
    expect(layout).toContain('</ClerkProvider>')
    expect(translationProvider).toContain('LanguageProvider')
    expect(translationProvider).toContain('<LanguageProvider>')
    expect(translationProvider).toContain('<TranslationBoundary>')
  })

  test('language sync contract stays on the existing client LanguageProvider', () => {
    expect(languageContext).toContain('"use client"')
    expect(languageContext).toContain('document.documentElement.lang = language')
    expect(languageContext).toContain('document.documentElement.dir = direction')
    expect(layout).toMatch(/<html lang="en" dir="ltr"/)
    expect(layout).toContain('<TranslationProvider>')
  })

  test('does not introduce next/font/google', () => {
    expect(layout).not.toMatch(/from\s+['"]next\/font(\/google)?['"]/)
    expect(layout).not.toMatch(/import\s+.*['"]next\/font/)
    expect(layout).toContain('Fonts loaded via CSS @import')
  })
})
