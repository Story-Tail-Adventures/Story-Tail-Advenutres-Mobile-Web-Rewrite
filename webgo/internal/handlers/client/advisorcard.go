package client

import (
	"context"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/supa"
)

// The client's own advisor (§3.12 PR 3), the port of web/lib/client/advisorCard.ts and
// advisorCardLoad.ts.
//
// NULL IS A NORMAL ANSWER. A failed read, or no card at all, leaves every caller on its own
// long-standing fixed words, so a card that cannot be read never empties a page.

// AdvisorCard is what a traveler is shown about Gyasi.
type AdvisorCard struct {
	FirstName   string
	DisplayName string
	Pronouns    string
	Bio         string
	// AvatarURL is absolute, on the Supabase origin the browser uses. Empty means initials:
	// never a stock portrait, which is worse than initials.
	AvatarURL string
	Initials  string
	Links     []AdvisorLink
	// ReplyLabel is "Usually replies within 4 hours".
	ReplyLabel string
	// AwayLabel is "Away until Tuesday, October 20" while a block runs, else empty.
	AwayLabel string
}

// AdvisorLink is one social link, already checked.
type AdvisorLink struct {
	Label string
	Href  string
}

// advisorLinkLabels is ADVISOR_LINK_LABELS, in the order the card draws them.
var advisorLinkLabels = []struct{ key, label string }{
	{"instagram", "Instagram"},
	{"facebook", "Facebook"},
	{"linkedin", "LinkedIn"},
	{"website", "Website"},
}

// advisorCardRow is client_advisor_card()'s row.
type advisorCardRow struct {
	DisplayName       *string           `json:"displayName"`
	FirstName         *string           `json:"firstName"`
	Pronouns          *string           `json:"pronouns"`
	Bio               *string           `json:"bio"`
	AvatarPath        *string           `json:"avatarPath"`
	SocialLinks       map[string]string `json:"socialLinks"`
	ResponseTimeHours *int              `json:"responseTimeHours"`
	AwayUntil         *string           `json:"awayUntil"`
}

// avatarPrefix is the one place an avatar may live. agent.avatar_url holds a PATH in the
// public bucket, never an absolute URL (Data-Model §7.1).
const avatarPrefix = "/storage/v1/object/public/agent-avatars/"

// AvatarSrc puts a stored avatar path on the Supabase origin the browser uses, or returns
// "" for anything that is not one — including an absolute URL somebody wrote into the
// column, which would let a row point a traveler's browser at another host.
func AvatarSrc(path, supabaseOrigin string) string {
	if path == "" || !strings.HasPrefix(path, avatarPrefix) || supabaseOrigin == "" {
		return ""
	}
	base, err := url.Parse(supabaseOrigin)
	if err != nil {
		return ""
	}
	ref, err := url.Parse(path)
	if err != nil || ref.IsAbs() || ref.Host != "" {
		return ""
	}
	return base.ResolveReference(ref).String()
}

// httpsLink is the shape a social link must have. The database only ever holds https links
// (agent_social_links_valid); checked again here so a card can never render a javascript: or
// http: link into a traveler's page.
var httpsLink = regexp.MustCompile(`^https://[^\s<>"]+$`)

// ReplyLabel is the promise clients see (Q13). A day and two days read better than 24 and
// 48 hours.
func ReplyLabel(hours *int) string {
	if hours != nil {
		switch *hours {
		case 2, 4, 12:
			return "Usually replies within " + strconv.Itoa(*hours) + " hours"
		case 48:
			return "Usually replies within 2 days"
		}
	}
	return "Usually replies within a day"
}

// AwayLabel is "Away until Tuesday, October 20": the first day back, read as a calendar
// date. It is a DATE and not an instant, so it is read in UTC and never shifts.
func AwayLabel(firstDayBack string) string {
	d, err := time.Parse(isoDate, firstDayBack)
	if err != nil || len(firstDayBack) != len(isoDate) {
		return ""
	}
	return "Away until " + d.Format("Monday, January 2")
}

// toAdvisorCard shapes the row.
func toAdvisorCard(row advisorCardRow, supabaseOrigin string) AdvisorCard {
	display := strings.TrimSpace(text(row.DisplayName))
	if display == "" {
		display = "Your advisor"
	}
	first := strings.TrimSpace(text(row.FirstName))
	if first == "" {
		first = strings.Fields(display)[0]
	}
	card := AdvisorCard{
		FirstName:   first,
		DisplayName: display,
		Pronouns:    strings.TrimSpace(text(row.Pronouns)),
		Bio:         strings.TrimSpace(text(row.Bio)),
		AvatarURL:   AvatarSrc(text(row.AvatarPath), supabaseOrigin),
		Initials:    initialsOf(display),
		ReplyLabel:  ReplyLabel(row.ResponseTimeHours),
		AwayLabel:   AwayLabel(text(row.AwayUntil)),
	}
	for _, l := range advisorLinkLabels {
		if href, ok := row.SocialLinks[l.key]; ok && httpsLink.MatchString(href) {
			card.Links = append(card.Links, AdvisorLink{Label: l.label, Href: href})
		}
	}
	return card
}

// initialsOf is the first and last initial, upper-cased.
func initialsOf(name string) string {
	parts := strings.Fields(name)
	if len(parts) == 0 {
		return "?"
	}
	out := string([]rune(parts[0])[:1])
	if len(parts) > 1 {
		last := parts[len(parts)-1]
		out += string([]rune(last)[:1])
	}
	return strings.ToUpper(out)
}

// loadAdvisorCard reads client_advisor_card(). Nil on any failure, which every caller reads
// as "keep the fixed words".
func (a *area) loadAdvisorCard(ctx context.Context, token string) *AdvisorCard {
	if a.off {
		return nil
	}
	rows, err := supa.RPC[[]advisorCardRow](ctx, a.Supa, token, "client_advisor_card", nil)
	if err != nil || len(rows) == 0 {
		if err != nil {
			a.Log.Warn("client: advisor card read failed", "err", err)
		}
		return nil
	}
	card := toAdvisorCard(rows[0], a.Config.SupabaseURL)
	return &card
}
