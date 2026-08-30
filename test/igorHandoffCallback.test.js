import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import { extractIgorHandoffCode, IGOR_HANDOFF_CALLBACK_PATH, igorHandoffCallbackHeaders, renderIgorHandoffCallbackPage } from "../server/igorHandoffCallback.js"

const code = "a".repeat(48)

test("Igor handoff callback accepts one valid PKCE code and ignores unrelated parameters", () => {
  assert.equal(extractIgorHandoffCode(`?code=${code}&state=ignored&next=/admin&token=ignored`), code)
  assert.equal(extractIgorHandoffCode(`?code=${code}&code=${code}`), null)
  assert.equal(extractIgorHandoffCode(`?state=x&access_token=x`), null)
  assert.equal(extractIgorHandoffCode("?code=short"), null)
})

test("callback page is standalone, no-store, and has no Miller auth or mutation path", () => {
  const page = renderIgorHandoffCallbackPage(), headers = igorHandoffCallbackHeaders()
  assert.equal(IGOR_HANDOFF_CALLBACK_PATH, "/auth/igor-handoff-callback")
  assert.match(headers["Cache-Control"], /no-store/)
  assert.match(headers["Referrer-Policy"], /no-referrer/)
  assert.match(page, /does not sign in to Miller or change Miller data/i)
  for (const forbidden of ["supabase", "localStorage", "sessionStorage", "fetch(", "admin"]) assert.doesNotMatch(page.toLowerCase(), new RegExp(forbidden.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
})

test("browser callback code is rendered only after URL scrubbing and is never persisted or logged", () => {
  const source = fs.readFileSync(new URL("../public/igor-handoff-callback.js", import.meta.url), "utf8"), server = fs.readFileSync(new URL("../server.js", import.meta.url), "utf8")
  assert.match(source, /history\.replaceState\(null, "", "\/auth\/igor-handoff-callback"\)/)
  assert.ok(source.indexOf("history.replaceState") < source.indexOf("output.value = code"))
  for (const forbidden of ["localStorage", "sessionStorage", "document.cookie", "fetch(", "console.", "supabase", "signIn", "createClient"]) assert.equal(source.includes(forbidden), false, forbidden)
  assert.match(server, /app\.get\(IGOR_HANDOFF_CALLBACK_PATH/)
  assert.doesNotMatch(server.slice(server.indexOf("app.get(IGOR_HANDOFF_CALLBACK_PATH"), server.indexOf("app.use(express.static")), /requireAdmin|supabase\.|client\.|openai/i)
})
