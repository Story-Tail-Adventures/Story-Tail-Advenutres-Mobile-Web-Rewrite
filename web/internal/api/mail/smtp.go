// Package mail sends email over SMTP with the standard library (ruling 15): the Go side of
// _shared/smtp.ts, configured exactly as docs/SMTP-Library-Security-Review.md §5 binds it.
//
//   - Implicit TLS from the first byte on 465, certificates checked against the host name.
//     Never a downgrade, never STARTTLS. The local mail catcher (no login) is the one plain
//     connection allowed; Config.Secure is false only for it (email.ConfigFromEnv decides).
//   - One connection per message, no pool: a dispatcher sends a small batch.
//   - WE BUILD EVERY HEADER. To is a bare address, so a client's chosen name never reaches a
//     header. Any header value with CR or LF is refused before a byte is written.
//   - Nothing is logged here. An error carries the SMTP code and the server's text, which
//     the caller scrubs of addresses and cuts to 200 characters before storing it
//     (Data-Model §12.8 last_error).
//   - Timeouts: 10 seconds to connect and for the greeting, 20 seconds of socket time per
//     exchange after that, as nodemailer was set.
package mail

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/tls"
	"encoding/hex"
	"errors"
	"fmt"
	"mime"
	"mime/quotedprintable"
	"net"
	"net/smtp"
	"net/textproto"
	"strconv"
	"strings"
	"time"
)

// Config is the connection.
type Config struct {
	Host     string
	Port     int
	Secure   bool // implicit TLS (465). False only for the local catcher.
	User     string
	Password string
}

// Header is one extra header, in the order given.
type Header struct{ Name, Value string }

// Message is one email. Every value is ours: constants, ids, and text we built.
type Message struct {
	FromName    string
	FromAddress string
	To          string // a bare address
	ReplyTo     string
	Subject     string
	Text        string
	HTML        string
	MessageID   string // with angle brackets
	InReplyTo   string
	References  string
	Headers     []Header
	// Date is the Date header; zero means now.
	Date time.Time
}

// Error is a refused send: the SMTP reply code (0 when the connection failed before one)
// and the server's text. Code mirrors nodemailer's responseCode, Kind its error code
// ("ECONNECTION", "ETIMEDOUT", "EAUTH", "EENVELOPE", "EMESSAGE").
type Error struct {
	Code int
	Kind string
	Text string
}

func (e *Error) Error() string {
	if e.Code != 0 {
		return strconv.Itoa(e.Code) + " " + e.Text
	}
	return e.Kind + " " + e.Text
}

const (
	connectTimeout = 10 * time.Second
	socketTimeout  = 20 * time.Second
)

// ErrHeader is a header value that could start a new header.
var ErrHeader = errors.New("mail: a header value holds CR or LF")

func headerSafe(values ...string) error {
	for _, v := range values {
		if strings.ContainsAny(v, "\r\n") {
			return ErrHeader
		}
	}
	return nil
}

// Build renders the message as RFC 5322 bytes: multipart/alternative with a quoted-printable
// UTF-8 text part and HTML part.
func Build(m Message) ([]byte, error) {
	vals := []string{m.FromName, m.FromAddress, m.To, m.ReplyTo, m.Subject, m.MessageID, m.InReplyTo, m.References}
	for _, h := range m.Headers {
		vals = append(vals, h.Name, h.Value)
	}
	if err := headerSafe(vals...); err != nil {
		return nil, err
	}
	if m.To == "" || strings.ContainsAny(m.To, " <>,;\"") {
		return nil, errors.New("mail: To must be one bare address")
	}
	date := m.Date
	if date.IsZero() {
		date = time.Now()
	}
	var boundary [12]byte
	_, _ = rand.Read(boundary[:])
	b := "--_sta_" + hex.EncodeToString(boundary[:])

	var out bytes.Buffer
	hdr := func(name, value string) {
		if value != "" {
			out.WriteString(name + ": " + value + "\r\n")
		}
	}
	hdr("From", encodeName(m.FromName)+" <"+m.FromAddress+">")
	hdr("To", m.To)
	hdr("Reply-To", m.ReplyTo)
	hdr("Subject", mime.QEncoding.Encode("utf-8", m.Subject))
	hdr("Message-ID", m.MessageID)
	hdr("In-Reply-To", m.InReplyTo)
	hdr("References", m.References)
	hdr("Date", date.Format(time.RFC1123Z))
	for _, h := range m.Headers {
		hdr(h.Name, h.Value)
	}
	hdr("MIME-Version", "1.0")
	hdr("Content-Type", `multipart/alternative; boundary="`+b+`"`)
	out.WriteString("\r\n")
	part := func(ctype, body string) error {
		out.WriteString("--" + b + "\r\n")
		out.WriteString("Content-Type: " + ctype + "; charset=utf-8\r\n")
		out.WriteString("Content-Transfer-Encoding: quoted-printable\r\n\r\n")
		w := quotedprintable.NewWriter(&out)
		if _, err := w.Write([]byte(strings.ReplaceAll(strings.ReplaceAll(body, "\r\n", "\n"), "\n", "\r\n"))); err != nil {
			return err
		}
		if err := w.Close(); err != nil {
			return err
		}
		out.WriteString("\r\n")
		return nil
	}
	if err := part("text/plain", m.Text); err != nil {
		return nil, err
	}
	if m.HTML != "" {
		if err := part("text/html", m.HTML); err != nil {
			return nil, err
		}
	}
	out.WriteString("--" + b + "--\r\n")
	return out.Bytes(), nil
}

