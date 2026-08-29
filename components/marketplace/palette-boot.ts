/**
 * Blocking first-paint palette boot.
 *
 * The marketplace palette used to be applied from PaletteProvider's
 * useEffect — i.e. AFTER first paint — so every full navigation of a market
 * page flashed the default mahogany before the stored palette arrived.
 *
 * This module builds a tiny inline <script> that runs synchronously in the
 * document body BEFORE React hydrates. It reads `ys-marketplace-palette`
 * from localStorage, resolves the palette tokens from the SAME registry the
 * React app uses (components/marketplace/palettes.ts), and writes the
 * --ys-* custom properties onto <html> (which .cw-market inherits) plus the
 * body background, so the document never flashes white or mahogany.
 *
 * The tokens are embedded at build time from PALETTES itself, so the boot
 * script and the React-side palette definitions cannot drift.
 */
import { PALETTES, DEFAULT_PALETTE_NAME } from './palettes'

export const PALETTE_STORAGE_KEY = 'ys-marketplace-palette'

/**
 * Idempotent browser snippet. Runs on every market/shop layout render; the
 * PaletteProvider effect re-applies the exact same values after hydration,
 * so there is no visible jump.
 */
export function buildPaletteBootScript(): string {
  const map: Record<string, Record<string, string>> = {}
  for (const p of PALETTES) map[p.name] = p.tokens
  const fallback = PALETTES.find(p => p.name === DEFAULT_PALETTE_NAME) ?? PALETTES[0]

  return `(function(){try{
var P=${JSON.stringify(map)};
var KEY=${JSON.stringify(PALETTE_STORAGE_KEY)};
var name=null;
try{name=window.localStorage.getItem(KEY)}catch(e){}
var t=(name&&P[name])||P[${JSON.stringify(fallback.name)}];
if(!t)return;
var docEl=document.documentElement;
for(var k in t){docEl.style.setProperty('--ys-'+k,t[k])}
docEl.setAttribute('data-ys-palette',(name&&P[name])?name:${JSON.stringify(fallback.name)});
if(document.body){document.body.style.backgroundColor=t.paper}
var m=document.querySelector('.cw-market');
if(m){for(var k2 in t){m.style.setProperty('--ys-'+k2,t[k2])}}
}catch(e){}})();`
}
