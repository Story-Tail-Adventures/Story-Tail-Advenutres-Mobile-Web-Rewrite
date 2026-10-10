-- Accent-insensitive cruise search (Data-Model §24.10, Screen 2.0.4 in Cruises mode). P2.
--
-- The cruise_sailing_search migration made the search case-insensitive but not
-- accent-insensitive, and the seeded catalog shows the cost: the Western Caribbean sailing
-- calls at "Roatán, Honduras", so a visitor typing "Roatan" (as most US keyboards will) got
-- nothing back. The same goes for Curaçao, São Tomé, Île de Ré and every other port name the
-- provider spells properly.
--
-- `unaccent` folds both sides: the needle before it is split into words, and every field it is
-- matched against. So "Roatan" finds "Roatán", and "Roatán" still finds it too. It also
-- expands ligatures ("Straße" → "Strasse", "Æro" → "AEro"), which is the right direction for a
-- search box.
--
-- WITH SCHEMA extensions, as pg_net already is, rather than public: Supabase's advisors flag
-- extensions installed in public. `CREATE EXTENSION IF NOT EXISTS` is one of the statements
-- supautils handles the same way locally and hosted, so this does not have the problem the
-- pg_cron COMMENT had (hosted-vs-local privileges, PR #35).
--
-- THE TWO-ARGUMENT FORM, `extensions.unaccent('extensions.unaccent'::regdictionary, ...)`, ON
-- PURPOSE. The function runs with `search_path = ''`, and the one-argument form has to find its
-- dictionary somehow. Recent versions look in the extension's own schema, older ones used the
-- search path. Naming the dictionary outright works on both and leaves nothing to resolve.
--
-- Everything else is unchanged: same signature and return type, so CREATE OR REPLACE keeps
-- the grants. They are re-stated below anyway, so this file says what it leaves behind
-- without anyone having to look at the earlier one.

CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.cruise_sailing_search(
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
      -- everything, which is the right answer to "what is sailing?". The needle is folded
      -- BEFORE the split, so an accented letter can never act as a word boundary.
      AND NOT EXISTS (
          SELECT 1
          FROM regexp_split_to_table(
              lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(needle, ''))),
              '[^[:alnum:]]+'
          ) AS w(word)
          WHERE w.word <> ''
            AND w.word <> ALL (ARRAY['a', 'an', 'and', 'the', 'to', 'of', 'in', 'cruise', 'cruises'])
            AND NOT (
                extensions.unaccent('extensions.unaccent'::regdictionary, s.title)
                    ILIKE '%' || w.word || '%'
                OR EXISTS (
                    SELECT 1 FROM unnest(s.destinations) AS d(name)
                    WHERE extensions.unaccent('extensions.unaccent'::regdictionary, d.name)
                        ILIKE '%' || w.word || '%'
                )
                OR EXISTS (
                    SELECT 1 FROM public.cruise_line AS l
                    WHERE l.id = s.cruise_line_id
                      AND extensions.unaccent('extensions.unaccent'::regdictionary, l.name)
                          ILIKE '%' || w.word || '%'
                )
                OR EXISTS (
                    SELECT 1 FROM public.cruise_ship AS sh
                    WHERE sh.id = s.ship_id
                      AND extensions.unaccent('extensions.unaccent'::regdictionary, sh.name)
                          ILIKE '%' || w.word || '%'
                )
                OR EXISTS (
                    SELECT 1 FROM public.cruise_port_call AS pc
                    WHERE pc.sailing_id = s.id
                      AND extensions.unaccent('extensions.unaccent'::regdictionary, pc.port_name)
                          ILIKE '%' || w.word || '%'
                )
            )
      )
    ORDER BY s.departure_date, s.id
    LIMIT greatest(1, least(coalesce(max_rows, 24), 100));
$$;

COMMENT ON FUNCTION public.cruise_sailing_search(text, date, date, integer, integer, integer) IS
    'Public cruise search (Screen 2.0.4, Cruises mode). Every word of the needle must match the '
    'sailing''s title, a destination, its line, its ship or a port of call, ignoring case and '
    'accents. Upcoming, unarchived sailings only, in departure order. service_role only: called '
    'by the cruise-search Edge Function, never by a client.';

REVOKE ALL ON FUNCTION public.cruise_sailing_search(text, date, date, integer, integer, integer) FROM public;
REVOKE ALL ON FUNCTION public.cruise_sailing_search(text, date, date, integer, integer, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cruise_sailing_search(text, date, date, integer, integer, integer) TO service_role;
