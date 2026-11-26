// Sign-out, with one step in front (components/agent/AgentSignOutForm.tsx, §3.10.7: "signing
// out stops that device's notifications at once"). That needs this browser's own push
// subscription, which only the browser can see, so before the form posts:
//
//   1. the browser drops its subscription (local and quick: once it is gone nothing can be
//      delivered here, whatever happens next), and
//   2. its endpoint rides along as push_endpoint, so the server tells push-device to forget it
//      with the session that is about to end.
//
// It never holds sign-out hostage: any failure, or two seconds, and the form posts as it was.
// With JS off the form posts plainly and the dispatcher forgets the row on the push service's
// 410 instead. Loaded by the layouts whose pages carry a sign-out form.

const SIGN_OUT = "/account/sign-out";

async function stopPushHere() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  if (!sub) return null;
  const endpoint = sub.endpoint;
  await sub.unsubscribe().catch(() => false);
  return endpoint;
}

document.addEventListener("submit", (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || event.defaultPrevented) return;
  if (new URL(form.action, window.location.href).pathname !== SIGN_OUT) return;
  if (form.dataset.pushChecked === "1") return; // the second, real submit

  event.preventDefault();
  form.dataset.pushChecked = "1";
  const timeout = new Promise((resolve) => window.setTimeout(() => resolve(null), 2000));
  Promise.race([stopPushHere().catch(() => null), timeout]).then((endpoint) => {
    if (typeof endpoint === "string" && endpoint.startsWith("https://")) {
      const field = document.createElement("input");
      field.type = "hidden";
      field.name = "push_endpoint";
      field.value = endpoint;
      form.append(field);
    }
    form.requestSubmit();
  });
});
