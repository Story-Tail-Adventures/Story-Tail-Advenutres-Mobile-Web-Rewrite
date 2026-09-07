# Design System
## Story-Tail Adventures — Web & Mobile CRM Platform

**Document Owner:** Gyasi Story
**Audience:** Internal — design, engineering, anyone implementing the UI
**Version:** 1.0 — Draft
**Date:** May 14, 2026
**Companion Documents:** BRD.md, Screen-Inventory.md, Data-Model.md
**Reference Prototype:** `design/source-prototype/Story-Tail Designs.html` (in this folder)

---

## 1. About This Document

A full HTML/CSS/JS design prototype was built in Claude Design for Story-Tail Adventures and exported to this project. The prototype contains **336 artboards** mapping 1:1 to the 168 screens in the Screen Inventory v1.0 (each screen rendered in both light and dark themes). The source files live under `design/source-prototype/` for reference; this document codifies what the prototype establishes — the design tokens, components, and patterns — in a form that travels into the eventual Kotlin Multiplatform codebase.

The design system follows **Material 3** (Material You) tokens and elevation conventions, but with Story-Tail brand colors and typography on top. Critically, the system ships **two color schemes**:

- **Light mode** — anchored on the book/fox logo: burgundy and orange primary, sand and cream surfaces.
- **Dark mode** — anchored on the tropical palm/sun logo: ocean blue and sunset gold primary, deep navy surfaces.

A dark mode is not a tint of the light mode — it is a fundamentally different palette that lets the brand express two distinct personalities while staying coherent.

The system also ships a small **Tweaks** layer that lets the brand try three named alternative palettes (Story / Tide / Atlas / Sun), three surface temperatures (Paper / Linen / Steam), and four wordmark voices (Caveat / Serif / Display / Sans). These are not runtime user-facing controls in production — they're for design exploration and stakeholder reviews.

---

## 2. Brand Voice & Worldview

The Story-Tail Adventures brand sits on top of a specific worldview, and the design system should carry it. This isn't a decorative layer — it's the *why* behind the business.

### 2.1 The Foundation

Two convictions inform everything Story-Tail Adventures says and shows:

**Rest is sacred — a gift, and a command.** From the very first chapter of Scripture, rest is woven into how the world was made. *"And on the seventh day God finished his work that he had done, and he rested on the seventh day from all his work that he had done. So God blessed the seventh day and made it holy"* (Genesis 2:2–3). Rest is later codified as the Fourth Commandment: *"Remember the Sabbath day, to keep it holy"* (Exodus 20:8). And Jesus himself extended it to his weary disciples: *"Come away by yourselves to a desolate place and rest a while"* (Mark 6:31). Vacation is not indulgence — it is participation in something God ordained.

**Creation is a gift to be enjoyed.** *"God, who richly provides us with everything to enjoy"* (1 Timothy 6:17). *"For you shall go out in joy and be led forth in peace; the mountains and the hills before you shall break forth into singing, and all the trees of the field shall clap their hands"* (Isaiah 55:12). *"He makes me lie down in green pastures. He leads me beside still waters. He restores my soul"* (Psalm 23:2–3). Travel — to a Caribbean beach, to a mountain town, to a place of beauty — is a way of stepping into creation and receiving it with gratitude.

These two truths sit underneath everything Story-Tail Adventures helps people do.

### 2.2 What This Means for the Voice

The Story-Tail Adventures voice is **warm, adventure-forward, and personal** (already established) — *and* informed by these convictions. In practical terms, that means:

- **The language of rest is intentional, not casual.** "Rest" isn't just downtime — it's restoration. Pre-trip emails can say "soon you'll be resting in green pastures" without forcing the reference; the resonance is there for those who hear it.
- **Travel is framed as participation in creation, not consumption.** A Caribbean beach is more than a beach; it's part of a world that was made to be beautiful. Copy leans into wonder and gratitude rather than commodity-style "destinations you can afford."
- **Peace and refreshment are recurring themes.** The platform helps clients move from labor toward rest. That arc — striving to peace — shows up in welcome screens, pre-trip messages, and post-trip reflections.
- **The brand is authentic about its source, not preachy.** Scripture is in the bloodstream of the brand; it is not bolted on as decoration. The About page acknowledges it directly. Most surfaces speak in the brand's natural voice and let the worldview emerge through what is *valued* (rest, wonder, beauty, presence) rather than through quoted verses on every screen.
- **The brand welcomes clients of every background.** Story-Tail's worldview shapes the founder's *why* — it does not gate who is served. A client of any faith (or none) finds the same warmth, the same care, the same craft. The voice never makes a non-Christian client feel like an outsider in their own trip.

