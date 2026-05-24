'use client'
import React from 'react'

interface IconProps {
  size?: number
  stroke?: number
  style?: React.CSSProperties
  className?: string
}

function makeIcon(
  paths: React.ReactNode,
  viewBox = '0 0 24 24'
): React.FC<IconProps> {
  return function Icon({ size = 20, stroke = 1.6, style = {}, className, ...rest }) {
    return (
      <svg
        width={size}
        height={size}
        viewBox={viewBox}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        style={{ display: 'inline-block', verticalAlign: 'middle', ...style }}
        {...rest}
      >
        {paths}
      </svg>
    )
  }
}

export const Arrow = makeIcon(
  <>
    <path d="M5 12h14" />
    <path d="m13 6 6 6-6 6" />
  </>
)

export const ArrowUR = makeIcon(
  <>
    <path d="M7 17 17 7" />
    <path d="M8 7h9v9" />
  </>
)

export const Plus = makeIcon(
  <>
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </>
)

export const Check = makeIcon(<path d="m5 12 5 5L20 7" />)

export const Shield = makeIcon(<path d="M12 22s8-4 8-12V5l-8-3-8 3v5c0 8 8 12 8 12Z" />)

export const Lock = makeIcon(
  <>
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </>
)

export const Globe = makeIcon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18" />
    <path d="M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
  </>
)

export const Scale = makeIcon(
  <>
    <path d="M12 3v18" />
    <path d="M6 7h12" />
    <path d="m6 7-4 8a4 4 0 0 0 8 0Z" />
    <path d="m18 7-4 8a4 4 0 0 0 8 0Z" />
  </>
)

export const Cap = makeIcon(
  <>
    <path d="M2 9 12 4l10 5-10 5L2 9Z" />
    <path d="M6 11v5a6 6 0 0 0 12 0v-5" />
  </>
)

export const Doc = makeIcon(
  <>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
    <path d="M14 3v5h5" />
    <path d="M9 13h6" />
    <path d="M9 17h4" />
  </>
)

export const Briefcase = makeIcon(
  <>
    <rect x="3" y="7" width="18" height="13" rx="2" />
    <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </>
)

export const House = makeIcon(<path d="M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z" />)

export const Coin = makeIcon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M9 9.5C9 8 10.5 7 12 7s3 1 3 2.5S13.5 12 12 12s-3 1-3 2.5S10.5 17 12 17s3-1 3-2.5" />
    <path d="M12 5v2M12 17v2" />
  </>
)

export const Star = makeIcon(
  <path d="m12 3 2.6 5.6L20 9.4l-4 4 1 5.6-5-2.8L7 19l1-5.6-4-4 5.4-.8L12 3Z" />
)

export const Quote = makeIcon(
  <path d="M7 8c-2 0-3 1.5-3 3.5S5 15 7 15h1v-7H7Zm10 0c-2 0-3 1.5-3 3.5S15 15 17 15h1v-7h-1Z" />
)

export const Spark = makeIcon(
  <>
    <path d="M12 3v5M12 16v5M3 12h5M16 12h5M5.5 5.5l3.5 3.5M15 15l3.5 3.5M5.5 18.5 9 15M15 9l3.5-3.5" />
  </>
)

export const ChevronDown = makeIcon(<path d="m6 9 6 6 6-6" />)

export const ChevronRight = makeIcon(<path d="m9 6 6 6-6 6" />)

export const ChevronLeft = makeIcon(<path d="m15 6-6 6 6 6" />)

export const Close = makeIcon(
  <>
    <path d="M6 6l12 12M18 6 6 18" />
  </>
)

export const Menu = makeIcon(
  <>
    <path d="M4 6h16M4 12h16M4 18h16" />
  </>
)

export const Clock = makeIcon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </>
)

export const Bolt = makeIcon(<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />)

export const Home = makeIcon(<path d="M3 11 12 3l9 8v9a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z" />)

export const Headset = makeIcon(
  <>
    <path d="M4 13a8 8 0 0 1 16 0" />
    <path d="M4 13v4a2 2 0 0 0 2 2h2v-7H6a2 2 0 0 0-2 2Z" />
    <path d="M20 13v4a2 2 0 0 1-2 2h-2v-7h2a2 2 0 0 1 2 1Z" />
    <path d="M14 19v.5a2 2 0 0 1-2 2h-1.5" />
  </>
)
