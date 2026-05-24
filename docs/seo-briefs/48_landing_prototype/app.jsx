/* eslint-disable react/prop-types */
// @ts-nocheck
const { useState: appUseState } = React;

// ── Tweakable defaults ─ persisted by the host between reloads ──────────
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "videoEnabled": true,
  "accent": "indigo",
  "showStats": true,
  "showProviders": true
}/*EDITMODE-END*/;

const VIDEO_SOURCES = [
  'assets/student-working.mp4',
  'assets/students-walking.mp4',
];

const ACCENT_OPTIONS = [
  { id: 'indigo',  label: 'Indigo',    color: '#3C3B6E' },
  { id: 'brick',   label: 'Brick',     color: '#B22234' },
  { id: 'gold',    label: 'Gold',      color: '#C4A45A' },
  { id: 'moss',    label: 'Moss',      color: '#5F6B3A' },
];

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [pickerOpen, setPickerOpen] = appUseState(false);

  // Apply accent swap by overriding tokens & a CSS variable on root.
  // Cheap because every accent usage in our components reads from
  // window.YS_TOKENS.indigo. We swap that key on tweak change.
  React.useEffect(() => {
    const choice = ACCENT_OPTIONS.find(a => a.id === t.accent) || ACCENT_OPTIONS[0];
    window.YS_TOKENS.indigo = choice.color;
    // Darken-on-press by mixing with black ~30%
    window.YS_TOKENS.indigoDeep = mix(choice.color, '#000', 0.35);
    window.YS_TOKENS.indigoSoft = hexToRgba(choice.color, 0.08);
    // Force a re-render of the page tree by setting a state on root
    // (we already trigger one via setTweak so this is sufficient)
  }, [t.accent]);

  return (
    <React.Fragment>
      <Nav onSignIn={() => setPickerOpen(true)} />
      <Hero
        videoEnabled={t.videoEnabled}
        videoSources={VIDEO_SOURCES}
        onSignIn={() => setPickerOpen(true)}
      />
      {t.showStats && <StatsBand />}
      <PopularCategories />
      <FeaturedServices />
      <TwoPractices />
      <HowItWorks />
      <LaneBand onSignIn={() => setPickerOpen(true)} />
      {t.showProviders && <FeaturedProviders />}
      <Testimonials />
      <TrustStrip />
      <PaymentMethods />
      <FAQ />
      <FinalCTA />
      <Footer />

      <LanePickerModal open={pickerOpen} onClose={() => setPickerOpen(false)} />

      <TweaksPanel title="Landing tweaks">
        <TweakSection label="Hero video">
          <TweakToggle
            label="Show background video"
            value={t.videoEnabled}
            onChange={(v) => setTweak('videoEnabled', v)}
          />
        </TweakSection>

        <TweakSection label="Accent colour">
          <TweakColor
            label="Primary accent"
            value={ACCENT_OPTIONS.find(a => a.id === t.accent)?.color || '#3C3B6E'}
            options={ACCENT_OPTIONS.map(a => a.color)}
            onChange={(hex) => {
              const choice = ACCENT_OPTIONS.find(a => a.color.toLowerCase() === hex.toLowerCase());
              if (choice) setTweak('accent', choice.id);
            }}
          />
        </TweakSection>

        <TweakSection label="Sections">
          <TweakToggle
            label="Stats band"
            value={t.showStats}
            onChange={(v) => setTweak('showStats', v)}
          />
          <TweakToggle
            label="Featured providers"
            value={t.showProviders}
            onChange={(v) => setTweak('showProviders', v)}
          />
        </TweakSection>

        <TweakSection label="Member sign-in">
          <TweakButton label="Open member sign-in" onClick={() => setPickerOpen(true)} />
        </TweakSection>
      </TweaksPanel>
    </React.Fragment>
  );
}

// Small colour helpers — kept inline so they go away with the prototype.
function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
function mix(hexA, hexB, weight) {
  const a = hexA.replace('#', '');
  const b = hexB.replace('#', '');
  const ar = parseInt(a.substring(0, 2), 16);
  const ag = parseInt(a.substring(2, 4), 16);
  const ab = parseInt(a.substring(4, 6), 16);
  const br = parseInt(b.substring(0, 2), 16);
  const bg = parseInt(b.substring(2, 4), 16);
  const bb = parseInt(b.substring(4, 6), 16);
  const r = Math.round(ar * (1 - weight) + br * weight);
  const g = Math.round(ag * (1 - weight) + bg * weight);
  const bl = Math.round(ab * (1 - weight) + bb * weight);
  return '#' + [r, g, bl].map(v => v.toString(16).padStart(2, '0')).join('');
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
