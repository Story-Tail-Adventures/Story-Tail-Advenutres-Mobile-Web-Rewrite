package content

import (
	"bytes"
	"encoding/json"
	"fmt"
)

// Placement is how the trip appears on one topic page, and false when the trip is not on it.
func (t Topics) Placement(topic Topic) (TopicPlacement, bool) {
	for _, e := range t {
		if e.Topic == topic {
			return e.Placement, true
		}
	}
	return TopicPlacement{}, false
}

// UnmarshalJSON reads the topics object one token at a time, so the entries keep the order
// the file lists them in. A map would lose it, and the Kotlin output lists them in that
// order. A topic listed twice, or a placement field nobody declared, is an error.
func (t *Topics) UnmarshalJSON(data []byte) error {
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.DisallowUnknownFields()
	tok, err := dec.Token()
	if err != nil {
		return err
	}
	if tok == nil {
		// JSON null leaves the value alone, as encoding/json does for its own types.
		return nil
	}
	if d, ok := tok.(json.Delim); !ok || d != '{' {
		return fmt.Errorf("topics: want a JSON object, got %v", tok)
	}
	var out Topics
	for dec.More() {
		tok, err := dec.Token()
		if err != nil {
			return err
		}
		key, ok := tok.(string)
		if !ok {
			return fmt.Errorf("topics: want a key, got %v", tok)
		}
		topic := Topic(key)
		if _, dup := out.Placement(topic); dup {
			return fmt.Errorf("topics: %q is listed twice", key)
		}
		var p TopicPlacement
		if err := dec.Decode(&p); err != nil {
			return fmt.Errorf("topics: %q: %w", key, err)
		}
		out = append(out, TopicEntry{Topic: topic, Placement: p})
	}
	if _, err := dec.Token(); err != nil { // the closing brace
		return err
	}
	*t = out
	return nil
}

// MarshalJSON writes the topics back as one JSON object, in the same order.
func (t Topics) MarshalJSON() ([]byte, error) {
	var b bytes.Buffer
	b.WriteByte('{')
	for i, e := range t {
		if i > 0 {
			b.WriteByte(',')
		}
		key, err := json.Marshal(string(e.Topic))
		if err != nil {
			return nil, err
		}
		val, err := json.Marshal(e.Placement)
		if err != nil {
			return nil, err
		}
		b.Write(key)
		b.WriteByte(':')
		b.Write(val)
	}
	b.WriteByte('}')
	return b.Bytes(), nil
}
