// Package emailinbound ports supabase/functions/_shared/emailInbound.ts: reading a client's
// reply by email out of the app's IONOS mailbox (§3.10 Stage 4, Data-Model §12.10,
// docs/IMAP-Library-Security-Review.md §3 and §3a). Pure: no network, no database, so CI tests
// every rule. `email-inbox` fetches mail over IMAP and hands the pieces here.
//
// Everything in a mailbox is a stranger's input until two locks agree: a live reply token (in
// the `info+<token>@` address, or found from the email the reply answers) and a sender the SQL
// matches to that token's verified account, vouched for by the receiving server. This package
// finds the token, reads the server's verdict, and reduces the mail to the new words only. It
// never renders HTML.
//
// There is no MIME decoding here, in Deno either: imapflow hands over the header lines and the
// body structure, and `email-inbox` downloads the one part TextPart names (imapflow decodes its
// transfer encoding and charset). That download and decoding is the function port's job.
//
// Two JavaScript details are written out by hand rather than left to Go's defaults:
//
//   - Case-insensitive patterns. JavaScript's /i (no u flag) folds ASCII letters only; Go's (?i)
//     also folds ſ (U+017F) into s and the Kelvin sign (U+212A) into k. So each /i pattern here
//     is written in lower case and matched case-sensitively against asciiLower(text), which
//     lowers A-Z and nothing else and keeps every byte offset.
//   - Lower-casing addresses and domains. js.ToLower turns U+0130 (İ) into a plain "i", where
//     JavaScript writes "i" + U+0307; on a From address that would let a look-alike domain read
//     as a client's real one. lower() writes it as JavaScript does.
package emailinbound

import (
	"crypto/sha256"
	"encoding/hex"
	"regexp"
	"slices"
	"strconv"
	"strings"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
)

// ── Headers ─────────────────────────────────────────────────────────────────

// Header is one raw header line: its name lowercased, its value trimmed.
type Header struct {
	Name  string
	Value string
}

var foldedLine = regexp.MustCompile(`\n[ \t]+`)

// ParseHeaders reads raw header lines as IMAP returns them: unfolded, in ORDER (the topmost
// first), with names lowercased. Order matters: the receiving server prepends its own trace
// headers, so the first Authentication-Results is the one IONOS wrote and any later one came
// with the mail.
func ParseHeaders(raw string) []Header {
	out := []Header{}
	unfolded := foldedLine.ReplaceAllLiteralString(strings.ReplaceAll(raw, "\r\n", "\n"), " ")
	for _, line := range strings.Split(unfolded, "\n") {
		i := strings.Index(line, ":")
		if i <= 0 {
			continue
		}
		out = append(out, Header{Name: lower(js.Trim(line[:i])), Value: js.Trim(line[i+1:])})
	}
	return out
}

func values(headers []Header, name string) []string {
	var out []string
	for _, h := range headers {
		if h.Name == name {
			out = append(out, h.Value)
		}
	}
	return out
}

// ── Addresses and the reply token ───────────────────────────────────────────

var (
	angleAddress = js.Regexp(`<([^<>\s]+@[^<>\s]+)>`, "")
	plainAddress = js.Regexp(`^[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}$`, "")
)

// BareAddress is a bare address out of `Name <addr>` or `addr`, lowercased; ok is false when
// the value is not a string, names no address, or names more than one. Found in review
// (2026-10-16): taking the FIRST <…> let a display name spoof the sender
// (`"<jordan@…>" <attacker@…>` read as Jordan). A From with two @s is refused outright; a real
// client's From has one.
func BareAddress(value js.Value) (string, bool) {
	s, ok := value.Str()
	if !ok {
		return "", false
	}
	return bareAddress(s)
}

func bareAddress(value string) (string, bool) {
	if strings.Count(value, "@") != 1 {
		return "", false
	}
	addr := value
	if angles := angleAddress.FindAllStringSubmatch(value, -1); len(angles) > 0 {
		addr = angles[len(angles)-1][1]
	}
	addr = lower(js.Trim(addr))
	if !plainAddress.MatchString(addr) {
		return "", false
	}
	return addr, true
}

