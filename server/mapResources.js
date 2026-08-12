import curatedRows from "../src/vancouver_resources_merged_updated.json" with { type: "json" }
import { stableCuratedResourceId } from "../src/map/mapChat.js"
import { normalizedResourceRows } from "../src/resourceData.js"

const value = (row, key) => String(row[key] || "").trim()

export const curatedMapResources = normalizedResourceRows(curatedRows).map((row) => {
  const resource = {
    name: value(row, "name") || "Unnamed resource",
    organization: value(row, "organization"), serviceType: value(row, "serviceType"),
    category: value(row, "category"), population: value(row, "population"),
    eligibility: value(row, "eligibility"), description: value(row, "description"),
    accessType: value(row, "accessType"), hours: value(row, "hours"), phone: value(row, "phone"),
    website: value(row, "website"), address: value(row, "address"), city: value(row, "city"),
    region: value(row, "region"), source: "curated", approved: true, hidden: false,
  }
  return { ...resource, id: stableCuratedResourceId(resource) }
})

const curatedById = new Map(curatedMapResources.map((resource) => [String(resource.id), resource]))
export function getCuratedMapResource(id) { return curatedById.get(String(id)) || null }

export async function authorizeMapMatches(candidateIds, supabase) {
  const orderedIds = [...new Set((candidateIds || []).map(String))].slice(0, 30)
  const authorized = new Map(orderedIds.filter((id) => curatedById.has(id)).map((id) => [id, curatedById.get(id)]))
  const numericIds = orderedIds.filter((id) => /^\d+$/.test(id)).map(Number)
  if (numericIds.length) {
    const { data, error } = await supabase.from("tavily_resources")
      .select("id,name,organization,description,website,city,category,service_type,source,approved,hidden")
      .in("id", numericIds).eq("approved", true).eq("hidden", false)
    if (error) throw new Error("Could not authorize map resources")
    for (const row of data || []) authorized.set(String(row.id), row)
  }
  return orderedIds.filter((id) => authorized.has(id)).map((id) => authorized.get(id))
}
