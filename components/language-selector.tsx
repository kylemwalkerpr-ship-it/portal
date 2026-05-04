"use client"

import { languages, useLanguage } from "@/contexts/language-context"

export function LanguageSelector() {
  const { language, setLanguage } = useLanguage()

  return (
    <label
      data-no-translate
      style={{
        position: "fixed",
        right: 16,
        bottom: 16,
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        gap: 8,
        border: "1px solid rgba(148, 163, 184, 0.35)",
        borderRadius: 8,
        background: "rgba(255, 255, 255, 0.95)",
        color: "#0f172a",
        boxShadow: "0 12px 30px rgba(15, 23, 42, 0.16)",
        padding: "8px 10px",
        fontSize: 14,
        fontWeight: 600,
      }}
    >
      <span aria-hidden="true">Language</span>
      <select
        value={language}
        aria-label="Language"
        onChange={(event) => setLanguage(event.target.value as typeof language)}
        style={{ border: 0, background: "transparent", font: "inherit", outline: "none" }}
      >
        {languages.map((item) => (
          <option key={item.code} value={item.code}>
            {item.label}
          </option>
        ))}
      </select>
    </label>
  )
}