// splitMailbox is `mailbox.toLowerCase().split("@")` read as `[local, domain]`; hasDomain is
// false when the domain would be undefined.
func splitMailbox(mailbox string) (local, domain string, hasDomain bool) {
	parts := strings.Split(lower(mailbox), "@")
	if len(parts) < 2 {
		return parts[0], "", false
	}
	return parts[0], parts[1], true
}

// PlusAddress is the mailbox's own plus address for a token: `info` + `abc…` → `info+abc…@domain`.
func PlusAddress(mailbox, token string) string {
	local, domain, ok := splitMailbox(mailbox)
	if !ok {
		domain = "undefined" // a template literal writes an undefined domain as the word
	}
	return local + "+" + token + "@" + domain
}

var plusToken = regexp.MustCompile(`^([^+@]+)\+([a-z2-7]{26})@(.+)$`)

// ReplyTokenFrom is the reply token from the first recipient shaped `<local>+<token>@<domain>`
// of OUR mailbox. Any other plus address, or a look-alike domain, is not ours. ok is false when
// none matches; the reply may still be matched by the email it answers (OutboxIDFrom).
func ReplyTokenFrom(recipients []string, mailbox string) (string, bool) {
	local, domain, hasDomain := splitMailbox(mailbox)
	for _, r := range recipients {
		addr, ok := bareAddress(r)
		if !ok {
			continue
		}
		// `.` cannot meet a line break here: bareAddress refused any whitespace.
		if m := plusToken.FindStringSubmatch(addr); m != nil && m[1] == local && hasDomain && m[3] == domain {
			return m[2], true
		}
	}
	return "", false
}

const uuidPattern = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"

// ourMessageID is `<(UUID)@([^<>\s]+)>` with the gi flags, matched against asciiLower(value).
var ourMessageID = js.Regexp(`<(`+uuidPattern+`)@([^<>\s]+)>`, "")

// OutboxIDFrom is the outbox id of OUR email that a reply answers: our Message-IDs are
// `<outbox-id@domain>`. In-Reply-To first (the email answered directly), else the LAST of ours
// in References (the most recent in the thread). Ids on any other domain are ignored.
func OutboxIDFrom(headers []Header, mailboxDomain string) (string, bool) {
	domain := lower(mailboxDomain)
	ours := func(value string) []string {
		var out []string
		for _, m := range ourMessageID.FindAllStringSubmatch(asciiLower(value), -1) {
			if lower(m[2]) == domain {
				out = append(out, lower(m[1]))
			}
		}
		return out
	}
	for _, v := range values(headers, "in-reply-to") {
		if found := ours(v); len(found) > 0 {
			return found[len(found)-1], true
		}
	}
	var refs []string
	for _, v := range values(headers, "references") {
		refs = append(refs, ours(v)...)
	}
	if len(refs) > 0 {
		return refs[len(refs)-1], true
	}
	return "", false
}

// RecipientsOf is every recipient address a delivered message names: the server's delivery
// headers, To and Cc.
func RecipientsOf(headers []Header) []string {
	out := []string{}
	for _, name := range []string{"delivered-to", "x-original-to", "to", "cc"} {
		for _, v := range values(headers, name) {
			for _, part := range strings.Split(v, ",") {
				if a, ok := bareAddress(js.Trim(part)); ok {
					out = append(out, a)
				}
			}
		}
	}
	return out
}

// FromOf is the From header's single address (ok false when it names none, or several).
func FromOf(headers []Header) (string, bool) {
	from := values(headers, "from")
	if len(from) != 1 {
		return "", false
	}
	return bareAddress(from[0])
}