### 2.3 Anchor Scripture (for designer / writer reference)

Designers and copywriters working on Story-Tail surfaces may find these passages useful as creative grounding. They are not required to appear on screens — they are the source material the voice draws from.

| Theme | Reference | Why it matters |
|---|---|---|
| Rest as divine pattern | **Genesis 2:2–3** | God rested after creating; rest is woven into the design of the world. |
| Rest as command | **Exodus 20:8–11** | The Fourth Commandment makes rest holy, not optional. |
| Rest extended to all | **Exodus 23:12** | Rest is for everyone — workers, animals, even the stranger. |
| Restoration through rest | **Psalm 23:1–3** | Green pastures, still waters, soul restored — the metaphor of holiday. |
| Christ's invitation | **Matthew 11:28–30** | *"Come to me, all who labor and are heavy laden, and I will give you rest."* |
| Travel as rest | **Mark 6:31** | Jesus tells his disciples: *"Come away by yourselves to a desolate place and rest a while."* The most directly travel-adjacent verse in Scripture. |
| Rest remains for God's people | **Hebrews 4:9–11** | The promise of rest is ongoing, eternal. |
| Creation declared good | **Genesis 1:1–31** | God made it, saw it was good, made it for us. |
| God provides for enjoyment | **1 Timothy 6:17** | *"God, who richly provides us with everything to enjoy."* |
| Creation as celebration | **Isaiah 55:12** | Mountains and hills break forth into singing — joy is built into the landscape. |
| Wonder as response | **Psalm 19:1** | *"The heavens declare the glory of God."* Creation tells a story; vacation is a chance to hear it. |

