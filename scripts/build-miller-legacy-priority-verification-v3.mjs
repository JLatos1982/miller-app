import { writeFile } from "node:fs/promises"

import rawResources from "../src/vancouver_resources_merged_updated.json" with { type: "json" }
import { stableCuratedResourceId } from "../src/map/mapChat.js"
import { normalizedResourceRows } from "../src/resourceData.js"

const overrides = Object.freeze({
  "curated:1drwmka": {
    website: "https://atira.bc.ca/what-we-do/housing/rice-block-support-recovery-housing-for-women",
    description: "Transitional supportive-recovery housing in Vancouver for women reducing or stopping substance use, including beds for women moving from detox toward treatment or from treatment toward longer-term housing.",
    population: "Women seeking supportive recovery housing; current referral and housing criteria apply.",
    email: "riceblocksupport@atira.bc.ca",
    access: "Referrals are primarily accepted from detox and treatment centres and may be reviewed through Vancouver Coastal Health central addiction intake or the BC Housing supported housing registry.",
  },
  "curated:99ypto": {
    website: "https://atira.bc.ca/what-we-do/housing/new-beginnings/",
    description: "Supportive housing in Vancouver for First Nations, Métis and Inuit women, including women with children under age two, with referrals and practical supports.",
    population: "First Nations, Métis and Inuit women; women with children under age two are also welcome. Current housing criteria apply.",
    email: "newbeginningssupport@atira.bc.ca",
    access: "Contact the program through its official email or Atira housing access pathway to confirm current referral and housing requirements.",
    visibility: ["miller", "miller_north"],
  },
  "curated:kt317p": {
    website: "https://wish-vancouver.net/wp-content/uploads/2025/07/2025-WISH-Daytime-Resource-Guide.pdf",
    description: "Public daytime resource guide from WISH compiling practical services for women in Vancouver's Downtown Eastside; individual service details should be confirmed before use.",
    population: "Women seeking daytime practical services in Vancouver's Downtown Eastside.",
    access: "Open the current official guide, then confirm service hours, access and contact details with the listed provider before relying on them.",
  },
})

const legacy = normalizedResourceRows(rawResources).map(resource => ({ ...resource, id: stableCuratedResourceId(resource), province: resource.province || "British Columbia" }))
const byId = new Map(legacy.map(resource => [resource.id, resource]))
const records = Object.entries(overrides).map(([id, update]) => {
  const source = byId.get(id)
  if (!source) throw new Error(`missing legacy resource ${id}`)
  return {
    canonical_resource_id: id,
    project_visibility: update.visibility || ["miller"],
    name: source.name,
    organization: source.organization || source.name,
    categories: [source.category || source.serviceType || "practical_support"],
    description: update.description,
    population_served: update.population,
    province: source.province,
    community: source.city || undefined,
    address: source.address || undefined,
    physical_location: source.city ? { community: source.city, address: source.address || undefined, province: source.province } : undefined,
    local_service_area: source.city ? [source.city] : undefined,
    service_area: source.region || source.city || source.province,
    delivery_modes: ["official online information", "contact service"],
    referral_requirements: update.access,
    access_pathway: update.access,
    phone: source.phone || undefined,
    email: update.email || source.email || undefined,
    website: update.website,
    source: { title: source.name, authority: source.organization || source.name, url: update.website },
    last_verified_date: "2026-09-08",
  }
})

const output = {
  schema_version: "miller-legacy-priority-verification-v3",
  generated_at: "2026-09-08",
  selection_method: ["appears in current frontline benchmark results", "stale verification blocked mobile readiness", "current first-party source available"],
  verification_scope: "Bounded three-record refresh. No readiness threshold was used as an acceptance target.",
  deferred: [
    { canonical_resource_id: "curated:ndlbns", reason: "The available organization database is not a sufficiently precise current service page for confident enrichment." },
  ],
  records,
}

await writeFile(new URL("../src/data/miller-legacy-priority-verification-v3-2026-09-08.json", import.meta.url), `${JSON.stringify(output, null, 2)}\n`)
console.log(JSON.stringify({ generated: records.length, deferred: output.deferred.length }))
