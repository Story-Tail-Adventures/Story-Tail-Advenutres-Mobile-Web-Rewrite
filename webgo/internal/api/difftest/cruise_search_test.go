//go:build difftest

package difftest

import (
	"context"
	"net/http"
	"testing"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
)

// cruise-search: Deno over HTTP with the search token, Go in process (the HTTP door 404s it).
// The catalog is shared, so both worlds read the same rows; one fixture sailing with a ship
// photo and sea days rides beside the seed sailings.
func TestCruiseSearch(t *testing.T) {
	ctx := context.Background()
	tag := Unique()
	lineID, shipID, sailID := uuid.New(), uuid.New(), uuid.New()
	must := func(err error) {
		t.Helper()
		if err != nil {
			t.Fatal(err)
		}
	}
	must(S.DB.From("cruise_line").Insert(ctx, js.O("id", lineID, "slug", "difftest-"+tag, "name", " Difftest Line "+tag+" "), nil))
	must(S.DB.From("cruise_ship").Insert(ctx, js.O("id", shipID, "cruise_line_id", lineID, "name", "Difftest Ship",
		"image_url", "https://upload.wikimedia.org/x.jpg", "image_credit", "A / Wikimedia Commons, CC BY-SA 4.0"), nil))
	must(S.DB.From("cruise_sailing").Insert(ctx, js.O("id", sailID, "cruise_line_id", lineID, "ship_id", shipID,
		"provider", "difftest", "provider_key", tag, "provider_locale", "en", "title", "  Zanzibar <Escape> & Co "+tag,
		"departure_date", "2027-03-01", "duration_nights", 9, "lead_price_cents", 123456, "currency", "USD",
		"destinations", []string{"Zanzibar", "Indian Ocean", "a", "b", "c", "d", "e"}), nil))
	for i, p := range []string{"Mombasa", "At Sea", "Zanzibar", "Zanzibar", " Fun Day At Sea ", "Mombasa"} {
		must(S.DB.From("cruise_port_call").Insert(ctx, js.O("id", uuid.New(), "sailing_id", sailID, "port_name", p, "sequence", i+1), nil))
	}
	t.Cleanup(func() {
		_ = S.DB.From("cruise_port_call").Eq("sailing_id", sailID).Delete(ctx, nil)
		_ = S.DB.From("cruise_sailing").Eq("id", sailID).Delete(ctx, nil)
		_ = S.DB.From("cruise_ship").Eq("id", shipID).Delete(ctx, nil)
		_ = S.DB.From("cruise_line").Eq("id", lineID).Delete(ctx, nil)
	})

	deno, goW := &World{Name: "deno", Agent: &Actor{}, Traveler: &Actor{}}, &World{Name: "go", Agent: &Actor{}, Traveler: &Actor{}}
	anon := func(*World) string { return S.Anon }
	searchToken := func(w *World) http.Header {
		if w.Name == "deno" {
			return http.Header{"X-Sta-Search-Token": {SearchToken}}
		}
		return nil
	}
	c := func(name, body string, expect int) Case {
		return Case{Name: name, Fn: "cruise-search", Via: "call", Token: anon, Header: searchToken,
			Body: func(*World) string { return body }, SkipAudit: true, Expect: expect}
	}
	Run(t, deno, goW, []Case{
		c("everything upcoming", `{}`, 200),
		c("the fixture by a word", `{"destination":"zanzibar"}`, 200),
		c("accents and case", `{"destination":"ZANZÍBAR mombasa"}`, 200),
		c("a date window", `{"from":"2027-02-01","to":"2027-04-01","minNights":8.6,"maxNights":10}`, 200),
		c("limit", `{"limit":2}`, 200),
		c("limit out of range", `{"limit":99,"minNights":0}`, 200),
		c("to before from", `{"from":"2027-04-01","to":"2027-02-01"}`, 400),
		c("an impossible date is ignored", `{"from":"2027-02-30","destination":"zanzibar"}`, 200),
		// A body that is not JSON cannot come through Call (a page passes a Go value), so
		// that branch is pinned by TestParseBody in the cruisesearch package instead.
		c("an array", `[1,2]`, 200),
		c("nothing matches", `{"destination":"atlantis-`+tag+`"}`, 200),
	})

	// GET is refused the same way.
	Run(t, deno, goW, []Case{{Name: "GET", Fn: "cruise-search", Via: "call", Method: "GET", Token: anon,
		Header: searchToken, SkipAudit: true, Expect: 403}})
}
