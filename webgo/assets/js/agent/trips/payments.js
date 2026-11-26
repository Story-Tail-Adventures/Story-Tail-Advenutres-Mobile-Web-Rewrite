// §3.4.15 / §3.6's small behaviours. Everything here is progressive: each form posts and 303s
// without it, and each dialog is a page state (?link=, ?paid=) whose Cancel is a link.
//
//   - The dialogs (?link=, ?paid=) are url-dialog.js's (loaded beside this: assets are served
//     only under hashed names, so modules cannot import each other).
//   - The pay link preview follows what is typed: the site name exactly as the client will
//     see it (lower case, no www., punycode from new URL()), and nothing for a link that is
//     not https. A courtesy only: the server checks the link again, then the function.

function paySiteName(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return "";
  }
  if (url.protocol !== "https:" || !url.hostname) return "";
  return url.hostname.toLowerCase().replace(/^www\./, "");
}

const input = document.querySelector("[data-trp-payurl]");
const preview = document.querySelector("[data-trp-preview]");
const site = document.querySelector("[data-trp-site]");
if (input instanceof HTMLInputElement && preview && site) {
  input.addEventListener("input", () => {
    const name = paySiteName(input.value.trim());
    site.textContent = name;
    preview.hidden = name === "";
  });
}
