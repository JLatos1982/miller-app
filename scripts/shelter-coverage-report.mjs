import { createClient } from "@supabase/supabase-js"

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Server-side Supabase configuration is required")
const db = createClient(new URL(process.env.SUPABASE_URL).origin, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const [candidateResult, oliveResult, directoryResult] = await Promise.all([
  db.from("resource_discovery_candidates").select("id,name,shelter_type,community,region,source_name,review_status,location_disclosure_status,geocoding_status,possible_matches,managed_alcohol_program,matched_resource_id,imported_tavily_resource_id"),
  db.from("resource_discovery_candidates").select("id,name,operator,review_status,location_disclosure_status,geocoding_status,managed_alcohol_program,possible_matches,source_url").ilike("name", "%Olive Branch%"),
  db.from("tavily_resources").select("id,name").ilike("name", "%Olive Branch%"),
])
if (candidateResult.error || oliveResult.error || directoryResult.error) throw new Error("Shelter coverage data could not be loaded")
const candidates = candidateResult.data || []
const countBy = (key) => {
  const counts = {}
  for (const item of candidates) counts[item[key] || "Not stated"] = (counts[item[key] || "Not stated"] || 0) + 1
  return Object.fromEntries(Object.entries(counts).sort((left, right) => right[1] - left[1]))
}
console.log(JSON.stringify({
  generated_at: new Date().toISOString(), total_candidates: candidates.length, statuses: countBy("review_status"), types: countBy("shelter_type"), regions: countBy("region"), sources: countBy("source_name"),
  public_location_disclosure: candidates.filter((item) => item.location_disclosure_status === "public").length,
  confidential_location: candidates.filter((item) => item.location_disclosure_status === "confidential").length,
  undisclosed_location: candidates.filter((item) => item.location_disclosure_status === "undisclosed").length,
  geocoding_not_requested: candidates.filter((item) => item.geocoding_status === "not_requested").length,
  awaiting_authorized_geocoder: candidates.filter((item) => item.geocoding_status === "awaiting_authorized_geocoder").length,
  candidates_with_possible_matches: candidates.filter((item) => item.possible_matches?.length).length,
  possible_match_references: candidates.reduce((sum, item) => sum + (item.possible_matches?.length || 0), 0),
  matched_existing_canonical: candidates.filter((item) => item.matched_resource_id).length,
  imported_to_directory: candidates.filter((item) => item.imported_tavily_resource_id).length,
  olive_branch_candidates: oliveResult.data || [], olive_branch_directory_rows: directoryResult.data || [],
}, null, 2))
