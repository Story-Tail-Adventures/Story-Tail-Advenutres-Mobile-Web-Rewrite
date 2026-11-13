package search

import (
	"slices"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/content"
)

// Guest inquiry: "Message Gyasi without an account" and "Continue as guest" (Screen
// Inventory 2.0.5, 2.0.6, 2.0.12; Design-System §2 voice). Ports web/lib/public/inquiry.ts.
//
// SINCE 2026-10-21 THIS IS A FORM, NOT AN EMAIL. BRD §6.5: anyone who asks for a quote is a
// client; anyone who only messages Gyasi without an account is a LEAD (Data-Model §11). The
// link goes to /message with where the visitor came from and what they were viewing.
//
// Only allow-listed values go into the URL: a source from InquirySources, a catalog slug, a
// topic. Never anything a visitor typed, so no personal information rides in a URL. The
// page looks the slug up again and shows only the catalog's name for it.

// InquirySource is the page a guest message started from.
type InquirySource string

// The pages a guest message can start from.
const (
	FromLanding    InquirySource = "landing"
	FromHowItWorks InquirySource = "how-it-works"
	FromAbout      InquirySource = "about"
	FromTopic      InquirySource = "topic"
	FromResults    InquirySource = "results"
	FromDetail     InquirySource = "detail"
	FromJoin       InquirySource = "join"
)

// InquirySources is every source.
var InquirySources = []InquirySource{
	FromLanding, FromHowItWorks, FromAbout, FromTopic, FromResults, FromDetail, FromJoin,
}

// IsInquirySource reports whether value is one of InquirySources.
func IsInquirySource(value string) bool {
	return slices.Contains(InquirySources, InquirySource(value))
}

// InquiryTrip is the catalog trip a guest message is about. Only the slug goes in the link.
type InquiryTrip struct {
	Slug string
	Name string
}

// GuestInquiryContext is where a guest message started and what it is about.
type GuestInquiryContext struct {
	Source InquirySource
	Trip   *InquiryTrip
	// Topic is used only when there is no Trip.
	Topic content.Topic
}

// TopicLabel is how the form names a topic: "About: a Caribbean week".
var TopicLabel = map[content.Topic]string{
	content.Caribbean:  "a Caribbean week",
	content.Cruises:    "a cruise",
	content.Honeymoons: "a honeymoon",
}

// InquiryHref is the link every guest "message" button uses: the 2.0.12 form, carrying
// where the visitor came from.
func InquiryHref(ctx GuestInquiryContext) string {
	var p params
	p.set("from", string(ctx.Source))
	if ctx.Trip != nil {
		p.set("trip", ctx.Trip.Slug)
	} else if ctx.Topic != "" {
		p.set("topic", string(ctx.Topic))
	}
	return "/message?" + p.String()
}
