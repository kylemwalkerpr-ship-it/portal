/* Yousafe Portal landing — design tokens
   Mirrors the production palette from app/portal-themes.css and
   components/design/shared.jsx, with a couple of marketplace-flavoured
   additions (gold, brick) made explicit so a global swap is one constant. */
window.YS_TOKENS = {
  // Surfaces
  paper:      '#FAFAF8',      // warm off-white (matches EstateFooter)
  bg:         '#F7F8FA',      // mountain-view default
  surface:    '#FFFFFF',
  surface2:   '#F1EEE6',      // putty — section bands
  surface3:   '#E9E4D6',      // putty deep

  // Ink
  ink:        '#0F172A',
  inkMid:     '#334155',
  inkSoft:    '#64748B',
  inkDim:     '#94A3B8',

  // Rules
  rule:       '#E5E7EB',
  ruleSoft:   '#F1F1EC',

  // Brand accents
  indigo:     '#3C3B6E',      // primary accent (portal-accent)
  indigoDeep: '#2A2A55',
  indigoSoft: 'rgba(60,59,110,0.08)',
  brick:      '#B22234',      // US flag red — used sparingly for emphasis
  gold:       '#C4A45A',      // premium gold — premium badges, ratings
  moss:       '#5F6B3A',      // moss green — success / Canada nod

  // Fonts
  serif: "'Cormorant Garamond', 'Garamond', Georgia, 'Times New Roman', serif",
  sans:  "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  mono:  "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
};
