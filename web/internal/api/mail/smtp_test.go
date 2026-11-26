package mail

import (
	"bufio"
	"context"
	"errors"
	"io"
	"mime"
	"mime/multipart"
	"mime/quotedprintable"
	"net"
	"net/mail"
	"strconv"
	"strings"
	"testing"
	"time"
)

// fakeServer speaks just enough SMTP for one message and records what it got.
type fakeServer struct {
	ln       net.Listener
	got      chan string
	rcptCode int
}

func newFake(t *testing.T, rcptCode int) *fakeServer {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	f := &fakeServer{ln: ln, got: make(chan string, 1), rcptCode: rcptCode}
	t.Cleanup(func() { ln.Close() })
	go f.serve()
	return f
}

func (f *fakeServer) serve() {
	conn, err := f.ln.Accept()
	if err != nil {
		return
	}
	defer conn.Close()
	r := bufio.NewReader(conn)
	say := func(s string) { _, _ = io.WriteString(conn, s+"\r\n") }
	say("220 fake ESMTP")
	var data strings.Builder
	for {
		line, err := r.ReadString('\n')
		if err != nil {
			return
		}
		cmd := strings.ToUpper(strings.TrimSpace(line))
		switch {
		case strings.HasPrefix(cmd, "EHLO"):
			say("250-fake")
			say("250 8BITMIME")
		case strings.HasPrefix(cmd, "MAIL FROM"):
			say("250 ok")
		case strings.HasPrefix(cmd, "RCPT TO"):
			if f.rcptCode != 250 {
				say(strconv.Itoa(f.rcptCode) + " 5.1.1 <bob@example.com>: Recipient address rejected")
				continue
			}
			say("250 ok")
		case cmd == "DATA":
			say("354 go ahead")
			for {
				l, err := r.ReadString('\n')
				if err != nil {
					return
				}
				if l == ".\r\n" {
					break
				}
				data.WriteString(l)
			}
			f.got <- data.String()
			say("250 2.0.0 Ok: queued as ABC123")
		case cmd == "QUIT":
			say("221 bye")
			return
		default:
			say("502 no")
		}
	}
}

func (f *fakeServer) cfg() Config {
	host, port, _ := net.SplitHostPort(f.ln.Addr().String())
	p, _ := strconv.Atoi(port)
	return Config{Host: host, Port: p}
}

func msg() Message {
	return Message{
		FromName: "Gyasi at Story-Tail Adventures", FromAddress: "info@adventures.example.com",
		To: "jordan@example.com", ReplyTo: "info+abc@adventures.example.com",
		Subject: "Gyasi wrote about Lisbon \U000000E0 deux", Text: "Hello Jordan,\nSee you soon. =)",
		HTML: "<p>Hello Jordan</p>", MessageID: "<0190@adventures.example.com>",
		Headers: []Header{{"List-Unsubscribe", "<https://x/u?t=1>"}, {"List-Unsubscribe-Post", "List-Unsubscribe=One-Click"}},
		Date:    time.Date(2026, 11, 6, 12, 0, 0, 0, time.UTC),
	}
}

func TestSendDeliversAReadableMessage(t *testing.T) {
	f := newFake(t, 250)
	reply, err := Send(context.Background(), f.cfg(), msg())
	if err != nil {
		t.Fatal(err)
	}
	if reply != "250 2.0.0 Ok: queued as ABC123" {
		t.Errorf("reply = %q", reply)
	}
	raw := <-f.got
	m, err := mail.ReadMessage(strings.NewReader(raw))
	if err != nil {
		t.Fatal(err)
	}
	dec := new(mime.WordDecoder)
	subj, _ := dec.DecodeHeader(m.Header.Get("Subject"))
	if subj != "Gyasi wrote about Lisbon \U000000E0 deux" || m.Header.Get("To") != "jordan@example.com" ||
		m.Header.Get("List-Unsubscribe-Post") != "List-Unsubscribe=One-Click" || m.Header.Get("Message-Id") != "<0190@adventures.example.com>" {
		t.Errorf("headers = %v (subject %q)", m.Header, subj)
	}
	from, err := mail.ParseAddress(m.Header.Get("From"))
	if err != nil || from.Name != "Gyasi at Story-Tail Adventures" || from.Address != "info@adventures.example.com" {
		t.Errorf("from = %v %v", from, err)
	}
	_, params, _ := mime.ParseMediaType(m.Header.Get("Content-Type"))
	mr := multipart.NewReader(m.Body, params["boundary"])
	p, err := mr.NextPart()
	if err != nil {
		t.Fatal(err)
	}
	body, _ := io.ReadAll(quotedprintable.NewReader(p))
	if string(body) != "Hello Jordan,\r\nSee you soon. =)" {
		t.Errorf("text = %q", body)
	}
}

func TestHeaderInjectionIsRefusedBeforeConnecting(t *testing.T) {
	for _, mutate := range []func(*Message){
		func(m *Message) { m.Subject = "Hi\r\nBcc: everyone@example.com" },
		func(m *Message) { m.FromName = "x\nBcc: y@z" },
		func(m *Message) { m.Headers = append(m.Headers, Header{"X", "a\rb"}) },
		func(m *Message) { m.To = "Jordan <jordan@example.com>" },
	} {
		m := msg()
		mutate(&m)
		_, err := Send(context.Background(), Config{Host: "203.0.113.1", Port: 9}, m)
		var e *Error
		if !errors.As(err, &e) || e.Kind != "EMESSAGE" {
			t.Errorf("%+v: err = %v", m, err)
		}
	}
}

// A refused recipient carries its SMTP code, which decides permanent vs retry.
func TestRefusalCarriesTheCode(t *testing.T) {
	f := newFake(t, 550)
	_, err := Send(context.Background(), f.cfg(), msg())
	var e *Error
	if !errors.As(err, &e) || e.Code != 550 {
		t.Fatalf("err = %#v", err)
	}
}

func TestNoServerIsAConnectionError(t *testing.T) {
	ln, _ := net.Listen("tcp", "127.0.0.1:0")
	addr := ln.Addr().(*net.TCPAddr)
	ln.Close()
	_, err := Send(context.Background(), Config{Host: "127.0.0.1", Port: addr.Port}, msg())
	var e *Error
	if !errors.As(err, &e) || e.Kind != "ECONNECTION" {
		t.Errorf("err = %v", err)
	}
}

// PlainAuth will not send a password over a plain connection to a remote host.
func TestNoPasswordOverPlainText(t *testing.T) {
	f := newFake(t, 250)
	cfg := f.cfg()
	cfg.Host = "localhost.example" // not localhost: net/smtp refuses PLAIN without TLS
	cfg.User, cfg.Password = "info@adventures.example.com", "secret"
	// Dial the fake by IP but name another host: the auth step must refuse.
	_, err := sendVia(f.ln.Addr().String(), cfg)
	if err == nil {
		t.Fatal("password sent over a plain connection")
	}
}

func sendVia(addr string, cfg Config) (string, error) {
	host, port, _ := net.SplitHostPort(addr)
	p, _ := strconv.Atoi(port)
	c := cfg
	c.Port = p
	// Resolve the fake's address under the other name by dialing the IP and keeping the
	// configured name for the SMTP client, as Send does.
	return sendWithHost(context.Background(), c, host, msg())
}
