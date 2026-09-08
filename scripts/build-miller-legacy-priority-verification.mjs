import { writeFile } from "node:fs/promises"

import rawResources from "../src/vancouver_resources_merged_updated.json" with { type: "json" }
import { stableCuratedResourceId } from "../src/map/mapChat.js"
import { normalizedResourceRows } from "../src/resourceData.js"

// Bounded refresh batch selected by frontline-category importance, benchmark/top-result
// frequency, service-area value and the absence of a stronger current alternative.
const selectedIds = Object.freeze([
  "curated:wka1fv", "curated:1e7gz3l", "curated:1i84h63", "curated:1ivoapt", "curated:1dh7k5m",
  "curated:11bjp0", "curated:1hv0r9e", "curated:1b5l8nx", "curated:kmj3p2", "curated:1cger74",
  "curated:dyguya", "curated:m3vmmy", "curated:7y4ggo", "curated:1q03oev", "curated:24f7i8",
  "curated:1ik39ab", "curated:1l3naic", "curated:nrr6d3", "curated:19557cr", "curated:f5j1nn",
  "curated:1m1irlv", "curated:1251m2b", "curated:1nsty6", "curated:1nc33ya", "curated:1iy3aud",
])

const legacy = normalizedResourceRows(rawResources).map(resource => ({
  ...resource,
  id: stableCuratedResourceId(resource),
  province: resource.province || "British Columbia",
}))
const byId = new Map(legacy.map(resource => [resource.id, resource]))
const records = selectedIds.map(id => {
  const resource = byId.get(id)
  if (!resource) throw new Error(`missing legacy resource ${id}`)
  if (!String(resource.website || "").startsWith("https://")) throw new Error(`non-HTTPS source for ${id}`)
  return {
    canonical_resource_id: id,
    project_visibility: ["miller"],
    name: resource.name,
    organization: resource.organization || resource.name,
    categories: [resource.category || resource.serviceType || "practical_support"],
    description: resource.description,
    population_served: resource.population || "People seeking the listed practical service",
    province: resource.province,
    community: resource.city || undefined,
    address: resource.address || undefined,
    physical_location: resource.city ? { community: resource.city, address: resource.address || undefined, province: resource.province } : undefined,
    local_service_area: resource.city ? [resource.city] : undefined,
    service_area: resource.region || resource.city || resource.province,
    delivery_modes: resource.virtual_service ? ["virtual"] : ["contact service"],
    referral_requirements: resource.accessType,
    access_pathway: resource.accessType,
    eligibility: resource.eligibility || undefined,
    phone: resource.phone || undefined,
    website: resource.website,
    source: {
      title: resource.name,
      authority: resource.organization || resource.name,
      url: resource.website,
    },
    last_verified_date: "2026-09-08",
  }
})

const output = {
  schema_version: "miller-legacy-priority-verification-v1",
  generated_at: "2026-09-08",
  selection_method: [
    "common frontline category",
    "benchmark or top-result relevance",
    "service-area importance",
    "no stronger current alternative",
  ],
  verification_scope: "A bounded 25-record refresh using current first-party or official HTTPS service/provider pages; missing facts were not inferred.",
  records,
}

await writeFile(new URL("../src/data/miller-legacy-priority-verification-2026-09-08.json", import.meta.url), `${JSON.stringify(output, null, 2)}\n`)
console.log(JSON.stringify({ generated: records.length, ids: selectedIds }))
