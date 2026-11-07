// Package message ports supabase/functions/_shared/message.ts: §3.10's request checks for the
// advisor's messaging, server-free so they are tested on their own. The SQL functions check
// all of this again; these answer in English first, so a malformed request is a 400 with a
// sentence rather than a 500 off a RAISE.
//
// Nothing in message.ts needs the database, the network or the environment; all of it is
// ported. ReadMessageID takes the clock as a parameter where the Deno version read Date.now().
package message

import (
	"regexp"
	"strconv"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
)

// MaxMessageBody is the same ceiling `trip-message` puts on a client's message.
const MaxMessageBody = 8000

// MaxArchive is how many threads one archive moves; `agent_set_conversations_archived`
// refuses more.
const MaxArchive = 100

// ReadMessageBody is readMessageBody: a message body, trimmed, something in it, under the
// ceiling.
func ReadMessageBody(value js.Value) (string, error) {
	body := ""
	if s, ok := value.Str(); ok {
		body = js.Trim(s)
	}
	if body == "" {
		return "", problem.BadRequest("A message needs something in it.")
	}
	if js.Len(body) > MaxMessageBody {
		return "", problem.BadRequest("Keep it under " + thousands(MaxMessageBody) + " characters.")
	}
	return body, nil
}

// The two kinds of ThreadAddress.
const (
	KindThread = "thread"
	KindClient = "client"
)

// ThreadAddress is where a message goes: an existing thread (Kind "thread", ConversationID
// set) or a client (Kind "client", ClientID set, TripID nil when no trip was named).
type ThreadAddress struct {
	Kind           string
	ConversationID string
	ClientID       string
	TripID         *string
}

// ReadThreadAddress is readThreadAddress: an existing thread, OR a client (and, optionally,
// one of their trips). Never both: a thread id from one client sent beside another client's
// id would put the message somewhere the caller did not name.
func ReadThreadAddress(payload js.Value) (ThreadAddress, error) {
	conversationID := payload.Get("conversationId")
	clientID := payload.Get("clientId")
	tripID := payload.Get("tripId")
	if !conversationID.IsNullish() {
		id, ok := uuidString(conversationID)
		if !ok {
			return ThreadAddress{}, problem.BadRequest("That is not a thread id.")
		}
		if !clientID.IsNullish() || !tripID.IsNullish() {
			return ThreadAddress{}, problem.BadRequest("Send a thread, or a client and trip, not both.")
		}
		return ThreadAddress{Kind: KindThread, ConversationID: id}, nil
	}
	client, ok := uuidString(clientID)
	if !ok {
		return ThreadAddress{}, problem.BadRequest("Say which thread or which client this is for.")
	}
	var trip *string
	if !tripID.IsNullish() {
		id, ok := uuidString(tripID)
		if !ok {
			return ThreadAddress{}, problem.BadRequest("That is not a trip id.")
		}
		trip = &id
	}
	return ThreadAddress{Kind: KindClient, ClientID: client, TripID: trip}, nil
}

// ReadMessageID is readMessageId: the id the caller minted for its message, REQUIRED as
// `trip-message` requires it. Minting it once per draft is what makes a double click or a
// retry land once, the repeat refused as already sent. A recent v7 (Data-Model §21.6),
// judged against now.
func ReadMessageID(value js.Value, now time.Time) (string, error) {
	id, ok := value.Str()
	if !ok {
		return "", problem.BadRequest("Send the message with its id.")
	}
	if err := uuid.CheckRecent(id, now); err != nil {
		return "", problem.BadRequest("That message is out of date. Copy it and send it again.")
	}
	return id, nil
}

// ReadInternalNote is readInternalNote: whether a send is an internal note. REQUIRED, never
// defaulted: a missing flag read as "public" would send a private note to the client.
func ReadInternalNote(value js.Value) (bool, error) {
	b, ok := value.Bool()
	if !ok {
		return false, problem.BadRequest("internalNote must be true or false.")
	}
	return b, nil
}

// timestamp is an ISO 8601 timestamp with a zone, as PostgREST writes timestamptz. The
// submatches feed parses, which stands in for the Deno version's Date.parse check.
var timestamp = regexp.MustCompile(`^(\d{4})-(\d{2})-(\d{2})([T ])(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-](\d{2})(?:(:?)(\d{2}))?)$`)

