import { createClient } from "@supabase/supabase-js"
import { publishPracticalPublicLocation } from "../server/practicalPublicLocationPublication.js"

const PROJECT = "wccagykzugrahwugefqt"
if (!process.env.SUPABASE_URL || new URL(process.env.SUPABASE_URL).hostname.split(".")[0] !== PROJECT || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("production_configuration_required")
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const { data: users, error: usersError } = await db.auth.admin.listUsers({ perPage: 1 })
if (usersError || !users?.users?.[0]?.id) throw usersError || new Error("trusted_actor_unavailable")

// Final deliberately-small Tier-1 batch.  Each record already has an exact
// BC 211 service page and an expected locality; the helper still independently
// retrieves, extracts, geocodes, preflights, and may decline publication.
const cases = [
  { name: "Addiction Services - Downtown Community Health Centre", locality: "Vancouver", url: "https://bc.211.ca/result/addiction-services-vancouver-downtown-community-health-centre-9507419/" },
  { name: "Community Addictions Counselling Team (CACT)", locality: "Vancouver", url: "https://bc.211.ca/result/community-addictions-counselling-team-cact-9492858/" },
  { name: "Tri-Cities Opioid Agonist Treatment (OAT) Clinic - Result - 211 British Columbia", locality: "Port Coquitlam", url: "https://bc.211.ca/result/tri-cities-opioid-agonist-treatment-oat-clinic-59980630/" },
  { name: "Mental Health and Substance Use Services - Vernon - Result - 211 British Columbia", locality: "Vernon", url: "https://bc.211.ca/result/mental-health-and-substance-use-services-vernon-9508041/" },
]

const report = []
for (const item of cases) {
  const { data: candidates, error } = await db.from("resource_registry").select("id,display_name").eq("display_name", item.name).limit(2)
  if (error) throw error
  if (candidates.length !== 1) { report.push({ name: item.name, outcome: "resource_not_unique", matching_resources: candidates.map((x) => x.display_name) }); continue }
  const output = await publishPracticalPublicLocation({ db, resourceId: candidates[0].id, source: { url: item.url, locality: item.locality, title: "BC 211 public service listing" }, actorId: users.users[0].id })
  report.push({ name: candidates[0].display_name, resource_id: candidates[0].id, outcome: output.outcome, publication_attempted: output.publication_attempted, canonical_address: output.package?.canonical_address || null, attempts: output.attempts })
}
console.log(JSON.stringify({ cases: report }, null, 2))
