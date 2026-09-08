const clean = value => String(value ?? "").replace(/\s+/g, " ").trim()
const normalized = value => clean(value).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim()

const CURRENT_VERIFICATION_DAYS = 400
const VERIFIED_STATES = new Set(["verified_active", "verified_public", "approved", "active"])

function validPublicUrl(value) {
  try {
    return new URL(clean(value)).protocol === "https:"
  } catch {
    return false
  }
}

function canonicalUrl(value) {
  try {
    const parsed = new URL(clean(value))
    parsed.hash = ""
    for (const key of [...parsed.searchParams.keys()]) if (key.startsWith("utm_")) parsed.searchParams.delete(key)
    return `${parsed.origin}${parsed.pathname.replace(/\/$/, "")}${parsed.search}`.toLowerCase()
  } catch {
    return ""
  }
}

function verificationDate(resource) {
  return clean(resource.location_last_verified || resource.last_verified || resource.source?.last_verified)
}

function sourceUrl(resource) {
  return clean(resource.sourceUrl || resource.source?.url || resource.website)
}

function verificationCurrent(value, now) {
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return false
  const ageDays = (now.getTime() - timestamp) / 86_400_000
  return ageDays >= -1 && ageDays <= CURRENT_VERIFICATION_DAYS
}

function duplicateKeys(resource) {
  const keys = []
  const url = canonicalUrl(resource.website || sourceUrl(resource))
  const name = normalized(resource.name)
  const geography = normalized(`${resource.city || ""}|${resource.province || ""}|${resource.region || ""}`)
  if (url && name) keys.push(`url-name:${url}|${name}`)
  if (name && geography) keys.push(`name:${name}|${geography}`)
  return keys
}

export function buildMobileDuplicateConflictIndex(catalog = []) {
  const owners = new Map()
  for (const resource of catalog) {
    const id = clean(resource.id)
    for (const key of duplicateKeys(resource)) {
      if (!owners.has(key)) owners.set(key, new Set())
      owners.get(key).add(id)
    }
  }
  const conflicts = new Map()
  for (const resource of catalog) {
    const ids = new Set()
    for (const key of duplicateKeys(resource)) {
      for (const id of owners.get(key) || []) if (id && id !== clean(resource.id)) ids.add(id)
    }
    conflicts.set(clean(resource.id), [...ids].sort())
  }
  return conflicts
}

export function assessMobileResourceReadiness(resource, { now = new Date(), conflicts = [] } = {}) {
  const status = clean(resource.verification_status || resource.source?.verification_status || "verified_public").toLowerCase()
  const access = clean(resource.accessType || resource.referralNote || resource.access_note)
  const checks = Object.freeze({
    stable_canonical_id: Boolean(clean(resource.id)),
    current_public_source: validPublicUrl(sourceUrl(resource))
      && VERIFIED_STATES.has(status)
      && verificationCurrent(verificationDate(resource), now),
    verified_contact: Boolean(clean(resource.phone || resource.email)) || validPublicUrl(resource.website || sourceUrl(resource)),
    clear_location_or_scope: Boolean(clean(resource.province) && clean(resource.city || resource.region || resource.service_area)),
    sufficient_access_information: Boolean(access),
    no_duplicate_conflict: conflicts.length === 0,
  })
  const reasons = Object.entries(checks).filter(([, passed]) => !passed).map(([key]) => key)
  return Object.freeze({ mobile_ready: reasons.length === 0, checks, reasons, duplicate_conflicts: [...conflicts] })
}

export function buildMobileReadinessIndex(catalog = [], { now = new Date() } = {}) {
  const conflicts = buildMobileDuplicateConflictIndex(catalog)
  return new Map(catalog.map(resource => {
    const id = clean(resource.id)
    return [id, assessMobileResourceReadiness(resource, { now, conflicts: conflicts.get(id) || [] })]
  }))
}

export function mobileReadinessSummary(catalog = [], { now = new Date() } = {}) {
  const index = buildMobileReadinessIndex(catalog, { now })
  const reasonCounts = {}
  let ready = 0
  for (const assessment of index.values()) {
    if (assessment.mobile_ready) ready += 1
    for (const reason of assessment.reasons) reasonCounts[reason] = (reasonCounts[reason] || 0) + 1
  }
  return Object.freeze({
    total: catalog.length,
    mobile_ready: ready,
    not_mobile_ready: catalog.length - ready,
    readiness_rate: catalog.length ? Number((ready / catalog.length).toFixed(3)) : 0,
    reason_counts: Object.fromEntries(Object.entries(reasonCounts).sort()),
  })
}