// DedupeKey is the key a delivered message is recorded under, so it is handled once. A hash of
// the From address and the message's own Message-ID when it has a usable one: a server that
// re-delivers an email (a retry, a forward loop) gives it a NEW mailbox UID but the same
// Message-ID. Found in testing (2026-10-16): keyed on the UID, one reply delivered twice posted
// twice. Scoped to the sender and case kept (review, 2026-10-16), so another sender reusing an id
// cannot pre-empt a client's reply. Without a Message-ID, the mailbox UID.
func DedupeKey(headers []Header, uidValidity string, uid int64) string {
	ids := values(headers, "message-id")
	if len(ids) == 0 || !usableMessageID(js.Trim(ids[0])) {
		return "imap:" + uidValidity + ":" + strconv.FormatInt(uid, 10)
	}
	id := js.Trim(ids[0])
	from := ""
	if froms := values(headers, "from"); len(froms) > 0 && froms[0] != "" {
		from, _ = bareAddress(froms[0])
	}
	digest := sha256.Sum256([]byte(from + "\n" + id))
	return "mid:" + hex.EncodeToString(digest[:])
}

// usableMessageID is /^<[^<>\s]{3,190}>$/, by hand: the count is UTF-16 units, as the
// JavaScript pattern counts them, where a Go pattern would count runes.
func usableMessageID(id string) bool {
	if len(id) < 2 || id[0] != '<' || id[len(id)-1] != '>' {
		return false
	}
	inner := id[1 : len(id)-1]
	if strings.ContainsFunc(inner, func(r rune) bool { return r == '<' || r == '>' || js.IsSpace(r) }) {
		return false
	}
	n := js.Len(inner)
	return n >= 3 && n <= 190
}

// ── Was the sender vouched for? ─────────────────────────────────────────────

// AuthMethod is one method's result in an Authentication-Results header, with its
// `ptype.property=value` pairs (keys and values lowercased).
type AuthMethod struct {
	Method string
	Result string
	Props  map[string]string
}

// AuthResults is one parsed Authentication-Results header: who wrote it, and each method.
type AuthResults struct {
	AuthservID string
	Methods    []AuthMethod
}

func (a AuthResults) find(name string) (AuthMethod, bool) {
	for _, m := range a.Methods {
		if m.Method == name {
			return m, true
		}
	}
	return AuthMethod{}, false
}

// ParseAuthResults is RFC 8601 parsing, strictly: comments `( … )` and quoted strings are
// removed FIRST, so nothing a sender put in a property value (`smtp.mailfrom="a;dmarc=pass"@evil.com`)
// can read as a result. Then the header splits on `;`: the first piece is the authserv-id (who
// wrote it), each later piece starts with `method=result` and may carry `ptype.property=value`
// pairs. Found in review (2026-10-16): a substring match accepted `dmarc=pass` from inside a
// quoted value.
func ParseAuthResults(value string) AuthResults {
	// Byte by byte where Deno went unit by unit: every character that matters is ASCII, and a
	// skipped or dropped byte of a longer character is dropped either way.
	var clean strings.Builder
	depth := 0
	quoted := false
	for i := 0; i < len(value); i++ {
		c := value[i]
		if quoted {
			if c == '\\' {
				i++
			} else if c == '"' {
				quoted = false
			}
			continue
		}
		if c == '"' && depth == 0 {
			quoted = true
			clean.WriteString(`""`)
			continue
		}
		if c == '(' {
			depth++
			continue
		}
		if c == ')' && depth > 0 {
			depth--
			continue
		}
		if depth == 0 {
			clean.WriteByte(c)
		}
	}
	pieces := strings.Split(clean.String(), ";")
	authservID := ""
	if words := strings.FieldsFunc(js.Trim(pieces[0]), js.IsSpace); len(words) > 0 {
		authservID = lower(words[0])
	}
	methods := []AuthMethod{}
	for _, segment := range pieces[1:] {
		words := strings.FieldsFunc(js.Trim(segment), js.IsSpace)
		first := ""
		if len(words) > 0 {
			first = words[0]
		}
		mr := strings.Split(lower(first), "=")
		method, result := mr[0], ""
		if len(mr) > 1 {
			result = mr[1]
		}
		props := map[string]string{}
		if len(words) > 1 {
			for _, w := range words[1:] {
				if i := strings.Index(w, "="); i > 0 {
					props[lower(w[:i])] = lower(w[i+1:])
				}
			}
		}
		if method != "" && result != "" {
			methods = append(methods, AuthMethod{Method: method, Result: result, Props: props})
		}
	}
	return AuthResults{AuthservID: authservID, Methods: methods}
}

