// app.jsx — Root: routing, tweaks, theme application.

function App() {
  const s = useStore().get();
  const [t, setTweak] = useTweaks(window.TWEAK_DEFAULTS);

  // Apply tweaks to :root
  React.useEffect(() => {
    const root = document.documentElement;

    root.setAttribute('data-theme', t.dark ? 'dark' : 'light');

    // Accent
    root.style.setProperty('--accent', t.accent);
    // Derive a slightly darker accent-ink from accent
    root.style.setProperty('--accent-ink', t.dark ? lighten(t.accent, 8) : darken(t.accent, 8));

    // Font pair
    const pairs = {
      'lora-plex':    { display: "'Lora', Georgia, serif",                body: "'Lora', Georgia, serif",                ui: "'IBM Plex Sans', system-ui, sans-serif" },
      'source-inter': { display: "'Source Serif 4', Georgia, serif",      body: "'Source Serif 4', Georgia, serif",      ui: "'Inter', system-ui, sans-serif" },
      'plex-plex':    { display: "'IBM Plex Sans', system-ui, sans-serif", body: "'IBM Plex Sans', system-ui, sans-serif", ui: "'IBM Plex Sans', system-ui, sans-serif" },
    };
    const p = pairs[t.fontPair] || pairs['lora-plex'];
    root.style.setProperty('--font-display', p.display);
    root.style.setProperty('--font-body',    p.body);
    root.style.setProperty('--font-ui',      p.ui);

    // Paper tone
    const tones = {
      'cream': 'oklch(98% 0.005 80)',
      'white': 'oklch(99% 0.001 90)',
      'sepia': 'oklch(95% 0.014 75)',
    };
    if (!t.dark) {
      root.style.setProperty('--paper', tones[t.paperTone] || tones.cream);
    }

    // Density
    const dens = { compact: 16, regular: 18, comfy: 20 };
    document.body.style.fontSize = (dens[t.density] || 18) + 'px';

    // Reading width
    root.style.setProperty('--reading-width', t.readingWidth + 'px');
  }, [t]);

  // Route
  let page;
  if (s.page.name === 'reader') page = <Reader articleId={s.page.params.id}/>;
  else if (s.page.name === 'author') page = <AuthorPage authorId={s.page.params.id}/>;
  else page = <Home/>;

  return (
    <TweaksCtx.Provider value={t}>
      <Nav/>
      {page}
      <Footer/>
      <TweaksPanel title="Tweaks">
        <TweakSection label="Typography"/>
        <TweakRadio
          label="Font pair"
          value={t.fontPair}
          options={[
            { value: 'lora-plex',    label: 'Lora · Plex' },
            { value: 'source-inter', label: 'Source · Inter' },
            { value: 'plex-plex',    label: 'Plex (sans)' },
          ]}
          onChange={(v) => setTweak('fontPair', v)}
        />
        <TweakSlider
          label="Reading width"
          value={t.readingWidth}
          min={560} max={820} step={20} unit="px"
          onChange={(v) => setTweak('readingWidth', v)}
        />
        <TweakRadio
          label="Density"
          value={t.density}
          options={['compact', 'regular', 'comfy']}
          onChange={(v) => setTweak('density', v)}
        />

        <TweakSection label="Theme"/>
        <TweakColor
          label="Accent"
          value={t.accent}
          options={['#b94a2b', '#1a6b3a', '#2a4a8a', '#1a1a1a']}
          onChange={(v) => setTweak('accent', v)}
        />
        <TweakRadio
          label="Paper"
          value={t.paperTone}
          options={[
            { value: 'cream', label: 'Cream' },
            { value: 'white', label: 'White' },
            { value: 'sepia', label: 'Sepia' },
          ]}
          onChange={(v) => setTweak('paperTone', v)}
        />
        <TweakToggle label="Dark mode" value={t.dark} onChange={(v) => setTweak('dark', v)}/>

        <TweakSection label="Cards"/>
        <TweakToggle label="Show bylines on cards" value={t.showBylines}
                     onChange={(v) => setTweak('showBylines', v)}/>

        <TweakSection label="Membership"/>
        <TweakRadio
          label="Account"
          value={s.membership}
          options={[
            { value: 'free',   label: 'Free reader' },
            { value: 'member', label: 'Member' },
          ]}
          onChange={(v) => STORE.set((st) => ({ ...st, membership: v }))}
        />

        <TweakSection label="Jump to"/>
        <TweakButton label="Home feed"      onClick={() => navigate('home')}/>
        <TweakButton label="Article reader" onClick={() => navigate('reader', { id: 'i765-eight-mistakes' })}/>
        <TweakButton label="Author profile" onClick={() => navigate('author', { id: 'maya-iyer' })}/>
      </TweaksPanel>
    </TweaksCtx.Provider>
  );
}

// ─── tiny color helpers ────────────────────────────────────────────────────

function hexToHsl(hex) {
  const m = hex.replace('#', '');
  const n = m.length === 3 ? m.split('').map((c) => c + c).join('') : m;
  const r = parseInt(n.slice(0, 2), 16) / 255;
  const g = parseInt(n.slice(2, 4), 16) / 255;
  const b = parseInt(n.slice(4, 6), 16) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  let h = 0, s = 0, l = (mx + mn) / 2;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    switch (mx) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h *= 60;
  }
  return { h, s: s * 100, l: l * 100 };
}
function hslStr({ h, s, l }) { return `hsl(${h.toFixed(0)} ${s.toFixed(0)}% ${l.toFixed(0)}%)`; }
function darken(hex, n) { const c = hexToHsl(hex); return hslStr({ ...c, l: Math.max(0, c.l - n) }); }
function lighten(hex, n) { const c = hexToHsl(hex); return hslStr({ ...c, l: Math.min(100, c.l + n) }); }

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
