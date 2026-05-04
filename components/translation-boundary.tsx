"use client"

import { useEffect, useRef, type ReactNode } from "react"
import { useLanguage } from "@/contexts/language-context"
import { translateText } from "@/hooks/use-translation"

const TRANSLATABLE_ATTRIBUTES = ["placeholder", "title", "aria-label", "alt"]
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "SELECT", "OPTION", "CODE", "PRE", "SVG"])
const originalText = new WeakMap<Text, string>()

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
      if (SKIP_TAGS.has(node.parentElement?.tagName ?? "")) return NodeFilter.FILTER_REJECT
      return shouldTranslate(node.nodeValue ?? "") ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
    },
  })

  while (walker.nextNode()) nodes.push(walker.currentNode as Text)
  return nodes
}

async function translateTextNode(node: Text, language: string) {
  const source = originalText.get(node) ?? node.nodeValue ?? ""
  if (!originalText.has(node)) originalText.set(node, source)

  if (language === "en") {
    if (node.nodeValue !== source) node.nodeValue = source
    return
  }

  const translated = await translateText(source, language)
  const nextValue = withOriginalWhitespace(source, translated)
  if (node.isConnected && node.nodeValue !== nextValue) node.nodeValue = nextValue
}

async function translateAttributes(root: HTMLElement, language: string) {
  const elements = Array.from(root.querySelectorAll<HTMLElement>("*")).filter((element) => !element.closest("[data-no-translate], [translate='no']"))

  await Promise.all(
    elements.flatMap((element) =>
      TRANSLATABLE_ATTRIBUTES.map(async (attribute) => {
        const value = element.getAttribute(attribute)
        if (!value || !shouldTranslate(value)) return

        const originalAttribute = `data-original-${attribute}`
        const source = element.getAttribute(originalAttribute) ?? value
        if (!element.hasAttribute(originalAttribute)) element.setAttribute(originalAttribute, source)

        if (language === "en") {
          if (element.getAttribute(attribute) !== source) element.setAttribute(attribute, source)
          return
        }

        const translated = await translateText(source, language)
        if (element.getAttribute(attribute) !== translated) element.setAttribute(attribute, translated)
      })
    )
  )
}

export function TranslationBoundary({ children }: { children: ReactNode }) {
  const { language } = useLanguage()
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const run = async () => {
      if (cancelled) return
      const textNodes = collectTextNodes(root)
      await Promise.all(textNodes.map((node) => translateTextNode(node, language)))
      await translateAttributes(root, language)
    }

    const schedule = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(run, 80)
    }

    schedule()
    const observer = new MutationObserver(schedule)
    observer.observe(root, { childList: true, subtree: true, characterData: true, attributes: true })

    return () => {
      cancelled = true
      observer.disconnect()
      if (timer) clearTimeout(timer)
    }
  }, [language])

  return <div ref={rootRef}>{children}</div>
}
