import { execFileSync, spawn } from "node:child_process"
import { createClient } from "@supabase/supabase-js"

const status = JSON.parse(execFileSync("npx", ["--yes", "supabase", "status", "-o", "json"], { encoding: "utf8" }))
if (!/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(status.API_URL || "")) throw new Error("Refusing to test a non-local Supabase API.")
if (process.env.ALLOW_PRODUCTION_DATABASE_TESTS) throw new Error("This script refuses production database testing.")

const email = "local-miller-admin@example.invalid"
const password = "Local-only-password-2026!"
const actorId = "00000000-0000-0000-0000-000000000310"
const resources = [
  ["22c9ff25-1305-5403-a127-53e3cbed6f10", "A Better Life Foundation"],
  ["1f60c6eb-4d9d-5fff-9108-092f60614c21", "YVR Heart Tattoo Society"],
]
const service = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const anonymous = createClient(status.API_URL, status.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const created = await service.auth.admin.createUser({ id: actorId, email, password, email_confirm: true })
if (created.error) throw created.error
const inserted = await service.from("resource_registry").insert(resources.map(([id, display_name]) => ({ id, display_name, lifecycle_state: "active", editorial_status: "pending" })))
if (inserted.error) throw inserted.error
const signedIn = await anonymous.auth.signInWithPassword({ email, password })
if (signedIn.error || !signedIn.data.session?.access_token) throw signedIn.error || new Error("Local sign-in failed.")
const token = signedIn.data.session.access_token

const port = 3199
const server = spawn(process.execPath, ["server.js"], {
  env: {
    ...process.env,
    PORT: String(port),
    NODE_ENV: "production",
    LOCATION_QC_REVIEW_STORE: "supabase",
    SUPABASE_URL: status.API_URL,
    SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
    ADMIN_EMAIL_ALLOWLIST: email,
    OPENAI_API_KEY: "local-disabled",
    TAVILY_API_KEY: "local-disabled",
  },
  stdio: ["ignore", "pipe", "pipe"],
})
let serverError = ""
server.stderr.on("data", (chunk) => { serverError += chunk })
const base = `http://127.0.0.1:${port}`
async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try { if ((await fetch(`${base}/api/admin/session`)).status === 401) return }
    catch { /* still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`Local Miller server did not start: ${serverError.slice(0, 200)}`)
}
const request = (path, options = {}) => fetch(`${base}${path}`, { ...options, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...options.headers } })

try {
  await waitForServer()
  if ((await fetch(`${base}/api/admin/location-qc-review`)).status !== 401) throw new Error("Unauthenticated QC route did not return 401.")
  const initial = await request("/api/admin/location-qc-review")
  const initialBody = await initial.json()
  const pending = initialBody.active?.find((item) => item.canonical_uuid === resources[0][0])
  if (initial.status !== 200 || initialBody.persistence !== "supabase" || pending?.canonical_validation?.qc_eligible !== true || pending?.canonical_validation?.editorial_status !== "pending") throw new Error("Pending canonical resource was not exposed as eligible private QC.")

  const locationsBefore = await service.from("resource_locations").select("id", { count: "exact", head: true })
  const first = await request(`/api/admin/location-qc-review/${resources[0][0]}/decision`, { method: "POST", body: JSON.stringify({ decision: "pilot_eligible", note: "local API integration", expected_version: 0 }) })
  if (first.status !== 201) throw new Error(`Initial API decision returned ${first.status}.`)
  const revision = await request(`/api/admin/location-qc-review/${resources[0][0]}/decision`, { method: "POST", body: JSON.stringify({ decision: "manual_review", note: "local version two", expected_version: 1 }) })
  if (revision.status !== 200) throw new Error(`Versioned API decision returned ${revision.status}.`)
  const stale = await request(`/api/admin/location-qc-review/${resources[0][0]}/decision`, { method: "POST", body: JSON.stringify({ decision: "defer", expected_version: 1 }) })
  if (stale.status !== 409) throw new Error(`Stale API decision returned ${stale.status}.`)

  const hidden = await service.from("resource_registry").update({ editorial_status: "hidden" }).eq("id", resources[1][0])
  if (hidden.error) throw hidden.error
  const denied = await request(`/api/admin/location-qc-review/${resources[1][0]}/decision`, { method: "POST", body: JSON.stringify({ decision: "defer", expected_version: 0 }) })
  if (denied.status !== 409) throw new Error(`Hidden resource API decision returned ${denied.status}.`)
  const restored = await service.from("resource_registry").update({ editorial_status: "pending" }).eq("id", resources[1][0])
  if (restored.error) throw restored.error

  const concurrent = await Promise.all([
    request(`/api/admin/location-qc-review/${resources[1][0]}/decision`, { method: "POST", body: JSON.stringify({ decision: "pilot_eligible", expected_version: 0 }) }),
    request(`/api/admin/location-qc-review/${resources[1][0]}/decision`, { method: "POST", body: JSON.stringify({ decision: "pilot_eligible", expected_version: 0 }) }),
  ])
  const statuses = concurrent.map((response) => response.status).sort((a, b) => a - b)
  if (statuses[0] !== 201 || statuses[1] !== 409) throw new Error(`Concurrent API statuses were ${statuses.join(",")}.`)

  const refreshed = await request("/api/admin/location-qc-review")
  const refreshedBody = await refreshed.json()
  if (!refreshedBody.completed?.some((item) => item.canonical_uuid === resources[0][0] && item.review?.version === 2)) throw new Error("Refresh did not retain the durable version-two decision.")
  const audits = await service.from("location_qc_review_audit").select("canonical_resource_id")
  const locationsAfter = await service.from("resource_locations").select("id", { count: "exact", head: true })
  if (audits.error || audits.data.length !== 3) throw new Error("Expected three append-only API audit rows.")
  if (locationsBefore.error || locationsAfter.error || locationsBefore.count !== locationsAfter.count) throw new Error("API QC changed resource locations.")

  console.log("target=local_supabase_api")
  console.log("unauthorized=401 pending_eligible=true hidden_denied=409")
  console.log("initial=201 revision=200 stale=409 refresh_version=2")
  console.log("concurrent_initial=201+409 audit_rows=3")
  console.log("resource_location_changes=0 publication_changes=0")
} finally {
  server.kill("SIGTERM")
}
