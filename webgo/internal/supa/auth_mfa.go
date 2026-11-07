package supa

import (
	"context"
	"net/http"
	"regexp"
)

// The MFA calls behind Screens 2.1.6 (setup) and 2.1.7 (challenge). Every one runs as the
// visitor, with their access token. The list of factors needs no call of its own: GetUser
// already returns them (listFactors is getUser in supabase-js too).

// Enrollment is a new, unverified TOTP factor.
type Enrollment struct {
	ID   string `json:"id"`
	Type string `json:"type"`
	TOTP struct {
		// QRCode is raw SVG markup from GoTrue. Never put it in a page as markup. Serve it
		// only for an <img> and with a sandboxing CSP: an SVG opened directly as a document
		// CAN run script, whatever its content type.
		QRCode string `json:"qr_code"`
		Secret string `json:"secret"`
		URI    string `json:"uri"`
	} `json:"totp"`
}

// EnrollTOTP starts a TOTP factor (mfa.enroll). It is a write: GoTrue stores an unverified
// factor every time, and max_enrolled_factors is 10.
func (c *Client) EnrollTOTP(ctx context.Context, accessToken, friendlyName string, who Caller) (Enrollment, error) {
	var e Enrollment
	err := c.call(ctx, http.MethodPost, "/factors", nil, accessToken,
		enrollBody{FriendlyName: friendlyName, FactorType: "totp"}, who, &e)
	if err != nil {
		return Enrollment{}, err
	}
	if e.ID == "" || e.TOTP.Secret == "" {
		return Enrollment{}, &AuthError{Status: http.StatusOK, Retryable: true}
	}
	return e, nil
}

type enrollBody struct {
	FriendlyName string `json:"friendly_name"`
	FactorType   string `json:"factor_type"`
}

// factorPath is a factor's path, or "" when the id is not a UUID. url.PathEscape leaves "."
// and ".." alone, so a non-UUID id could climb out of /factors/ (".." reached GoTrue's /verify
// through Kong when this was tried).
func factorPath(factorID string) string {
	if !uuidShape.MatchString(factorID) {
		return ""
	}
	return "/factors/" + factorID
}

var uuidShape = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

// Unenroll removes a factor (mfa.unenroll).
func (c *Client) Unenroll(ctx context.Context, accessToken, factorID string, who Caller) error {
	path := factorPath(factorID)
	if path == "" {
		return &AuthError{Status: http.StatusBadRequest, Code: "validation_failed"}
	}
	return c.call(ctx, http.MethodDelete, path, nil, accessToken, nil, who, nil)
}

// ChallengeAndVerify answers a factor with a code (mfa.challengeAndVerify) and returns the
// session it raises to aal2. The caller MUST store these tokens: the old ones stay aal1, and a
// browser left holding them is sent back to the challenge forever.
func (c *Client) ChallengeAndVerify(ctx context.Context, accessToken, factorID, code string, who Caller) (Tokens, error) {
	path := factorPath(factorID)
	if path == "" {
		return Tokens{}, &AuthError{Status: http.StatusBadRequest, Code: "validation_failed"}
	}
	var ch struct {
		ID string `json:"id"`
	}
	if err := c.call(ctx, http.MethodPost, path+"/challenge", nil, accessToken, struct{}{}, who, &ch); err != nil {
		return Tokens{}, err
	}
	if ch.ID == "" {
		return Tokens{}, &AuthError{Status: http.StatusOK, Retryable: true}
	}
	var s session
	err := c.call(ctx, http.MethodPost, path+"/verify", nil, accessToken,
		verifyFactor{ChallengeID: ch.ID, Code: code}, who, &s)
	if err != nil {
		return Tokens{}, err
	}
	return s.tokens()
}

type verifyFactor struct {
	ChallengeID string `json:"challenge_id"`
	Code        string `json:"code"`
}
