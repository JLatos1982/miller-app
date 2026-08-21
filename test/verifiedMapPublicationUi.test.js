import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

const ui = fs.readFileSync(new URL("../src/map/RefreshedLocationReviews.jsx", import.meta.url), "utf8")
const server = fs.readFileSync(new URL("../server.js", import.meta.url), "utf8")
const admin = fs.readFileSync(new URL("../src/map/AdminLocationReview.jsx", import.meta.url), "utf8")

test("ready-to-publish UI requires an explicit confirmation and sends the protected request", () => {
  assert.match(ui, /Publish this verified service location on Miller's public map\?/) 
  assert.match(ui, /item\.resource_name/)
  assert.match(ui, /item\.address/)
  assert.match(ui, /item\.community/)
  assert.match(ui, /\/api\/admin\/verified-map-pins\/\$\{item\.canonical_uuid\}\/publish/)
  assert.match(ui, /expected_qc_version: item\.qc\.version/)
  assert.match(ui, /confirmed_publication: true/)
})

test("ready-to-publish UI prevents duplicates and visibly handles every response class", () => {
  assert.match(ui, /saving \|\| !window\.confirm/)
  assert.match(ui, /disabled=\{Boolean\(saving\)\}/)
  assert.match(ui, /Publishing…/)
  assert.match(ui, /Published on Miller's public map\./)
  assert.match(ui, /already on Miller's public map/)
  assert.match(ui, /body\.error \|\| "Publication was not completed/)
  assert.match(ui, /Publication could not reach the server/)
  assert.match(ui, /await load\(\)/)
})

test("server publication endpoint is authenticated and validates confirmation and current QC", () => {
  const section = server.slice(server.indexOf('app.post("/api/admin/verified-map-pins'), server.indexOf('app.post("/api/admin/private-location-candidates'))
  assert.match(section, /requireAdmin/)
  assert.match(section, /expected_qc_version/)
  assert.match(section, /confirmed_publication !== true/)
  assert.match(section, /publish_verified_map_pin/)
  assert.match(section, /QC changed\. Reload before publishing\./)
})

test("primary admin location workflow leads with Ready to publish", () => {
  assert.match(admin, /^import[\s\S]*return <>\s*<RefreshedLocationReviews\/>/)
  assert.match(admin, /<summary>Advanced location diagnostics and history<\/summary>/)
})

test("publication queue keeps ready, confirmation-only, and blocked records distinct", () => {
  assert.match(server, /alreadyPublished \? "already_published" : eligibility\.eligible \? "ready_to_publish"/)
  assert.match(server, /queue_counts = \{ ready_to_publish/)
  assert.match(ui, /Ready to publish \(\{counts\.ready_to_publish/)
  assert.match(ui, /One confirmation away \(\{counts\.one_confirmation_away/)
  assert.match(ui, /Blocked \(\{counts\.blocked/)
  assert.match(server, /alreadyPublished \? "already_published"/)
  assert.match(server, /filter\(\(item\) => item\.queue_state !== "already_published"\)/)
})
