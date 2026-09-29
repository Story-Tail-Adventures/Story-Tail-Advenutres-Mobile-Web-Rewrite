#!/usr/bin/env bash
#
# Generate the committed DB types, and refuse to do it against the wrong database.
#
# WHY THIS IS A SCRIPT AND NOT TWO PIPES IN package.json: the files it writes are committed
# and CI regenerates them on a clean runner and fails on any difference. That makes this the
# one command in the repo whose output has to be reproducible on a machine that is not yours,
# and two separate things here are not.
#
# ── 1. THE CLI VERSION, which is not the same everywhere ──────────────────────────────────
#
# `supabase gen types` emits different output per CLI version, and not only cosmetically:
# 2.117.0 DROPS function signatures that 2.116.0 emits. A laptop one minor ahead of the pin
# therefore produces a file CI cannot reproduce, and the diff names generated generic helpers
# rather than anything anybody touched. So the version is pinned here rather than taken from
# whatever `supabase` resolves to, and SUPABASE_CLI_VERSION below is the single copy of it —
# .github/workflows/ci.yml pins the same number for `setup-cli` and its comment points here.
#
# ── 2. THE DATABASE, which is shared and might be someone else's ──────────────────────────
#
# This is the sharper one, and it is why the script exists at all.
#
# The local Supabase stack is ONE set of containers shared by every git worktree on the
# machine. Whichever tree last ran `supabase db reset` owns the schema. So a second session
# working on another branch silently replaces the database this one is about to describe —
# and `gen types` does exactly what it is told: it faithfully documents a schema that exists
# on no branch at all.
#
# That happened, and it cost two CI rounds. Types were committed carrying
# `agent_update_template` and `trip.refund_detail`, neither of which appears in any migration
# on that branch. Every local check passed, because the test suite only asserts about rows it
# can see, and nothing anywhere reads the type file. It surfaced only on a runner with a
# clean database, as 71 deleted lines in a diff about cruise ships.
#
# The failure is SILENT, which is what makes a guard worth having rather than a convention:
# nothing errors, the output is well-formed, and it looks exactly like a correct run.
#
# So the applied migration set is compared against this worktree's migration files, and they
# must match exactly. Twice — BEFORE, so the schema being described is this branch's, and
# AFTER, because a concurrent reset that lands mid-generation would otherwise be committed
# with no trace. The second check is not paranoia; the window is a couple of seconds and a
# `db reset` from another worktree fits inside it comfortably.
#
#   npm run supabase:types
#
# On a mismatch it names the difference and stops. The fix is almost always `supabase db
# reset` from THIS worktree, which is what the error says.
set -euo pipefail

# Not on the default non-interactive PATH, and `supabase` needs docker.
export PATH="$HOME/.orbstack/bin:$PATH"

# Must match .github/workflows/ci.yml's setup-cli pin. Move them together.
SUPABASE_CLI_VERSION="2.116.0"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

# Read the port out of config.toml rather than hardcoding it, so the two cannot disagree.
DB_PORT="$(sed -n '/^\[db\]/,/^\[/p' supabase/config.toml | grep -m1 '^port' | tr -dc '0-9')"
DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:${DB_PORT:-54322}/postgres}"

# Use an installed CLI when it is ALREADY the pinned version, and fall back to npx otherwise.
# CI installs the pin through setup-cli, so this keeps the job from re-downloading a ~30MB
# binary on every run; a laptop on a different version quietly takes the slow, correct path.
if command -v supabase >/dev/null 2>&1 &&
   [ "$(supabase --version 2>/dev/null | head -1 | tr -dc '0-9.')" = "$SUPABASE_CLI_VERSION" ]; then
    gen() { supabase gen types typescript --local; }
else
    gen() { npx --yes "supabase@${SUPABASE_CLI_VERSION}" gen types typescript --local; }
fi

WEB_TYPES="web/types/supabase.ts"
FN_TYPES="supabase/functions/_shared/database.types.ts"

# The version prefix of every migration file in THIS worktree.
expected_migrations() {
    ls -1 supabase/migrations/*.sql 2>/dev/null | sed 's|.*/||; s|_.*||' | sort
}

# What the running database says it has applied.
applied_migrations() {
    psql "$DB_URL" -X -A -t -c \
        'SELECT version FROM supabase_migrations.schema_migrations ORDER BY version' 2>/dev/null
}

assert_stack_is_ours() {
    local when="$1" expected applied
    expected="$(expected_migrations)"
    applied="$(applied_migrations)" || true

    if [ -z "$applied" ]; then
        echo "Cannot read supabase_migrations.schema_migrations at $DB_URL." >&2
        echo "Is the local stack running?  npm run supabase:start" >&2
        exit 1
    fi

    if [ "$expected" != "$applied" ]; then
        echo >&2
        echo "REFUSING TO GENERATE ($when): the database is not serving this worktree." >&2
        echo >&2
        echo "The local Supabase stack is shared by every worktree on this machine, so another" >&2
        echo "session's reset can replace the schema under you. Generating now would commit a" >&2
        echo "description of a database that exists on no branch, and nothing local would catch" >&2
        echo "it — CI would, as an unexplainable diff." >&2
        echo >&2
        echo "  < only in this worktree's migrations/     > only applied in the database" >&2
        diff <(echo "$expected") <(echo "$applied") | grep '^[<>]' >&2 || true
        echo >&2
        echo "Fix: run 'supabase db reset' from THIS worktree, then try again." >&2
        exit 1
    fi
}

assert_stack_is_ours "before generating"

mkdir -p web/types
gen > "$WEB_TYPES"

# Re-read the migration set before the second write rather than after both, so a reset that
# lands between the two files cannot leave the two copies describing different databases.
assert_stack_is_ours "during generation"

cp "$WEB_TYPES" "$FN_TYPES"

echo "Types written from $(expected_migrations | wc -l | tr -d ' ') migrations" \
     "using supabase@${SUPABASE_CLI_VERSION}:"
echo "  $WEB_TYPES"
echo "  $FN_TYPES"
