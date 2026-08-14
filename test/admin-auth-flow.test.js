import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import {
  clearAuthCallbackFromUrl,
  getAdminRedirectUrl,
  hasAuthCallbackParams,
  requestAdminMagicLink,
} from "../src/adminAuthFlow.js"

test("admin redirect uses the current local Vite origin and protected admin path", () => {
  assert.equal(getAdminRedirectUrl("http://localhost:5173"), "http://localhost:5173/admin")
  assert.equal(getAdminRedirectUrl("http://localhost:5199/old"), "http://localhost:5199/admin")
})

test("production redirect cannot be replaced by an arbitrary destination", () => {
  assert.equal(getAdminRedirectUrl("https://miller.example.org"), "https://miller.example.org/admin")
  assert.equal(getAdminRedirectUrl("https://miller.example.org/?next=https://evil.example"), "https://miller.example.org/admin")
})

test("magic-link request targets admin and does not create arbitrary users", async () => {
  let received
  const supabase = { auth: { signInWithOtp: async (value) => { received = value; return { error: null } } } }
  await requestAdminMagicLink({ supabase, email: " admin@example.org ", origin: "https://miller.example.org" })
  assert.deepEqual(received, {
    email: "admin@example.org",
    options: { emailRedirectTo: "https://miller.example.org/admin", shouldCreateUser: false },
  })
})

test("implicit auth fragments are recognized and removed without reading their values", () => {
  const location = { hash: "#access_token=redacted&refresh_token=redacted", search: "" }
  let replacement
  const history = { state: { ok: true }, replaceState: (...args) => { replacement = args } }
  assert.equal(hasAuthCallbackParams(location), true)
  assert.equal(clearAuthCallbackFromUrl(history, location), true)
  assert.deepEqual(replacement, [{ ok: true }, "", "/admin"])
})

test("PKCE and callback errors are recognized while ordinary URLs are untouched", () => {
  assert.equal(hasAuthCallbackParams({ hash: "", search: "?code=redacted" }), true)
  assert.equal(hasAuthCallbackParams({ hash: "#error=access_denied", search: "" }), true)
  assert.equal(hasAuthCallbackParams({ hash: "#section", search: "?view=queue" }), false)
})

test("admin auth source has no obsolete port or token logging", () => {
  const source = ["../src/adminAuthFlow.js", "../src/AdminLogin.jsx", "../src/App.jsx"]
    .map((file) => fs.readFileSync(new URL(file, import.meta.url), "utf8"))
    .join("\n")
  assert.doesNotMatch(source, /localhost:3000/)
  assert.doesNotMatch(source, /console\.(?:log|debug|info)\([^\n]*(?:access_token|refresh_token)/)
})
