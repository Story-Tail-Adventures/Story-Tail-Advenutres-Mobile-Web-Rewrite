// The strength meter under a new-password field (components/auth/PasswordStrength.tsx), on
// Screens 2.1.2 and 2.1.5. The rules are exactly the policy's, ported from
// web/lib/validation/password-strength.ts, and webgo/internal/validate/password_strength.go is
// the server's copy: the words below must match it byte for byte.
//
//   <input data-strength="password-hint" ...>
//   <div class="auth-meter" data-score="0">...</div>      the next .auth-meter after the input
//   <p id="password-hint" data-idle="...">...</p>         replaced by the message as they type
//
// The password itself is never kept: each input event scores the field's current value and
// drops it. Without JS the meter stays empty and the policy hint stays, and the server still
// refuses a weak password with the same words.

const RULES = [
  ["at least 12 characters", (v) => v.length >= 12],
  ["a capital letter", (v) => /[A-Z]/.test(v)],
  ["a lowercase letter", (v) => /[a-z]/.test(v)],
  ["a number", (v) => /\d/.test(v)],
];

function joinReadably(parts) {
  if (parts.length <= 1) return parts[0] ?? "";
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

function strength(value) {
  const missing = RULES.filter(([, met]) => !met(value)).map(([label]) => label);
  return { score: RULES.length - missing.length, missing };
}

function message(value) {
  if (value.length === 0) return "";
  const { missing } = strength(value);
  return missing.length === 0
    ? "Strong — 12+ characters, upper and lower case, and a number."
    : `Still needs ${joinReadably(missing)}.`;
}

document.addEventListener("input", (event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || !input.hasAttribute("data-strength")) return;
  const value = input.value;

  const meter = input.parentElement?.querySelector(".auth-meter");
  if (meter) meter.setAttribute("data-score", String(strength(value).score));

  // Absent while the field shows a server error, as in Next (the hint and the error share a line).
  const hint = document.getElementById(input.getAttribute("data-strength") ?? "");
  if (hint) hint.textContent = message(value) || hint.getAttribute("data-idle") || "";
});
