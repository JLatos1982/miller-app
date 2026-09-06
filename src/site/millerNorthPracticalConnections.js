import practicalSupports from "../data/miller-practical-supports-public-v1.json" with { type: "json" }
import firstNationsSupports from "../data/miller-north-first-nations-supports-public-v1.json" with { type: "json" }

export const MILLER_NORTH_CASE_SUPPORT_CONNECTIONS = Object.freeze({
  "in-plain-sight": Object.freeze([
    ["miller", "curated:88k31t"],
    ["north", "fns_bc_fnha_quality_care_safety"],
  ]),
  "saskatoon-coerced-sterilization": Object.freeze([
    ["north", "fns_sk_indigenous_birth_support"],
    ["north", "fns_sk_fnho"],
  ]),
  "alberta-indigenous-primary-care": Object.freeze([
    ["north", "fns_ab_indigenous_support_line"],
    ["north", "fns_ab_indigenous_wellness_clinic"],
  ]),
  "first-nations-health-ombudsperson": Object.freeze([
    ["north", "fns_sk_fnho"],
    ["north", "fns_sk_sha_fnm_health_services"],
  ]),
  "alberta-indigenous-patient-safety": Object.freeze([
    ["north", "fns_ab_indigenous_support_line"],
    ["north", "fns_ab_four_winds_navigation"],
  ]),
})

const practicalById = new Map(practicalSupports.records.map(record => [record.id, record]))
const northById = new Map(firstNationsSupports.records.map(record => [record.public_support_id, record]))

function normalizePractical(record) {
  return record && {
    id: record.id,
    name: record.name,
    organization: record.organization,
    area: record.area_served,
    category: record.category.replaceAll("_", " "),
    description: record.description,
    eligibility: record.eligibility,
    phone: record.phone,
    website: record.website,
    collectionHref: "/practical-supports",
  }
}

function normalizeNorth(record) {
  return record && {
    id: record.public_support_id,
    name: record.name,
    organization: record.organization,
    area: record.service_area,
    category: record.categories.slice(0, 3).map(value => value.replaceAll("_", " ")).join(" · "),
    description: record.access_pathway,
    eligibility: record.eligibility,
    phone: record.phone,
    website: record.website,
    collectionHref: "/indigenous-healthcare-evidence/first-nations-supports",
  }
}

export function practicalHelpForCase(caseSlug) {
  return (MILLER_NORTH_CASE_SUPPORT_CONNECTIONS[caseSlug] || []).map(([collection, id]) => collection === "miller" ? normalizePractical(practicalById.get(id)) : normalizeNorth(northById.get(id))).filter(Boolean)
}
