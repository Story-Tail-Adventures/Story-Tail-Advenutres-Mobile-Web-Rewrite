package service

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/url"
)

// GoTrue admin calls (auth-js's auth.admin), used by account-admin. They run with the
// service key, so each one is a power no visitor holds: the function decides who may cause
// one, and audits it.

// AdminUser is the part of a GoTrue user the functions read.
type AdminUser struct {
	ID               string  `json:"id"`
	Email            string  `json:"email"`
	EmailConfirmedAt *string `json:"email_confirmed_at"`
	BannedUntil      *string `json:"banned_until"`
	LastSignInAt     *string `json:"last_sign_in_at"`
	CreatedAt        string  `json:"created_at"`
}

// UpdateUserByID is `auth.admin.updateUserById(id, attributes)`: PUT /auth/v1/admin/users/{id}.
// attributes is a js.O or a struct ({ ban_duration }, { email_confirm }).
func (c *Client) UpdateUserByID(ctx context.Context, id string, attributes any) (AdminUser, error) {
	b, err := marshal(attributes)
	if err != nil {
		return AdminUser{}, err
	}
	_, _, raw, err := c.do(ctx, http.MethodPut, c.base+"/auth/v1/admin/users/"+url.PathEscape(id), bytes.NewReader(b), jsonHeader())
	if err != nil {
		return AdminUser{}, err
	}
	var u AdminUser
	return u, decode(raw, &u)
}

// GetUserByID is `auth.admin.getUserById(id)`.
func (c *Client) GetUserByID(ctx context.Context, id string) (AdminUser, error) {
	_, _, raw, err := c.do(ctx, http.MethodGet, c.base+"/auth/v1/admin/users/"+url.PathEscape(id), nil, jsonHeader())
	if err != nil {
		return AdminUser{}, err
	}
	var u AdminUser
	return u, decode(raw, &u)
}

// GenerateLinkParams is generateLink's argument: { type, email, options: { redirectTo, data } }.
type GenerateLinkParams struct {
	Type       string // invite, magiclink, recovery, signup
	Email      string
	RedirectTo string
	Data       any // user metadata, a js.O; nil for none
}

// LinkProperties is generateLink's `data.properties`.
type LinkProperties struct {
	ActionLink       string `json:"action_link"`
	EmailOTP         string `json:"email_otp"`
	HashedToken      string `json:"hashed_token"`
	RedirectTo       string `json:"redirect_to"`
	VerificationType string `json:"verification_type"`
}

// GeneratedLink is generateLink's `data`.
type GeneratedLink struct {
	Properties LinkProperties
	User       AdminUser
}

// GenerateLink is `auth.admin.generateLink(params)`: POST /auth/v1/admin/generate_link.
// GoTrue answers with the user and the link fields side by side; auth-js splits them into
// properties and user, and so does this.
func (c *Client) GenerateLink(ctx context.Context, p GenerateLinkParams) (GeneratedLink, error) {
	body := map[string]any{"type": p.Type, "email": p.Email}
	if p.RedirectTo != "" {
		body["redirect_to"] = p.RedirectTo
	}
	if p.Data != nil {
		body["data"] = p.Data
	}
	b, err := json.Marshal(body)
	if err != nil {
		return GeneratedLink{}, err
	}
	_, _, raw, err := c.do(ctx, http.MethodPost, c.base+"/auth/v1/admin/generate_link", bytes.NewReader(b), jsonHeader())
	if err != nil {
		return GeneratedLink{}, err
	}
	var out GeneratedLink
	if err := decode(raw, &out.Properties); err != nil {
		return GeneratedLink{}, err
	}
	return out, decode(raw, &out.User)
}
