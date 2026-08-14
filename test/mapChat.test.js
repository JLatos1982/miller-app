import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import { boundedMapConversation, buildAuthorizedMapResponse } from "../server/mapChat.js"
import { buildMapCandidates, resolveAuthorizedMapResults, stableCuratedResourceId, toMillerMatch } from "../src/map/mapChat.js"
import { normalizeMapResource } from "../src/map/geography.js"
import { authorizeMapMatches, curatedMapResources } from "../server/mapResources.js"

const approved = (overrides = {}) => normalizeMapResource({ id: "approved:1", name: "Approved Clinic", approved: true, public_map: true, serviceType: "OAT clinic", latitude: 49.2, longitude: -123.1, ...overrides })

test("server map contract rejects hallucinated and unauthorized resource IDs", () => {
  const resource = approved()
  const response = buildAuthorizedMapResponse({ parsed: { answer: "Try this.", resourceIds: ["invented", resource.id] }, authorizedResources: [resource] })
  assert.deepEqual(response.resourceIds, [resource.id])
  assert.equal(response.message, "Try this.")
})

test("map candidates never include hidden, excluded, or unapproved resources", () => {
  const visible = approved()
  const resources = [visible, approved({ id: "hidden", hidden: true }), approved({ id: "excluded", public_map: false }), approved({ id: "pending", approved: false })]
  assert.deepEqual(buildMapCandidates(resources, "clinic").map((item) => item.id), [visible.id])
  assert.deepEqual(resolveAuthorizedMapResults(resources, [visible.id, "hidden", "excluded", "pending"]).map((item) => item.id), [visible.id])
})

test("map candidate payload withholds geography review and coordinate fields", () => {
  const match = toMillerMatch(approved({ geocode_confidence: 0.4, verification_status: "needs_review" }))
  assert.equal(match.latitude, undefined)
  assert.equal(match.longitude, undefined)
  assert.equal(match.geocode_confidence, undefined)
  assert.equal(match.verification_status, undefined)
})

test("bounded map conversation keeps eight turns without persistence", () => {
  const messages = Array.from({ length: 24 }, (_, index) => ({ role: index % 2 ? "assistant" : "user", content: `message ${index}` }))
  const bounded = boundedMapConversation(messages)
  assert.equal(bounded.length, 16)
  assert.equal(bounded[0].content, "message 8")
})

test("curated stable IDs are deterministic and distinguish resources", () => {
  const first = stableCuratedResourceId({ name: "Clinic", city: "Surrey", organization: "Health" })
  assert.equal(first, stableCuratedResourceId({ name: " Clinic ", city: "SURREY", organization: "Health" }))
  assert.notEqual(first, stableCuratedResourceId({ name: "Clinic", city: "Burnaby", organization: "Health" }))
})

