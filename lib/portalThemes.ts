export type PortalThemeId =
  | 'mountain-view'
  | 'lake-view'
  | 'ocean-view'
  | 'forest-view'
  | 'desert-view'

export const THEME_IDS: PortalThemeId[] = [
  'mountain-view', 'lake-view', 'ocean-view', 'forest-view', 'desert-view',
]

export const DEFAULT_THEME: PortalThemeId = 'mountain-view'

export interface PortalThemeMeta {
  id: PortalThemeId
  name: string
  description: string
  swatch: { bg: string; ink: string; accent: string }
}

export const PORTAL_THEMES: Record<PortalThemeId, PortalThemeMeta> = {
  'mountain-view': {
    id: 'mountain-view',
    name: 'Mountain View',
    description: 'Cool slate with indigo accent',
    swatch: { bg: '#F7F8FA', ink: '#0F172A', accent: '#3C3B6E' },
  },
  'lake-view': {
    id: 'lake-view',
    name: 'Lake View',
    description: 'Cool blue-grays with lake blue accent',
    swatch: { bg: '#F0F5FA', ink: '#0F2433', accent: '#2E6B9F' },
  },
  'ocean-view': {
    id: 'ocean-view',
    name: 'Ocean View',
    description: 'Deep ocean with teal accent',
    swatch: { bg: '#EEF6F8', ink: '#0A1F2E', accent: '#0E7C8E' },
  },
  'forest-view': {
    id: 'forest-view',
    name: 'Forest View',
    description: 'Warm cream with moss accent',
    swatch: { bg: '#F5F4EC', ink: '#1F2516', accent: '#4F6B3A' },
  },
  'desert-view': {
    id: 'desert-view',
    name: 'Desert View',
    description: 'Sand and terracotta accent',
    swatch: { bg: '#FBF6EE', ink: '#2A1F12', accent: '#B8623E' },
  },
}
