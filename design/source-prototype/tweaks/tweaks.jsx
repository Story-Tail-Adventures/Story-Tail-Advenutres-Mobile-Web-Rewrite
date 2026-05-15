/* global React, TweaksPanel, TweakSection, TweakRadio, TweakSelect, useTweaks */
// Story-Tail · Tweaks panel — three expressive controls that reshape the feel.

function StoryTailTweaks() {
  const DEFAULTS = /*EDITMODE-BEGIN*/{
    "palette": "story",
    "paper": "paper",
    "script": "caveat"
  }/*EDITMODE-END*/;

  const [t, setTweak] = useTweaks(DEFAULTS);

  // Apply data-attrs to body so the CSS overlays kick in.
  React.useEffect(() => {
    document.body.dataset.palette = t.palette;
    document.body.dataset.paper = t.paper;
    document.body.dataset.script = t.script;
  }, [t.palette, t.paper, t.script]);

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

  const paletteOpts = [
    { value: 'story', label: 'Story · burgundy + orange' },
    { value: 'tide',  label: 'Tide · ocean + coral' },
    { value: 'atlas', label: 'Atlas · slate + amber' },
    { value: 'sun',   label: 'Sun · terracotta + gold' },
  ];
  const paperOpts = [
    { value: 'paper', label: 'Paper · cream' },
    { value: 'linen', label: 'Linen · putty' },
    { value: 'steam', label: 'Steam · cool white' },
  ];
  const scriptOpts = [
    { value: 'caveat',  label: 'Caveat · handwritten' },
    { value: 'serif',   label: 'Serif · editorial' },
    { value: 'display', label: 'Display · luxurious' },
    { value: 'sans',    label: 'Sans · modern' },
  ];

  return (
    <TweaksPanel title="Story-Tail · Tweaks">
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
