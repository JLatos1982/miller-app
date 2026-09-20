import registry from "./data/miller-shared-resource-registry-v1.json" with { type: "json" }
import { buildSharedCanonicalMillerResources, millerResourceSearchText } from "./millerPublicSearchResources.js"

const clean = value => String(value ?? "").replace(/\s+/g, " ").trim()

// The canonical registry is intentionally loaded only by public browse views.
// Search uses the server's identical canonical catalog, so the homepage does
// not parse or merge a national registry before a person searches.
export const millerCanonicalPublicResources = Object.freeze(
  buildSharedCanonicalMillerResources(registry.records, registry.access_locations || [])
)

export function canonicalResourceText(resource = {}) {
  return millerResourceSearchText(resource).toLowerCase()
}

export function isCanonicalFundingResource(resource = {}) {
  return /\bfund|benefit|financial|income support|subsid|grant|bursary\b/.test(canonicalResourceText(resource))
    || Boolean(clean(resource.fundingType))
}

export function isCanonicalPracticalResource(resource = {}) {
  return /\bhousing|shelter|food|meal|basic needs|identification|document|transport|legal|advocacy|employment|training|outreach|income|benefit\b/.test(canonicalResourceText(resource))
}

export function displayCategory(value = "") {
  return clean(value).replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase()) || "Support"
}
