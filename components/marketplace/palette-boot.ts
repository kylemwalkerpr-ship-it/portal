/**
 * Blocking first-paint palette + pattern boot.
 *
 * The marketplace palette/pattern used to be applied from a React useEffect —
 * i.e. AFTER first paint — so every full navigation of a market page flashed
 * the default palette, and the pattern did not appear until hydration
 * (a no-pattern window plus remount instability).
 *
 * This module builds a tiny inline <script> that runs synchronously in the
 * document body BEFORE React hydrates. It reads `ys-marketplace-palette` and
 * `ys-marketplace-pattern` from localStorage, resolves them from the SAME
 * registries the React app uses (components/marketplace/palettes.ts and
 * patterns.ts), and writes:
 *
 *   - the palette --ys-* custom properties onto <html> (which .cw-market
 *     inherits) plus the body background, so the document never flashes white
 *     or the default palette;
 *   - the `--ys-pattern-*` custom properties the .cw-market::before canvas
 *     consumes, so the saved motif is on screen in the first paint;
 *   - `data-ys-palette` / `data-ys-pattern` on <html>. Any .cw-market
 *     fallback declaration in CSS is gated on the ABSENCE of data-ys-palette,
 *     so a root inherits these values instead of flashing the shipped default
 *     until React hydrates.
 *
 * The tokens are embedded at build time from PALETTES itself, so the boot
 * script and the React-side palette definitions cannot drift.
 */
import { PALETTES, DEFAULT_PALETTE_NAME, PALETTE_STORAGE_KEY } from './palettes'
import { DEFAULT_PATTERN_ID, MARKET_PATTERN_STORAGE_KEY, patternBootData } from './patterns'

export { PALETTE_STORAGE_KEY }

/**
 * Idempotent browser snippet. Runs on every market/shop layout render; the
 * PaletteProvider store re-applies the exact same values after hydration, so
 * there is no visible jump.
 */
export function buildPaletteBootScript(): string {
  const map: Record<string, Record<string, string>> = {}
  for (const p of PALETTES) map[p.name] = p.tokens
  const fallback = PALETTES.find(p => p.name === DEFAULT_PALETTE_NAME) ?? PALETTES[0]
  const patterns = patternBootData()

  return `(function(){try{
var P=${JSON.stringify(map)};
var KEY=${JSON.stringify(PALETTE_STORAGE_KEY)};
var FALLBACK=${JSON.stringify(fallback.name)};
var name=null;
try{name=window.localStorage.getItem(KEY)}catch(e){}
var t=(name&&P[name])||P[FALLBACK];
if(!t)return;
var docEl=document.documentElement;
for(var k in t){docEl.style.setProperty('--ys-'+k,t[k])}
docEl.setAttribute('data-ys-palette',(name&&P[name])?name:FALLBACK);
if(document.body){document.body.style.backgroundColor=t.paper}
var PM=${JSON.stringify(patterns)};
var PKEY=${JSON.stringify(MARKET_PATTERN_STORAGE_KEY)};
var PFALLBACK=${JSON.stringify(DEFAULT_PATTERN_ID)};
var pid=null;
try{pid=window.localStorage.getItem(PKEY)}catch(e){}
var pd=(pid&&PM[pid])||PM[PFALLBACK];
var paint=function(el){if(!pd)return;el.style.setProperty('--ys-pattern-image',pd[0]);el.style.setProperty('--ys-pattern-size',pd[1]);el.style.setProperty('--ys-pattern-position',pd[2]);el.style.setProperty('--ys-pattern-opacity',''+pd[3])};
paint(docEl);
docEl.setAttribute('data-ys-pattern',(pid&&PM[pid])?pid:PFALLBACK);
if(typeof document.querySelectorAll==='function'){
var roots=document.querySelectorAll('.cw-market');
for(var r=0;r<roots.length;r++){var m=roots[r];
for(var k2 in t){m.style.setProperty('--ys-'+k2,t[k2])}
paint(m)}
}
}catch(e){}})();`
}
