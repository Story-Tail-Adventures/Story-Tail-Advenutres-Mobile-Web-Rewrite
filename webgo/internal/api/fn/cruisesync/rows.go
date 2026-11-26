package cruisesync

import (
	"slices"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/cruise"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
)

// The mapper rows (internal/domain/cruise) as ordered objects, keys in the order map.ts wrote
// them, so a row can be spread into a write the way `{...mapX(...), id, ...}` did. Built field
// by field rather than through a JSON round trip: the cents stay int64 throughout.

func cruiseLineFields(r cruise.CruiseLineRow) js.Ordered {
	return js.O(
		"slug", r.Slug,
		"name", r.Name,
		"display_order", r.DisplayOrder,
		"is_booked", r.IsBooked,
		"sailing_count", r.SailingCount,
		"ship_count", r.ShipCount,
		"destination_count", r.DestinationCount,
		"earliest_departure", r.EarliestDeparture,
		"latest_departure", r.LatestDeparture,
		"destinations", r.Destinations,
		"locales", r.Locales,
		"provider", r.Provider,
		"provider_key", r.ProviderKey,
	)
}

// shipFields is mapShip's row without `company`, which the callers resolve to cruise_line_id
// and drop (`const { company: _company, ...mapped } = mapShip(ship)`).
func shipFields(r cruise.ShipRow) js.Ordered {
	return js.O(
		"name", r.Name,
		"slug", r.Slug,
		"sailing_count", r.SailingCount,
		"earliest_departure", r.EarliestDeparture,
		"latest_departure", r.LatestDeparture,
		"provider", r.Provider,
		"provider_key", r.ProviderKey,
	)
}

// portFields is mapPort's row: sailing_count only when the caller measured one (an absent
// key leaves the column alone on the upsert; see cruise.PortRow).
func portFields(r cruise.PortRow) js.Ordered {
	o := js.O("name", r.Name, "provider", r.Provider, "provider_key", r.ProviderKey)
	if r.SailingCountSet {
		o = append(o, js.Field{Key: "sailing_count", Value: r.SailingCount})
	}
	return o
}

// sailingFields is mapSailing's row without `company` and `ship_name`, which upsertSailing
// resolves to ids (`const { company, ship_name: shipName, ...row } = mapped`).
func sailingFields(r *cruise.SailingRow) js.Ordered {
	return js.O(
		"provider", r.Provider,
		"provider_key", r.ProviderKey,
		"provider_locale", r.ProviderLocale,
		"title", r.Title,
		"departure_date", r.DepartureDate,
		"duration_nights", r.DurationNights,
		"lead_price_cents", r.LeadPriceCents,
		"currency", r.Currency,
		"lead_price_eur_cents", r.LeadPriceEurCents,
		"destinations", r.Destinations,
		"itinerary_url", r.ItineraryURL,
		"provider_updated_at", r.ProviderUpdatedAt,
	)
}

func portCallFields(c cruise.PortCallRow) js.Ordered {
	return js.O(
		"port_name", c.PortName,
		"sequence", c.Sequence,
		"day", c.Day,
		"arrival_at", c.ArrivalAt,
		"departure_at", c.DepartureAt,
	)
}

func cabinFields(c cruise.CabinPriceRow) js.Ordered {
	return js.O(
		"cabin_code", c.CabinCode,
		"price_cents", c.PriceCents,
		"currency", c.Currency,
		"provider_locale", c.ProviderLocale,
	)
}

// spread is `{...o, k1: v1, k2: v2}`: a key o already has keeps its place and takes the new
// value; a new key goes on the end. o itself is not changed.
func spread(o js.Ordered, kv ...any) js.Ordered {
	out := slices.Clone(o)
	for i := 0; i+1 < len(kv); i += 2 {
		out = out.Set(kv[i].(string), kv[i+1])
	}
	return out
}

// field is `row[key]`: the value and whether the key is there.
func field(o js.Ordered, key string) (any, bool) {
	for _, f := range o {
		if f.Key == key {
			return f.Value, true
		}
	}
	return nil, false
}
