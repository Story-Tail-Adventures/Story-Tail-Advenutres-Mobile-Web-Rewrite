package money

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"slices"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/handlers/agent/agentread"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/session"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/supa"
)

// §3.12's view model, a port of web/lib/agent/settingsView.ts, and its one read.

// settingsRow is agent_settings_self()'s snapshot. Every field is optional: a read made
// before a later migration simply has no key for it, and the defaults below are §3.12's own.
type settingsRow struct {
	Profile *struct {
		DisplayName *string           `json:"displayName"`
		Pronouns    *string           `json:"pronouns"`
		Email       *string           `json:"email"`
		Phone       *string           `json:"phone"`
		Bio         *string           `json:"bio"`
		AvatarURL   *string           `json:"avatarUrl"`
		SocialLinks map[string]string `json:"socialLinks"`
	} `json:"profile"`
	Availability *struct {
		TimeZone          *string         `json:"timeZone"`
		WeeklySchedule    json.RawMessage `json:"weeklySchedule"`
		ResponseTimeHours *int            `json:"responseTimeHours"`
	} `json:"availability"`
	Notifications *struct {
		ClientMessages *channelPair `json:"clientMessages"`
		QuoteRequests  *channelPair `json:"quoteRequests"`
	} `json:"notifications"`
	Signature *struct {
		Text      *string `json:"text"`
		IsDefault *bool   `json:"isDefault"`
	} `json:"signature"`
	Today   *string `json:"today"`
	TimeOff []struct {
		ID               string  `json:"id"`
		StartsOn         string  `json:"startsOn"`
		EndsOn           string  `json:"endsOn"`
		Label            *string `json:"label"`
		AutoReplyEnabled *bool   `json:"autoReplyEnabled"`
		AutoReplyText    *string `json:"autoReplyText"`
	} `json:"timeOff"`
}

type channelPair struct {
	Push  *bool `json:"push"`
	Email *bool `json:"email"`
}

// profileView is §3.12.1's.
type profileView struct {
	DisplayName string
	Pronouns    string
	Email       string
	Phone       string
	Bio         string
	// AvatarURL is already on the Supabase origin, or "" for no photo.
	AvatarURL   string
	SocialLinks map[string]string
}

// timeOffView is one block of time away.
type timeOffView struct {
	ID               string
	StartsOn         string
	EndsOn           string
	Label            string
	AutoReplyEnabled bool
	AutoReplyText    string
}

type notificationsView struct {
	ClientMessagesPush  bool
	ClientMessagesEmail bool
	QuoteRequestsPush   bool
	QuoteRequestsEmail  bool
}

type signatureView struct {
	Text string
	// IsDefault: nothing is stored, so a better default later still reaches this advisor.
	IsDefault bool
}

type availabilityView struct {
	TimeZone          string
	WeeklySchedule    weeklySchedule
	ResponseTimeHours int
	Today             string
	TimeOff           []timeOffView
}

type settingsViewModel struct {
	Profile       profileView
	Availability  availabilityView
	Notifications notificationsView
	Signature     signatureView
}

func boolOr(v *bool, fallback bool) bool {
	if v == nil {
		return fallback
	}
	return *v
}

