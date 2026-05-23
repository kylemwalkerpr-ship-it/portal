'use client'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'

type Code = 'all' | 'us' | 'uk' | 'ca'

interface Tab {
  code: Code
  label: string
}

const TABS: Tab[] = [
  { code: 'all', label: 'All' },
  { code: 'us', label: 'United States' },
  { code: 'uk', label: 'United Kingdom' },
  { code: 'ca', label: 'Canada' },
]

export function CountryTabs({ active }: { active: Code }) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()

  function go(code: Code) {
    const params = new URLSearchParams(sp?.toString() ?? '')
    if (code === 'all') params.delete('country')
    else params.set('country', code)
    const qs = params.toString()
    router.push(`${pathname}${qs ? `?${qs}` : ''}#jurisdictions`, { scroll: false })
  }

  return (
    <>
      {TABS.map((t) => (
        <a
          key={t.code}
          href={t.code === 'all' ? '/' : `/?country=${t.code}`}
          onClick={(e) => {
            e.preventDefault()
            go(t.code)
          }}
          className={t.code === active ? 'active' : ''}
        >
          {t.label}
        </a>
      ))}
    </>
  )
}

export function CountryPicker({ active }: { active: Code }) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()

  function onChange(code: Code) {
    const params = new URLSearchParams(sp?.toString() ?? '')
    if (code === 'all') params.delete('country')
    else params.set('country', code)
    const qs = params.toString()
    router.push(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false })
  }

  return (
    <select
      value={active}
      onChange={(e) => onChange(e.target.value as Code)}
      aria-label="Jurisdiction"
      style={{
        appearance: 'none',
        WebkitAppearance: 'none',
        border: 'none',
        background: 'transparent',
        font: 'inherit',
        color: 'inherit',
        cursor: 'pointer',
        padding: 0,
        fontWeight: 600,
        outline: 'none',
      }}
    >
      <option value="all">All jurisdictions</option>
      <option value="us">United States</option>
      <option value="uk">United Kingdom</option>
      <option value="ca">Canada</option>
    </select>
  )
}
