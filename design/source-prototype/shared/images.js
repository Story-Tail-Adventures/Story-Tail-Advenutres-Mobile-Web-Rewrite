/* global window */
// Centralized Unsplash photo IDs so artboards share a consistent travel image library.
// Format: https://images.unsplash.com/photo-{id}?w=...&q=80&fit=crop
const STA_IMAGES = {
  // Caribbean beaches
  turks: 'photo-1507525428034-b723cf961d3e',          // turquoise beach
  bahamas: 'photo-1559827260-dc66d52bef19',           // palm + beach
  stlucia: 'photo-1473625247510-8ceb1760943f',        // tropical island
  jamaica: 'photo-1564507592333-c60657eea523',        // negril-style cliffs
  aruba: 'photo-1530541930197-ff16ac917b0e',          // beach palms
  bvi: 'photo-1473625247510-8ceb1760943f',            // sailing
  // Resorts & pools
  resortPool: 'photo-1582719508461-905c673771fd',     // infinity pool
  overwater: 'photo-1540541338287-41700207dee6',      // overwater bungalows
  resortNight: 'photo-1571896349842-33c89424de2d',    // hotel night
  // Cruises
  cruiseShip: 'photo-1548574505-5e239809ee19',        // big cruise ship
  cruiseAerial: 'photo-1599582909646-2b9c9a0e98da',   // cruise aerial
  // Honeymoon / couples
  honeymoon: 'photo-1517824806704-9040b037703b',      // couple beach
  candlelit: 'photo-1519999482648-25049ddd37b1',      // candlelit dinner
  // Family
  family: 'photo-1602002418082-a4443e081dd1',         // family pool
  // Adventure
  zipline: 'photo-1620745137038-d62b1f1c6e63',        // zipline
  snorkel: 'photo-1582967788606-a171c1080cb0',        // snorkeling
  // Generic tropical
  palmTree: 'photo-1507525428034-b723cf961d3e',
  sunset: 'photo-1506929562872-bb421503ef21',         // sunset palm
  // Avatars (people)
  avatarA: 'photo-1494790108377-be9c29b29330',        // smiling woman
  avatarB: 'photo-1500648767791-00dcc994a43e',        // man
  avatarC: 'photo-1438761681033-6461ffad8d80',        // woman 2
  avatarD: 'photo-1472099645785-5658abf4ff4e',        // man 2
  avatarE: 'photo-1544005313-94ddf0286df2',           // woman 3
  avatarF: 'photo-1507003211169-0a1dd7228f2d',        // man 3
};

function staImg(key, w = 800, h = null) {
  const id = STA_IMAGES[key] || key;
  let q = `?w=${w}&q=80&auto=format&fit=crop`;
  if (h) q += `&h=${h}`;
  return `https://images.unsplash.com/${id}${q}`;
}

function staAvatar(key, w = 96) {
  return staImg(key, w, w);
}

Object.assign(window, { STA_IMAGES, staImg, staAvatar });
