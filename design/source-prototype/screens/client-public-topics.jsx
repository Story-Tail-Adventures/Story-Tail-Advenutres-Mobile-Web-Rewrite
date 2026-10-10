/* global React, MUI, Icon, MuiIcon, StoryTailMark, staImg, staAvatar, MuiScreenFrame */
// Client · 2.0 Public — Topic & advisor landing pages. MUI v9.
// Format: Hero + sticky inquire bar + curated tile grid.
// Voice: subtle Rest + Wonder language; no explicit scripture except the
// one designated Christian sub-card in Honeymoons.
//
// Rendered inside <StaMuiScheme>. Fixed white / gold / rgba values appear only
// in overlays drawn over photographs, where the scrim is intentional.

// ──────────────────────────────────────────────────────────────────────
// Shared building blocks
// ──────────────────────────────────────────────────────────────────────

function HeroBleed({ img, overline, title, script, sub, gradient, tall }) {
  const { Box, Typography } = MUI;
  return (
    <Box sx={{ position: 'relative', height: tall ? 420 : 360, overflow: 'hidden' }}>
      <Box component="img" src={staImg(img, 1800, 700)} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      <Box sx={{ position: 'absolute', inset: 0, background: gradient || 'linear-gradient(115deg, rgba(13,33,55,0.7) 0%, rgba(122,26,31,0.45) 55%, rgba(0,0,0,0.15) 100%)' }} />
      <Box sx={{ position: 'absolute', inset: 0, px: 6, py: 5, color: 'common.white', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', maxWidth: 760 }}>
        {overline && <Typography variant="overline" sx={{ display: 'block', color: 'brandSource.gold', fontWeight: 600, mb: 1 }}>{overline}</Typography>}
        <Typography variant="h2" component="h1" sx={{ color: 'common.white', fontWeight: 700, lineHeight: 1.04 }}>
          {title} {script && <Typography variant="script" component="span" sx={{ color: 'brandSource.gold', fontSize: 64 }}>{script}</Typography>}
        </Typography>
        {sub && <Typography variant="body1" sx={{ mt: 1.5, color: 'rgba(255,255,255,0.92)', maxWidth: 620 }}>{sub}</Typography>}
      </Box>
    </Box>
  );
}

function StickyInquireBar({ destination, dates, travelers, vibe }) {
  const { Box, Stack, Typography, Button, Paper, Divider } = MUI;
  const fields = [
    { l: 'Destination', v: destination, i: 'map' },
    { l: 'When', v: dates, i: 'calendar' },
    { l: 'Travelers', v: travelers, i: 'user' },
    { l: 'Vibe', v: vibe, i: 'palm' },
  ];
  return (
    <Box sx={{ position: 'sticky', top: 56, zIndex: 5, px: 6, py: 1.75, bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' }}>
      <Paper elevation={1} sx={{ display: 'flex', alignItems: 'center' }}>
        {fields.map((f, i) => (
          <React.Fragment key={f.l}>
            {i > 0 && <Divider orientation="vertical" flexItem />}
            <Box sx={{ flex: 1, px: 2, py: 1.25 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.2 }}>{f.l}</Typography>
              <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', mt: 0.25 }}>
                <MuiIcon name={f.i} size={13} sx={{ color: 'brand.main' }} />
                <Typography variant="subtitle2" sx={{ lineHeight: 1.2 }}>{f.v}</Typography>
              </Stack>
            </Box>
          </React.Fragment>
        ))}
        <Button variant="contained" startIcon={<MuiIcon name="message" size={14} />} sx={{ height: 44, m: 0.5, flexShrink: 0 }}>
          Request a quote
        </Button>
      </Paper>
    </Box>
  );
}

const PRICE_DOTS = { '$': 1, '$$': 2, '$$$': 3 };
function PriceRange({ range }) {
  const { Box } = MUI;
  const filled = PRICE_DOTS[range] || 2;
  return (
    <Box component="span" sx={{
      display: 'inline-flex', gap: '1px', px: 1, py: 0.375, borderRadius: 1,
      bgcolor: 'rgba(13,33,55,0.85)', color: 'common.white',
      fontFamily: (t) => t.typography.mono, fontWeight: 700, fontSize: 10, lineHeight: 1, letterSpacing: 0.5,
    }}>
      {['$', '$', '$'].map((d, i) => (
        <Box component="span" key={i} sx={{ opacity: i < filled ? 1 : 0.32 }}>$</Box>
      ))}
    </Box>
  );
}

function TripTile({ t, s, img, range, tag, badge }) {
  const { Box, Stack, Typography, Button, IconButton, Card, CardMedia, CardContent, Chip } = MUI;
  return (
    <Card sx={{ position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ position: 'relative', aspectRatio: '5/3' }}>
        <CardMedia component="img" image={staImg(img, 600, 360)} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        {badge && (
          <Chip size="small" color="secondary" label={badge}
                sx={{ position: 'absolute', top: 10, left: 10, fontWeight: 700, fontSize: 9.5, letterSpacing: 0.5, textTransform: 'uppercase', height: 20 }} />
        )}
        <Box component="span" sx={{ position: 'absolute', top: 10, right: 10 }}><PriceRange range={range} /></Box>
      </Box>
      <CardContent sx={{ p: 1.75, flex: 1, display: 'flex', flexDirection: 'column', '&:last-child': { pb: 1.75 } }}>
        <Typography variant="overline" sx={{ display: 'block', color: 'brand.main', fontWeight: 600, lineHeight: 1.3 }}>{tag}</Typography>
        <Typography variant="subtitle1" sx={{ mt: 0.25 }}>{t}</Typography>
        <Typography variant="caption" component="p" color="text.secondary">{s}</Typography>
        <Stack direction="row" spacing={0.75} sx={{ mt: 'auto', pt: 1.25, alignItems: 'center' }}>
          <Button variant="contained" size="small" sx={{ flex: 1 }}>Request quote</Button>
          <IconButton size="small"><MuiIcon name="heart" size={14} /></IconButton>
        </Stack>
      </CardContent>
    </Card>
  );
}

function SectionLabel({ overline, title, sub }) {
  const { Box, Typography } = MUI;
  return (
    <Box sx={{ mb: 2 }}>
      {overline && <Typography variant="overline" sx={{ display: 'block', color: 'brand.main', fontWeight: 600 }}>{overline}</Typography>}
      <Typography variant="h4" component="h2" sx={{ fontWeight: 700, mt: 0.5, mb: 0.5 }}>{title}</Typography>
      {sub && <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 720 }}>{sub}</Typography>}
    </Box>
  );
}

function ClosingCTA({ image, title, body, primary = 'Request a quote', secondary = 'Message Gyasi first' }) {
  const { Box, Stack, Typography, Button, Paper } = MUI;
  const glass = { color: 'common.white', borderColor: 'rgba(255,255,255,0.3)', bgcolor: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(6px)',
                  '&:hover': { borderColor: 'rgba(255,255,255,0.5)', bgcolor: 'rgba(255,255,255,0.26)' } };
  return (
    <Paper elevation={0} sx={{ position: 'relative', overflow: 'hidden', mt: 1.5, minHeight: 220 }}>
      <Box component="img" src={staImg(image, 1600, 500)} alt="" sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      <Box sx={{ position: 'absolute', inset: 0, background: 'linear-gradient(120deg, rgba(122,26,31,0.85), rgba(13,33,55,0.55))' }} />
      <Stack direction="row" spacing={3} useFlexGap sx={{ position: 'relative', px: 4.5, py: 4, color: 'common.white', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <Box sx={{ maxWidth: 540 }}>
          <Typography variant="h4" component="h3" sx={{ fontWeight: 700, color: 'common.white' }}>{title}</Typography>
          <Typography variant="body2" sx={{ mt: 0.75, color: 'rgba(255,255,255,0.9)' }}>{body}</Typography>
        </Box>
        <Stack direction="row" spacing={1.25}>
          <Button variant="contained" color="brand" size="large">{primary}</Button>
          <Button variant="outlined" size="large" sx={glass}>{secondary}</Button>
        </Stack>
      </Stack>
    </Paper>
  );
}

// Photo card with a small tag chip over the image and a title + blurb below.
// Used by the Cruises "three types" and Honeymoons "three styles" rows.
function C20_MuiTypeCard({ img, tag, title, body }) {
  const { Box, Typography, Card, CardMedia, CardContent, Chip } = MUI;
  return (
    <Card sx={{ overflow: 'hidden', height: '100%' }}>
      <Box sx={{ position: 'relative', height: 160 }}>
        <CardMedia component="img" image={staImg(img, 600, 320)} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        <Chip size="small" label={tag}
              sx={{ position: 'absolute', top: 10, left: 10, bgcolor: 'rgba(255,255,255,0.92)', color: 'primary.main', fontWeight: 700, fontSize: 9.5, letterSpacing: 0.5, height: 20 }} />
      </Box>
      <CardContent sx={{ p: 2 }}>
        <Typography variant="h5">{title}</Typography>
        <Typography variant="caption" component="p" color="text.secondary" sx={{ mt: 0.5 }}>{body}</Typography>
      </CardContent>
    </Card>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 2.0.8 — Caribbean
// ──────────────────────────────────────────────────────────────────────

function C208_Caribbean() {
  const { Box, Stack, Grid, Typography, Button, Card, CardMedia } = MUI;
  const islands = [
    { n: 'Turks & Caicos', img: 'turks' }, { n: 'Bahamas', img: 'bahamas' },
    { n: 'St. Lucia', img: 'stlucia' }, { n: 'Jamaica', img: 'jamaica' },
    { n: 'Aruba', img: 'aruba' }, { n: 'BVI', img: 'bvi' },
  ];
  const trips = [
    { t: 'Beaches Turks & Caicos', s: 'Providenciales · Family all-inclusive', tag: 'ALL-INCLUSIVE · FAMILY', img: 'turks', range: '$$', badge: "Gyasi's pick" },
    { t: 'Sandals Royal Bahamian', s: 'Nassau · Adults-only · 7 nights', tag: 'ALL-INCLUSIVE · ADULTS', img: 'bahamas', range: '$$$' },
    { t: 'Sandals Grande St. Lucian', s: 'Rodney Bay · Lush rainforest views', tag: 'ALL-INCLUSIVE · COUPLES', img: 'stlucia', range: '$$$' },
    { t: 'Couples Negril', s: 'Negril · Quiet, all-inclusive, no kids', tag: 'ALL-INCLUSIVE · COUPLES', img: 'jamaica', range: '$$' },
    { t: 'Bucuti & Tara · Aruba', s: 'Eagle Beach · Boutique adult-only', tag: 'BOUTIQUE · ADULTS', img: 'aruba', range: '$$$' },
    { t: 'Atlantis Paradise Island', s: 'Nassau · Waterpark + family suites', tag: 'RESORT · FAMILY', img: 'bahamas', range: '$$' },
    { t: 'Excellence Oyster Bay', s: 'Falmouth · Adults-only all-inclusive', tag: 'ALL-INCLUSIVE · ADULTS', img: 'jamaica', range: '$$' },
    { t: 'BVI sailing charter', s: '7-night skippered catamaran', tag: 'SAILING · GROUP', img: 'bvi', range: '$$$', badge: 'Group fav' },
    { t: 'Beaches Negril', s: 'Negril · Sesame Street + 7 beaches', tag: 'ALL-INCLUSIVE · FAMILY', img: 'overwater', range: '$$' },
  ];
  const intro = [
    { i: 'palm', t: 'You won\'t have to think.', d: 'Transfers, dining reservations, the spa slot you didn\'t know you needed — handled before you leave Miami.' },
    { i: 'shield', t: 'Real prices, honest takes.', d: 'I tell you which resorts are tired and which ones are quietly the best. No commission steers my picks.' },
    { i: 'heart', t: 'A week worth returning to.', d: 'The point isn\'t the trip — it\'s the rest you bring home from it. We plan with that in mind.' },
  ];

  return (
    <MuiScreenFrame chrome="topbar" role="public" search={false} padding={0} scrollable>
      <HeroBleed
        img="turks"
        overline="CARIBBEAN VACATIONS"
        title="A region built for"
        script="rest."
        sub="Twelve islands. One advisor who's planned every one of them. The hard part isn't finding a good week — it's choosing which good one."
      />
      <StickyInquireBar destination="Anywhere Caribbean" dates="Flexible · 7 nights" travelers="2 adults" vibe="Beach + rest"/>

      <Box sx={{ px: 6, pt: 4, pb: 7, maxWidth: 1280, mx: 'auto' }}>
        {/* Intro band */}
        <Grid container spacing={1.75} sx={{ mb: 4.5 }}>
          {intro.map((c) => (
            <Grid key={c.t} size={4}>
              <Box sx={{ px: 2, py: 1.75 }}>
                <MuiIcon name={c.i} size={20} sx={{ color: 'brand.main' }} />
                <Typography variant="h5" sx={{ mt: 1, mb: 0.5 }}>{c.t}</Typography>
                <Typography variant="caption" component="p" color="text.secondary">{c.d}</Typography>
              </Box>
            </Grid>
          ))}
        </Grid>

        {/* Island chip strip */}
        <SectionLabel overline="ISLANDS" title="Where to land" sub="Tap an island to start a search, or let Gyasi suggest one based on your week."/>
        <Grid container spacing={1.25} sx={{ mb: 4.5 }}>
          {islands.map((isl) => (
            <Grid key={isl.n} size={2}>
              <Card sx={{ position: 'relative', overflow: 'hidden', aspectRatio: '4/5', cursor: 'pointer' }}>
                <CardMedia component="img" image={staImg(isl.img, 320, 400)} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <Box sx={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.7))' }} />
                <Typography variant="subtitle2" sx={{ position: 'absolute', left: 10, right: 10, bottom: 10, color: 'common.white', fontWeight: 700, lineHeight: 1.2 }}>{isl.n}</Typography>
              </Card>
            </Grid>
          ))}
        </Grid>

        {/* Trip grid */}
        <SectionLabel overline="HAND-PICKED · 9 TRIPS" title="Caribbean weeks Gyasi loves right now" sub="Updated monthly. The $ chip is a rough range — request a quote to see real prices for your dates."/>
        <Grid container spacing={1.75} sx={{ mb: 3 }}>
          {trips.map((t) => <Grid key={t.t} size={4}><TripTile {...t}/></Grid>)}
        </Grid>
        <Stack direction="row" sx={{ justifyContent: 'center', mb: 4.5 }}>
          <Button variant="outlined" color="secondary">See all 28 Caribbean trips →</Button>
        </Stack>

        <ClosingCTA
          image="overwater"
          title="Tell me your week. I'll come back with three good options."
          body="No account needed to message. No planning fees, ever. Just a real conversation about what you actually need."
        />
      </Box>
    </MuiScreenFrame>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 2.0.9 — Cruises
// ──────────────────────────────────────────────────────────────────────

function C209_Cruises() {
  const { Box, Stack, Grid, Button, Chip } = MUI;
  const types = [
    { t: 'Family cruises', d: 'Multi-gen sailings with waterparks, character meet-ups, and rooms that connect.', img: 'cruiseShip', tag: 'FAMILY' },
    { t: 'Adults-only', d: 'Virgin, Viking, premium Celebrity — quieter ships, real dining, no kids underfoot.', img: 'cruiseAerial', tag: 'ADULTS' },
    { t: 'Group cruises', d: '8+ travelers — birthday, anniversary, ministry, friends week. Group rates + a coordinator.', img: 'overwater', tag: 'GROUP' },
  ];
  const lines = ['Royal Caribbean', 'Celebrity', 'Disney', 'Princess', 'Carnival', 'Virgin Voyages', 'Norwegian', 'Holland America'];
  const trips = [
    { t: 'Symphony of the Seas', s: 'Eastern Caribbean · 7 nights · From Miami', tag: 'ROYAL CARIBBEAN', img: 'cruiseShip', range: '$$', badge: "Gyasi's pick" },
    { t: 'Disney Fantasy', s: 'Western Caribbean · 7 nights · Castaway Cay', tag: 'DISNEY · FAMILY', img: 'cruiseAerial', range: '$$$' },
    { t: 'Celebrity Edge', s: 'Southern Caribbean · 11 nights · Curaçao + Aruba', tag: 'CELEBRITY · ADULTS', img: 'cruiseShip', range: '$$$' },
    { t: 'Princess Sky', s: 'Bahamas · 4 nights · Quick getaway', tag: 'PRINCESS · WEEKEND', img: 'bahamas', range: '$' },
    { t: 'Virgin Resilient Lady', s: 'Adults-only · 5 nights · Puerto Plata', tag: 'VIRGIN · ADULTS', img: 'cruiseAerial', range: '$$' },
    { t: 'Carnival Celebration', s: 'Eastern Caribbean · 6 nights · Family-priced', tag: 'CARNIVAL · FAMILY', img: 'cruiseShip', range: '$' },
    { t: 'Holland America Eurodam', s: 'Panama Canal · 11 nights · Bucket-list', tag: 'HAL · GROUP', img: 'cruiseAerial', range: '$$$' },
    { t: 'Norwegian Encore', s: 'Bermuda · 7 nights · Pink-sand beaches', tag: 'NCL · FAMILY', img: 'bahamas', range: '$$' },
    { t: 'Royal Wonder of the Seas', s: 'Western Caribbean · 7 nights · Mahogany Bay', tag: 'ROYAL · FAMILY', img: 'cruiseShip', range: '$$' },
  ];

  return (
    <MuiScreenFrame chrome="topbar" role="public" search={false} padding={0} scrollable>
      <HeroBleed
        img="cruiseAerial"
        overline="CRUISING"
        title="A floating Sabbath,"
        script="every morning new."
        sub="Unpack once. See three islands. The ship handles dinner, the towel art, the kids' club — you handle being on a balcony at sunrise."
      />
      <StickyInquireBar destination="Caribbean cruise" dates="Flexible · 7 nights" travelers="2 adults" vibe="Family · Adults · Group"/>

      <Box sx={{ px: 6, pt: 4, pb: 7, maxWidth: 1280, mx: 'auto' }}>
        {/* Three types */}
        <SectionLabel overline="WHO IT'S FOR" title="Three kinds of cruise, one advisor." sub="I sail with each line at least once a year, so the recommendation isn't a brochure — it's lived."/>
        <Grid container spacing={1.75} sx={{ mb: 4.5 }}>
          {types.map((tp) => (
            <Grid key={tp.t} size={4}>
              <C20_MuiTypeCard img={tp.img} tag={tp.tag} title={tp.t} body={tp.d} />
            </Grid>
          ))}
        </Grid>

        {/* Cruise lines */}
        <SectionLabel overline="LINES WE BOOK" title="Eight lines, picked for the trip — not the loyalty points."/>
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', mb: 4.5 }}>
          {lines.map((l) => (
            <Chip key={l} variant="outlined" label={l} />
          ))}
        </Stack>

        {/* Trip grid */}
        <SectionLabel overline="HAND-PICKED · 9 SAILINGS" title="Sailings worth booking this season"/>
        <Grid container spacing={1.75} sx={{ mb: 3 }}>
          {trips.map((t) => <Grid key={t.t} size={4}><TripTile {...t}/></Grid>)}
        </Grid>
        <Stack direction="row" sx={{ justifyContent: 'center', mb: 4.5 }}>
          <Button variant="outlined" color="secondary">See all 36 sailings →</Button>
        </Stack>

        <ClosingCTA
          image="cruiseShip"
          title="Tell me how many people, when, and roughly your budget."
          body="I'll come back with three sailings, on three lines, with honest notes on what each ship is actually good at."
        />
      </Box>
    </MuiScreenFrame>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 2.0.10 — Honeymoons
// ──────────────────────────────────────────────────────────────────────

function C2010_Honeymoons() {
  const { Box, Stack, Grid, Typography, Button, Card, CardContent, Paper, Avatar } = MUI;
  const styles = [
    { t: 'Adults-only resorts', d: 'Sandals, Couples, Excellence — all-inclusive, no kids, real spas.', img: 'overwater', tag: 'ALL-INCLUSIVE' },
    { t: 'Overwater bungalows', d: 'A door to the ocean from your bed. Tahiti, Maldives, El Dorado Maroma.', img: 'overwater', tag: 'OVERWATER' },
    { t: 'Multi-stop', d: 'Two islands. Or a city + a beach. We sequence the rhythm — busy first, rest second.', img: 'sunset', tag: 'MULTI-STOP' },
  ];
  const trips = [
    { t: 'Sandals Grande St. Lucian', s: 'St. Lucia · Overwater bungalows · 7 nights', tag: 'OVERWATER · ADULTS', img: 'stlucia', range: '$$$', badge: "Gyasi's pick" },
    { t: 'Couples Sans Souci', s: 'Ocho Rios, Jamaica · Cliffside · 7 nights', tag: 'BOUTIQUE · ADULTS', img: 'jamaica', range: '$$' },
    { t: 'Excellence Playa Mujeres', s: 'Cancún · Adults-only · Beachfront swim-up', tag: 'ALL-INCLUSIVE', img: 'aruba', range: '$$' },
    { t: 'Le Blanc Spa Resort', s: 'Cancún · Five-star · Couples-focused', tag: 'LUXURY · ADULTS', img: 'overwater', range: '$$$' },
    { t: 'Hamanasi Resort', s: 'Belize · Adventure + beach hybrid', tag: 'ADVENTURE', img: 'snorkel', range: '$$', badge: 'Off-the-beaten' },
    { t: 'Sandals Royal Bahamian', s: 'Nassau · Private island day · 7 nights', tag: 'ALL-INCLUSIVE · ADULTS', img: 'bahamas', range: '$$$' },
  ];

  return (
    <MuiScreenFrame chrome="topbar" role="public" search={false} padding={0} scrollable>
      <HeroBleed
        img="overwater"
        overline="HONEYMOONS"
        title="The first rest,"
        script="after the I-do's."
        sub="A week that begins your marriage — quiet, unhurried, and built around the two of you. We handle the moving parts so you can be present."
        tall
      />
      <StickyInquireBar destination="Anywhere romantic" dates="After your wedding date" travelers="2 adults" vibe="Quiet · Beach · Spa"/>

      <Box sx={{ px: 6, pt: 4, pb: 7, maxWidth: 1280, mx: 'auto' }}>
        {/* Intro letter */}
        <Card sx={{ bgcolor: 'surface.2', mb: 4.5 }}>
          <CardContent sx={{ px: 3.5, py: 3, display: 'grid', gridTemplateColumns: '56px 1fr', gap: 2.25, alignItems: 'start', '&:last-child': { pb: 3 } }}>
            <Avatar src={staImg('avatarA', 120, 120)} alt="" sx={{ width: 56, height: 56 }} />
            <Box>
              <Typography variant="overline" sx={{ display: 'block', color: 'brand.main', fontWeight: 600 }}>A NOTE FROM GYASI</Typography>
              <Typography variant="body1" sx={{ mt: 0.75, textWrap: 'pretty' }}>
                Honeymoons are the most personal trip I plan. Some couples want the resort with no decisions to make. Some want two islands and a snorkel boat between them. I ask the same question first either way: <i>what kind of rest does your marriage need to begin with?</i> Then we plan from there.
              </Typography>
            </Box>
          </CardContent>
        </Card>

        {/* Three styles */}
        <SectionLabel overline="THREE WAYS TO HONEYMOON" title="Pick the rhythm. We pick the rest."/>
        <Grid container spacing={1.75} sx={{ mb: 4.5 }}>
          {styles.map((s) => (
            <Grid key={s.t} size={4}>
              <C20_MuiTypeCard img={s.img} tag={s.tag} title={s.t} body={s.d} />
            </Grid>
          ))}
        </Grid>

        {/* Featured packages */}
        <SectionLabel overline="FEATURED · 6 PACKAGES" title="Honeymoons booked this year"/>
        <Grid container spacing={1.75} sx={{ mb: 4.5 }}>
          {trips.map((t) => <Grid key={t.t} size={4}><TripTile {...t}/></Grid>)}
        </Grid>

        {/* Christian couples sub-card — explicit framing for the audience that wants it */}
        <Paper elevation={0} sx={{
          position: 'relative', overflow: 'hidden', mb: 4.5, px: 4, py: 3.5,
          background: (t) => `linear-gradient(135deg, ${t.palette.primary.container} 0%, ${t.palette.secondary.container} 100%)`,
        }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 3.5, alignItems: 'center' }}>
            <Box>
              <Typography variant="overline" sx={{ display: 'block', color: 'primary.main', fontWeight: 600 }}>FOR CHRISTIAN COUPLES</Typography>
              <Typography variant="h4" component="h3" sx={{ fontWeight: 700, mt: 0.5, mb: 1, color: 'primary.onContainer' }}>A honeymoon that honors what you just promised.</Typography>
              <Typography variant="body2" sx={{ color: 'primary.onContainer', opacity: 0.85, maxWidth: 540 }}>
                If you're building a Christ-centered marriage, your first week away matters. We'll steer you toward resorts that fit — quieter properties, family-owned boutiques, an Adventist-friendly Sabbath rhythm if that matters to you. Just tell me on the inquiry form. No upcharge, no judgment, no awkward conversation.
              </Typography>
              <Stack direction="row" spacing={1.25} sx={{ mt: 2 }}>
                <Button variant="contained">Request a quote</Button>
                <Button variant="text">See the curated list →</Button>
              </Stack>
            </Box>
            <Box sx={{ position: 'relative', borderRadius: 1, overflow: 'hidden', aspectRatio: '5/4' }}>
              <Box component="img" src={staImg('candlelit', 600, 480)} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            </Box>
          </Box>
        </Paper>

        <ClosingCTA
          image="honeymoon"
          title="When's the wedding? I'll start there."
          body="Tell me the date, your two priorities (rest? adventure? privacy?), and a budget range. I'll send three honest options within 48 hours."
        />
      </Box>
    </MuiScreenFrame>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 2.0.11 — About Gyasi
// ──────────────────────────────────────────────────────────────────────

function C2011_AboutGyasi() {
  const { Box, Stack, Grid, Typography, Button, Card, CardContent, Avatar, Divider, Accordion, AccordionSummary, AccordionDetails } = MUI;
  const glass = { color: 'common.white', borderColor: 'rgba(255,255,255,0.3)', bgcolor: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(6px)',
                  '&:hover': { borderColor: 'rgba(255,255,255,0.5)', bgcolor: 'rgba(255,255,255,0.26)' } };
  const stats = [
    { n: '240+', l: 'Travelers served', i: 'users' },
    { n: '4.9 ★', l: '138 reviews', i: 'star' },
    { n: '< 2h', l: 'Avg reply time', i: 'message' },
    { n: '5 yrs', l: 'Caribbean specialist', i: 'palm' },
  ];
  const creds = [
    { t: 'Hosted by Inteletravel', s: 'IATA-accredited host agency · Full supplier access' },
    { t: 'CLIA Member', s: 'Cruise Lines International Association · Sailings booked yearly' },
    { t: 'Sandals Certified Specialist', s: 'Trained on all properties in Jamaica, Bahamas, St. Lucia, Turks' },
    { t: 'Royal Caribbean Master', s: 'Master-level certification · Symphony, Wonder, Icon class' },
  ];
  const testimonials = [
    { q: 'Gyasi planned our first family cruise. Three kids, two grandparents, one mom who needed a break. She didn\'t miss a detail — even called when our connection got cancelled in Miami.', who: 'The Westbrook Family', trip: 'Symphony · Dec 2024', a: 'avatarC' },
    { q: 'She steered us to a quieter resort than what we picked online — saved us thousands too. Best honeymoon week we could\'ve asked for.', who: 'Reggie & Marc', trip: 'Sandals St. Lucia · May 2024', a: 'avatarD' },
    { q: 'I message her at 9pm with random questions and she replies. That\'s the whole pitch right there — she actually cares.', who: 'Aisha Patel', trip: 'Atlantis · Mar 2024', a: 'avatarE' },
    { q: 'We did a multi-gen group trip — 12 people, two cabins, three flights from three cities. She made it feel small.', who: 'The Khan Family', trip: 'Beaches T&C · Aug 2024', a: 'avatarF' },
    { q: 'No high-pressure sales, no upselling. Just real options, real prices, and a person who picks up the phone.', who: 'Tasha Whitfield', trip: 'Aruba · Oct 2023', a: 'avatarB' },
    { q: 'I was nervous about authorizing a card online. She walked me through every step, sent me the audit log, never made me feel silly.', who: 'Linda Gomez', trip: 'Riviera Maya · Jan 2024', a: 'avatarA' },
  ];
  const faq = [
    { q: 'Do you charge a planning fee?', a: 'No — and I can\'t. As an Inteletravel-hosted advisor I\'m contractually prohibited from charging clients planning, consultation, or service fees. I earn commission from suppliers when you travel.' },
    { q: 'What if I just want to message you, no commitment?', a: 'Please do. Most relationships start with a casual question. Use the form at the top of any page, or text the number on my contact card.' },
    { q: 'Why the Caribbean specifically?', a: 'I lived in the islands. I know which Sandals has the best Red Lane spa (Grande St. Lucian). I know which Royal Caribbean ship to put a multi-gen family on (Wonder, hands down). When you know one region well, you serve people better.' },
    { q: 'Do you book non-Caribbean trips?', a: 'Yes — Mexico, Europe, cruises anywhere, group trips, all-inclusives worldwide. The Caribbean is my deepest specialty, not my only one.' },
    { q: 'How does payment work?', a: 'You add a card through a Stripe-secured form. I use it only to pay suppliers on your behalf, up to a cap you authorize, with audit logs and notifications. I never charge you a service fee.' },
  ];

  return (
    <MuiScreenFrame chrome="topbar" role="public" search={false} padding={0} scrollable>
      {/* Hero — portrait + name. Brand gradient is the same in both schemes, like the legacy screen. */}
      <Box sx={{ position: 'relative', overflow: 'hidden',
                 background: (t) => `linear-gradient(120deg, ${t.palette.brandSource.burgundyDark} 0%, ${t.palette.brandSource.burgundy} 60%, ${t.palette.brandSource.orange} 130%)` }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', alignItems: 'stretch', minHeight: 420 }}>
          <Box sx={{ px: 7, py: 6.5, color: 'common.white', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <Typography variant="overline" sx={{ display: 'block', color: 'brandSource.gold', fontWeight: 600, mb: 1.25 }}>YOUR ADVISOR</Typography>
            <Typography variant="h2" component="h1" sx={{ color: 'common.white', fontWeight: 700, lineHeight: 1.04 }}>Hi, I'm <Typography variant="script" component="span" sx={{ color: 'brandSource.gold', fontSize: 72 }}>Gyasi.</Typography></Typography>
            <Typography variant="body1" sx={{ mt: 1.75, color: 'rgba(255,255,255,0.92)', maxWidth: 540 }}>
              Caribbean specialist, mom of three, Sandals-certified, hosted by Inteletravel. I plan the kind of week that turns into a story your family tells for years — and I don't disappear after the deposit clears.
            </Typography>
            <Stack direction="row" spacing={1.25} sx={{ mt: 2.75 }}>
              <Button variant="contained" color="brand" size="large">Request a quote</Button>
              <Button variant="outlined" size="large" startIcon={<MuiIcon name="message" size={14} />} sx={glass}>
                Message me first
              </Button>
            </Stack>
          </Box>
          <Box sx={{ position: 'relative', overflow: 'hidden' }}>
            <Box component="img" src={staImg('avatarA', 800, 1000)} alt="" sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 30%' }} />
          </Box>
        </Box>
      </Box>

      {/* Stats strip */}
      <Box sx={{ bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' }}>
        <Grid container spacing={3} sx={{ maxWidth: 1280, mx: 'auto', px: 6, py: 3 }}>
          {stats.map((s) => (
            <Grid key={s.l} size={3}>
              <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                <Avatar variant="rounded" sx={{ width: 44, height: 44, bgcolor: 'primary.container', color: 'primary.onContainer' }}>
                  <Icon name={s.i} size={20} />
                </Avatar>
                <Box>
                  <Typography variant="h4" sx={{ fontWeight: 700, fontSize: 28, lineHeight: 1.1 }}>{s.n}</Typography>
                  <Typography variant="caption" component="p" color="text.secondary">{s.l}</Typography>
                </Box>
              </Stack>
            </Grid>
          ))}
        </Grid>
      </Box>

      <Box sx={{ px: 6, pt: 5, pb: 7, maxWidth: 1280, mx: 'auto' }}>
        {/* Bio + credentials */}
        <Box sx={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 3.5, mb: 5.5 }}>
          <Box>
            <SectionLabel overline="THE STORY" title="How Story-Tail started."/>
            <Box sx={{ color: 'text.primary', textWrap: 'pretty', maxWidth: 640 }}>
              <Typography variant="body1" sx={{ mb: 1.75 }}>I started planning trips for friends in 2019 because they kept asking. I'd done enough Caribbean weeks of my own to know which resorts were worth it and which were paying for good Google ads. By 2021 the side-thing had a name — <i>Story-Tail Adventures</i> — and a backlog.</Typography>
              <Typography variant="body1" sx={{ mb: 1.75 }}>I'm hosted by Inteletravel, which means you get my care plus an IATA-accredited host agency behind every booking. I earn commission from suppliers — never a fee from you.</Typography>
              <Typography variant="body1">My belief about all this is simple: vacation isn't an escape from your life, it's a gift. The world is good. Rest is good. My job is to remove enough friction that you can actually receive both.</Typography>
              <Typography variant="script" component="p" sx={{ mt: 2.25, color: 'primary.main', fontSize: 30 }}>— Gyasi</Typography>
            </Box>
          </Box>
          <Box>
            <SectionLabel overline="CREDENTIALS" title="Trained, certified, audited."/>
            <Stack spacing={1}>
              {creds.map((c) => (
                <Card key={c.t}>
                  <CardContent sx={{ p: 1.75, display: 'flex', gap: 1.5, alignItems: 'flex-start', '&:last-child': { pb: 1.75 } }}>
                    <Avatar variant="rounded" sx={{ width: 36, height: 36, bgcolor: 'secondary.container', color: 'secondary.onContainer', flexShrink: 0 }}>
                      <Icon name="shield" size={16} />
                    </Avatar>
                    <Box>
                      <Typography variant="subtitle1">{c.t}</Typography>
                      <Typography variant="caption" component="p" color="text.secondary">{c.s}</Typography>
                    </Box>
                  </CardContent>
                </Card>
              ))}
            </Stack>
          </Box>
        </Box>

        {/* Testimonials */}
        <SectionLabel overline="WHAT TRAVELERS SAY" title="Six unedited notes."/>
        <Grid container spacing={1.75} sx={{ mb: 5.5 }}>
          {testimonials.map((t, i) => (
            <Grid key={i} size={4}>
              <Card sx={{ height: '100%' }}>
                <CardContent sx={{ p: 2.25, height: '100%', display: 'flex', flexDirection: 'column', '&:last-child': { pb: 2.25 } }}>
                  <Typography variant="script" sx={{ fontSize: 32, lineHeight: 0.7, color: 'brand.main', letterSpacing: -2 }}>"</Typography>
                  <Typography variant="body2" sx={{ mt: 0.5, textWrap: 'pretty', flex: 1 }}>{t.q}</Typography>
                  <Divider sx={{ mt: 1.75 }} />
                  <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', pt: 1.75 }}>
                    <Avatar src={staImg(t.a, 80, 80)} alt="" sx={{ width: 32, height: 32 }} />
                    <Box>
                      <Typography variant="subtitle2" sx={{ lineHeight: 1.2 }}>{t.who}</Typography>
                      <Typography variant="caption" component="p" color="text.secondary">{t.trip}</Typography>
                    </Box>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>

        {/* FAQ */}
        <SectionLabel overline="QUESTIONS PEOPLE ASK" title="FAQ"/>
        <Stack spacing={1.25} sx={{ mb: 5.5 }}>
          {faq.map((f, i) => (
            <Accordion key={i} defaultExpanded={i === 0} disableGutters>
              <AccordionSummary expandIcon={<MuiIcon name="chevron_down" size={16} />}>
                <Typography variant="subtitle2">{f.q}</Typography>
              </AccordionSummary>
              <AccordionDetails sx={{ pt: 0 }}>
                <Typography variant="body2" color="text.secondary">{f.a}</Typography>
              </AccordionDetails>
            </Accordion>
          ))}
        </Stack>

        <ClosingCTA
          image="sunset"
          title="Let's start with a conversation."
          body="No account, no commitment — just tell me what you're dreaming about and I'll come back with three real options."
          primary="Request a quote"
          secondary="Message Gyasi"
        />
      </Box>
    </MuiScreenFrame>
  );
}

Object.assign(window, { C208_Caribbean, C209_Cruises, C2010_Honeymoons, C2011_AboutGyasi });
