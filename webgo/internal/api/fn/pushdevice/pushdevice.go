// Package pushdevice ports supabase/functions/push-device: §3.10 Stage 3b, turn a device's
// notifications on or off (Screen Inventory §3.10.7, Data-Model §12.6). Mobile calls it.
//
// `register` is the inbox card's "Turn on": the browser or the phone hands over where it can be
// reached. Advisors only, and an archived advisor is refused, as every agent write is
// (requireAgentId). The SQL keys the device on its address, so the same browser registering
// again refreshes its row, and an address someone else signed out of moves to whoever signed in.
//
// `unregister` is sign-out. It needs only a signed-in caller, not an active advisor: an archived
// advisor signing out must still be able to stop their own notifications. It removes only the
// caller's own row for that address.
//
// Device addresses are identifiers. None is ever returned, logged or quoted in an error; the
// reply is the outcome only.
//
// NO AUDIT ROWS, on the same footing as message templates: push_device holds no client data
// and is not one of Rule 3's sensitive tables. The writes still come through here rather than
// an RPC grant, because the SQL takes the caller's platform user id as trusted input.
package pushdevice

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/edge"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/guard"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/caller"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/push"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
)

// backend is what the function needs from the service client (*service.Client).
type backend interface {
	RPC(ctx context.Context, fn string, args any, out any) error
}

// Func is the function.
func Func(d *edge.Deps, r *http.Request) (*edge.Reply, error) {
	if r.Method != http.MethodPost {
		return nil, problem.BadRequest("Use POST.")
	}
	c, err := edge.RequireUser(d, r)
	if err != nil {
		return nil, err
	}
	payload, err := edge.ReadObject(r, edge.SendJSONObject)
	if err != nil {
		return nil, err
	}
	requireAgent := func() error {
		_, err := guard.RequireAgentID(r.Context(), d.DB, c)
		return err
	}
	return handle(r.Context(), d.DB, c, requireAgent, payload, d.Now())
}

// The sentences.
const (
	sendWithID   = "Send the device with its id."
	outOfDate    = "That page is out of date. Reload it and try again."
	sendPlatform = "Send a platform of web or android."
	sendAddress  = "Send the address to turn off."
	sendOp       = "Send an op of register or unregister."
)

// requireNewID is the device id the browser or phone minted: a recent v7.
func requireNewID(v js.Value, now time.Time) (string, error) {
	s, ok := v.Str()
	if !ok {
		return "", problem.BadRequest(sendWithID)
	}
	if uuid.CheckRecent(s, now) != nil {
		return "", problem.BadRequest(outOfDate)
	}
	return s, nil
}

// bounded is `typeof v === "string" && v.length > 0 && v.length <= 4096`.
func bounded(v js.Value) (string, bool) {
	s, ok := v.Str()
	if !ok {
		return "", false
	}
	n := js.Len(s)
	return s, n > 0 && n <= 4096
}

func handle(ctx context.Context, db backend, c *caller.Context, requireAgent func() error, payload js.Value, now time.Time) (*edge.Reply, error) {
	op, _ := payload.Get("op").Str()
	switch op {
	case "register":
		if err := requireAgent(); err != nil {
			return nil, err
		}
		deviceID, err := requireNewID(payload.Get("deviceId"), now)
		if err != nil {
			return nil, err
		}
		// `readDeviceLabel(...) ?? undefined`: no label leaves the argument out, and the SQL
		// keeps the label the row already had.
		labelText, err := push.ReadDeviceLabel(payload.Get("label"))
		if err != nil {
			return nil, err
		}
		var label any = js.Undef
		if labelText != nil {
			label = *labelText
		}
		var args js.Ordered
		switch platform, _ := payload.Get("platform").Str(); platform {
		case "web":
			sub, err := push.ReadWebSubscription(payload.Get("subscription"))
			if err != nil {
				return nil, err
			}
			args = js.O("p_user_id", c.PlatformUserID, "p_device_id", deviceID, "p_platform", "web",
				"p_web_endpoint", sub.Endpoint, "p_web_p256dh", sub.P256dh, "p_web_auth", sub.Auth, "p_label", label)
		case "android":
			token, err := push.ReadFCMToken(payload.Get("fcmToken"))
			if err != nil {
				return nil, err
			}
			args = js.O("p_user_id", c.PlatformUserID, "p_device_id", deviceID, "p_platform", "android",
				"p_fcm_token", token, "p_label", label)
		default:
			// iOS arrives once Xcode is installed.
			return nil, problem.BadRequest(sendPlatform)
		}
		var data *string
		if err := db.RPC(ctx, "push_register_device", args, &data); err != nil {
			// The id is already some other device's: only a stale or forged page reaches it.
			if strings.Contains(err.Error(), "already in use") {
				return nil, problem.BadRequest(outOfDate)
			}
			return nil, fmt.Errorf("push register failed: %w", err)
		}
		return edge.OK(js.O("outcome", "registered", "deviceId", data))

	case "unregister":
		// A browser names its endpoint; a phone its FCM token. Only the caller's own row goes.
		endpoint, hasEndpoint := bounded(payload.Get("endpoint"))
		fcmToken, hasToken := bounded(payload.Get("fcmToken"))
		if !hasEndpoint && !hasToken {
			return nil, problem.BadRequest(sendAddress)
		}
		args := js.O("p_user_id", c.PlatformUserID)
		if hasEndpoint {
			args = append(args, js.Field{Key: "p_web_endpoint", Value: endpoint})
		}
		if hasToken {
			args = append(args, js.Field{Key: "p_fcm_token", Value: fcmToken})
		}
		var removed int64
		if err := db.RPC(ctx, "push_unregister_device", args, &removed); err != nil {
			return nil, fmt.Errorf("push unregister failed: %w", err)
		}
		outcome := "not_found"
		if removed != 0 {
			outcome = "unregistered"
		}
		return edge.OK(js.O("outcome", outcome))

	default:
		return nil, problem.BadRequest(sendOp)
	}
}
