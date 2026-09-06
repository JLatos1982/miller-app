import { createClient } from "@supabase/supabase-js"
import { publishPracticalPublicLocation } from "../server/practicalPublicLocationPublication.js"

const PROJECT = "wccagykzugrahwugefqt"
if (!process.env.SUPABASE_URL || new URL(process.env.SUPABASE_URL).hostname.split(".")[0] !== PROJECT || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("production_configuration_required")
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const { data: users, error: usersError } = await db.auth.admin.listUsers({ perPage: 1 })
if (usersError || !users?.users?.[0]?.id) throw usersError || new Error("trusted_actor_unavailable")

// Deliberately small, high-yield selection: named public clinical services with
// one expected site.  Aggregate, shelter, residential, and known-conflict rows
// are intentionally absent.
const cases = [
  { id: "39983e78-265e-5719-9751-02038fd5921f", name: "Vancouver Detox", sources: [
    { url: "https://www.vch.ca/en/location/vancouver-detoxification-centre", locality: "Vancouver", title: "Vancouver Coastal Health — Vancouver Detox" },
    { url: "https://bc.211.ca/result/vancouver-detox-9503456/", locality: "Vancouver", title: "BC 211 — Vancouver Detox" },
  ] },
  { id: "bf018a4b-45ee-593f-bd96-441ef7bdbe45", name: "Road to Recovery - St. Paul's Hospital", sources: [
    { url: "https://www.providencehealthcare.org/en/health-services/services/harm-reduction/road-recovery", locality: "Vancouver", title: "Providence Health Care — Road to Recovery" },
    { url: "https://bc.211.ca/agency-details/providence-health-care-9488549/", locality: "Vancouver", title: "BC 211 — Road to Recovery" },
  ] },
  { id: "0717926a-242f-5b8b-9faa-e4fba5536c1f", name: "Providence Crosstown Clinic", sources: [
    { url: "https://www.providencehealthcare.org/en/clinics/providence-crosstown-clinic", locality: "Vancouver", title: "Providence Health Care — Crosstown Clinic" },
  ] },
]

const report = []
for (const item of cases) {
  const output = await publishPracticalPublicLocation({ db, resourceId: item.id, sources: item.sources, actorId: users.users[0].id })
  report.push({ name: item.name, resource_id: item.id, outcome: output.outcome, publication_attempted: output.publication_attempted, fallback_used: output.fallback_used, canonical_address: output.package?.canonical_address || null, attempts: output.attempts })
}
console.log(JSON.stringify({ cases: report }, null, 2))