[Reference: OpenBible.info — *Enjoying Creation*](https://www.openbible.info/topics/enjoying_creation) · [OpenBible.info — *Resting in Christ*](https://www.openbible.info/topics/resting_in_christ)

### 2.4 Where the Worldview Shows Up in the Product

The design system identifies specific surfaces where the voice should be most explicit. Other surfaces can be more transactional — the brand doesn't need to evangelize on every screen.

| Surface | How the worldview shows up |
|---|---|
| **2.0.1 App Subdomain Public Landing** | Hero line can reference rest and creation directly without quoting scripture: *"Your story is about more than where you go. It's about rest, wonder, and the time God meant you to have."* or shorter: *"Rest is sacred. Wonder is everywhere. Let's plan."* |
| **2.0.2 About / How It Works** | This is where Story-Tail explains *why* it exists. The page should be transparent about the founder's worldview: *"We believe travel is more than a transaction — it's rest, which God called holy, and it's creation, which God gave us to enjoy."* Include one or two anchor verses (Mark 6:31 and 1 Tim 6:17 work well) and a clear "Welcome to anyone, whatever you believe" line. |
| **2.1.9 Welcome / First Login** | Personal welcome from Gyasi. Can include a soft line like *"Travel is one of the ways we step into something restoring. I'm glad to plan that with you."* |
| **2.2.1 Client Dashboard / Home — Upcoming Trip Hero** | The hero card can include a "Resting in [destination] in [N] days" countdown framing for trips that are clearly leisure (not always — sometimes the trip is a wedding, reunion, work-adjacent — but the default leisure framing works). |
| **2.2.4 Itinerary Viewer** | The intro note Gyasi writes per trip is the place to let the voice come through. Post-arrival messages can include a small reflection: *"You made it. Rest deeply this week."* |
| **2.2.11 Past Trip / Memory View** | The reflection/testimonial prompt can lean into gratitude framing: *"What did you carry home from this trip?"* — open-ended, invites the kind of reflection that fits the worldview. |
| **2.3.1 Search Landing / Inspiration Hub** | Inspiration tiles can be themed in ways that reflect the voice: *"True Rest"*, *"Wonder of Creation"*, *"Sabbath in the Sand"*, *"Mountain Quiet"* — alongside more transactional tiles like *"All-Inclusive"* and *"Cruises"*. |
| **Pre-trip email (7–14 days out)** | *"In a week, you'll be there. He makes me lie down in green pastures — and so will you, soon."* (Psalm 23 reference, embedded gently.) The email is warm regardless of the client's reading; the resonance is for those who hear it. |
| **Post-trip email** | *"Welcome home. I hope you came back rested, with new wonder."* Plant the seed for the next trip without forcing a sale. |
| **Email signature** | Standard signature stays as defined. Optional: a small italicized line at the bottom like *"Rest is sacred. Wonder is everywhere."* — to be used at Gyasi's discretion. |
| **Agent Profile Setup (3.1.7)** | The agent's bio field is the natural place to surface this for any new advisor joining Story-Tail later. The default text for Gyasi's profile reflects the voice. |

### 2.5 What This Doesn't Mean

A few things the worldview is *not*:

- It is not a screening device. Clients are not asked about their faith and the platform does not assume anything about them.
- It is not displayed on every screen. The Itinerary Viewer for a Royal Caribbean cruise doesn't need a verse — it needs flight times, cabin numbers, and Gyasi's tips. Save the voice for the surfaces where it lands.
- It is not used to sell more. The brand doesn't promise that booking a trip will deepen your faith. It promises rest and wonder, well-planned, by someone who takes both seriously.
- It is not anti-fun, anti-celebration, or anti-luxury. Sandals trips, party cruises, foodie weekends, romantic getaways — all of these fit. Rest takes many shapes; so does wonder.

### 2.6 Tone Calibration — Quick Reference

When writing for any Story-Tail surface, ask:

1. **Does it sound like a friend who's done this 100 times?** (Warmth, expertise, no jargon.) ✓
2. **Does it treat the trip as a gift, not a commodity?** (Wonder language, not just transactional.) ✓
3. **Does it leave room for rest?** (Pace, whitespace in copy, gentle CTAs — not pushy.) ✓
4. **Would a non-Christian client feel welcome reading it?** (Inclusive, not preachy, even where the worldview is visible.) ✓
5. **Would Gyasi say this out loud?** (Authentic voice, no AI-generated corporate-speak.) ✓

If a piece of copy fails any of these, revise it before it ships.

---

## 3. Brand Source Colors

These are the canonical brand colors from the existing Story-Tail Adventures brand palette. They appear directly in tokens.css and feed every theme variant.

| Token | Hex | Use |
|---|---|---|
| `brand.burgundy` | `#7A1A1F` | Light-mode primary; book/fox logo |
| `brand.burgundyDark` | `#5C0F13` | Light-mode primary hover/active |
| `brand.orange` | `#E87722` | Light-mode secondary; CTAs |
| `brand.orangeLight` | `#F59E4E` | Light-mode secondary hover |
| `brand.sunset` | `#F5A623` | Sunset Gold — dark-mode secondary; tropical logo |
| `brand.gold` | `#FFC83F` | Gold on photography — hero overlines, script accents, scripture lines over imagery (scheme-independent); equals the dark scheme's `md.secondary` |
| `brand.ocean` | `#1565C0` | Ocean Blue — dark-mode primary; tropical logo |
| `brand.navy` | `#0D2137` | Deep Navy — dark-mode background |
| `brand.cream` | `#FBF6EE` | Light-mode background |
| `brand.sand` | `#F1E7D5` | Warm neutral, secondary surfaces |

The two logo variants (`logo-fox.png` and `logo-tropical-dark.png` in `design/source-prototype/brand/`) cleanly partition: book/fox on light backgrounds, palm/sun on dark backgrounds. Never use the book/fox logo on dark or the tropical logo on light — they were designed to oppose each other.

---

## 4. Color Token System (Material 3)

The system uses the Material 3 token names because they encode role rather than raw color (primary, secondary, tertiary, surface, on-surface, etc.). This makes dark-mode swapping trivial and lets the Tweaks system swap palettes without touching components.

### 4.1 Light Scheme (Default)

| Token | Hex | Notes |
|---|---|---|
| `md.primary` | `#7A1A1F` | Burgundy |
| `md.onPrimary` | `#FFFFFF` | |
| `md.primaryContainer` | `#FFDAD5` | Soft burgundy tint |
| `md.onPrimaryContainer` | `#410005` | |
| `md.secondary` | `#C75A14` | Burnt orange |
| `md.onSecondary` | `#FFFFFF` | |
| `md.secondaryContainer` | `#FFDCC1` | |
| `md.onSecondaryContainer` | `#321200` | |
| `md.tertiary` | `#1565C0` | Ocean — used as accent in light mode |
| `md.onTertiary` | `#FFFFFF` | |
| `md.tertiaryContainer` | `#D5E3FF` | |
| `md.onTertiaryContainer` | `#001A41` | |
| `md.error` | `#BA1A1A` | |
| `md.onError` | `#FFFFFF` | |
| `md.errorContainer` | `#FFDAD6` | |
| `md.onErrorContainer` | `#410002` | |
| `md.success` | `#1B6E3F` | |
| `md.successContainer` | `#B6F2C8` | |
| `md.warning` | `#B7691C` | |
| `md.warningContainer` | `#FFDDB4` | |
| `md.bg` | `#FBF6EE` | App background — cream |
| `md.onBg` | `#1C1B1A` | |
| `md.surface` | `#FBF8F3` | |
| `md.onSurface` | `#1C1B1A` | |
| `md.surfaceDim` | `#E1DCD3` | |
| `md.surfaceBright` | `#FFFEFA` | |
| `md.surface1` | `#FFFFFF` | containerLowest |
| `md.surface2` | `#F6F1EA` | containerLow |
| `md.surface3` | `#F0EAE2` | container |
| `md.surface4` | `#EAE4DB` | containerHigh |
| `md.surface5` | `#E4DDD4` | containerHighest |
| `md.onSurfaceVariant` | `#524540` | |
| `md.outline` | `#847370` | |
| `md.outlineVariant` | `#D7C2BD` | |
| `md.scrim` | `rgba(0,0,0,0.4)` | |

### 4.2 Dark Scheme (Tropical Logo)

Dark mode is its own palette anchored on the tropical logo — ocean blue and sunset gold on deep navy. It is not a desaturated light mode.

| Token | Hex | Notes |
|---|---|---|
| `md.primary` | `#5BB6FF` | Sky blue |
| `md.onPrimary` | `#00264D` | |
| `md.primaryContainer` | `#003E78` | Deep ocean |
| `md.onPrimaryContainer` | `#C5E0FF` | |
| `md.secondary` | `#FFC83F` | Sunset gold |
| `md.onSecondary` | `#4A2C00` | |
| `md.secondaryContainer` | `#6F4400` | |
| `md.onSecondaryContainer` | `#FFE3B5` | |
| `md.tertiary` | `#6CD279` | Palm green |
| `md.onTertiary` | `#003915` | |
| `md.tertiaryContainer` | `#105228` | |
| `md.onTertiaryContainer` | `#B6F2C8` | |
| `md.error` | `#FFB4AB` | |
| `md.errorContainer` | `#93000A` | |
| `md.success` | `#8DDCA4` | |
| `md.successContainer` | `#00522A` | |
| `md.warning` | `#FFD09C` | |
| `md.warningContainer` | `#6D4400` | |
| `md.bg` | `#050D1A` | Near-black navy |
| `md.onBg` | `#E8F0FC` | |
| `md.surface` | `#07111F` | |
| `md.onSurface` | `#E8F0FC` | |
| `md.surfaceDim` | `#07111F` | |
| `md.surfaceBright` | `#2A3D55` | |
| `md.surface1` | `#0A1828` | |
| `md.surface2` | `#0F2034` | |
| `md.surface3` | `#142A41` | |
| `md.surface4` | `#1A314D` | |
| `md.surface5` | `#21395A` | |
| `md.onSurfaceVariant` | `#C3D3E6` | |
| `md.outline` | `#6A8AAE` | |
| `md.outlineVariant` | `#2A4566` | |
| `md.scrim` | `rgba(0,0,0,0.65)` | |

### 4.3 Status Chip Colors

Trip and lead statuses get their own chip color pairs (background + text) tuned for accessibility in both schemes. Use semantic names — never hardcode trip-status colors elsewhere.

| Status | Light bg | Light text | Dark bg | Dark text |
|---|---|---|---|---|
| `proposal` | `#FFE3B7` | `#6B3F00` | `#6B4400` | `#FFE3B7` |
| `booked` | `#C7E9D4` | `#0A4A26` | `#0D5A2F` | `#C7E9D4` |
| `due` | `#FCD3D0` | `#6E1313` | `#6E1313` | `#FCD3D0` |
| `traveling` | `#C9DDF8` | `#0A3669` | `#0E4A85` | `#C9DDF8` |
| `past` | `#E2DBD2` | `#4A3F38` | `#1F3450` | `#C3D3E6` |
| `lead` | `#F4D9F6` | `#4E124E` | `#4E124E` | `#F4D9F6` |
| `inquiry` | `#E1D7F4` | `#2C1761` | `#2A1559` | `#E1D7F4` |
| `cancelled` | `#D7DFE6` | `#3D352E` | `#2A3340` | `#C9D2DC` |

---

## 5. Typography

The system uses three font families. All three are loaded from Google Fonts in the prototype; in production, ship them via `kotlinx.coroutines`-friendly font loading (Compose Multiplatform `Font` resources for native, `@font-face` for web).

| Family | Weights | Use |
|---|---|---|
| **Poppins** | 300, 400, 500, 600, 700, 800 | Primary sans — all UI text |
| **Caveat** | 500, 700 | "Story-Tail" wordmark script |
| **JetBrains Mono** | 400, 500 | Code, confirmation numbers, kbd hints |

### 5.1 Type Ramp

These are Material-3-style names with Story-Tail's Poppins tuning. Sizes are in **dp/sp** (Compose) or **px** (CSS, 1:1 at default zoom).

| Token | Spec | Use |
|---|---|---|
| `t.displayL` | Poppins 800 · 57px · 1.05 · −1.5 letter-spacing | Marketing hero |
| `t.display` | Poppins 800 · 45px · 1.08 · −1px | Section headers |
| `t.displayS` | Poppins 700 · 36px · 1.1 · −0.6px | Page titles |
| `t.headline` | Poppins 700 · 28px · 1.15 · −0.4px | Major card headers |
| `t.titleL` | Poppins 600 · 22px · 1.2 · −0.2px | Card titles |
| `t.title` | Poppins 600 · 18px · 1.25 · −0.1px | List rows |
| `t.titleS` | Poppins 600 · 15px · 1.3 | Subheads |
| `t.bodyL` | Poppins 400 · 16px · 1.5 | Long-form body |
| `t.body` | Poppins 400 · 14px · 1.5 | Default body |
| `t.bodyS` | Poppins 400 · 13px · 1.45 | Compact body |
| `t.labelL` | Poppins 500 · 14px · 1.3 | Button labels |
| `t.label` | Poppins 500 · 12px · 1.3 · 0.4 letter-spacing | Small labels |
| `t.labelS` | Poppins 600 · 11px · 1.3 · 0.6 letter-spacing · uppercase | Tags, badges |
| `t.script` | Caveat 700 · 32px · 1 | "Story-Tail" wordmark |
| `t.mono` | JetBrains Mono 400 · 12px · 1.4 | Confirmation numbers |

---

## 6. Shape Scale

| Token | Value | Use |
|---|---|---|
| `r.xs` | 6px | Tight chip corners |
| `r.sm` | 10px | Inputs, tight buttons |
| `r.md` | 14px | FAB corners |
| `r.lg` | 20px | Cards |
| `r.xl` | 28px | Hero cards, modals |
| `r.full` | 999px | Pill buttons, avatars |

---

## 7. Elevation / Shadow

M3-style elevation in 4 tiers. Light and dark each have their own shadow tunings — the dark-mode shadows are heavier because the navy background can absorb them.

| Tier | Light shadow | Dark shadow |
|---|---|---|
| 1 | `0 1px 2px rgba(28,17,15,.08), 0 1px 3px rgba(28,17,15,.06)` | `0 1px 2px rgba(0,0,0,.55), 0 1px 3px rgba(0,0,0,.35)` |
| 2 | `0 2px 4px rgba(28,17,15,.10), 0 4px 10px rgba(28,17,15,.06)` | `0 2px 4px rgba(0,0,0,.6), 0 4px 12px rgba(0,0,0,.4)` |
| 3 | `0 4px 12px rgba(28,17,15,.12), 0 10px 28px rgba(28,17,15,.08)` | `0 4px 14px rgba(0,0,0,.7), 0 12px 32px rgba(0,0,0,.5)` |
| 4 | `0 8px 24px rgba(28,17,15,.16), 0 18px 48px rgba(28,17,15,.10)` | `0 8px 28px rgba(0,0,0,.75), 0 22px 54px rgba(0,0,0,.55)` |

---

## 8. Core Component Inventory

Every artboard in the prototype consumes these shared components. Implementations should match their visual contract before deviating.

### 8.1 Buttons

- **Filled** (`btn-filled`) — `md.primary` background, white text. Primary CTAs.
- **Tonal** (`btn-tonal`) — `md.secondaryContainer` background. Secondary CTAs.
- **Tertiary** (`btn-tertiary`) — `md.tertiaryContainer` background. Tertiary actions.
- **Outlined** (`btn-outlined`) — transparent, outlined border. Neutral CTAs.
- **Text** (`btn-text`) — bare label. Inline actions.
- **Elevated** (`btn-elevated`) — white background, primary label, shadow 1. Used on tonal surfaces.
- **Danger** (`btn-danger`) — `md.error` background. Destructive actions.
- **Orange** (`btn-orange`) — `brand.orange` background, white text. Brand-forward CTAs.

Sizes: `btn-sm` (32px height), default (40px), `btn-lg` (48px). Icon variant `btn-icon` is 40×40 circular.

FAB (Floating Action Button): 56px tall, 16px corner, `md.primaryContainer` background, shadow 3. Always pill-shaped (extended FAB pattern).

### 8.2 Chips

- **Default chip** — 28px tall, 8px corner, `md.surface3` background, outlined border. Used for tags.
- **Filter chip** (`chip-filter`) — same shape, `md.surface2` background. Becomes `md.secondaryContainer` when `.is-on` (selected).
- **Status chip** (`chip-status`) — 22px tall, 9px padding, uppercase 10.5px label. Color comes from the status name (`.proposal`, `.booked`, etc. — see Section 4.3).

### 8.3 Cards

- **Card** — `md.surface1` background, 20px corner, shadow 1, outline-variant border.
- **Card-flat** — no shadow, outlined border, `md.surface2` background.
- **Card-tonal** — `md.surface3` background, no border, no shadow.
- **Card-elev** — shadow 2, no border. Use for hero or focal cards.

### 8.4 Inputs

44px tall, 10px corner, outlined border. Focus state: 2px outline of `md.primary`. Use `field-label` (12px, 500 weight, 0.2 letter-spacing) above each input.

### 8.5 Avatars

- 36px default, 24px small (`avatar.sm`), 56px large (`avatar.lg`), 84px extra-large (`avatar.xl`). Always pill-shaped with initials centered.

### 8.6 Tropical Accents

- **`.tropical-gradient`** — radial blends of sunset gold + ocean blue on a deep navy base. For hero areas only — never for chrome.
- **`.tropical-soft`** — same gradient over `md.surface2`. Used for inspirational tiles on the search landing.

---

## 9. App Shell Components

These are not Material primitives but Story-Tail-specific layouts that appear across every authenticated screen.

### 9.1 Top App Bar (`StaTopBar`)

64px tall, 24px horizontal padding. Contains: brand mark (logo + script wordmark + "ADVENTURES" tagline), search pill (40px tall, pill-shaped, role-aware placeholder), and a right-side action cluster (help, messages with red dot, notifications with badge, avatar + name + role).

The brand mark switches glyph based on theme: book/fox logo in light, palm/sun logo in dark. CSS-driven; the JSX always renders both SVGs and CSS hides the wrong one.

### 9.2 Navigation Rail (`StaNavRail`)

88px wide vertical rail with stacked icon+label items. The active item gets a pill-shaped 56×32 highlight using `md.secondaryContainer`. Used on web for agent and authenticated client screens.

### 9.3 Bottom Tab Bar (Mobile)

5 tabs: Home, Trips, Search, Messages, Profile (client) or Worklist, Clients, Messages, More (agent). Native iOS/Android conventions.

### 9.4 Hero Countdown Card (Client Dashboard)

The hallmark card on `C221_Dashboard`. Large hero image + day countdown overlay + trip title + "View Itinerary" CTA. The single highest-value moment on the client side.

### 9.5 Pipeline Kanban (Agent Pipeline)

5 columns: Inquiry, Proposal Sent, Booked, In Progress, Completed. On mobile: stage picker with horizontal swipe; on tablet: 2–3 stages with horizontal scroll; on web: full kanban with drag-and-drop.

---

## 10. Theme Switching

### 10.1 Light ↔ Dark

Every component reads tokens through CSS variables in the prototype. In production (Compose Multiplatform): a `MaterialTheme` wrapper provides a `LightStoryTailColors` or `DarkStoryTailColors` object via `LocalColorScheme`. Components never reference brand hex values directly.

The system listens to the OS-level theme by default; users can override in Settings → Appearance.

### 10.2 Tweaks (Design-Exploration Only)

The prototype includes a Tweaks panel that swaps:

- **Brand palette**: Story (default) · Tide (ocean+coral) · Atlas (slate+amber, editorial) · Sun (terracotta+gold, Mediterranean).
- **Surface temperature**: Paper (default cream) · Linen (warmer putty) · Steam (cool clinical white).
- **Wordmark voice**: Caveat (default handwritten) · Serif (Playfair italic) · Display (DM Serif Display) · Sans (Poppins ultrabold).

These are for designer/stakeholder exploration only. They are not user-facing in production. The Compose Multiplatform implementation can wire them in for internal Figma-style design previews if useful, but the default ship is always Story / Paper / Caveat.

---

## 11. Logo Usage

Two SVG/PNG glyphs ship in the system:

- `brand/logo-fox.png` — the book-and-fox mark. Use on **light backgrounds only**.
- `brand/logo-tropical-dark.png` — the palm-tree-and-sunset mark. Use on **dark backgrounds only**.

The "Story-Tail" wordmark is rendered as live text using Caveat for the script and Poppins-extrabold for the "ADVENTURES" tagline (1.6–1.8 letter-spacing). The script gets a gradient fill: orange→yellow in dark mode (sunset), solid burgundy in light mode. The tagline gets a blue gradient in dark mode, solid orange in light mode.

Logo + wordmark together form the `brand-mark` component (`.brand-mark`). Never use the glyph without the wordmark in onboarded screens; the standalone glyph is allowed in mobile app icons, favicons, and email avatars.

---

## 12. Implementation Per Platform

The design system ships in two implementation flavors — Kotlin for the mobile apps and CSS + TypeScript for the web app. The CSS prototype tokens in `design/source-prototype/styles/tokens.css` are the canonical source; both flavors mirror those tokens.

### 12.1 Mobile — Compose Multiplatform (Android + iOS)

Four Kotlin theme files have been generated at `design/compose-theme/` as a starter for the KMP shared module. They define the design tokens above in `androidx.compose.ui` / Material 3 conventions.

- **`StoryTailColors.kt`** — `StoryTailColors` data class plus `LightStoryTailColors` and `DarkStoryTailColors` companion objects. Also defines `StoryTailStatusColors` for the chip statuses.
- **`StoryTailTypography.kt`** — `StoryTailTypography` with the type ramp from Section 5. Includes a `StoryTailFontFamily` declaration for Poppins / Caveat / JetBrains Mono using Compose Multiplatform `Font` resources.
- **`StoryTailShape.kt`** — the six-tier shape scale as `RoundedCornerShape` values.
- **`StoryTailTheme.kt`** — the top-level `StoryTailTheme` composable that combines colors, typography, and shapes, and exposes them via `CompositionLocal`.

Drop these into `mobile/shared/src/commonMain/kotlin/com/storytail/ui/theme/`. Add the font resources to `mobile/shared/src/commonMain/composeResources/font/` and update `StoryTailTypography.kt` to point `PoppinsFamily`, `CaveatFamily`, `MonoFamily` at the bundled resources.

### 12.2 Web — Next.js + React + TypeScript

The Next.js web app consumes the same tokens via CSS custom properties. Two starter files ship at `design/web-tokens/`:

- **`tokens.css`** (copy of `design/source-prototype/styles/tokens.css`) — the canonical CSS variable definitions. Import once in the Next.js root layout so every component can reference `var(--md-primary)`, `var(--md-surface-1)`, etc.
- **`design-tokens.ts`** — a TypeScript module that mirrors the same tokens as typed constants for use with CSS-in-JS or Tailwind. Use this when you want autocomplete and type checking on token names.

Styling approach is flexible — Tailwind CSS, CSS Modules, vanilla CSS, or any CSS-in-JS library can consume the variables. The design tokens are framework-agnostic; only the typing layer changes per styling choice.

If using Tailwind, extend `tailwind.config.ts` to pull from the same variables:

```typescript
import { tokens } from "./design/web-tokens/design-tokens";
export default {
  theme: {
    extend: {
      colors: tokens.colors,
      fontFamily: tokens.fonts,
      borderRadius: tokens.radii,
    },
  },
};
```

### 12.3 Backend — No Theme

Supabase Edge Functions (the backend) don't have a UI, so they don't consume the design system. They do produce content (email templates, PDF itineraries) that should reference the brand palette — those should hardcode the hex values from Section 4 of this document and be reviewed by a designer if they're customer-facing.

### 12.4 Tokens Are the Contract

Components reference *tokens*, not raw hex values. Any new color, font size, spacing value, or radius added to the system goes into `tokens.css` first, then into both `StoryTailColors.kt`/etc. and `design-tokens.ts` as mirror updates. Treat the three files as a single source of truth that must stay in sync — a CI check that lints for mismatched values is worth setting up early.

---

## 13. Implementation Checklist

When the engineering team starts building, they should:

1. **Copy the three Compose theme files** from `design/compose-theme/` into the KMP shared module under `commonMain/kotlin/com/storytail/ui/theme/`.
2. **Add the font resources** (Poppins, Caveat, JetBrains Mono) to `commonMain/composeResources/font/`. Compose Multiplatform supports `Font(resource = ...)` cross-platform.
3. **Wire `StoryTailTheme` into the app root** of every target (Android `MainActivity`, iOS `MainViewController`, web `App.kt`). Apply system-theme detection by default; expose a user override in Settings → Appearance.
4. **Reference the prototype** in `design/source-prototype/` when building each screen. Open the screen-specific JSX file and recreate it in Compose — match the visual output, not the prototype's internal structure.
5. **Use the per-screen variant mapping** in Screen Inventory Section 4.4 to determine which Pattern (A through J) a screen uses, and therefore what its mobile/tablet/web layouts look like.
6. **Run a design QA pass** against the prototype's light + dark artboards before each screen lands. The prototype's 336 artboards are the visual ground truth — if Compose deviates, fix Compose unless the prototype is wrong.

---

## 14. Open Questions

**Font licensing.** Poppins, Caveat, and JetBrains Mono are all available under the SIL Open Font License. The implementation should ship them bundled in app resources (not loaded from Google Fonts CDN at runtime) for offline mobile use and to avoid third-party requests on cold-start.

**Tablet logo treatment.** The prototype renders the brand mark identically across viewports. Should the iPad-format hero use a larger or different logo lockup? Decide before designing the iPad-specific layouts in Phase 2.

**Material 3 vs Material You dynamic theming.** Android 12+ offers user-personalized dynamic theming. The Story-Tail brand is strong enough that we should **opt out** by default — the brand colors should always win. Confirm with the agent UX team.

**Per-agent branding (Phase 3 multi-agent).** When other advisors join the platform (Screen Inventory 3.12.5 Branding Settings), the design system needs to support per-agent logo and signature overrides while keeping core M3 tokens fixed. This is a Phase 3 concern but the token architecture is ready for it.

---

*Story-Tail Adventures — Making Travel an Adventure*