// ReadSeenUpTo is readSeenUpTo: the created_at of the newest message the caller had on
// screen. Reading (or writing in) a thread clears only what that covers. It is passed
// through AS TEXT, never through a time.Time, which would keep less than the microseconds
// Postgres compares on: the newest message would then look newer than itself and stay
// unread. Nil when absent and not required.
func ReadSeenUpTo(value js.Value, required bool) (*string, error) {
	if value.IsNullish() {
		if required {
			return nil, problem.BadRequest("Say which message was the newest on screen.")
		}
		return nil, nil
	}
	s, ok := value.Str()
	if !ok {
		return nil, problem.BadRequest("seenUpTo must be a timestamp.")
	}
	m := timestamp.FindStringSubmatch(s)
	if m == nil || !parses(m) {
		return nil, problem.BadRequest("seenUpTo must be a timestamp.")
	}
	return &s, nil
}

// parses answers `!Number.isNaN(Date.parse(value))` for a string the timestamp pattern
// already matched. V8 reads the "T" form with its ISO parser and the space form with its
// legacy one, and they disagree on the zone. The rules below were derived from Deno 2.9.6 and
// checked against it over every combination of month 00-13, day 00-99, hour, minute and
// second 00-99, eleven fractions and 141 zones, in both forms (171,864,000 strings, no
// difference):
//   - month 01-12 and day 01-31 (a day past the month's end rolls over, so it parses);
//   - hour 00-23, minute 00-59, second 00-59, or exactly 24:00:00, whose fraction must be all
//     zeros in the "T" form and zero to the millisecond in the space form;
//   - "Z" always; "+HH" only in the space form; "+HHMM" and "+HH:MM" in the "T" form only up
//     to 23:59; in the space form "+HHMM" always and "+HH:MM" when the minutes are 00-59.
func parses(m []string) bool {
	month, day := atoi(m[2]), atoi(m[3])
	if month < 1 || month > 12 || day < 1 || day > 31 {
		return false
	}
	isoForm := m[4] == "T"
	hour, minute, second, fraction := atoi(m[5]), atoi(m[6]), atoi(m[7]), m[8]
	switch {
	case hour <= 23 && minute <= 59 && second <= 59:
	case hour == 24 && minute == 0 && second == 0:
		digits := fraction
		if !isoForm && len(digits) > 3 {
			digits = digits[:3] // the legacy parser keeps milliseconds only
		}
		for _, d := range digits {
			if d != '0' {
				return false
			}
		}
	default:
		return false
	}
	if m[9] == "Z" {
		return true
	}
	zoneHour, colon, zoneMinute := atoi(m[10]), m[11], m[12]
	if isoForm {
		return zoneMinute != "" && zoneHour <= 23 && atoi(zoneMinute) <= 59
	}
	if zoneMinute == "" || colon == "" {
		return true
	}
	return atoi(zoneMinute) <= 59
}

// ReadConversationIDs is readConversationIds: the threads one archive names, at least one,
// at most MaxArchive, no repeats (compared lower-cased, which is also what comes back).
func ReadConversationIDs(value js.Value) ([]string, error) {
	items, ok := value.Array()
	if !ok || len(items) == 0 {
		return nil, problem.BadRequest("Pick at least one thread.")
	}
	if len(items) > MaxArchive {
		return nil, problem.BadRequest("Archive up to " + strconv.Itoa(MaxArchive) + " at a time.")
	}
	ids := make([]string, 0, len(items))
	seen := make(map[string]bool, len(items))
	for _, item := range items {
		id, ok := uuidString(item)
		if !ok {
			return nil, problem.BadRequest("That is not a thread id.")
		}
		id = js.ToLower(id) // a uuid is ASCII, where Go's lower-casing and JavaScript's agree
		if !seen[id] {
			seen[id] = true
			ids = append(ids, id)
		}
	}
	return ids, nil
}

// uuidString is isUuid: a string shaped like any uuid.
func uuidString(v js.Value) (string, bool) {
	s, ok := v.Str()
	return s, ok && uuid.IsUUID(s)
}

// thousands is n.toLocaleString("en-US") for a non-negative integer: 8000 is "8,000".
func thousands(n int) string {
	s := strconv.Itoa(n)
	for i := len(s) - 3; i > 0; i -= 3 {
		s = s[:i] + "," + s[i:]
	}
	return s
}

func atoi(s string) int {
	n, _ := strconv.Atoi(s)
	return n
}
