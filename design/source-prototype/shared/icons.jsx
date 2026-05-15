/* global React */
// Shared icon set (24px stroke-1.6, M3-aligned).
// Use as: <Icon name="search" size={20} />
const ICON_PATHS = {
  search: 'M11 4a7 7 0 1 1-4.95 11.95L3 19l3.05-3.05A7 7 0 0 1 11 4Zm0 2a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z',
  bell: 'M12 3a6 6 0 0 0-6 6v3.5L4 16h16l-2-3.5V9a6 6 0 0 0-6-6Zm0 18a2.5 2.5 0 0 1-2.45-2h4.9A2.5 2.5 0 0 1 12 21Z',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-4.4 0-8 2.7-8 6v2h16v-2c0-3.3-3.6-6-8-6Z',
  message: 'M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2Z',
  calendar: 'M7 2v3M17 2v3M3 8h18M5 5h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z',
  plane: 'M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2.5 1.5V22L12 21l3.5 1.5V20.5L13 19v-5.5L21 16Z',
  ship: 'M3 18s2 2 5 2 5-2 5-2 2 2 5 2 3-2 3-2l-2-6H5l-2 6Zm9-13v3m-5 4V8a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v4',
  palm: 'M12 3c4 0 7 2 7 2s-4 0-6 2c3-1 5 1 5 1s-3-1-5 1c1-1 3-1 4-3-2 1-4 3-5 5l1 11h-2l1-11c-1-2-3-4-5-5 1 2 3 2 4 3-2-2-5-1-5-1s2-2 5-1c-2-2-6-2-6-2s3-2 7-2Z',
  map: 'M9 4v15M15 5v15M3 6l6-2 6 2 6-2v15l-6 2-6-2-6 2V6Z',
  card: 'M3 6h18v12H3zM3 10h18M7 15h3',
  lock: 'M6 11V8a6 6 0 0 1 12 0v3m-9 4h2m-5-4h12v9H5v-9Z',
  shield: 'M12 3 4 6v6c0 5 4 8 8 9 4-1 8-4 8-9V6l-8-3Z',
  heart: 'M12 21s-7-4.5-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.5-9 9-9 9Z',
  star: 'm12 3 2.6 5.5 6 .9-4.3 4.3 1 6L12 17l-5.4 2.7 1-6L3.3 9.4l6-.9L12 3Z',
  plus: 'M12 5v14m-7-7h14',
  check: 'm5 12 5 5L20 6',
  arrow_right: 'M5 12h14m-5-6 6 6-6 6',
  arrow_left: 'M19 12H5m6-6-6 6 6 6',
  chevron_right: 'm9 6 6 6-6 6',
  chevron_left: 'm15 6-6 6 6 6',
  chevron_down: 'm6 9 6 6 6-6',
  chevron_up: 'm6 15 6-6 6 6',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  more_vert: 'M12 5h.01M12 12h.01M12 19h.01',
  close: 'M6 6l12 12M6 18 18 6',
  filter: 'M4 5h16M7 12h10m-7 7h4',
  download: 'M12 3v12m-5-5 5 5 5-5M5 21h14',
  upload: 'M12 21V9m-5 5 5-5 5 5M5 3h14',
  share: 'M16 6l-4-4-4 4m4-4v14M5 12v8h14v-8',
  pin: 'M12 22s-7-7-7-12a7 7 0 1 1 14 0c0 5-7 12-7 12Zm0-9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  clock: 'M12 7v5l3 2m-3 7a9 9 0 1 1 0-18 9 9 0 0 1 0 18Z',
  sun: 'M12 4v2m0 12v2M4 12H2m20 0h-2M5.6 5.6 4 4m16 16-1.6-1.6M5.6 18.4 4 20m16-16-1.6 1.6M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z',
  moon: 'M21 13A8 8 0 0 1 11 3a8 8 0 1 0 10 10Z',
  trash: 'M4 7h16M9 7V4h6v3m-7 0v13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V7',
  edit: 'm4 20 4-1 11-11-3-3L5 16l-1 4Zm12-15 3 3',
  copy: 'M8 4h10a2 2 0 0 1 2 2v12M4 8h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2Z',
  link: 'M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1m-1 8a5 5 0 0 1-7 0l-3-3a5 5 0 0 1 7-7l1 1',
  refresh: 'M21 12a9 9 0 1 1-3-6.7M21 4v5h-5',
  inbox: 'M3 12h6l2 3h2l2-3h6M3 12V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6M3 12v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6',
  briefcase: 'M3 7h18v13H3zM8 7V4h8v3M3 12h18',
  dollar: 'M12 3v18m5-14a4 4 0 0 0-4-4h-2a3 3 0 0 0 0 6h2a3 3 0 0 1 0 6h-2a4 4 0 0 1-4-4',
  chart: 'M3 21V3m0 18h18m-3-6V9m-5 12V6M8 21v-8',
  pulse: 'M3 12h4l3-8 4 16 3-8h4',
  globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 0c3 3 3 15 0 18M12 3c-3 3-3 15 0 18M3 12h18',
  sparkle: 'm12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Zm7 11 .9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9.9-2.1Z',
  fire: 'M12 3s-1 4-4 6c-3 2-4 5-3 8 1 3 4 4 7 4s6-1 7-4c1-3 0-6-3-8-2-1-3-4-3-4-1 2-2 4-3 4 0-2 2-6 2-6Z',
  passport: 'M5 3h14v18H5zM9 8h6M9 12h6M9 16h3M5 3v18',
  suitcase: 'M5 8h14v12H5zM9 8V5h6v3M3 13h18',
  utensils: 'M6 3v8a2 2 0 0 0 2 2h0v8m0-18v6M18 3c-2 1-3 4-3 6s1 3 3 3v9',
  ticket: 'M3 7v3a2 2 0 0 1 0 4v3h18v-3a2 2 0 0 1 0-4V7H3Zm10 0v10',
  bookmark: 'M6 3h12v18l-6-4-6 4V3Z',
  trend_up: 'M3 17l6-6 4 4 8-8m0 0h-5m5 0v5',
  warning: 'M12 4 2 20h20L12 4Zm0 6v4m0 3h.01',
  info: 'M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18Zm0 8v6m0-9h.01',
  send: 'M3 11 22 3l-8 19-3-8-8-3Z',
  attach: 'm21 12-9 9a5 5 0 0 1-7-7l9-9a3 3 0 0 1 4 4l-9 9a1 1 0 0 1-1-1l8-8',
  menu: 'M4 7h16M4 12h16M4 17h16',
  settings: 'M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8Zm8 4a8 8 0 0 0-.2-1.8l2-1.6-2-3.5-2.4.8a8 8 0 0 0-3-1.8L14 2h-4l-.4 2.5a8 8 0 0 0-3 1.7l-2.4-.8-2 3.5 2 1.6A8 8 0 0 0 4 12c0 .6.1 1.2.2 1.8l-2 1.6 2 3.5 2.4-.8a8 8 0 0 0 3 1.8L10 22h4l.4-2.5a8 8 0 0 0 3-1.7l2.4.8 2-3.5-2-1.6c.1-.6.2-1.2.2-1.8Z',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  list: 'M4 6h2m4 0h10M4 12h2m4 0h10M4 18h2m4 0h10',
  building: 'M4 22V4h10v18M14 22V10h6v12M8 8h2M8 12h2M8 16h2M17 14h.01M17 18h.01',
  users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7-1a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-7 3c-4 0-7 2-7 5v2h14v-2c0-3-3-5-7-5Zm9 0c-1 0-2 .2-3 .5 1.5 1 2.5 2.5 2.5 4.5v2h5v-2c0-3-2-5-4.5-5Z',
  database: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3Zm0 0v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6m-16 6c0 1.7 3.6 3 8 3s8-1.3 8-3',
  key: 'M21 3 13 11m-1 1a5 5 0 1 1-7 7 5 5 0 0 1 7-7Zm5-3-2 2m4-4-2 2',
  flag: 'M5 21V4m0 0h10l-2 4 2 4H5',
  question: 'M9 9a3 3 0 1 1 4.5 2.6c-1 .6-1.5 1.4-1.5 2.4m0 4h.01M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18Z',
  external: 'M14 4h6v6m0-6L10 14M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6',
  phone: 'M5 4h4l2 5-3 2a11 11 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z',
  mail: 'M3 7l9 6 9-6M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z',
  home: 'M3 11 12 3l9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V11Z',
  trip: 'M3 13l3-6h12l3 6m-18 0v6h18v-6M3 13h18M7 17h.01M17 17h.01',
  receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2V3Zm3 5h6m-6 4h6m-6 4h3',
  zap: 'M13 2 3 14h8l-1 8 10-12h-8l1-8Z',
};

