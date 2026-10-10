-- The public cruise search, as a function (Data-Model §24.10, Screen 2.0.4 in Cruises mode). P2.
--
-- `cruise-search` used to build this filter as a PostgREST `or=(...)` string, and that string
-- could not say what the search needed to say. Measured against the seeded catalog on
-- 2026-10-09, before this migration:
--
--   "Nassau", "Cozumel", "St. Thomas"   0 results — ports were never searched, though every
--                                       card lists them under "Ports of call"
--   "Royal Caribbean"                   0 results — the line and ship were never searched,
--                                       though `SailingQuery.destination` said they were
--   "caribbean"                         3 of 4 — `destinations.cs.{...}` is an exact,
--                                       case-sensitive element match, so lowercase missed
--                                       the sailing whose title lacks the word
--   a `"` or `\` in the box             HTTP 500, which the page renders as "the sailing list
--                                       didn't come back"
--
-- Every one of those reads to a visitor as "cruise search is broken". The fix is to stop
-- assembling a filter grammar out of visitor text: here the needle is a bound parameter, so
-- there is nothing to escape, and Postgres can ILIKE inside an array and across the joins that
-- PostgREST's `or` cannot span.
--
-- HOW THE NEEDLE MATCHES. It is split into words on anything that is not a letter or digit, and
-- EVERY word must appear somewhere on the sailing — title, a destination, the line, the ship,
-- or a port of call — case-insensitively. So "Nassau Bahamas", "Nassau, Bahamas" and
-- "Nassau (Bahamas)" all find the sailing that calls at Nassau, and "Western Caribbean" does
-- not match an Eastern one. Splitting on non-alphanumerics also means no LIKE metacharacter
-- (`%`, `_`, `\`) can reach a pattern, which is why nothing below escapes anything.
--
-- A short list of filler words is dropped first: "bahamas cruise" would otherwise demand the
-- word "cruise" on the sailing, and Royal Caribbean's name does not have it.
--
-- RETURNS SETOF cruise_sailing ON PURPOSE, so `cruise-search` can keep embedding the line and
-- ship through PostgREST (`.rpc(...).select(COLUMNS)`). That means the row type carries
-- `lead_price_cents` and `provider_payload` as far as the Edge Function, exactly as the plain
-- table read did before; the explicit column list there, and `mapSailing` after it, are still
-- what keep them off the page.
--
-- SECURITY INVOKER, and executable by service_role alone — the same posture as the tables it
-- reads. `rls_cruise_catalog.sql` asserts that neither anon nor authenticated can call it.
-- Supabase's default privileges grant EXECUTE on every new public function to both, so the
-- REVOKE below is load-bearing, not tidy-up.

CREATE FUNCTION public.cruise_sailing_search(
    needle      text    DEFAULT NULL,
    depart_from date    DEFAULT NULL,
    depart_to   date    DEFAULT NULL,
    min_nights  integer DEFAULT NULL,
    max_nights  integer DEFAULT NULL,
    max_rows    integer DEFAULT 24
)
RETURNS SETOF public.cruise_sailing
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
    SELECT s.*
    FROM public.cruise_sailing AS s
    WHERE s.archived_at IS NULL
      -- Never a departed sailing, whatever `depart_from` says: it cannot be quoted.
      AND s.departure_date >= greatest(coalesce(depart_from, current_date), current_date)
      AND (depart_to IS NULL OR s.departure_date <= depart_to)
      AND (min_nights IS NULL OR s.duration_nights >= min_nights)
      AND (max_nights IS NULL OR s.duration_nights <= max_nights)
      -- "No word fails to match." An empty or all-filler needle has no words, so it matches
      -- everything, which is the right answer to "what is sailing?".
      AND NOT EXISTS (
          SELECT 1
          FROM regexp_split_to_table(lower(coalesce(needle, '')), '[^[:alnum:]]+') AS w(word)
          WHERE w.word <> ''
            AND w.word <> ALL (ARRAY['a', 'an', 'and', 'the', 'to', 'of', 'in', 'cruise', 'cruises'])
            AND NOT (
                s.title ILIKE '%' || w.word || '%'
                OR EXISTS (
                    SELECT 1 FROM unnest(s.destinations) AS d(name)
                    WHERE d.name ILIKE '%' || w.word || '%'
                )
                OR EXISTS (
                    SELECT 1 FROM public.cruise_line AS l
                    WHERE l.id = s.cruise_line_id AND l.name ILIKE '%' || w.word || '%'
                )
                OR EXISTS (
                    SELECT 1 FROM public.cruise_ship AS sh
                    WHERE sh.id = s.ship_id AND sh.name ILIKE '%' || w.word || '%'
                )
                OR EXISTS (
                    SELECT 1 FROM public.cruise_port_call AS pc
                    WHERE pc.sailing_id = s.id AND pc.port_name ILIKE '%' || w.word || '%'
                )
            )
      )
    ORDER BY s.departure_date, s.id
    LIMIT greatest(1, least(coalesce(max_rows, 24), 100));
$$;

COMMENT ON FUNCTION public.cruise_sailing_search(text, date, date, integer, integer, integer) IS
    'Public cruise search (Screen 2.0.4, Cruises mode). Every word of the needle must match the '
    'sailing''s title, a destination, its line, its ship or a port of call, case-insensitively. '
    'Upcoming, unarchived sailings only, in departure order. service_role only: called by the '
    'cruise-search Edge Function, never by a client.';

REVOKE ALL ON FUNCTION public.cruise_sailing_search(text, date, date, integer, integer, integer) FROM public;
REVOKE ALL ON FUNCTION public.cruise_sailing_search(text, date, date, integer, integer, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cruise_sailing_search(text, date, date, integer, integer, integer) TO service_role;
