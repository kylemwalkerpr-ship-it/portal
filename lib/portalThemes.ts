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
    description: 'Cool gray paper with slate-navy actions',
    swatch: { bg: '#F4F6F8', ink: '#0F172A', accent: '#3C3B6E' },
  },
  'lake-view': {
    id: 'lake-view',
    name: 'Lake View',
    description: 'Cool gray paper with steel actions',
    swatch: { bg: '#F4F6F8', ink: '#0F172A', accent: '#3D5A73' },
  },
  'ocean-view': {
    id: 'ocean-view',
    name: 'Ocean View',
    description: 'Cool paper with deep slate actions',
    swatch: { bg: '#F3F5F6', ink: '#0F172A', accent: '#334155' },
  },
  'forest-view': {
    id: 'forest-view',
    name: 'Forest View',
    description: 'Pale linen with olive actions',
    swatch: { bg: '#F5F6F3', ink: '#0F172A', accent: '#2F5D46' },
  },
  'desert-view': {
    id: 'desert-view',
    name: 'Desert View',
    description: 'Warm stone paper with terracotta actions',
    swatch: { bg: '#F7F5F2', ink: '#0F172A', accent: '#8A3D1C' },
  },
  // ── New palettes ───────────────────────────────────────────────
  'sunset-view': {
    id: 'sunset-view',
    name: 'Sunset View',
    description: 'Warm paper with oxblood actions',
    swatch: { bg: '#F7F4F2', ink: '#0F172A', accent: '#7A2E32' },
  },
  'arctic-view': {
    id: 'arctic-view',
    name: 'Arctic View',
    description: 'Crisp gray paper with graphite actions',
    swatch: { bg: '#F5F6F8', ink: '#0F172A', accent: '#3F3F46' },
  },
  'meadow-view': {
    id: 'meadow-view',
    name: 'Meadow View',
    description: 'Warm ivory paper with claret actions',
    swatch: { bg: '#F6F3EC', ink: '#0F172A', accent: '#7C2D3A' },
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
    description: 'Warm paper with claret actions',
    swatch: { bg: '#F7F4EE', ink: '#0F172A', accent: '#7A2E32' },
  },
}
