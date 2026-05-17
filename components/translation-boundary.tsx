"use client"

import { useEffect, type ReactNode } from "react"
import { useLanguage } from "@/contexts/language-context"
import { translateText, translateTexts } from "@/hooks/use-translation"

const TRANSLATABLE_ATTRIBUTES = ["placeholder", "title", "aria-label", "alt"]
// NOTE: OPTION intentionally removed so <option> text inside <select> translates.
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "SELECT", "CODE", "PRE", "SVG"])
const originalText = new WeakMap<Text, string>()
const BATCH_ENDPOINT = "/api/translate/batch"

function shouldTranslate(value: string) {
  const normalized = value.trim()
  return normalized.length > 1 && /[\p{L}\p{N}]/u.test(normalized)
}

function isSkipped(node: Node) {
  const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement
  return !!element?.closest("[data-no-translate], [translate='no']")
}

function withOriginalWhitespace(source: string, translated: string) {
  return `${source.match(/^\s*/)?.[0] ?? ""}${translated}${source.match(/\s*$/)?.[0] ?? ""}`
}

function collectTextNodes(root: HTMLElement) {
  const nodes: Text[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (isSkipped(node)) return NodeFilter.FILTER_REJECT
      const parentTag = node.parentElement?.tagName ?? ""
      if (SKIP_TAGS.has(parentTag)) return NodeFilter.FILTER_REJECT
      const source = originalText.get(node as Text) ?? node.nodeValue ?? ""
      return shouldTranslate(source) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
    },
  })

  while (walker.nextNode()) nodes.push(walker.currentNode as Text)
  return nodes
}

function sourceFor(node: Text) {
  const stored = originalText.get(node)
  if (stored !== undefined) return stored
  const initial = node.nodeValue ?? ""
  originalText.set(node, initial)
  return initial
}

/** Chunk an array into pieces of `size`. */
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

async function batchTranslateUnique(texts: string[], language: string): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  if (!texts.length) return map

  // The batch endpoint caps at 100 strings per request.
  const chunks = chunk(texts, 100)

  for (const part of chunks) {
    let succeeded = false
    try {
      const res = await fetch(BATCH_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texts: part, targetLang: language }),
      })
      if (res.ok) {
        const data = await res.json()
        const translations: unknown = data?.translations
        if (Array.isArray(translations) && translations.length === part.length) {
          for (let i = 0; i < part.length; i++) {
            const t = typeof translations[i] === "string" ? (translations[i] as string) : part[i]
            map.set(part[i], t)
          }
          succeeded = true
        }
      }
    } catch {
      /* fall through to per-string */
    }

    if (!succeeded) {
      // Per-string fallback via the existing single-string endpoint.
      const perString = await Promise.all(part.map((s) => translateText(s, language)))
      for (let i = 0; i < part.length; i++) map.set(part[i], perString[i])
    }
  }

  return map
}

async function translateRoot(root: HTMLElement, language: string, cancelled: () => boolean) {
  const textNodes = collectTextNodes(root)
  if (cancelled()) return

  if (language === "en") {
    // Restore originals.
    for (const node of textNodes) {
      const source = originalText.get(node)
      if (source !== undefined && node.isConnected && node.nodeValue !== source) {
        node.nodeValue = source
      }
    }
    await restoreAttributes(root)
    return
  }

  // Collect unique sources to translate.
  const uniqueSources = new Set<string>()
  for (const node of textNodes) {
    const trimmed = sourceFor(node).trim()
    if (trimmed) uniqueSources.add(trimmed)
  }

  // Collect translatable attribute values too.
  const attrTargets: Array<{ element: HTMLElement; attribute: string; source: string }> = []
  const attrElements = Array.from(root.querySelectorAll<HTMLElement>("*")).filter(
    (element) => !element.closest("[data-no-translate], [translate='no']")
  )
  for (const element of attrElements) {
    for (const attribute of TRANSLATABLE_ATTRIBUTES) {
      const value = element.getAttribute(attribute)
      if (!value || !shouldTranslate(value)) continue
      const originalAttribute = `data-original-${attribute}`
      const source = element.getAttribute(originalAttribute) ?? value
      if (!element.hasAttribute(originalAttribute)) element.setAttribute(originalAttribute, source)
      attrTargets.push({ element, attribute, source })
      const trimmed = source.trim()
      if (trimmed) uniqueSources.add(trimmed)
    }
  }

  if (!uniqueSources.size) return

  const translationMap = await batchTranslateUnique(Array.from(uniqueSources), language)
  if (cancelled()) return

  // Apply to text nodes.
  for (const node of textNodes) {
    if (!node.isConnected) continue
    const source = sourceFor(node)
    const trimmed = source.trim()
    if (!trimmed) continue
    const translated = translationMap.get(trimmed) ?? trimmed
    const next = withOriginalWhitespace(source, translated)
    if (node.nodeValue !== next) node.nodeValue = next
  }

  // Apply to attributes.
  for (const { element, attribute, source } of attrTargets) {
    const trimmed = source.trim()
    const translated = translationMap.get(trimmed) ?? source
    if (element.getAttribute(attribute) !== translated) element.setAttribute(attribute, translated)
  }
}

async function restoreAttributes(root: HTMLElement) {
  const elements = Array.from(root.querySelectorAll<HTMLElement>("*"))
  for (const element of elements) {
    for (const attribute of TRANSLATABLE_ATTRIBUTES) {
      const originalAttribute = `data-original-${attribute}`
      const source = element.getAttribute(originalAttribute)
      if (source !== null && element.getAttribute(attribute) !== source) {
        element.setAttribute(attribute, source)
      }
    }
  }
}

export function TranslationBoundary({ children }: { children: ReactNode }) {
  const { language } = useLanguage()

  useEffect(() => {
    if (typeof document === "undefined") return
    const root = document.body
    if (!root) return

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    let running = false
    let rerun = false

    const run = async () => {
      if (cancelled) return
      if (running) {
        rerun = true
        return
      }
      running = true
      try {
        await translateRoot(root, language, () => cancelled)
      } finally {
        running = false
        if (rerun && !cancelled) {
          rerun = false
          schedule()
        }
      }
    }

    const schedule = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(run, 80)
    }

    schedule()
    const observer = new MutationObserver((mutations) => {
      // Ignore mutations triggered solely by our own text-node updates to avoid loops.
      // We still want to react to genuine DOM changes, so we use the debounce.
      for (const m of mutations) {
        if (m.type === "characterData") {
          // characterData on a node we've already cached is likely our own write.
          if (originalText.has(m.target as Text)) continue
        }
        schedule()
        return
      }
    })
    observer.observe(root, { childList: true, subtree: true, characterData: true, attributes: true })

    return () => {
      cancelled = true
      observer.disconnect()
      if (timer) clearTimeout(timer)
    }
  }, [language])

  // Render children directly — we observe document.body so portals are covered.
  return <>{children}</>
}
