export const translations: Record<string, Record<string, string>> = {
  es: {},
  fr: {},
  ar: {},
  zh: {},
  hi: {},
  pt: {},
}

export function getLocalTranslation(text: string, targetLang: string): string | null {
  const normalized = text.trim()
  if (!normalized || targetLang === "en") return null
  return translations[targetLang]?.[normalized] ?? null
}
