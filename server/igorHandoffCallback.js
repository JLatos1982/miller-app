export const IGOR_HANDOFF_CALLBACK_PATH = "/auth/igor-handoff-callback"
const CODE = /^[A-Za-z0-9_-]{16,2048}$/

// PKCE authorization codes are opaque. This accepts exactly one bounded code
// parameter and deliberately ignores every other callback parameter.
export function extractIgorHandoffCode(search = "") {
  const values = new URLSearchParams(search).getAll("code")
  return values.length === 1 && CODE.test(values[0]) ? values[0] : null
}

export function igorHandoffCallbackHeaders() {
  return Object.freeze({
    "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
  })
}

export function renderIgorHandoffCallbackPage() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><title>Igor handoff bootstrap</title><style>body{font-family:system-ui,sans-serif;max-width:42rem;margin:4rem auto;padding:0 1.25rem;color:#17212b}textarea{display:block;width:100%;min-height:5rem;margin:1rem 0;font:inherit}button{padding:.65rem 1rem}#result[hidden]{display:none}.error{color:#8a1f11}</style><script src="/igor-handoff-callback.js" defer></script></head><body><main><h1>Igor handoff bootstrap</h1><p>This page does not sign in to Miller or change Miller data.</p><section id="result" hidden><p>Return this one-time authorization code to Igor’s bootstrap command. Do not share it elsewhere.</p><label for="authorization-code">One-time authorization code</label><textarea id="authorization-code" readonly spellcheck="false"></textarea><button id="copy-code" type="button">Copy code</button><p id="copy-status" aria-live="polite"></p></section><p id="error" class="error" hidden>No valid Igor handoff authorization code was supplied. Return to Igor’s bootstrap command and start the authorization again.</p></main></body></html>`
}