// toSettingsView shapes the snapshot. Every "when it is missing" answer here is §3.12's own
// default, so a read made before a later migration still draws a whole page.
func toSettingsView(row settingsRow, supabaseOrigin, zone string) settingsViewModel {
	var v settingsViewModel

	if p := row.Profile; p != nil {
		v.Profile = profileView{
			DisplayName: str(p.DisplayName),
			Pronouns:    str(p.Pronouns),
			Email:       str(p.Email),
			Phone:       str(p.Phone),
			Bio:         str(p.Bio),
			AvatarURL:   avatarSrc(str(p.AvatarURL), supabaseOrigin),
		}
		v.Profile.SocialLinks = map[string]string{}
		for _, n := range socialNetworks {
			if s := p.SocialLinks[n]; s != "" {
				v.Profile.SocialLinks[n] = s
			}
		}
	} else {
		v.Profile.SocialLinks = map[string]string{}
	}

	v.Availability = availabilityView{
		TimeZone:          defaultZone,
		WeeklySchedule:    defaultWeeklySchedule(),
		ResponseTimeHours: 24,
		Today:             clockDay(zone),
	}
	if a := row.Availability; a != nil {
		if s := str(a.TimeZone); s != "" {
			v.Availability.TimeZone = s
		}
		v.Availability.WeeklySchedule = scheduleFromJSON(a.WeeklySchedule)
		if a.ResponseTimeHours != nil {
			v.Availability.ResponseTimeHours = *a.ResponseTimeHours
		}
	}
	if t := str(row.Today); t != "" {
		v.Availability.Today = t
	}
	for _, t := range row.TimeOff {
		v.Availability.TimeOff = append(v.Availability.TimeOff, timeOffView{
			ID: t.ID, StartsOn: t.StartsOn, EndsOn: t.EndsOn,
			Label:            str(t.Label),
			AutoReplyEnabled: boolOr(t.AutoReplyEnabled, false),
			AutoReplyText:    str(t.AutoReplyText),
		})
	}

	// §3.12.3's defaults, for a read that predates them.
	v.Notifications = notificationsView{ClientMessagesPush: true, QuoteRequestsPush: true, QuoteRequestsEmail: true}
	if n := row.Notifications; n != nil {
		if c := n.ClientMessages; c != nil {
			v.Notifications.ClientMessagesPush = boolOr(c.Push, true)
			v.Notifications.ClientMessagesEmail = boolOr(c.Email, false)
		}
		if q := n.QuoteRequests; q != nil {
			v.Notifications.QuoteRequestsPush = boolOr(q.Push, true)
			v.Notifications.QuoteRequestsEmail = boolOr(q.Email, true)
		}
	}

	v.Signature = signatureView{Text: defaultSignature, IsDefault: true}
	if s := row.Signature; s != nil {
		if s.Text != nil {
			v.Signature.Text = *s.Text
		}
		v.Signature.IsDefault = boolOr(s.IsDefault, true)
	}
	return v
}

// loadSettings is §3.12's one read.
//
// IT DOES NOT GO THROUGH agentread.Call, and this is the only read in the sub-area that
// does not. `agent_settings_self()` RETURNS jsonb — a SCALAR — so PostgREST answers with the
// object itself rather than a one-row array, and agentread's `supa.RPC[[]T]` cannot absorb
// that. The name is still checked against agentread.Names and the failure is logged exactly
// as agentread logs one, so nothing about the read surface is widened here. A shared
// `agentread.One[T]` would be the tidier home for this; it is left for whoever owns that
// package, since three sub-areas share it.
func (a *app) loadSettings(ctx context.Context, v visit, supabaseOrigin string) *settingsViewModel {
	row, err := scalarRead[settingsRow](ctx, a.d.Supa, v.st, "agent_settings_self", a.d.Log)
	if err != nil || row == nil {
		return nil
	}
	out := toSettingsView(*row, supabaseOrigin, v.zoneName)
	return &out
}

// scalarRead runs a named read that answers with ONE jsonb value. nil, nil means the function
// answered null: not an advisor, which is the same "nothing to draw" as a failure here.
func scalarRead[T any](ctx context.Context, sb *supa.Client, st session.State, name string, log *slog.Logger) (*T, error) {
	if !slices.Contains(agentread.Names, name) {
		return nil, fmt.Errorf("money: %q is not a known read", name)
	}
	if !st.SignedIn || st.AccessToken == "" {
		return nil, agentread.ErrUnauthenticated
	}
	raw, err := supa.RPC[json.RawMessage](ctx, sb, st.AccessToken, name, struct{}{})
	if err != nil {
		code := ""
		var se *supa.Error
		if errors.As(err, &se) {
			code = se.Code
		}
		// By name and PostgREST code only, never the message (it can carry the statement).
		log.Warn("agent read failed", "read", name, "code", code)
		return nil, fmt.Errorf("%w: %s", agentread.ErrUnavailable, name)
	}
	if len(raw) == 0 || string(raw) == "null" {
		return nil, nil
	}
	var out T
	if err := json.Unmarshal(raw, &out); err != nil {
		log.Warn("agent read failed", "read", name, "code", "shape")
		return nil, fmt.Errorf("%w: %s", agentread.ErrUnavailable, name)
	}
	return &out, nil
}
