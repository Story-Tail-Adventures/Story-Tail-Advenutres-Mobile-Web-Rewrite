-- Story-Tail Adventures — Initial schema
--
-- Source of truth: docs/Data-Model.md
-- This migration creates all Phase 1 (MVP) entities, their enums, indexes,
-- and placeholder Row-Level Security policies. Phase 2 entities (Lead,
-- LeadSource, SavedSearch, Favorite, Integration) and Phase 3 entities
-- (AgentInvitation, TripGroup, GroupMember) are added in later migrations.
--
-- After running this migration: `supabase gen types typescript --local > ../web/types/supabase.ts`
-- to refresh the generated TypeScript types.

BEGIN;

-- ============================================================
-- Extensions
-- ============================================================

CREATE EXTENSION IF NOT EXISTS citext;       -- case-insensitive email columns
CREATE EXTENSION IF NOT EXISTS pgcrypto;     -- column-level encryption for sensitive PII
CREATE EXTENSION IF NOT EXISTS pg_trgm;      -- trigram search for client name lookups
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";  -- UUID generation (UUID v7 is generated client-side)

-- ============================================================
-- Enums (see docs/Data-Model.md §17)
-- ============================================================

CREATE TYPE user_role AS ENUM ('client', 'agent', 'admin');
CREATE TYPE auth_provider AS ENUM ('email', 'google', 'apple');
CREATE TYPE mfa_kind AS ENUM ('totp', 'sms', 'backup_codes');
CREATE TYPE auth_event_type AS ENUM (
  'login_attempt', 'login_success', 'login_failure',
  'password_reset_request', 'password_reset_complete',
  'mfa_challenge_issued', 'mfa_challenge_success', 'mfa_challenge_failure',
  'account_locked', 'account_unlocked', 'session_revoked'
);

CREATE TYPE client_status AS ENUM ('active', 'archived', 'merged_into');
CREATE TYPE agent_status AS ENUM ('active', 'inactive', 'archived');

CREATE TYPE travel_doc_kind AS ENUM (
  'passport', 'visa', 'drivers_license', 'nexus', 'globalentry',
  'insurance', 'vaccination', 'other'
);

CREATE TYPE supplier_kind AS ENUM (
  'airline', 'hotel_brand', 'resort', 'cruise_line',
  'tour_operator', 'insurance', 'transfer', 'other'
);

CREATE TYPE supplier_payment_kind AS ENUM ('api', 'portal', 'unknown');

CREATE TYPE trip_type AS ENUM (
  'cruise', 'all_inclusive', 'multi_destination', 'group', 'custom'
);

CREATE TYPE trip_status AS ENUM (
  'inquiry', 'proposal', 'booked', 'in_progress', 'completed', 'cancelled'
);

CREATE TYPE component_kind AS ENUM (
  'flight', 'hotel', 'cruise', 'transfer', 'excursion', 'insurance', 'custom'
);

CREATE TYPE block_kind AS ENUM ('morning', 'afternoon', 'evening', 'all_day');

CREATE TYPE card_status AS ENUM ('active', 'revoked', 'expired', 'failed');
CREATE TYPE card_auth_status AS ENUM ('active', 'revoked', 'expired', 'exhausted');
CREATE TYPE auth_request_status AS ENUM ('pending', 'completed', 'expired', 'cancelled');

CREATE TYPE commission_status AS ENUM (
  'expected', 'invoiced', 'received', 'disputed', 'lost'
);

CREATE TYPE document_kind AS ENUM (
  'passport', 'visa', 'insurance_cert', 'supplier_confirmation',
  'receipt', 'photo', 'csv_import', 'pdf_proposal', 'pdf_itinerary', 'other'
);

-- ============================================================
-- Identity (Data Model §5)
-- ============================================================

CREATE TABLE account (
  id                  uuid PRIMARY KEY,
  email               citext NOT NULL,
  email_verified_at   timestamptz,
  password_hash       text,                       -- managed by Supabase Auth; column kept for completeness
  auth_provider       auth_provider NOT NULL,
  auth_provider_id    text,
  mfa_required        boolean NOT NULL DEFAULT false,
  mfa_enrolled_at     timestamptz,
  locked_at           timestamptz,
  locked_reason       text,
  last_login_at       timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  archived_at         timestamptz
);

