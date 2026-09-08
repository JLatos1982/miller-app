import rawResources from "../src/vancouver_resources_merged_updated.json" with { type: "json" }
import practicalSupports from "../src/data/miller-practical-supports-public-v1.json" with { type: "json" }
import millerFunding from "../src/data/miller-funding-assistance-public-v1.json" with { type: "json" }
import sharedResourceRegistry from "../src/data/miller-shared-resource-registry-v1.json" with { type: "json" }
import { stableCuratedResourceId } from "../src/map/mapChat.js"
import {
  buildMillerSpecializedSearchResources,
  buildSharedCanonicalMillerResources,
  mergeMillerSearchResources,
} from "../src/millerPublicSearchResources.js"
import { normalizedResourceRows } from "../src/resourceData.js"

function uniqueResources(resources) {
  const seen = new Set()
  return resources.filter(resource => {
    const key = String(resource?.id || "").trim()
      || `${String(resource?.name || "").trim().toLowerCase()}|${String(resource?.city || "").trim().toLowerCase()}`
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function buildMillerMobileCatalog() {
  const legacy = normalizedResourceRows(rawResources).map(resource => ({
    ...resource,
    id: stableCuratedResourceId(resource),
    province: resource.province || "British Columbia",
  }))
  const specialized = buildMillerSpecializedSearchResources(
    practicalSupports.records,
    millerFunding.records,
  )
  const shared = buildSharedCanonicalMillerResources(sharedResourceRegistry.records)
  return uniqueResources(mergeMillerSearchResources(
    mergeMillerSearchResources(legacy, specialized),
    shared,
  ))
}

export const millerMobileCatalog = Object.freeze(buildMillerMobileCatalog())