// domainOf is the domain part of an address or a bare domain, lowercased, without a trailing dot.
func domainOf(value string) string {
	v := strings.TrimSuffix(lower(value), ".")
	if i := strings.LastIndex(v, "@"); i >= 0 {
		return v[i+1:]
	}
	return v
}

// SenderVerified reports whether the receiving server vouched for the From address. from and
// authservID are "" for null. Three rules, each from review (2026-10-16):
//
//  1. Only the TOPMOST Authentication-Results counts, and only when its authserv-id is OUR
//     server's (authservID, pinned in settings). A sender can write any number of these
//     headers; if the server added none, the sender's own would otherwise be on top. No pinned
//     id, no matching header: not verified (fail closed).
//  2. dmarc=fail always fails. dmarc=pass passes: DMARC itself checks that SPF or DKIM is
//     aligned with the From domain.
//  3. Without DMARC (none), SPF and DKIM must BOTH pass AND both be for the From address's own
//     domain (smtp.mailfrom, header.d). An attacker's own domain passing proves nothing about
//     someone else's From. strict (the match-by-the-email-it-answers path) accepts DMARC only.
func SenderVerified(headers []Header, from, authservID string, strict bool) bool {
	if from == "" || authservID == "" {
		return false
	}
	tops := values(headers, "authentication-results")
	if len(tops) == 0 || tops[0] == "" {
		return false
	}
	ar := ParseAuthResults(tops[0])
	if ar.AuthservID != lower(authservID) {
		return false
	}

	dmarc, hasDMARC := ar.find("dmarc")
	if hasDMARC && dmarc.Result == "fail" {
		return false
	}
	if hasDMARC && dmarc.Result == "pass" {
		return true
	}
	if strict {
		return false
	}

	fromDomain := domainOf(from)
	dkim := false
	for _, m := range ar.Methods {
		if m.Method == "dkim" && m.Result == "pass" && domainOf(m.Props["header.d"]) == fromDomain {
			dkim = true
			break
		}
	}
	spfAligned := false
	if spf, ok := ar.find("spf"); ok && spf.Result == "pass" {
		// `props["smtp.mailfrom"] ?? props["smtp.helo"]`: an empty mailfrom still wins.
		envelope, has := spf.Props["smtp.mailfrom"]
		if !has {
			envelope = spf.Props["smtp.helo"]
		}
		spfAligned = domainOf(envelope) == fromDomain
	}
	return spfAligned && dkim
}

// ── Automatic answers ───────────────────────────────────────────────────────

// autoSubject is /^\s*(automatic reply|auto(matic)?[- ]?reply|out of (the )?office)\b/i, matched
// against asciiLower(subject).
var autoSubject = js.Regexp(`^\s*(automatic reply|auto(matic)?[- ]?reply|out of (the )?office)\b`, "")

// IsAutoReply reports an out-of-office or other machine answer (RFC 3834's Auto-Submitted, the
// common Precedence and X-Autoreply headers, or an "Automatic reply:" subject). Our own emails
// say Auto-Submitted, so most responders stay quiet; this catches the ones that answer anyway,
// which would otherwise post "I'm away until Monday" into the client's thread as if they wrote it.
func IsAutoReply(headers []Header, subject js.Value) bool {
	if auto := values(headers, "auto-submitted"); len(auto) > 0 && lower(js.Trim(auto[0])) != "no" {
		return true
	}
	if p := values(headers, "precedence"); len(p) > 0 {
		precedence := lower(js.Trim(p[0]))
		if precedence != "" && slices.Contains([]string{"bulk", "junk", "list", "auto_reply"}, precedence) {
			return true
		}
	}
	if len(values(headers, "x-autoreply")) > 0 || len(values(headers, "x-autorespond")) > 0 {
		return true
	}
	s, ok := subject.Str()
	return ok && autoSubject.MatchString(asciiLower(s))
}

// ── The message's parts ─────────────────────────────────────────────────────

// BodyNode is the fields of imapflow's bodyStructure this package reads. Part is nil when the
// node has none (a single-part message's root); the other fields read the same empty or absent.
type BodyNode struct {
	Part                  *string
	Type                  string
	Disposition           string
	DispositionParameters map[string]string
	Parameters            map[string]string
	ID                    string
	ChildNodes            []BodyNode
}

