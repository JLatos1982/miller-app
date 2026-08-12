const text = (value) => String(value ?? "").trim()

export function flattenResourceRows(rows, output = []) {
  for (const row of Array.isArray(rows) ? rows : []) {
    if (Array.isArray(row)) flattenResourceRows(row, output)
    else if (row && typeof row === "object" && Object.keys(row).length) output.push(row)
  }
  return output
}

const first = (row, keys) => {
  for (const key of keys) if (text(row[key])) return text(row[key])
  return ""
}

export function normalizeResourceRow(row) {
  return {
    name: first(row, ["Resource Name", "Name", "name"]) || "Unnamed Resource",
    organization: first(row, ["Organization", "organization"]),
    serviceType: first(row, ["Service Type", "serviceType", "service_type"]),
    category: first(row, ["Program Category", "category"]),
    population: first(row, ["Population", "population"]),
    eligibility: first(row, ["Age / Eligibility", "eligibility"]),
    description: first(row, ["Description", "description"]),
    accessType: first(row, ["Access Type", "accessType", "access_type"]),
    hours: first(row, ["Hours", "hours"]), phone: first(row, ["Phone", "phone"]),
    altPhone: first(row, ["Alt Phone", "altPhone"]), email: first(row, ["Email", "email"]),
    website: first(row, ["Website", "website"]), address: first(row, ["Address", "address"]),
    city: first(row, ["City", "city"]), region: first(row, ["Region", "region"]),
    notes: first(row, ["Notes", "notes"]), fundingType: first(row, ["Funding Type", "funding_type"]),
    source: first(row, ["source"]) || "curated", approved: row.approved !== false,
    hidden: row.hidden === true, latitude: first(row, ["latitude"]), longitude: first(row, ["longitude"]),
    virtual_service: row.virtual_service === true, mobile_service: row.mobile_service === true,
    public_map: row.public_map !== false, verification_status: first(row, ["verification_status", "geocode_status"]),
    location_last_verified: first(row, ["location_last_verified"]),
  }
}

export function normalizedResourceRows(rows) {
  return flattenResourceRows(rows).map(normalizeResourceRow)
}