function Icon({ name, size = 20, stroke = 1.7, fill = 'none', color = 'currentColor', className = '', style = {} }) {
  const d = ICON_PATHS[name];
  if (!d) return null;
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill={fill} stroke={color} strokeWidth={stroke}
      strokeLinecap="round" strokeLinejoin="round"
      className={className} style={style} aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

// Story-Tail mark — renders both glyph variants and lets CSS show whichever
// matches the surrounding .scheme-dark / light context.
function StoryTailMark({ size = 32 }) {
  return (
    <span style={{ display: 'inline-flex', width: size, height: size, position: 'relative' }} aria-hidden="true">
      {/* LIGHT — book held in fox tail (burgundy + orange) */}
      <svg className="sta-mark-light" width={size} height={size} viewBox="0 0 64 64" fill="none" style={{ position: 'absolute', inset: 0 }}>
        <path d="M10 44c4 12 18 14 28 10 6-3 9-9 8-15-2 4-7 6-12 5-6-2-8-7-7-12-4 4-12 4-17 12Z" fill="#E87722"/>
        <path d="M22 6h22c2 0 4 2 4 4v40c0 2-2 4-4 4H26c-4 0-6-2-6-6V8c0-1 1-2 2-2Z" fill="#7A1A1F" stroke="#5C0F13" strokeWidth="1.4"/>
        <path d="M24 8v40" stroke="#A53A3F" strokeWidth="1.2" strokeLinecap="round"/>
        <circle cx="34" cy="28" r="8" stroke="#F1E7D5" strokeWidth="1.6" fill="none"/>
        <path d="M26 28c2-2 14-2 16 0M34 20c2 4 2 12 0 16M34 20c-2 4-2 12 0 16" stroke="#F1E7D5" strokeWidth="1.2" fill="none"/>
        <path d="M40 19l3-3M40 19l-1 3M40 19l3 0" stroke="#F1E7D5" strokeWidth="1.6" strokeLinecap="round"/>
      </svg>

      {/* DARK — tropical island: twin palm + sun + wave + plane silhouette */}
      <svg className="sta-mark-dark" width={size} height={size} viewBox="0 0 64 64" fill="none" style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <linearGradient id="staSun" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FFD86B"/>
            <stop offset="100%" stopColor="#F58F33"/>
          </linearGradient>
          <linearGradient id="staWave" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#0A4DA3"/>
            <stop offset="100%" stopColor="#1E92E5"/>
          </linearGradient>
          <linearGradient id="staLeaf" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6CD279"/>
            <stop offset="100%" stopColor="#1FAF45"/>
          </linearGradient>
        </defs>

        {/* sun disc behind everything */}
        <path d="M22 44a14 14 0 0 1 28 0H22Z" fill="url(#staSun)"/>
        {/* plane silhouette across the sun */}
        <path d="M48 34l3-1.5-2.2-1.6-3 1-3-1.5-1 .5 2 1.6-2.5 1.2-1.6-.7-.7.3 1 1.2-1.2 1.4.6.4 1.7-1 2.6 1 3-1 2 1.4 1.2-.5-2.4-1.8 3-1Z" fill="#0D2137"/>
        {/* gulls */}
        <path d="M25 42c1-0.8 1.5-0.8 2.4 0M30 41.5c0.8-0.7 1.3-0.7 2 0" stroke="#0D2137" strokeWidth="0.8" strokeLinecap="round" fill="none"/>
        {/* twin palms */}
        <path d="M16 50C16 38 18 28 19 22M21 50c0-10 1-20 2-26" stroke="#8A4A1F" strokeWidth="1.8" strokeLinecap="round" fill="none"/>
        <path d="M19 22c-3-3-8-3-11-1 3-1 6 0 8 2-4-1-8 1-10 4 4-2 8-2 10 1-3 0-6 2-7 5 3-2 6-2 9 0M23 18c4-3 10-3 14-1-4-1-8 0-10 2 4-1 9 1 11 4-4-2-9-2-11 1 3 0 7 2 8 5-4-2-8-2-12 0" fill="url(#staLeaf)" stroke="url(#staLeaf)" strokeWidth="0.6"/>
        {/* wave */}
        <path d="M8 46c4-2 8-2 12 0s10 2 14 0 8-2 14 0 8 2 12 0v6c-4 2-8 2-12 0s-8-2-14 0-10 2-14 0-8-2-12 0v-6Z" fill="url(#staWave)"/>
      </svg>
    </span>
  );
}

Object.assign(window, { Icon, ICON_PATHS, StoryTailMark });