// encodeName quotes a display name: RFC 2047 when it is not plain ASCII, a quoted string
// when it holds specials.
func encodeName(name string) string {
	for _, r := range name {
		if r > 0x7e || r < 0x20 {
			return mime.QEncoding.Encode("utf-8", name)
		}
	}
	if strings.ContainsAny(name, `()<>[]:;@\,."`) {
		return `"` + strings.NewReplacer(`\`, `\\`, `"`, `\"`).Replace(name) + `"`
	}
	return name
}

// Send connects, logs in when there is a login, sends one message and quits. It returns
// the server's final reply text ("250 2.0.0 Ok: queued as ...").
func Send(ctx context.Context, cfg Config, m Message) (string, error) {
	return sendWithHost(ctx, cfg, cfg.Host, m)
}

// sendWithHost dials dialHost but speaks to (and checks TLS and AUTH against) cfg.Host.
// They differ only in tests.
func sendWithHost(ctx context.Context, cfg Config, dialHost string, m Message) (string, error) {
	data, err := Build(m)
	if err != nil {
		return "", &Error{Kind: "EMESSAGE", Text: err.Error()}
	}
	addr := net.JoinHostPort(dialHost, strconv.Itoa(cfg.Port))
	d := &net.Dialer{Timeout: connectTimeout}
	var conn net.Conn
	if cfg.Secure {
		conn, err = (&tls.Dialer{NetDialer: d, Config: &tls.Config{ServerName: cfg.Host, MinVersion: tls.VersionTLS12}}).DialContext(ctx, "tcp", addr)
	} else {
		conn, err = d.DialContext(ctx, "tcp", addr)
	}
	if err != nil {
		return "", &Error{Kind: "ECONNECTION", Text: "could not connect"}
	}
	defer conn.Close()
	_ = conn.SetDeadline(time.Now().Add(connectTimeout))

	c, err := smtp.NewClient(conn, cfg.Host)
	if err != nil {
		return "", asError(err, "ECONNECTION")
	}
	defer c.Close()
	step := func() { _ = conn.SetDeadline(time.Now().Add(socketTimeout)) }

	step()
	if err := c.Hello(helloName(cfg)); err != nil {
		return "", asError(err, "EPROTOCOL")
	}
	if cfg.User != "" {
		step()
		// PlainAuth refuses to send the password unless the connection is TLS (or localhost).
		if err := c.Auth(smtp.PlainAuth("", cfg.User, cfg.Password, cfg.Host)); err != nil {
			return "", asError(err, "EAUTH")
		}
	}
	step()
	if err := c.Mail(m.FromAddress); err != nil {
		return "", asError(err, "EENVELOPE")
	}
	step()
	if err := c.Rcpt(m.To); err != nil {
		return "", asError(err, "EENVELOPE")
	}
	step()
	// DATA by hand so the server's final reply text comes back (smtp.Client.Data drops it).
	id, err := c.Text.Cmd("DATA")
	if err != nil {
		return "", asError(err, "EMESSAGE")
	}
	c.Text.StartResponse(id)
	_, _, err = c.Text.ReadResponse(354)
	c.Text.EndResponse(id)
	if err != nil {
		return "", asError(err, "EMESSAGE")
	}
	w := c.Text.DotWriter()
	if _, err := w.Write(data); err != nil {
		return "", asError(err, "EMESSAGE")
	}
	if err := w.Close(); err != nil {
		return "", asError(err, "EMESSAGE")
	}
	step()
	code, text, err := c.Text.ReadResponse(250)
	if err != nil {
		return "", asError(err, "EMESSAGE")
	}
	_ = c.Quit()
	return strconv.Itoa(code) + " " + text, nil
}

// helloName is what EHLO says: the sending domain, never this machine's name.
func helloName(cfg Config) string {
	if at := strings.LastIndexByte(cfg.User, '@'); at >= 0 {
		return cfg.User[at+1:]
	}
	return "localhost"
}

func asError(err error, kind string) error {
	var tp *textproto.Error
	if errors.As(err, &tp) {
		return &Error{Code: tp.Code, Kind: kind, Text: tp.Msg}
	}
	var ne net.Error
	if errors.As(err, &ne) && ne.Timeout() {
		return &Error{Kind: "ETIMEDOUT", Text: "timed out"}
	}
	return &Error{Kind: kind, Text: fmt.Sprintf("%v", err)}
}
