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
