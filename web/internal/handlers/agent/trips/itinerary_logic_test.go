package trips

import (
	"net/url"
	"testing"
)

// lib/agent/itinerary.ts has no tests of its own in the Next app; these pin its behaviour
// (and the page's suggestedDate and open-form order) as the TS source states it.

func TestBlocks(t *testing.T) {
	want := []string{"", "morning", "afternoon", "evening", "all_day"}
	labels := []string{"Work it out from the time", "Morning", "Afternoon", "Evening", "All day"}
	for i, b := range blocks {
		if b.value != want[i] || b.label != labels[i] {
			t.Errorf("blocks[%d] = %+v", i, b)
		}
	}
	for _, v := range want[1:] {
		if !isBlock(v) {
			t.Errorf("isBlock(%q)", v)
		}
	}
	for _, v := range []string{"", "night", "Morning", "all day"} {
		if isBlock(v) {
			t.Errorf("isBlock(%q) accepted", v)
		}
	}
}

func TestDayFromFormAndValidate(t *testing.T) {
	v := dayFromForm(url.Values{"dayId": {" d1 "}, "date": {"2027-01-13"}, "label": {"  Seven Mile Beach "}, "summary": {"Slow.\r\nThen slower.\r\n"}})
	if v != (dayValues{dayID: "d1", date: "2027-01-13", label: "Seven Mile Beach", summary: "Slow.\nThen slower."}) {
		t.Errorf("dayFromForm = %+v", v)
	}
	if e := validateDay(dayValues{}); e != "A day needs a date." {
		t.Errorf("a new day without a date: %q", e)
	}
	if e := validateDay(dayValues{dayID: "d1"}); e != "" {
		t.Errorf("an edit may leave the date alone: %q", e)
	}
	if e := validateDay(dayValues{date: "2027-01-13"}); e != "" {
		t.Errorf("a new day with a date: %q", e)
	}
}

func TestActivityFromFormAndValidate(t *testing.T) {
	v := activityFromForm(url.Values{"activityId": {"a1"}, "dayId": {"d1"}, "title": {" Catamaran "}, "block": {"evening"},
		"startTime": {"15:00"}, "endTime": {"17:30"}, "body": {"Snorkel\r\nstop"}, "location": {"Booby Cay"},
		"address": {"Negril"}, "phone": {"+1 876"}, "confirmationNumber": {" CAT-9 "}, "gyasisTip": {"Sit at the back."}})
	want := activityValues{activityID: "a1", dayID: "d1", title: "Catamaran", block: "evening", startTime: "15:00",
		endTime: "17:30", body: "Snorkel\nstop", location: "Booby Cay", address: "Negril", phone: "+1 876",
		confirmation: "CAT-9", tip: "Sit at the back."}
	if v != want {
		t.Errorf("activityFromForm = %+v", v)
	}
	// A block the select does not offer is "work it out from the time", not a refusal.
	if b := activityFromForm(url.Values{"block": {"night"}}).block; b != "" {
		t.Errorf("unknown block = %q", b)
	}
	if e := validateActivity(activityValues{title: ""}); e != "Give it a name — it's the line the client reads." {
		t.Errorf("no title: %q", e)
	}
	if e := validateActivity(want); e != "" {
		t.Errorf("a named entry: %q", e)
	}
}

func TestSuggestedDate(t *testing.T) {
	day := func(date string) itineraryDay { return itineraryDay{date: date} }
	cases := []struct {
		days []itineraryDay
		want string
	}{
		{nil, ""},
		{[]itineraryDay{day("")}, ""},
		{[]itineraryDay{day("2027-01-13")}, "2027-01-14"},
		{[]itineraryDay{day("2027-01-15"), day(""), day("2027-01-13")}, "2027-01-16"},
		{[]itineraryDay{day("2026-12-31")}, "2027-01-01"},
		{[]itineraryDay{day("2028-02-28")}, "2028-02-29"},
		{[]itineraryDay{day("not a date")}, ""},
	}
	for _, c := range cases {
		if got := suggestedDate(c.days); got != c.want {
			t.Errorf("suggestedDate(%v) = %q, want %q", c.days, got, c.want)
		}
	}
}

func TestOpenFromQuery(t *testing.T) {
	it := &itinerary{days: []itineraryDay{
		{id: "d1", number: 1, date: "2027-01-13", activities: []itineraryActivity{{id: "a1", title: "Check in", block: "all_day", componentID: "c1"}}},
		{id: "d2", number: 2},
	}}
	open := func(q string) *itineraryView {
		iv := &itineraryView{itin: it}
		v, _ := url.ParseQuery(q)
		openFromQuery(iv, v)
		return iv
	}
	if iv := open("activity=a1&day=d1"); iv.act == nil || iv.act.title != "Check in" || iv.act.block != "all_day" || iv.act.dayID != "d1" || iv.day != nil {
		t.Errorf("?activity= wins, with the stored block: %+v", iv.act)
	}
	if iv := open("activity=gone&day=d1"); iv.act != nil || iv.day != nil {
		t.Error("a gone entry opens nothing, and does not fall through")
	}
	if iv := open("addTo=d2&day=d1"); iv.act == nil || iv.act.dayID != "d2" || iv.act.activityID != "" {
		t.Error("?addTo= a day of this trip")
	}
	if iv := open("addTo=elsewhere&day=d1"); iv.act != nil || iv.day == nil || iv.day.dayID != "d1" {
		t.Error("an ?addTo= that names no day falls through to ?day=")
	}
	if iv := open("day=gone&addDay=1"); iv.day != nil {
		t.Error("a gone day opens nothing")
	}
	if iv := open("addDay=1"); iv.day == nil || iv.day.dayID != "" || iv.day.date != "2027-01-14" {
		t.Errorf("?addDay= suggests the day after the last: %+v", iv.day)
	}
	for q, want := range map[string]string{"generated=some": "some", "generated=nothing": "nothing", "generated=%3Cb%3E": "", "generated=failed": ""} {
		if got := open(q).generated; got != want {
			t.Errorf("%s: receipt %q", q, got)
		}
	}
}