CREATE UNIQUE INDEX account_email_active
  ON account (email) WHERE archived_at IS NULL;
CREATE INDEX account_last_login ON account (last_login_at);

CREATE TABLE agent (
  id                    uuid PRIMARY KEY,
  display_name          text NOT NULL,
  pronouns              text,
  email                 citext NOT NULL,
  phone                 text,
  avatar_url            text,
  bio                   text,
  social_links          jsonb NOT NULL DEFAULT '{}'::jsonb,
  time_zone             text NOT NULL DEFAULT 'America/Chicago',
  status                agent_status NOT NULL DEFAULT 'active',
  commission_split_pct  numeric(5,2),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX agent_email_active ON agent (email) WHERE status != 'archived';

CREATE TABLE address (
  id          uuid PRIMARY KEY,
  line1       text NOT NULL,
  line2       text,
  city        text NOT NULL,
  region      text,
  postal_code text,
  country     char(2) NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE client (
  id                      uuid PRIMARY KEY,
  agent_id                uuid NOT NULL REFERENCES agent(id),
  first_name              text NOT NULL,
  last_name               text NOT NULL,
  preferred_name          text,
  email                   citext,
  phone                   text,
  date_of_birth           date,
  mailing_address_id      uuid REFERENCES address(id),
  important_dates         jsonb NOT NULL DEFAULT '[]'::jsonb,
  lifetime_value_cents    bigint NOT NULL DEFAULT 0,
  tags                    text[] NOT NULL DEFAULT '{}',
  status                  client_status NOT NULL DEFAULT 'active',
  merged_into_client_id   uuid REFERENCES client(id),
  notes                   text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  archived_at             timestamptz,
  version                 integer NOT NULL DEFAULT 1
);
CREATE INDEX client_agent_status   ON client (agent_id, status, last_name);
CREATE INDEX client_email          ON client (email) WHERE email IS NOT NULL;
CREATE INDEX client_name_trgm      ON client USING gin ((first_name || ' ' || last_name) gin_trgm_ops);

CREATE TABLE platform_user (
  id           uuid PRIMARY KEY,
  account_id   uuid NOT NULL REFERENCES account(id),
  role         user_role NOT NULL,
  client_id    uuid REFERENCES client(id),
  agent_id     uuid REFERENCES agent(id),
  display_name text NOT NULL,
  avatar_url   text,
  time_zone    text NOT NULL DEFAULT 'America/Chicago',
  locale       text NOT NULL DEFAULT 'en-US',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (role = 'client'  AND client_id IS NOT NULL AND agent_id IS NULL) OR
    (role = 'agent'   AND agent_id  IS NOT NULL AND client_id IS NULL) OR
    (role = 'admin')
  )
);
CREATE UNIQUE INDEX platform_user_account ON platform_user (account_id);
CREATE UNIQUE INDEX platform_user_client  ON platform_user (client_id) WHERE client_id IS NOT NULL;
CREATE UNIQUE INDEX platform_user_agent   ON platform_user (agent_id)  WHERE agent_id  IS NOT NULL;

CREATE TABLE session (
  id              uuid PRIMARY KEY,
  account_id      uuid NOT NULL REFERENCES account(id),
  device_label    text NOT NULL,
  ip_address      inet NOT NULL,
  ip_country      char(2),
  user_agent      text NOT NULL,
  started_at      timestamptz NOT NULL DEFAULT now(),
  last_active_at  timestamptz NOT NULL DEFAULT now(),
  revoked_at      timestamptz,
  expires_at      timestamptz NOT NULL
);
CREATE INDEX session_account_active ON session (account_id, last_active_at DESC);

CREATE TABLE mfa_device (
  id                uuid PRIMARY KEY,
  account_id        uuid NOT NULL REFERENCES account(id),
  kind              mfa_kind NOT NULL,
  label             text NOT NULL,
  secret_encrypted  bytea,
  is_primary        boolean NOT NULL DEFAULT false,
  enrolled_at       timestamptz NOT NULL DEFAULT now(),
  last_used_at      timestamptz,
  revoked_at        timestamptz
);
CREATE INDEX mfa_device_account ON mfa_device (account_id);
CREATE UNIQUE INDEX mfa_device_primary
  ON mfa_device (account_id, is_primary)
  WHERE is_primary AND revoked_at IS NULL;

CREATE TABLE auth_event (
  id               uuid PRIMARY KEY,
  account_id       uuid REFERENCES account(id),
  email_attempted  citext,
  event_type       auth_event_type NOT NULL,
  result           text NOT NULL CHECK (result IN ('success','failure','pending')),
  ip_address       inet NOT NULL,
  user_agent       text NOT NULL,
  failure_reason   text,
  created_at       timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE auth_event IS 'Append-only — no UPDATE, no DELETE except by retention policy.';
CREATE INDEX auth_event_account ON auth_event (account_id, created_at DESC);
CREATE INDEX auth_event_ip      ON auth_event (ip_address, created_at);

-- ============================================================
-- Client domain (Data Model §6)
-- ============================================================

CREATE TABLE travel_preference (
  id                     uuid PRIMARY KEY,
  client_id              uuid NOT NULL UNIQUE REFERENCES client(id),
  preferred_destinations text[] NOT NULL DEFAULT '{}',
  travel_styles          text[] NOT NULL DEFAULT '{}',
  dietary_restrictions   text[] NOT NULL DEFAULT '{}',
  accessibility_needs    text[] NOT NULL DEFAULT '{}',
  loyalty_programs       jsonb NOT NULL DEFAULT '[]'::jsonb,
  budget_band            text,
  favorite_past_trips    text,
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE companion (
  id                          uuid PRIMARY KEY,
  client_id                   uuid NOT NULL REFERENCES client(id),
  first_name                  text NOT NULL,
  last_name                   text NOT NULL,
  relationship                text,
  date_of_birth               date,
  passport_number_encrypted   bytea,
  passport_expiry             date,
  passport_country            char(2),
  frequent_flyer_numbers      jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_invited_to_platform      boolean NOT NULL DEFAULT false,
  linked_client_id            uuid REFERENCES client(id),
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX companion_client ON companion (client_id);

CREATE TABLE client_note (
  id              uuid PRIMARY KEY,
  client_id       uuid NOT NULL REFERENCES client(id),
  author_user_id  uuid NOT NULL REFERENCES platform_user(id),
  body            text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  archived_at     timestamptz
);

-- ============================================================
-- Agent domain (Data Model §7)
-- AgentInvitation is P3 — added in a later migration.
-- ============================================================

CREATE TABLE agent_availability (
  agent_id                                uuid PRIMARY KEY REFERENCES agent(id),
  weekly_schedule                         jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_time_hours                     integer NOT NULL DEFAULT 24,
  time_off_blocks                         jsonb NOT NULL DEFAULT '[]'::jsonb,
  calendar_sync_provider                  text,
  calendar_sync_refresh_token_encrypted   bytea,
  updated_at                              timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- Trip domain (Data Model §8)
-- ============================================================

CREATE TABLE supplier (
  id                          uuid PRIMARY KEY,
  name                        text NOT NULL,
  kind                        supplier_kind NOT NULL,
  payment_method_kind         supplier_payment_kind NOT NULL DEFAULT 'unknown',
  payment_api_endpoint        text,
  payment_portal_url          text,
  default_commission_pct      numeric(5,2),
  commission_payment_terms    text,
  contact_email               text,
  contact_phone               text,
  notes                       text,
  archived_at                 timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX supplier_kind_active ON supplier (kind) WHERE archived_at IS NULL;

CREATE TABLE trip_template (
  id           uuid PRIMARY KEY,
  agent_id     uuid NOT NULL REFERENCES agent(id),
  name         text NOT NULL,
  description  text,
  trip_type    trip_type NOT NULL,
  payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  archived_at  timestamptz
);

CREATE TABLE trip (
  id                      uuid PRIMARY KEY,
  client_id               uuid NOT NULL REFERENCES client(id),
  agent_id                uuid NOT NULL REFERENCES agent(id),
  title                   text NOT NULL,
  trip_type               trip_type NOT NULL,
  status                  trip_status NOT NULL DEFAULT 'inquiry',
  status_changed_at       timestamptz NOT NULL DEFAULT now(),
  start_date              date,
  end_date                date,
  destinations            text[] NOT NULL DEFAULT '{}',
  traveler_count          integer NOT NULL DEFAULT 1,
  traveler_breakdown      jsonb,
  total_value_cents       bigint NOT NULL DEFAULT 0,
  total_paid_cents        bigint NOT NULL DEFAULT 0,
  total_commission_cents  bigint NOT NULL DEFAULT 0,
  currency                char(3) NOT NULL DEFAULT 'USD',
  template_id             uuid REFERENCES trip_template(id),
  -- group_id              uuid REFERENCES trip_group(id),   -- P3: added when TripGroup lands
  cancellation_reason     text,
  refund_status           text,
  notes                   text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  archived_at             timestamptz,
  version                 integer NOT NULL DEFAULT 1,
  CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);
CREATE INDEX trip_agent_status_start ON trip (agent_id, status, start_date);
CREATE INDEX trip_client_start       ON trip (client_id, start_date DESC);
CREATE INDEX trip_status_end         ON trip (status, end_date);

CREATE TABLE trip_component (
  id                  uuid PRIMARY KEY,
  trip_id             uuid NOT NULL REFERENCES trip(id),
  kind                component_kind NOT NULL,
  supplier_id         uuid REFERENCES supplier(id),
  display_name        text NOT NULL,
  start_date          date,
  end_date            date,
  start_time          time,
  end_time            time,
  location            text,
  confirmation_number text,
  cost_cents          bigint NOT NULL DEFAULT 0,
  commission_pct      numeric(5,2),
  commission_cents    bigint NOT NULL DEFAULT 0,
  currency            char(3) NOT NULL DEFAULT 'USD',
  payload             jsonb NOT NULL DEFAULT '{}'::jsonb,
  api_source          text,
  api_reference       text,
  order_index         integer NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  archived_at         timestamptz
);
CREATE INDEX trip_component_trip_order ON trip_component (trip_id, order_index);
CREATE INDEX trip_component_api_ref    ON trip_component (api_reference) WHERE api_reference IS NOT NULL;

CREATE TABLE itinerary (
  id                  uuid PRIMARY KEY,
  trip_id             uuid NOT NULL UNIQUE REFERENCES trip(id),
  cover_image_url     text,
  intro_note          text,
  closing_note        text,
  published_at        timestamptz,
  last_published_at   timestamptz,
  version             integer NOT NULL DEFAULT 1,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE itinerary_day (
  id               uuid PRIMARY KEY,
  itinerary_id     uuid NOT NULL REFERENCES itinerary(id),
  day_number       integer NOT NULL,
  date             date NOT NULL,
  label            text,
  summary          text,
  weather_forecast jsonb
);
CREATE UNIQUE INDEX itinerary_day_idx ON itinerary_day (itinerary_id, day_number);

CREATE TABLE itinerary_activity (
  id                  uuid PRIMARY KEY,
  itinerary_day_id    uuid NOT NULL REFERENCES itinerary_day(id),
  block               block_kind NOT NULL,
  start_time          time,
  end_time            time,
  title               text NOT NULL,
  body                text,
  location            text,
  address             text,
  phone               text,
  confirmation_number text,
  gyasis_tip          text,
  component_id        uuid REFERENCES trip_component(id),
  order_index         integer NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE proposal (
  id                    uuid PRIMARY KEY,
  trip_id               uuid NOT NULL REFERENCES trip(id),
  version_number        integer NOT NULL,
  snapshot              jsonb NOT NULL,
  cover_title           text NOT NULL,
  cover_image_url       text,
  opening_note          text,
  closing_note          text,
  pricing_valid_until   date,
  sent_at               timestamptz,
  viewed_at             timestamptz,
  accepted_at           timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX proposal_trip_version ON proposal (trip_id, version_number);

-- ============================================================
-- Payment domain (Data Model §9)
-- Critical PCI invariant: only Stripe tokens + non-sensitive metadata. NEVER PANs.
-- ============================================================

CREATE TABLE payment_card (
  id                          uuid PRIMARY KEY,
  client_id                   uuid NOT NULL REFERENCES client(id),
  stripe_payment_method_id    text NOT NULL UNIQUE,
  stripe_customer_id          text NOT NULL,
  brand                       text NOT NULL,
  last4                       char(4) NOT NULL,
  exp_month                   smallint NOT NULL CHECK (exp_month BETWEEN 1 AND 12),
  exp_year                    smallint NOT NULL,
  nickname                    text,
  consent_recorded_at         timestamptz NOT NULL,
  status                      card_status NOT NULL DEFAULT 'active',
  revoked_at                  timestamptz,
  revoked_reason              text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE payment_card IS 'Tokenized cards only. NEVER store PAN, CVV, or any portion beyond brand/last4/expiration.';
CREATE INDEX payment_card_client_status ON payment_card (client_id, status);

CREATE TABLE card_authorization (
  id                        uuid PRIMARY KEY,
  payment_card_id           uuid NOT NULL REFERENCES payment_card(id),
  trip_id                   uuid NOT NULL REFERENCES trip(id),
  spending_limit_cents      bigint NOT NULL,
  amount_used_cents         bigint NOT NULL DEFAULT 0,
  expires_at                timestamptz NOT NULL,
  status                    card_auth_status NOT NULL DEFAULT 'active',
  revoked_at                timestamptz,
  revoked_by_user_id        uuid REFERENCES platform_user(id),
  consent_payload           jsonb NOT NULL,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX card_auth_active_per_trip
  ON card_authorization (payment_card_id, trip_id)
  WHERE status = 'active';
CREATE INDEX card_auth_trip ON card_authorization (trip_id, status);

CREATE TABLE authorization_request (
  id                              uuid PRIMARY KEY,
  trip_id                         uuid NOT NULL REFERENCES trip(id),
  client_id                       uuid NOT NULL REFERENCES client(id),
  requesting_agent_id             uuid NOT NULL REFERENCES agent(id),
  proposed_limit_cents            bigint NOT NULL,
  proposed_expiry                 date NOT NULL,
  personal_note                   text,
  token_hash                      text NOT NULL,
  status                          auth_request_status NOT NULL DEFAULT 'pending',
  completed_card_authorization_id uuid REFERENCES card_authorization(id),
  sent_at                         timestamptz NOT NULL DEFAULT now(),
  completed_at                    timestamptz,
  expires_at                      timestamptz NOT NULL
);

CREATE TABLE card_use_event (
  id                       uuid PRIMARY KEY,
  card_authorization_id    uuid NOT NULL REFERENCES card_authorization(id),
  payment_card_id          uuid NOT NULL REFERENCES payment_card(id),
  trip_id                  uuid NOT NULL REFERENCES trip(id),
  agent_user_id            uuid NOT NULL REFERENCES platform_user(id),
  supplier_id              uuid REFERENCES supplier(id),
  supplier_name_snapshot   text NOT NULL,
  amount_cents             bigint NOT NULL,
  currency                 char(3) NOT NULL DEFAULT 'USD',
  reference_number         text,
  justification            text NOT NULL,
  receipt_document_id      uuid,  -- FK added after document table is created below
  client_flag_status       text NOT NULL DEFAULT 'not_flagged',
  client_flagged_at        timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE card_use_event IS 'Append-only — no UPDATE, no DELETE.';
CREATE INDEX card_use_event_auth ON card_use_event (card_authorization_id, created_at DESC);
CREATE INDEX card_use_event_card ON card_use_event (payment_card_id, created_at DESC);
CREATE INDEX card_use_event_trip ON card_use_event (trip_id, created_at DESC);

-- ============================================================
-- Commission domain (Data Model §10)
-- ============================================================

CREATE TABLE commission_import (
  id                    uuid PRIMARY KEY,
  imported_by_user_id   uuid NOT NULL REFERENCES platform_user(id),
  source                text NOT NULL DEFAULT 'inteletravel_csv',
  original_filename     text NOT NULL,
  document_id           uuid,  -- FK added after document table
  total_rows            integer NOT NULL DEFAULT 0,
  matched_rows          integer NOT NULL DEFAULT 0,
  unmatched_rows        integer NOT NULL DEFAULT 0,
  period_start          date,
  period_end            date,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE commission (
  id                         uuid PRIMARY KEY,
  trip_id                    uuid NOT NULL REFERENCES trip(id),
  component_id               uuid REFERENCES trip_component(id),
  agent_id                   uuid NOT NULL REFERENCES agent(id),
  supplier_id                uuid NOT NULL REFERENCES supplier(id),
  gross_booking_cents        bigint NOT NULL,
  commission_pct             numeric(5,2) NOT NULL,
  expected_commission_cents  bigint NOT NULL,
  received_commission_cents  bigint NOT NULL DEFAULT 0,
  payment_terms              text NOT NULL,
  status                     commission_status NOT NULL DEFAULT 'expected',
  received_at                date,
  inteletravel_reference     text,
  import_id                  uuid REFERENCES commission_import(id),
  notes                      text,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX commission_agent_status ON commission (agent_id, status, received_at);
CREATE INDEX commission_trip         ON commission (trip_id);
CREATE INDEX commission_supplier     ON commission (supplier_id, status);

-- ============================================================
-- Communication domain (Data Model §12)
-- ============================================================

CREATE TABLE conversation (
  id                       uuid PRIMARY KEY,
  client_id                uuid NOT NULL REFERENCES client(id),
  agent_id                 uuid NOT NULL REFERENCES agent(id),
  trip_id                  uuid REFERENCES trip(id),
  -- lead_id               uuid REFERENCES lead(id),  -- P2: added when Lead lands
  subject                  text,
  last_message_at          timestamptz NOT NULL DEFAULT now(),
  last_message_preview     text,
  client_unread_count      integer NOT NULL DEFAULT 0,
  agent_unread_count       integer NOT NULL DEFAULT 0,
  archived_at              timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX conversation_agent_last ON conversation (agent_id, last_message_at DESC);
CREATE INDEX conversation_client_last ON conversation (client_id, last_message_at DESC);
CREATE INDEX conversation_trip       ON conversation (trip_id);

CREATE TABLE message (
  id                  uuid PRIMARY KEY,
  conversation_id     uuid NOT NULL REFERENCES conversation(id),
  sender_user_id      uuid NOT NULL REFERENCES platform_user(id),
  sender_role         user_role NOT NULL,
  body                text NOT NULL,
  is_internal_note    boolean NOT NULL DEFAULT false,
  read_by_other_at    timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  archived_at         timestamptz
);
CREATE INDEX message_conversation ON message (conversation_id, created_at);

CREATE TABLE message_template (
  id            uuid PRIMARY KEY,
  agent_id      uuid NOT NULL REFERENCES agent(id),
  category      text NOT NULL,
  name          text NOT NULL,
  subject       text,
  body_markdown text NOT NULL,
  tags          text[] NOT NULL DEFAULT '{}',
  archived_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE notification_preference (
  user_id            uuid PRIMARY KEY REFERENCES platform_user(id),
  channels           jsonb NOT NULL DEFAULT '{}'::jsonb,
  quiet_hours_start  time,
  quiet_hours_end    time,
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- Document domain (Data Model §13)
-- ============================================================

CREATE TABLE document (
  id                uuid PRIMARY KEY,
  owner_user_id     uuid NOT NULL REFERENCES platform_user(id),
  client_id         uuid REFERENCES client(id),
  trip_id           uuid REFERENCES trip(id),
  kind              document_kind NOT NULL,
  filename          text NOT NULL,
  mime_type         text NOT NULL,
  size_bytes        bigint NOT NULL,
  storage_bucket    text NOT NULL,
  storage_key       text NOT NULL,
  checksum_sha256   bytea NOT NULL,
  is_sensitive      boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  archived_at       timestamptz
);
CREATE INDEX document_client   ON document (client_id) WHERE client_id IS NOT NULL;
CREATE INDEX document_trip     ON document (trip_id) WHERE trip_id IS NOT NULL;
CREATE INDEX document_checksum ON document (checksum_sha256);

-- Now add the deferred foreign keys
ALTER TABLE card_use_event
  ADD CONSTRAINT card_use_event_receipt_fk
  FOREIGN KEY (receipt_document_id) REFERENCES document(id);

ALTER TABLE commission_import
  ADD CONSTRAINT commission_import_document_fk
  FOREIGN KEY (document_id) REFERENCES document(id);

CREATE TABLE travel_document (
  id                          uuid PRIMARY KEY,
  client_id                   uuid NOT NULL REFERENCES client(id),
  companion_id                uuid REFERENCES companion(id),
  document_id                 uuid NOT NULL REFERENCES document(id),
  kind                        travel_doc_kind NOT NULL,
  document_number_encrypted   bytea,
  issuing_country             char(2),
  issued_on                   date,
  expires_on                  date,
  notes                       text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  archived_at                 timestamptz
);
CREATE INDEX travel_document_client  ON travel_document (client_id);
CREATE INDEX travel_document_expires ON travel_document (expires_on) WHERE expires_on IS NOT NULL;

-- ============================================================
-- System domain (Data Model §15)
-- ============================================================

CREATE TABLE audit_event (
  id              uuid PRIMARY KEY,
  actor_user_id   uuid REFERENCES platform_user(id),
  actor_role      user_role,
  event_type      text NOT NULL,
  target_entity   text,
  target_id       uuid,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address      inet,
  user_agent      text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE audit_event IS 'Append-only — retained 7 years (10 years for card-related events). Critical for PCI compliance.';
CREATE INDEX audit_event_actor  ON audit_event (actor_user_id, created_at DESC);
CREATE INDEX audit_event_target ON audit_event (target_entity, target_id, created_at DESC);
CREATE INDEX audit_event_type   ON audit_event (event_type, created_at DESC);

CREATE TABLE feature_flag (
  key          text PRIMARY KEY,
  enabled      boolean NOT NULL DEFAULT false,
  targeting    jsonb NOT NULL DEFAULT '{}'::jsonb,
  description  text,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- Row-Level Security policies (placeholders — refine before production)
--
-- Every table below has RLS enabled but currently no policies; this means
-- the service_role can read/write but anonymous and authenticated clients
-- cannot. Edge Functions running with the service_role key still work.
--
-- TODO before production:
--   - Add per-table SELECT/INSERT/UPDATE/DELETE policies based on agent
--     ownership and client ownership (Data Model §19).
--   - Specifically: a client can read their own client/trip/document/etc.
--     rows; an agent can read all rows where agent_id = their agent ID.
--   - Audit events and card use events: agents read those they're the actor
--     for OR where their owned client is the target; clients read those
--     where they're the target.
-- ============================================================

ALTER TABLE account              ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_user        ENABLE ROW LEVEL SECURITY;
ALTER TABLE session              ENABLE ROW LEVEL SECURITY;
ALTER TABLE mfa_device           ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_event           ENABLE ROW LEVEL SECURITY;
ALTER TABLE client               ENABLE ROW LEVEL SECURITY;
ALTER TABLE travel_preference    ENABLE ROW LEVEL SECURITY;
ALTER TABLE companion            ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_note          ENABLE ROW LEVEL SECURITY;
ALTER TABLE address              ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent                ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_availability   ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier             ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_component       ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_template        ENABLE ROW LEVEL SECURITY;
ALTER TABLE itinerary            ENABLE ROW LEVEL SECURITY;
ALTER TABLE itinerary_day        ENABLE ROW LEVEL SECURITY;
ALTER TABLE itinerary_activity   ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposal             ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_card         ENABLE ROW LEVEL SECURITY;
ALTER TABLE card_authorization   ENABLE ROW LEVEL SECURITY;
ALTER TABLE authorization_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE card_use_event       ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission           ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_import    ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation         ENABLE ROW LEVEL SECURITY;
ALTER TABLE message              ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_template     ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preference ENABLE ROW LEVEL SECURITY;
ALTER TABLE document             ENABLE ROW LEVEL SECURITY;
ALTER TABLE travel_document      ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_event          ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_flag         ENABLE ROW LEVEL SECURITY;

-- TODO: add the actual policies in 20260601000000_rls_policies.sql or similar.

COMMIT;
