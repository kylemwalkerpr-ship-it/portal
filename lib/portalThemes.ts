export type PortalThemeId =
  | 'mountain-view'
  | 'lake-view'
  | 'ocean-view'
  | 'forest-view'
  | 'desert-view'
  | 'sunset-view'
  | 'arctic-view'
  | 'meadow-view'
  | 'midnight-view'
  | 'harvest-view'

export const THEME_IDS: PortalThemeId[] = [
  'mountain-view', 'lake-view', 'ocean-view', 'forest-view', 'desert-view',
  'sunset-view', 'arctic-view', 'meadow-view', 'midnight-view', 'harvest-view',
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
  // ── New palettes ───────────────────────────────────────────────
  'sunset-view': {
    id: 'sunset-view',
    name: 'Sunset View',
    description: 'Warm rose with coral accent',
    swatch: { bg: '#FDF5F3', ink: '#2D1810', accent: '#C8483A' },
  },
  'arctic-view': {
    id: 'arctic-view',
    name: 'Arctic View',
    description: 'Crisp ice with polar blue accent',
    swatch: { bg: '#F4F9FD', ink: '#0C1A2B', accent: '#3B7FC4' },
  },
  'meadow-view': {
    id: 'meadow-view',
    name: 'Meadow View',
    description: 'Soft sage with lavender accent',
    swatch: { bg: '#F6F8F0', ink: '#1C2414', accent: '#7B6CB5' },
  },
  'midnight-view': {
    id: 'midnight-view',
    name: 'Midnight View',
    description: 'Deep charcoal with silver accent',
    swatch: { bg: '#1E1F24', ink: '#E8E9ED', accent: '#A0A5B8' },
  },
  'harvest-view': {
    id: 'harvest-view',
    name: 'Harvest View',
    description: 'Golden amber with burgundy accent',
    swatch: { bg: '#FBF7ED', ink: '#231A0A', accent: '#8B3A3A' },
  },
}