test("map chat reuses protected Miller endpoint without analytics or browser location", () => {
  const client = fs.readFileSync(new URL("../src/map/ServiceMap.jsx", import.meta.url), "utf8")
  const server = fs.readFileSync(new URL("../server.js", import.meta.url), "utf8")
  assert.match(client, /askMiller\(buildMillerRequest/)
  assert.match(server, /isMapInterface/)
  assert.doesNotMatch(client, /geolocation|getCurrentPosition|trackEvent/)
  assert.match(client, /aria-live="polite"/)
  assert.match(client, /role="alert"/)
  assert.match(client, /Filters narrow both visible pins and conversational results/)
})

test("public map endpoint exposes only administrator-verified geography", () => {
  const server = fs.readFileSync(new URL("../server.js", import.meta.url), "utf8")
  assert.match(server, /from\("resource_locations"\)/)
  assert.match(server, /\.eq\("location_type", "fixed"\)\.eq\("public_map", true\)\.eq\("geocode_status", "verified"\)\.eq\("review_status", "approved"\)/)
})

test("server independently authorizes curated and approved Supabase map IDs", async () => {
  const curated = curatedMapResources[0]
  const supabase = { from: () => ({ select: () => ({ in: () => ({ eq: () => ({ eq: async () => ({ data: [{ id: 22, name: "DB resource", approved: true, hidden: false }], error: null }) }) }) }) }) }
  const result = await authorizeMapMatches([curated.id, "forged", 22], supabase)
  assert.deepEqual(result.map((item) => String(item.id)), [String(curated.id), "22"])
  assert.equal(result[0].name, curated.name)
})

test("map diagnostics are protected and report every zero-pin pipeline stage", () => {
  const server = fs.readFileSync(new URL("../server.js", import.meta.url), "utf8")
  assert.match(server, /app\.get\("\/api\/admin\/map-diagnostics", requireAdmin/)
  for (const field of ["authorized_resources", "canonical_ids_resolved", "location_records_found", "pending_locations", "approved_public_locations", "valid_coordinates_returnable", "expected_marker_groups"]) assert.match(server, new RegExp(field))
})

test("pending location preview is admin-only and never feeds the public map query", () => {
  const server = fs.readFileSync(new URL("../server.js", import.meta.url), "utf8")
  const component = fs.readFileSync(new URL("../src/map/PendingLocationReview.jsx", import.meta.url), "utf8")
  assert.match(server, /app\.get\("\/api\/admin\/pending-locations", requireAdmin/)
  assert.match(server, /app\.patch\("\/api\/admin\/pending-locations\/:locationId", requireAdmin/)
  assert.match(server, /Explicit approval confirmation is required/)
  assert.match(server, /\.eq\("public_map", false\)/)
  assert.match(component, /Pending locations — not public/)
  assert.match(component, /Maximum 20; Tier 1 only/)
  assert.match(component, /window\.confirm/)
  assert.doesNotMatch(server.match(/app\.get\("\/api\/map\/resources"[\s\S]*?\n\}\)/)?.[0] || "", /review_status", "pending"/)
})

test("location review queue classifies the live location row and returns authoritative transitions", () => {
  const server = fs.readFileSync(new URL("../server.js", import.meta.url), "utf8")
  const review = fs.readFileSync(new URL("../src/map/PendingLocationReview.jsx", import.meta.url), "utf8")
  assert.match(server, /select\("id,resource_id,location_type,original_address_text/)
  assert.match(server, /code: "review_saved"/)
  assert.match(server, /code: "stale_record"/)
  assert.match(server, /code: "not_fixed"/)
  assert.match(server, /next_eligible_queue_membership/)
  assert.match(server, /audit_action_id/)
  assert.match(review, /expected_updated_at: selected\.updated_at/)
  assert.match(review, /resource_id: selected\.resource_id/)
  assert.match(review, /setItems\(\(current\) => current\.map/)
  assert.match(review, /result\.error \|\| `Decision was not saved/)
})

test("pilot runner is capped, validates geography, and stores only pending non-public points", () => {
  const source = fs.readFileSync(new URL("../scripts/geocoding-pilot.mjs", import.meta.url), "utf8")
  assert.match(source, /requestCount >= 15/)
  assert.match(source, /country_or_province_mismatch/)
  assert.match(source, /city_mismatch/)
  assert.match(source, /non_building_approximation/)
  assert.match(source, /review_status: "pending", public_map: false/)
})

test("bounded approval requires exact UUID identities, versions, names, Tier 1, and a maximum of twenty", () => {
  const server = fs.readFileSync(new URL("../server.js", import.meta.url), "utf8")
  assert.match(server, /app\.post\("\/api\/admin\/pending-locations\/bounded-approve", requireAdmin/)
  assert.match(server, /selected\.length > 20/)
  assert.match(server, /confirmed_public_statement/)
  assert.match(server, /not_tier_one/)
  assert.match(server, /expected_updated_at/)
  assert.match(server, /identity_mismatch/)
  assert.match(server, /stale_record/)
  assert.match(server, /not_approvable_pending_state/)
  assert.match(server, /already_approved/)
  assert.match(server, /complete selected-name confirmation list/)
  assert.match(server, /Administrator-confirmed bounded approval/)
})

test("public endpoint hydrates approved curated aliases and excludes hidden registry records", () => {
  const server = fs.readFileSync(new URL("../server.js", import.meta.url), "utf8")
  assert.match(server, /getCuratedMapResource/)
  assert.match(server, /item\.lifecycle_state === "active" && item\.editorial_status !== "hidden"/)
  assert.match(server, /\.eq\("geocode_status", "verified"\)\.eq\("review_status", "approved"\)/)
  assert.match(server, /representedLocations/)
})

test("administrator login and dashboard render only on the dedicated admin route", () => {
  const app = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8")
  assert.match(app, /window\.location\.pathname\.startsWith\("\/admin"\)/)
  assert.match(app, /requestAdminMagicLink/)
  assert.match(app, /<a href="\/admin\/login">Admin<\/a>/)
  assert.match(app, /if \(isAdminRoute\) \{[\s\S]*Administrator sign in/)
  const publicHero = app.slice(app.indexOf('className="hero-layout"'))
  assert.doesNotMatch(publicHero, /Administrator sign in/)
  assert.doesNotMatch(publicHero, /<PendingLocationReview/)
})

test("public route does not fetch protected administrator data", () => {
  const app = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8")
  assert.match(app, /if \(!isAdminRoute \|\| !isAdminMode\) return/)
  assert.match(app, /if \(!isAdminRoute\) return undefined/)
  const server = fs.readFileSync(new URL("../server.js", import.meta.url), "utf8")
  assert.match(server, /app\.get\("\/api\/admin\/pending-locations", requireAdmin/)
})

test("dedicated admin login uses passwordless Supabase auth and returns to the admin route", () => {
  const login = fs.readFileSync(new URL("../src/AdminLogin.jsx", import.meta.url), "utf8")
  assert.match(login, /requestAdminMagicLink/)
  assert.match(login, /window\.location\.replace\("\/admin"\)/)
  assert.doesNotMatch(login, /signInWithPassword|type="password"/)
})
