// Screen 3.4.3's client picker (components/agent/NewTripForm.tsx): keeps the hidden clientId
// in step with the name typed into the <datalist> field. An exact (case-insensitive) match
// posts that client's id; an unmatched name posts none, so a name two clients share cannot
// pick one silently; an empty field keeps the id the page was opened with (?client=).
// Without this module the server resolves the typed name itself (newtrip.go).

const input = document.querySelector("[data-trp-client]");
const hidden = document.querySelector("[data-trp-client-id]");

if (input instanceof HTMLInputElement && hidden instanceof HTMLInputElement && input.list) {
  const preset = hidden.value;
  const options = Array.from(input.list.querySelectorAll("option[data-client-id]"));

  const sync = () => {
    const text = input.value.trim().toLowerCase();
    if (text === "") {
      hidden.value = preset;
      return;
    }
    const matches = options.filter((o) => o.value.toLowerCase() === text);
    hidden.value = matches.length === 1 ? matches[0].getAttribute("data-client-id") ?? "" : "";
  };

  input.addEventListener("input", sync);
  // Back from the builder restores the typed text from the cache; follow it.
  window.addEventListener("pageshow", sync);
}
