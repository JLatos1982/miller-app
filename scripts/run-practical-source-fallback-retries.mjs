import { createClient } from "@supabase/supabase-js"
import { publishPracticalPublicLocation } from "../server/practicalPublicLocationPublication.js"

const PROJECT = "wccagykzugrahwugefqt"
if (!process.env.SUPABASE_URL || new URL(process.env.SUPABASE_URL).hostname.split(".")[0] !== PROJECT || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("production_configuration_required")
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const { data: users, error: usersError } = await db.auth.admin.listUsers({ perPage: 1 })
if (usersError || !users?.users?.[0]?.id) throw usersError || new Error("trusted_actor_unavailable")

// Ordered sources are narrow, reviewed public sources.  This is the fallback
// ladder, not an internet search or a source-discovery mechanism.
const cases = [
  { name: "Anne Vogel Clinic", sources: [
    { url: "https://www.vch.ca/en/location-service/anne-vogel-clinic", locality: "Richmond", title: "Vancouver Coastal Health — Anne Vogel Clinic" },
    { url: "https://bc.211.ca/result/anne-vogel-clinic-9509817/", locality: "Richmond", title: "BC 211 — Anne Vogel Clinic" },
  ] },
  { name: "The CORE (Community Outpatient Recovery Experience)", sources: [
    { url: "https://www.vch.ca/en/location-service/core-community-outpatient-recovery-experience", locality: "Vancouver", title: "Vancouver Coastal Health — The CORE" },
    { url: "https://bc.211.ca/result/the-core-community-outpatient-recovery-experience-63201516/", locality: "Vancouver", title: "BC 211 — The CORE" },
  ] },
  { name: "Hope RAAC / Anderson Clinic", sources: [
    { url: "https://www.fraserhealth.ca/Service-Directory/Services/mental-health-and-substance-use/rapid-access-to-addiction-care-clinic", locality: "Hope", title: "Fraser Health — RAAC Clinic" },
    { url: "https://bc.211.ca/result/rapid-access-to-addiction-care-raac-clinic-fraser-east-hope-95445839/", locality: "Hope", title: "BC 211 — Hope RAAC Clinic" },
  ] },
  { name: "Pacifica Treatment Centre", sources: [
    { url: "https://www.pacificatreatment.ca/admissions/", locality: "Vancouver", title: "Pacifica Treatment Centre — admissions" },
    { url: "https://bc.211.ca/agency-details/pacifica-treatment-centre-society-9488510/", locality: "Vancouver", title: "BC 211 — Pacifica Treatment Centre" },
  ] },
]

const report = []
for (const item of cases) {
  const { data: candidates, error } = await db.from("resource_registry").select("id,display_name").ilike("display_name", item.name).limit(2)
  if (error) throw error
  if (candidates.length !== 1) { report.push({ name: item.name, outcome: "resource_not_unique", matching_resources: candidates.map((x) => x.display_name) }); continue }
  const output = await publishPracticalPublicLocation({ db, resourceId: candidates[0].id, sources: item.sources, actorId: users.users[0].id })
  report.push({ name: candidates[0].display_name, resource_id: candidates[0].id, outcome: output.outcome, publication_attempted: output.publication_attempted, fallback_used: output.fallback_used, canonical_address: output.package?.canonical_address || null, attempts: output.attempts })
}
console.log(JSON.stringify({ cases: report }, null, 2))
