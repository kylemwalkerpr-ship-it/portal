"use client"

import { languages, useLanguage } from "@/contexts/language-context"

type LanguageSelectorProps = {
  placement?: "fixed" | "inline"
}

export function LanguageSelector({ placement = "fixed" }: LanguageSelectorProps) {
  const { language, setLanguage } = useLanguage()
  const fixed = placement === "fixed"

  return (
    <label
      data-no-translate
      className={fixed ? "yousafe-language-selector yousafe-language-selector-fixed" : "yousafe-language-selector"}
      style={{
        position: fixed ? "fixed" : "static",
        right: fixed ? 16 : undefined,
        bottom: fixed ? 16 : undefined,
        zIndex: fixed ? 10000 : undefined,
        display: "flex",
        alignItems: "center",
        gap: 8,
        border: "1px solid rgba(148, 163, 184, 0.35)",
        borderRadius: 8,
        background: "rgba(255, 255, 255, 0.95)",
        color: "#0f172a",
        boxShadow: fixed ? "0 12px 30px rgba(15, 23, 42, 0.16)" : "none",
        padding: "8px 10px",
        fontSize: 13,
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
