"use client"

import React from "react"
import { languages, useLanguage, type Language } from "@/contexts/language-context"

/**
 * GlobalLanguageBar — fixed, compact site-wide language switcher.
 *
 * Mounted once in app/layout.tsx so it shows on EVERY page. Renders the
 * currently active language as a 2-letter code (EN, ES, FR, AR, ZH, HI,
 * PT) inside a small pill, and opens a drop panel listing the full native
 * names. Click-outside / Esc dismisses.
 *
 * `position: fixed` keeps it pinned through scroll. `data-no-translate`
 * prevents Google Translate from retranslating its own controls.
 */
const SHORT_LABEL: Record<Language, string> = {
  en: "EN", es: "ES", fr: "FR", ar: "AR", zh: "ZH", hi: "HI", pt: "PT",
}

export function GlobalLanguageBar() {
  const { language, setLanguage } = useLanguage()
  const [open, setOpen] = React.useState(false)
  const wrapRef = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false) }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onEsc)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onEsc)
    }
  }, [open])

  const current = languages.find(l => l.code === language) || languages[0]
  const shortCurrent = SHORT_LABEL[current.code] || current.code.toUpperCase()

  return (
    <div
      ref={wrapRef}
      data-no-translate
      style={{
        position: "fixed",
        top: 74,
        right: 16,
        zIndex: 10010,
        pointerEvents: "auto",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif",
      }}
    >
      <button
        type="button"
        aria-label={`Language: ${current.label}. Click to change.`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          padding: "5px 10px",
          border: "1px solid rgba(148,163,184,0.35)",
          borderRadius: 6,
          background: "rgba(255,255,255,0.96)",
          color: "#0f172a",
          boxShadow: "0 4px 12px rgba(15,23,42,0.08)",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: ".06em",
          lineHeight: 1,
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        <span aria-hidden="true" style={{ fontSize: 12 }}>🌐</span>
        <span>{shortCurrent}</span>
        <span aria-hidden="true" style={{ fontSize: 9, opacity: 0.55, marginLeft: 1 }}>▾</span>
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="Choose language"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            minWidth: 160,
            margin: 0,
            padding: 4,
            listStyle: "none",
            border: "1px solid rgba(148,163,184,0.30)",
            borderRadius: 8,
            background: "#fff",
            boxShadow: "0 12px 28px rgba(15,23,42,0.16)",
            maxHeight: "60vh",
            overflowY: "auto",
          }}
        >
          {languages.map(item => {
            const active = item.code === language
            const short = SHORT_LABEL[item.code] || item.code.toUpperCase()
            return (
              <li key={item.code} role="option" aria-selected={active}>
                <button
                  type="button"
                  onClick={() => { setLanguage(item.code); setOpen(false) }}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    padding: "7px 10px",
                    border: "none",
                    background: active ? "rgba(14,124,142,0.10)" : "transparent",
                    color: active ? "#0E7C8E" : "#1A1F2E",
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: active ? 700 : 500,
                    borderRadius: 5,
                    textAlign: "left",
                    fontFamily: "inherit",
                  }}
                >
                  <span>{item.nativeLabel}</span>
                  <span style={{
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: ".06em",
                    color: active ? "#0E7C8E" : "#5C6070",
                    fontFamily: "'SF Mono', Menlo, Consolas, monospace",
                  }}>
                    {short}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