func leaves(node *BodyNode) []*BodyNode {
	if node == nil {
		return nil
	}
	if len(node.ChildNodes) > 0 {
		var out []*BodyNode
		for i := range node.ChildNodes {
			out = append(out, leaves(&node.ChildNodes[i])...)
		}
		return out
	}
	return []*BodyNode{node}
}

func isFile(n *BodyNode) bool {
	disposition := lower(n.Disposition)
	if disposition == "attachment" {
		return true
	}
	if disposition == "inline" && n.ID != "" {
		return false // an image in a signature
	}
	named := n.DispositionParameters["filename"] != "" || n.Parameters["name"] != ""
	return named && !strings.HasPrefix(lower(n.Type), "text/")
}

// CountFiles is the files on the reply, not counting images inlined in a signature. Never
// downloaded.
func CountFiles(structure *BodyNode) int {
	n := 0
	for _, leaf := range leaves(structure) {
		if isFile(leaf) {
			n++
		}
	}
	return n
}

// TextPartRef names the part to read and whether it is HTML.
type TextPartRef struct {
	Part string
	HTML bool
}

// TextPart is the part to read: the first text/plain that is not a file, else the first
// text/html. A single-part message has no part id; IMAP calls its body part "1".
func TextPart(structure *BodyNode) (TextPartRef, bool) {
	var candidates []*BodyNode
	for _, leaf := range leaves(structure) {
		if !isFile(leaf) {
			candidates = append(candidates, leaf)
		}
	}
	partOf := func(n *BodyNode) string {
		if n.Part == nil {
			return "1"
		}
		return *n.Part
	}
	for _, n := range candidates {
		if lower(n.Type) == "text/plain" {
			return TextPartRef{Part: partOf(n), HTML: false}, true
		}
	}
	for _, n := range candidates {
		if lower(n.Type) == "text/html" {
			return TextPartRef{Part: partOf(n), HTML: true}, true
		}
	}
	return TextPartRef{}, false
}

// ── The new words only ───────────────────────────────────────────────────────

// lineChar is JavaScript's `.`: anything but a line terminator.
const lineChar = `[^\n\r\x{2028}\x{2029}]`

// cutAt is the lines that start the quoted history or a signature in the common mail apps,
// matched against asciiLower(line). The Gmail / Apple Mail line is wroteLine, by hand.
var cutAt = []*regexp.Regexp{
	js.Regexp(`^-{2,}\s*original message\s*-{2,}`, ""), // Outlook
	js.Regexp(`^_{10,}\s*$`, ""),                       // Outlook's rule before "From:"
	js.Regexp(`^from:\s`+lineChar+`+`, ""),             // Outlook / Yahoo header block
	regexp.MustCompile(`^sent from my (iphone|ipad|android|galaxy|phone)`),
	regexp.MustCompile(`^get outlook for `),
	regexp.MustCompile(`^-- ?$`), // RFC 3676 signature delimiter
}

// wroteLine is /^On .{4,200}wrote:\s*$/i (Gmail, Apple Mail), by hand: `.{4,200}` counts
// UTF-16 units in JavaScript, and a Go pattern would count runes. Only whitespace may follow
// the final "wrote:", so that occurrence is the one at the end, and the line matches when what
// sits between "On " and it is 4 to 200 units with no line terminator.
func wroteLine(line string) bool {
	u := js.TrimEnd(line)
	if len(u) < len("On ")+len("wrote:") || asciiLower(u[:3]) != "on " || asciiLower(u[len(u)-6:]) != "wrote:" {
		return false
	}
	middle := u[3 : len(u)-6]
	if strings.ContainsAny(middle, "\n\r\U00002028\U00002029") {
		return false
	}
	n := js.Len(middle)
	return n >= 4 && n <= 200
}

func cutsHere(line string) bool {
	if wroteLine(line) {
		return true
	}
	lowered := asciiLower(line)
	for _, re := range cutAt {
		if re.MatchString(lowered) {
			return true
		}
	}
	return false
}

