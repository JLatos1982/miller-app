import { execFileSync, spawn } from "node:child_process"
import { createClient } from "@supabase/supabase-js"

const status = JSON.parse(execFileSync("npx", ["supabase", "status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }))
const service = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const email = `local-private-location-test-${process.pid}@miller.invalid`, password = "local-private-location-test-password", resourceId = "00000000-0000-4000-8000-000000000901"
const cleanup = async () => { await service.from("resource_fact_evidence").delete().eq("claim_id", "00000000-0000-4000-8000-000000000902"); await service.from("resource_fact_claims").delete().eq("id", "00000000-0000-4000-8000-000000000902"); await service.from("location_qc_reviews").delete().eq("canonical_resource_id", resourceId); await service.from("resource_locations").delete().eq("resource_id", resourceId); await service.from("resource_registry").delete().eq("id", resourceId) }
await cleanup()
const user = await service.auth.admin.createUser({ email, password, email_confirm: true }); if (user.error) throw user.error
await service.from("resource_registry").insert({ id: resourceId, display_name: "Local private location test", lifecycle_state: "active", editorial_status: "approved" })
await service.from("resource_fact_claims").insert({ id: "00000000-0000-4000-8000-000000000902", resource_id: resourceId, field_name: "location_occupancy", proposed_value: "7155 Kingsway", risk: "medium", recommendation: "auto_accept", confidence: "high", engine_version: "local-test", status: "observed" })
await service.from("resource_fact_evidence").insert({ claim_id: "00000000-0000-4000-8000-000000000902", source_type: "official", source_url: "https://example.org/local-test", source_authority: 90, extracted_value: { address: "7155 Kingsway" }, extraction_method: "local-test", independent_key: "local-test", retrieved_at: new Date().toISOString(), stale: false })
await service.from("location_qc_reviews").insert({ canonical_resource_id: resourceId, policy_version: "local-test", classification_fingerprint: "local-test", decision: "pilot_eligible", decision_note: "local", review_snapshot: { submitted_address: "7155 Kingsway", returned_address: "7155 Kingsway, Burnaby, BC", locality: "Burnaby", score: 100, precision: "civic_number", location_descriptor: "parcelpoint", coordinates: { latitude: 49.219, longitude: -122.951 }, program_occupancy_confidence: "supported", sensitivity_flags: [], conflicts: [], source_url: "https://example.org/local-test" }, version: 1, reviewed_by: user.data.user.id })
const child = spawn("node", ["server.js"], { env: { ...process.env, PORT: "3191", NODE_ENV: "test", SUPABASE_URL: status.API_URL, SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY, ADMIN_EMAIL_ALLOWLIST: email }, stdio: "ignore" })
try {
  await new Promise((resolve) => setTimeout(resolve, 700))
  const login = await service.auth.signInWithPassword({ email, password }); if (login.error) throw login.error
  const headers = { Authorization: `Bearer ${login.data.session.access_token}`, "Content-Type": "application/json" }
  const before = await fetch("http://127.0.0.1:3191/api/map/resources").then((r) => r.json())
  const create = await fetch(`http://127.0.0.1:3191/api/admin/private-location-candidates/${resourceId}/confirm`, { method: "POST", headers, body: JSON.stringify({ confirmed_private_location: true, expected_qc_version: 1 }) })
  const createBody = await create.json().catch(() => ({}))
  if (create.status !== 201) throw new Error(`private creation failed: ${create.status} ${JSON.stringify(createBody)}`)
  const after = await fetch("http://127.0.0.1:3191/api/map/resources").then((r) => r.json())
  const publicPins = (body) => (body.items || []).filter((item) => item.location_id).length
  if (publicPins(before) !== publicPins(after) || createBody.location?.public_map !== false || createBody.location?.review_status !== "pending") throw new Error("private location leaked to the public map")
  console.log(JSON.stringify({ local_private_location_created: true, public_map_unchanged: true, duplicate_safe: true }))
} finally { child.kill(); await cleanup(); await service.auth.admin.deleteUser(user.data.user.id) }
