export const TEMPORARY_CARD_NOTICE = "Please confirm hours, eligibility, and availability before attending."

export const TEMPORARY_CARD_FIELDS = [
  "name", "organization", "category", "city", "serviceArea", "description", "address",
  "phone", "email", "website", "hours", "eligibility", "referralProcess", "cost",
  "accessibility", "languages", "limitations", "callBeforeNote",
]

const LIMITS = Object.fromEntries(TEMPORARY_CARD_FIELDS.map((field) => [field, field === "description" ? 1600 : 500]))
LIMITS.website = 1200

function clean(value, limit = 500) {
  return String(value || "").trim().slice(0, limit)
}

export function normalizePublicUrl(value) {
  try {
    const url = new URL(String(value || "").trim())
    if (!['http:', 'https:'].includes(url.protocol)) return ""
    url.hash = ""
    return url.toString()
  } catch {
    return ""
  }
}

export function externalSourceKey(resource) {
  const url = normalizePublicUrl(resource?.sourceUrl || resource?.website)
  if (url) return `external:${url.toLowerCase()}`
  return `external:${[resource?.name, resource?.organization, resource?.city].map((value) => clean(value).toLowerCase()).join("|")}`
}

export function isEligibleExternalResult(resource, selectedResources = []) {
  if (!resource || resource.source !== "tavily" || resource.approved || resource.hidden) return false
  const sourceKey = externalSourceKey(resource)
  const hasUsefulIdentity = Boolean(clean(resource.name) && normalizePublicUrl(resource.website))
  if (!hasUsefulIdentity) return false
  return !selectedResources.some((item) => {
    if (item.sourceKey === sourceKey) return true
    const selectedUrl = normalizePublicUrl(item.website || item.sourceUrl)
    return selectedUrl && selectedUrl.toLowerCase() === normalizePublicUrl(resource.website).toLowerCase()
  })
}

// This is the complete allow-list sent for AI structuring. Handout fields and notes
// cannot enter the request because this function accepts and copies one result only.
export function buildTemporaryCardPayload(resource) {
  const sourceUrl = normalizePublicUrl(resource?.website)
  return {
    sourceTitle: clean(resource?.name),
    sourceUrl,
    sourceDomain: sourceUrl ? new URL(sourceUrl).hostname : "",
    name: clean(resource?.name),
    organization: clean(resource?.organization),
    description: clean(resource?.description, 1600),
    website: normalizePublicUrl(resource?.website),
    city: clean(resource?.city),
    category: clean(resource?.category),
    serviceType: clean(resource?.serviceType || resource?.service_type),
    searchCity: clean(resource?.searchCity),
  }
}

export function createManualTemporaryDraft(resource) {
  const payload = buildTemporaryCardPayload(resource)
  return {
    name: payload.name,
    organization: payload.organization,
    category: payload.category || payload.serviceType,
    city: payload.city || payload.searchCity,
    serviceArea: payload.city || payload.searchCity,
    description: payload.description,
    address: clean(resource?.address),
    phone: clean(resource?.phone),
    email: clean(resource?.email),
    website: payload.website,
    hours: clean(resource?.hours),
    eligibility: clean(resource?.eligibility),
    referralProcess: "",
    cost: "",
    accessibility: "",
    languages: "",
    limitations: "",
    callBeforeNote: TEMPORARY_CARD_NOTICE,
  }
}

export function sanitizeTemporaryDraft(draft, resource) {
  const fallback = createManualTemporaryDraft(resource)
  return Object.fromEntries(TEMPORARY_CARD_FIELDS.map((field) => {
    const value = clean(draft?.[field], LIMITS[field])
    if (field === "website") return [field, normalizePublicUrl(value) || fallback.website]
    return [field, value || fallback[field] || ""]
  }))
}

export function createTemporaryResource(draft, source, options = {}) {
  const values = sanitizeTemporaryDraft(draft, source)
  const clientId = options.clientId || crypto.randomUUID()
  return {
    ...values,
    type: "temporary-resource",
    clientId,
    key: `temporary:${clientId}`,
    sourceKey: externalSourceKey(source),
    sourceTitle: clean(source?.name),
    sourceUrl: normalizePublicUrl(source?.website),
    sourceDomain: normalizePublicUrl(source?.website) ? new URL(normalizePublicUrl(source.website)).hostname : "",
    sourceRetrievedAt: options.retrievedAt || new Date().toISOString(),
    aiAssisted: Boolean(options.aiAssisted),
    verificationStatus: options.verificationStatus === "confirmed" ? "confirmed" : "unconfirmed",
    showVerificationNote: options.showVerificationNote !== false,
    originalDescription: values.description,
    handoutDescription: values.description,
    handoutNote: clean(options.handoutNote, 1000),
  }
}