// The /gi patterns of htmlToText, in lower case for asciiLower(html). The first is
// /<(script|style|head)[\s\S]*?<\/\1>/gi: Go has no backreference, so each tag is its own
// alternative, tried in the same order, which finds the same matches.
var (
	hiddenBlock = regexp.MustCompile(`<script(?s:.*?)</script>|<style(?s:.*?)</style>|<head(?s:.*?)</head>`)
	quoteBlock  = regexp.MustCompile(`<blockquote(?s:.*?)</blockquote>`)
	lineBreak   = js.Regexp(`<br\s*/?>`, "")
	blockEnd    = regexp.MustCompile(`</(p|div|li|tr|h[1-6])>`)
	anyTag      = regexp.MustCompile(`<[^>]+>`)
)

// HTMLToText is a crude, safe HTML-to-text for mail with no text part: tags dropped, never
// rendered.
func HTMLToText(html string) string {
	s := replaceFolded(hiddenBlock, html, "")
	s = replaceFolded(quoteBlock, s, "")
	s = replaceFolded(lineBreak, s, "\n")
	s = replaceFolded(blockEnd, s, "\n")
	s = anyTag.ReplaceAllLiteralString(s, "")
	for _, e := range [][2]string{{"&nbsp;", " "}, {"&lt;", "<"}, {"&gt;", ">"}, {"&quot;", `"`}, {"&#39;", "'"}, {"&amp;", "&"}} {
		s = strings.ReplaceAll(s, e[0], e[1])
	}
	return s
}

var blankRun = regexp.MustCompile(`\n{3,}`)

// NewWordsOnly is what the client actually wrote: everything above the first quoted-history or
// signature line, with `>` lines dropped, blank runs collapsed and the ends trimmed. nil is
// null or undefined. The SQL refuses an empty result and anything over the message ceiling.
func NewWordsOnly(text, html *string) string {
	source := ""
	if text != nil && js.Trim(*text) != "" {
		source = *text
	} else if html != nil {
		source = HTMLToText(*html)
	}
	source = strings.ReplaceAll(strings.ReplaceAll(source, "\r\n", "\n"), "\r", "\n")
	kept := []string{}
	for _, line := range strings.Split(source, "\n") {
		if cutsHere(js.Trim(line)) {
			break
		}
		if strings.HasPrefix(js.TrimStart(line), ">") {
			continue
		}
		kept = append(kept, js.TrimEnd(line))
	}
	return js.Trim(blankRun.ReplaceAllLiteralString(strings.Join(kept, "\n"), "\n\n"))
}

// ── JavaScript case rules ───────────────────────────────────────────────────

// asciiLower lowers A-Z only, keeping every byte offset, so a lower-case pattern matched
// against it finds what the /i pattern found in the original (see the package comment).
func asciiLower(s string) string {
	if !strings.ContainsFunc(s, func(r rune) bool { return r >= 'A' && r <= 'Z' }) {
		return s
	}
	b := []byte(s)
	for i, c := range b {
		if c >= 'A' && c <= 'Z' {
			b[i] = c + ('a' - 'A')
		}
	}
	return string(b)
}

// replaceFolded is `s.replace(re /gi, repl)` for a pattern written for asciiLower(s): it finds
// the matches in the lowered copy and replaces the same bytes of the original.
func replaceFolded(re *regexp.Regexp, s, repl string) string {
	matches := re.FindAllStringIndex(asciiLower(s), -1)
	if matches == nil {
		return s
	}
	var b strings.Builder
	at := 0
	for _, m := range matches {
		b.WriteString(s[at:m[0]])
		b.WriteString(repl)
		at = m[1]
	}
	b.WriteString(s[at:])
	return b.String()
}

// lower is toLowerCase. It differs from js.ToLower on U+0130 (İ), which JavaScript lowers to
// "i" + U+0307 and Go to a plain "i" (see the package comment). JavaScript's final sigma (ς at
// the end of a word, σ in Go) is the one difference left; it makes nothing equal that was not.
func lower(s string) string {
	if strings.ContainsRune(s, 0x130) {
		s = strings.ReplaceAll(s, "\U00000130", "i\U00000307")
	}
	return js.ToLower(s)
}
