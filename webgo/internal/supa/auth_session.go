package supa

import (
	"context"
	"net/http"
	"net/url"
)

// The email-and-password calls behind Screens 2.1.1 to 2.1.5 and /auth/callback, /auth/confirm.
// Each takes the same arguments supabase-js sent from the Next server, and each failure is an
// *AuthError (see auth_call.go).

// SignIn exchanges an email and password for a session (signInWithPassword). Unlike
// SignInWithPassword in supa.go it keeps GoTrue's error code, which the sign-in screen needs to
// tell "check your email" and "on hold" from "that doesn't match".
func (c *Client) SignIn(ctx context.Context, email, password string, who Caller) (Tokens, error) {
	var s session
	err := c.call(ctx, http.MethodPost, "/token", url.Values{"grant_type": {"password"}}, "",
		passwordGrant{Email: email, Password: password}, who, &s)
	if err != nil {
		return Tokens{}, err
	}
	return s.tokens()
}

type passwordGrant struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// SignUpMetadata is the whole of raw_user_meta_data a sign-up may set. handle_new_user()
// trusts that column, so it is exactly these two names, built from validated fields, and never
// anything else from the form: agent_id in particular would let a self-registering visitor
// attach themselves to any advisor's book of business.
type SignUpMetadata struct {
	FirstName string `json:"first_name"`
	LastName  string `json:"last_name"`
}

// SignUp creates an account (signUp). With email confirmations on (the hosted default) GoTrue
// answers a new address AND an existing one with a user and no session, so a nil *Tokens is
// the normal answer; with them off (local) it signs the visitor in, or refuses a taken address
// with user_already_exists. redirectTo is where the confirmation link lands; p is the PKCE
// flow the link will finish.
func (c *Client) SignUp(ctx context.Context, email, password string, meta SignUpMetadata, redirectTo string, p PKCE, who Caller) (*Tokens, error) {
	var s session
	err := c.call(ctx, http.MethodPost, "/signup", redirect(redirectTo), "", signUpBody{
		Email:               email,
		Password:            password,
		Data:                meta,
		CodeChallenge:       p.Challenge,
		CodeChallengeMethod: PKCEMethod,
	}, who, &s)
	if err != nil {
		return nil, err
	}
	if s.AccessToken == "" {
		return nil, nil // awaiting confirmation (or an address that already has an account)
	}
	t, err := s.tokens()
	if err != nil {
		return nil, err
	}
	return &t, nil
}

type signUpBody struct {
	Email               string         `json:"email"`
	Password            string         `json:"password"`
	Data                SignUpMetadata `json:"data"`
	CodeChallenge       string         `json:"code_challenge"`
	CodeChallengeMethod string         `json:"code_challenge_method"`
}

// Recover mails a password-reset link (resetPasswordForEmail). GoTrue answers an unknown
// address exactly as a known one, which is the point.
func (c *Client) Recover(ctx context.Context, email, redirectTo string, p PKCE, who Caller) error {
	return c.call(ctx, http.MethodPost, "/recover", redirect(redirectTo), "", emailFlow{
		Email:               email,
		CodeChallenge:       p.Challenge,
		CodeChallengeMethod: PKCEMethod,
	}, who, nil)
}

type emailFlow struct {
	Email               string `json:"email"`
	Type                string `json:"type,omitempty"`
	CodeChallenge       string `json:"code_challenge"`
	CodeChallengeMethod string `json:"code_challenge_method"`
}

// ResendSignup mails the sign-up confirmation again (resend, type "signup").
func (c *Client) ResendSignup(ctx context.Context, email, redirectTo string, p PKCE, who Caller) error {
	return c.call(ctx, http.MethodPost, "/resend", redirect(redirectTo), "", emailFlow{
		Email:               email,
		Type:                "signup",
		CodeChallenge:       p.Challenge,
		CodeChallengeMethod: PKCEMethod,
	}, who, nil)
}

// ExchangeCode finishes a PKCE flow (exchangeCodeForSession): the code GoTrue put on the
// callback URL, and the verifier only the browser that started the flow holds.
func (c *Client) ExchangeCode(ctx context.Context, authCode, verifier string, who Caller) (Tokens, error) {
	var s session
	err := c.call(ctx, http.MethodPost, "/token", url.Values{"grant_type": {"pkce"}}, "",
		pkceGrant{AuthCode: authCode, CodeVerifier: verifier}, who, &s)
	if err != nil {
		return Tokens{}, err
	}
	return s.tokens()
}

type pkceGrant struct {
	AuthCode     string `json:"auth_code"`
	CodeVerifier string `json:"code_verifier"`
}

// VerifyTokenHash spends an emailed one-time link (verifyOtp with token_hash) and returns the
// session it opens. Only a person's button press may call this: a GET that did would let a
// mail scanner spend the link first (§3.9, /auth/confirm).
func (c *Client) VerifyTokenHash(ctx context.Context, tokenHash, typ string, who Caller) (Tokens, error) {
	var s session
	err := c.call(ctx, http.MethodPost, "/verify", nil, "", verifyBody{TokenHash: tokenHash, Type: typ}, who, &s)
	if err != nil {
		return Tokens{}, err
	}
	return s.tokens()
}

type verifyBody struct {
	TokenHash string `json:"token_hash"`
	Type      string `json:"type"`
}

// UpdatePassword sets a new password for whoever accessToken belongs to (updateUser). On the
// reset screen that is the recovery session, the only authority for whose password changes.
func (c *Client) UpdatePassword(ctx context.Context, accessToken, password string, who Caller) error {
	return c.call(ctx, http.MethodPut, "/user", nil, accessToken, passwordUpdate{Password: password}, who, nil)
}

type passwordUpdate struct {
	Password string `json:"password"`
}

// UpdateEmail moves the account behind accessToken to a new address (updateUser with email).
// double_confirm_changes mails both addresses.
func (c *Client) UpdateEmail(ctx context.Context, accessToken, email, redirectTo string, p PKCE, who Caller) error {
	return c.call(ctx, http.MethodPut, "/user", redirect(redirectTo), accessToken, emailFlow{
		Email:               email,
		CodeChallenge:       p.Challenge,
		CodeChallengeMethod: PKCEMethod,
	}, who, nil)
}

// UserDetail is the GoTrue user with the fields the auth screens read beyond User's.
type UserDetail struct {
	ID               string   `json:"id"`
	Email            string   `json:"email"`
	EmailConfirmedAt *string  `json:"email_confirmed_at"`
	Factors          []Factor `json:"factors"`
}

// Confirmed reports whether the address has been verified.
func (u UserDetail) Confirmed() bool { return u.EmailConfirmedAt != nil && *u.EmailConfirmedAt != "" }

// CurrentUser asks GoTrue who accessToken belongs to (getUser), with the confirmation state.
func (c *Client) CurrentUser(ctx context.Context, accessToken string, who Caller) (UserDetail, error) {
	var u UserDetail
	if err := c.call(ctx, http.MethodGet, "/user", nil, accessToken, nil, who, &u); err != nil {
		return UserDetail{}, err
	}
	if u.ID == "" {
		return UserDetail{}, &AuthError{Status: http.StatusUnauthorized}
	}
	return u, nil
}

// redirect is the redirect_to query supabase-js adds, or none.
func redirect(to string) url.Values {
	if to == "" {
		return nil
	}
	return url.Values{"redirect_to": {to}}
}
