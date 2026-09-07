export function toMillerNorthSupportEmailResult(record) {
  if (!record?.public_support_id || !record?.name || !record?.website) return null
  return {
    id: `support:north:${record.public_support_id}`,
    kind: "service",
    name: record.name,
    organization: record.organization,
    description: record.access_pathway,
    region: record.service_area,
    eligibility: record.eligibility,
    accessType: record.referral_requirements || record.access_pathway,
    phone: record.phone,
    website: record.website,
    source: "Miller North First Nations Supports",
    last_verified_at: record.last_verified_date,
    approved: true,
    hidden: false,
  }
}

export function toMillerNorthSharedEmailResult(record) {
  if (!record?.project_visibility?.includes("miller_north") || !record?.program_name || !record?.website) return null
  const fundingSourceId = record.source_record_ids?.find(id => id.startsWith("funding:miller-north:"))
  const supportSourceId = record.source_record_ids?.find(id => id.startsWith("fns_"))
  const sharedSourceId = record.source_record_ids?.find(id => id.startsWith("shared_"))
  const sourceId = fundingSourceId || supportSourceId || sharedSourceId || record.canonical_resource_id
  if (!sourceId) return null
  return {
    id: fundingSourceId ? sourceId : `support:north:${sourceId}`,
    kind: fundingSourceId || record.funding ? "funding" : "service",
    name: record.program_name,
    organization: record.organization,
    description: record.description || record.access,
    region: record.service_area || record.geography,
    eligibility: record.eligibility,
    accessType: record.access,
    phone: record.phone,
    website: record.website,
    source: record.source?.authority,
    last_verified_at: record.last_verified,
    approved: true,
    hidden: false,
  }
}
