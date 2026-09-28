-- Ship photography: four editorial columns on cruise_ship (Data-Model §24.2).
--
-- Screen 2.3.4's spec has asked for a ship image since the Screen Inventory was written
-- ("cruise cards (ship image, itinerary stops, dates, price from)"), and there has never been
-- a column to put one in. track.cruises does not carry imagery at all — Free-Travel-APIs §4.8
-- is explicit that Widgety's imagery "is what makes §2.0.9 look like anything" and that this
-- provider has none — so the photos are curated, from Wikimedia Commons, and they need a home
-- that the sync cannot touch.
--
-- THESE ARE EDITORIAL COLUMNS, in the sense §24.0 rule 3 gives the word: "curated content wins
-- over synced content, as a layer rather than an edit." They sit beside `slug`, `display_order`
-- and `is_booked` rather than beside the provider columns. Nothing enforces that at the
-- database level and nothing needs to — PostgREST builds an upsert's DO UPDATE SET from the
-- keys actually present in the payload, so a column the mapper omits keeps its stored value on
-- conflict (the mechanism 20260909001124:103-107 documents for first_seen_at). `mapShip`
-- (_shared/cruise/map.ts:220-231) omits all four, and supabase/tests/constraints_cruise_fleet.sql
-- asserts that a sync-shaped write leaves them alone. If a future mapper adds them, that test
-- is what fails.

ALTER TABLE public.cruise_ship
    ADD COLUMN image_url        text,
    ADD COLUMN image_credit     text,
    ADD COLUMN image_license    text,
    ADD COLUMN image_source_url text,

    -- THE FIRST URL-SHAPE CHECK IN THIS SCHEMA, and the reason it belongs here and nowhere
    -- else: every other URL column holds something a feed sent us, where a CHECK would turn a
    -- bad upstream row into a failed sync. This one holds something WE write, once, by
    -- migration — so the constraint can be exact, and the cost of it being wrong is a failed
    -- deploy rather than a broken catalog.
    --
    -- What it is actually guarding. web/next.config.ts registers a CUSTOM next/image loader,
    -- which means `remotePatterns` is never consulted and any URL stored here would be fetched
    -- by a visitor's browser from whatever origin it names. _shared/hotels/map.ts:36-44 makes
    -- the same argument for hotel photography and keeps an allow-list in two places for it.
    -- Ship photos arrive by migration rather than over the wire, so the earlier of those two
    -- places is the column itself.
    --
    -- It also permanently forecloses the mistake this feature started from: the source CSV's
    -- "Image URL" column was 153 Google Images SEARCH links, and a search link stored here
    -- renders as a broken image on every card.
    ADD CONSTRAINT cruise_ship_image_host
        CHECK (image_url IS NULL OR image_url ~ '^https://upload\.wikimedia\.org/'),

    -- Attribution is not optional, so the pair is all-or-nothing — the same shape, and the
    -- same reasoning, as the (provider, provider_key) CHECK three lines up in the original
    -- table: half a pair is a row that cannot be reconciled with where it came from. Here the
    -- consequence is a licence breach rather than a confused upsert. CC BY and CC BY-SA both
    -- require credit; an image with none must not be storable.
    ADD CONSTRAINT cruise_ship_image_attributed
        CHECK ((image_url IS NULL) = (image_credit IS NULL));

COMMENT ON COLUMN public.cruise_ship.image_url IS
    'Direct upload.wikimedia.org URL for the ship''s photo. Curated, never synced. Pinned to '
    'that host by CHECK because next.config.ts uses a custom image loader, so remotePatterns '
    'is never consulted and this column is the only thing deciding where a visitor''s browser '
    'is sent. Null is normal — 2025-26 newbuilds often have no Commons photo yet.';

COMMENT ON COLUMN public.cruise_ship.image_credit IS
    'Rendered attribution line, e.g. "Jane Doe / Wikimedia Commons, CC BY-SA 4.0". Required '
    'whenever image_url is set, and enforced. MUST be displayed wherever the image is: for '
    'photographs the CC obligation is credit plus a licence notice, and share-alike binds '
    'derivatives of the photo rather than the page carrying it.';

COMMENT ON COLUMN public.cruise_ship.image_license IS
    'Commons'' LicenseShortName for the photo — "CC BY-SA 4.0", "CC BY 2.0", "Public domain". '
    'Text, not an enum, for the same reason the provider vocabularies are text: it is someone '
    'else''s list and it grows without asking us.';

COMMENT ON COLUMN public.cruise_ship.image_source_url IS
    'The Commons file page. Attribution without a path back to the source is weak attribution, '
    'and this is what a credit line should link to.';
