export const categoryLabels = {
  healthcare: "Health",
  housing: "Housing",
  legal_rights: "Legal & rights",
  financial_funding: "Funding",
  mental_health_substance_use: "Mental health & substance use",
  transportation: "Transportation",
  family_community: "Family & community",
}

const searchableTerms = record => [
  record.program_name,
  record.organization,
  record.description,
  record.population_served,
  record.eligibility,
  record.geography,
  record.service_area,
  ...(record.categories || []),
  ...(record.subcategories || []),
  ...(record.access_requirements || []),
  record.transportation?.funding_source,
  ...(record.transportation?.eligible_trip_types || []),
  ...(record.transportation?.travel_modes || []),
].filter(Boolean).join(" ").toLowerCase()

export function matchesSupportCategory(record, category) {
  if (category === "all") return true
  if (category === "mental_health_substance_use") return /mental health|substance|addiction|treatment|detox|harm reduction|recovery/.test(searchableTerms(record))
  if (category === "transportation") return /transport|travel|ambulance|medevac|escort/.test(searchableTerms(record))
  return record.categories.includes(category)
}

export function filterMillerNorthSupports(records, { query = "", province = "all", category = "all" } = {}) {
  const term = query.trim().toLowerCase()
  return records.filter(record => (!term || searchableTerms(record).includes(term))
    && (province === "all" || record.province === province)
    && matchesSupportCategory(record, category))
}
