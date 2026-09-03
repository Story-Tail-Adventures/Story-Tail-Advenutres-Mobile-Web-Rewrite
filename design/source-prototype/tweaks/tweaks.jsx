/* global React, TweaksPanel, TweakSection, TweakRadio, TweakSelect, useTweaks */
// Story-Tail · Tweaks panel — three expressive controls that reshape the feel.

function StoryTailTweaks() {
  const DEFAULTS = /*EDITMODE-BEGIN*/{
    "theme": "light",
    "view": "web",
    "palette": "story",
    "paper": "paper",
    "script": "caveat"
  }/*EDITMODE-END*/;

  // Theme + viewport are also owned by the header toggles on each section page,
  // which persist to these keys. Hydrate from them so our mount-time broadcast
  // echoes the stored choice instead of clobbering it back to the default.
  const readStored = (k, fallback) => {
    try { return localStorage.getItem(k) || fallback; } catch (e) { return fallback; }
  };
  const HYDRATED = Object.assign({}, DEFAULTS, {
    theme: readStored('st-theme', DEFAULTS.theme),
    view: readStored('st-view', DEFAULTS.view),
  });

  const [t, setTweak] = useTweaks(HYDRATED);

  // Apply data-attrs to body so the CSS overlays kick in.
  React.useEffect(() => {
    document.body.dataset.palette = t.palette;
    document.body.dataset.paper = t.paper;
    document.body.dataset.script = t.script;
  }, [t.palette, t.paper, t.script]);

  // Broadcast theme to any subscribers on the page (per-section canvases).
  React.useEffect(() => {
    window.__stTheme = t.theme;
    window.dispatchEvent(new CustomEvent('st-theme-change', { detail: t.theme }));
  }, [t.theme]);

  // Broadcast viewport (web/mobile) — sections opt in by providing mobile variants.
  React.useEffect(() => {
    window.__stView = t.view;
    window.dispatchEvent(new CustomEvent('st-view-change', { detail: t.view }));
  }, [t.view]);

  // Load extra fonts on demand
  React.useEffect(() => {
    if (!document.getElementById('tweak-fonts')) {
      const link = document.createElement('link');
      link.id = 'tweak-fonts';
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@1,700&family=DM+Serif+Display&display=swap';
      document.head.appendChild(link);
    }
  }, []);

  const themeOpts = [
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
  ];
  const viewOpts = [
    { value: 'web', label: 'Web' },
    { value: 'mobile', label: 'Mobile' },
  ];
  const paletteOpts = [
    { value: 'story', label: 'Story · burgundy + orange' },
    { value: 'tide', label: 'Tide · ocean + coral' },
    { value: 'atlas', label: 'Atlas · slate + amber' },
    { value: 'sun', label: 'Sun · terracotta + gold' },
  ];
  const paperOpts = [
    { value: 'paper', label: 'Paper · cream' },
    { value: 'linen', label: 'Linen · putty' },
    { value: 'steam', label: 'Steam · cool white' },
  ];
  const scriptOpts = [
    { value: 'caveat', label: 'Caveat · handwritten' },
    { value: 'serif', label: 'Serif · editorial' },
    { value: 'display', label: 'Display · luxurious' },
    { value: 'sans', label: 'Sans · modern' },
  ];

  return (
    <TweaksPanel title="Story-Tail · Tweaks">
      <TweakSection label="THEME — light or dark mode"/>
      <TweakRadio label="" value={t.theme} options={themeOpts} onChange={(v) => setTweak('theme', v)}/>

      <TweakSection label="VIEWPORT — web or mobile"/>
      <TweakRadio label="" value={t.view} options={viewOpts} onChange={(v) => setTweak('view', v)}/>

      <TweakSection label="BRAND PALETTE — color personality"/>
      <TweakSelect label="" value={t.palette} options={paletteOpts} onChange={(v) => setTweak('palette', v)}/>

      <TweakSection label="SURFACE TEMPERATURE — ambient mood"/>
      <TweakRadio label="" value={t.paper} options={paperOpts} onChange={(v) => setTweak('paper', v)}/>

      <TweakSection label="WORDMARK VOICE — the Story-Tail script"/>
      <TweakSelect label="" value={t.script} options={scriptOpts} onChange={(v) => setTweak('script', v)}/>
    </TweaksPanel>
  );
}

window.StoryTailTweaks = StoryTailTweaks;
