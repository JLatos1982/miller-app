const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const MAX_EMAIL_RESULTS = 15
export const EMAIL_RESULTS_RATE_LIMIT = Object.freeze({ windowMs: 60 * 60 * 1000, max: 3 })

const clean = (value, max = 500) => String(value ?? "")
  .split("")
  .map((character) => {
    const code = character.charCodeAt(0)
    return code < 32 || code === 127 ? " " : character
  })
  .join("")
  .replace(/\s+/g, " ")
  .trim()
  .slice(0, max)

const safeUrl = (value) => {
  try {
    const parsed = new URL(clean(value, 2_000))
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.toString() : ""
  } catch {
    return ""
  }
}

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;")

export function isValidEmailAddress(value) {
  const candidate = clean(value, 254)
  return candidate.length >= 6 && candidate.length <= 254 && EMAIL_PATTERN.test(candidate)
}

export function normalizeEmailResult(resource) {
  if (!resource || typeof resource !== "object") return null
  const id = clean(resource.id, 120)
  const name = clean(resource.name, 160)
  if (!id || !name || resource.hidden === true || resource.approved === false) return null
  return Object.freeze({
    id,
    kind: resource.kind === "funding" ? "funding" : "service",
    name,
    organization: clean(resource.organization, 160),
    description: clean(resource.description, 500),
    city: clean(resource.city, 100),
    region: clean(resource.region, 120),
    eligibility: clean(resource.eligibility, 350),
    access: clean(resource.accessType || resource.access, 350),
    phone: clean(resource.phone, 80),
    website: safeUrl(resource.website),
    source: clean(resource.source === "curated" ? "Miller curated directory" : resource.source, 120),
    lastVerified: clean(resource.location_last_verified || resource.last_verified_at, 40),
  })
}

export function buildEmailResultIndex(resources) {
  return new Map((Array.isArray(resources) ? resources : [])
    .map(normalizeEmailResult)
    .filter(Boolean)
    .map((resource) => [resource.id, resource]))
}

export function validateEmailResultsRequest(body) {
  const recipient = clean(body?.recipient, 254).toLowerCase()
  const resultIds = Array.isArray(body?.result_ids)
    ? [...new Set(body.result_ids.map((id) => clean(id, 120)).filter(Boolean))]
    : []
  if (body?.confirm !== true) throw new Error("confirmation_required")
  if (!isValidEmailAddress(recipient)) throw new Error("invalid_email")
  if (!resultIds.length) throw new Error("no_results_selected")
  if (resultIds.length > MAX_EMAIL_RESULTS) throw new Error("too_many_results")
  return {
    recipient,
    resultIds,
    city: clean(body?.search_context?.city, 80),
    categories: Array.isArray(body?.search_context?.categories)
      ? body.search_context.categories.map((item) => clean(item, 60)).filter(Boolean).slice(0, 5)
      : [],
  }
}

export function resolveEmailResults(resultIds, resourceIndex) {
  const resources = resultIds.map((id) => resourceIndex.get(id)).filter(Boolean)
  if (resources.length !== resultIds.length) throw new Error("unavailable_result")
  return resources
}

export function buildResultsEmail({ resources, city = "", categories = [] }) {
  if (!Array.isArray(resources) || !resources.length || resources.length > MAX_EMAIL_RESULTS) {
    throw new Error("invalid_result_selection")
  }
  const safeCity = clean(city, 80)
  const fundingOnly = resources.every(resource => resource.kind === "funding")
  const mixed = resources.some(resource => resource.kind === "funding") && !fundingOnly
  const subject = fundingOnly
    ? "Funding opportunities from Miller"
    : mixed
      ? "Selected Miller resources and funding"
      : safeCity && safeCity.toLowerCase() !== "all cities"
        ? `Miller resources for ${safeCity}`
        : "Selected Miller resources"
  const context = categories.length
    ? `This list includes ${categories.map((item) => clean(item, 60)).filter(Boolean).join(", ")} supports${safeCity ? ` around ${safeCity}` : ""}.`
    : `Here are the ${resources.length} resources selected from Miller${safeCity ? ` for ${safeCity}` : ""}.`
  const textItems = resources.map((resource, index) => [
    `${index + 1}. ${resource.name}`,
    resource.organization ? `Organization: ${resource.organization}` : "",
    resource.city || resource.region ? `Location: ${[resource.city, resource.region].filter(Boolean).join(", ")}` : "",
    resource.description ? `About: ${resource.description}` : "",
    resource.eligibility ? `Eligibility: ${resource.eligibility}` : "",
    resource.access ? `Access: ${resource.access}` : "",
    resource.phone ? `Phone: ${resource.phone}` : "",
    resource.website ? `Website: ${resource.website}` : "",
    resource.lastVerified ? `Last verified: ${resource.lastVerified}` : "",
  ].filter(Boolean).join("\n")).join("\n\n")
  const disclaimer = fundingOnly
    ? "Funding availability, deadlines and eligibility can change. Check the official program page before applying."
    : mixed
      ? "Service and funding availability can change. Contact services directly and check official program pages before relying on this information."
      : "Program availability and eligibility can change. Please contact each service directly to confirm current information."
  const text = `${context}\n\n${textItems}\n\n${disclaimer}`
  const htmlItems = resources.map((resource) => {
    const details = [
      resource.organization ? `<p><strong>Organization:</strong> ${escapeHtml(resource.organization)}</p>` : "",
      resource.city || resource.region ? `<p><strong>Location:</strong> ${escapeHtml([resource.city, resource.region].filter(Boolean).join(", "))}</p>` : "",
      resource.description ? `<p>${escapeHtml(resource.description)}</p>` : "",
      resource.eligibility ? `<p><strong>Eligibility:</strong> ${escapeHtml(resource.eligibility)}</p>` : "",
      resource.access ? `<p><strong>Access:</strong> ${escapeHtml(resource.access)}</p>` : "",
      resource.phone ? `<p><strong>Phone:</strong> ${escapeHtml(resource.phone)}</p>` : "",
      resource.website ? `<p><a href="${escapeHtml(resource.website)}">Open the public resource page</a></p>` : "",
      resource.lastVerified ? `<p><small>Last verified: ${escapeHtml(resource.lastVerified)}</small></p>` : "",
    ].filter(Boolean).join("")
    return `<section style="margin:0 0 24px"><h2 style="font-size:18px;margin:0 0 8px">${escapeHtml(resource.name)}</h2>${details}</section>`
  }).join("")
  const html = `<main style="font-family:Arial,sans-serif;line-height:1.5;max-width:680px;margin:auto;padding:24px;color:#20231f"><p>${escapeHtml(context)}</p>${htmlItems}<p><small>${escapeHtml(disclaimer)}</small></p></main>`
  return { subject, text, html }
}

export function emailProviderStatus(environment = process.env) {
  const provider = clean(environment.MILLER_EMAIL_PROVIDER, 40).toLowerCase()
  const enabled = provider === "resend" && Boolean(clean(environment.RESEND_API_KEY, 500)) && Boolean(clean(environment.MILLER_EMAIL_FROM, 254))
  return { enabled, provider: enabled ? "resend" : null, max_results: MAX_EMAIL_RESULTS }
}

export function createEmailSender(environment = process.env, request = fetch) {
  const status = emailProviderStatus(environment)
  if (!status.enabled) return null
  return async ({ recipient, subject, text, html }) => {
    const response = await request("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${environment.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: clean(environment.MILLER_EMAIL_FROM, 254),
        to: [recipient],
        subject,
        text,
        html,
      }),
    })
    if (!response.ok) throw new Error("provider_failure")
    const payload = await response.json()
    return { message_id: clean(payload?.id, 160) || null }
  }
}

export const emailErrorMessage = (code) => ({
  confirmation_required: "Please review the email and confirm before sending.",
  invalid_email: "Enter a valid email address.",
  no_results_selected: "Select at least one resource.",
  too_many_results: `Choose no more than ${MAX_EMAIL_RESULTS} resources.`,
  unavailable_result: "One or more selected resources are no longer available. Please refresh the results.",
}[code] || "We couldn’t send that email right now. Your results are still here.")
