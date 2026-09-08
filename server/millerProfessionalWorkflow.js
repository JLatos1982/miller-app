const clean = value => String(value ?? "").replace(/\s+/g, " ").trim()
const normalized = value => clean(value).toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9]+/g, " ").trim()

const NEED_LABELS = Object.freeze({
  detox: "Withdrawal support",
  treatment: "Treatment",
  oat: "Opioid agonist treatment",
  counselling: "Counselling",
  mental_health: "Mental-health support",
  housing: "Housing",
  transportation: "Transportation",
  funding: "Cost or funding",
  legal: "Legal navigation",
  harm_reduction: "Harm reduction",
  meetings: "Peer support",
  basic_needs: "Basic needs",
  reentry: "Re-entry support",
  family_support: "Family or caregiver support",
  continuity: "Continuity after discharge or treatment",
  access_navigation: "Access navigation",
})

const BARRIER_NEEDS = new Set(["transportation", "funding", "legal", "basic_needs"])

function inferredNeeds(query) {
  const text = normalized(query)
  const needs = []
  if (/\b(leaving|after|discharg(?:e|ed|ing)|finishing|returning|coming (?:back )?home)\b.*\b(detox|treatment|custody|jail|hospital)\b|\b(returning|coming back|coming)\b.*\b(after treatment|after detox|from treatment|from detox)\b|\b(housing|somewhere to stay)\b.*\b(after|afterward|afterwards)\b.*\b(detox|treatment)|\b(detox|treatment)\b.*\b(housing|somewhere to stay)\b.*\b(after|afterward|afterwards)\b/.test(text)) needs.push("continuity")
  if (/\b(no|without|doesn t have|do not have)\b.*\b(family doctor|doctor|primary care|referral)\b|\bhow (?:do|can) (?:i|we|they) (?:get|access|start)\b/.test(text)) needs.push("access_navigation")
  if (/\b(doesn t drive|does not drive|no car|can t get there|cannot get there)\b/.test(text)) needs.push("transportation")
  if (/\b(can t afford|cannot afford|low cost|free option|cost is a barrier)\b/.test(text)) needs.push("funding")
  if (/\b(famil(?:y|ies)|parent|caregiver|loved one)\b/.test(text) && !/\bfamily doctor\b/.test(text)) needs.push("family_support")
  return needs
}

export function millerProfessionalWorkflowIntent(query = "", needs = []) {
  const text = normalized(query)
  const ids = new Set(needs.map(need => typeof need === "string" ? need : need?.need_id))
  return ids.has("continuity") && /\b(return(?:ing)?|coming back|coming (?:back )?home|after treatment|after detox|discharg(?:e|ed|ing))\b/.test(text)
    ? "return_home_after_treatment"
    : "multi_need_resource_navigation"
}

export function decomposeMillerProfessionalNeeds(query = "", intents = []) {
  const explicit = [...new Set(intents.map(clean).filter(Boolean))]
  const inferred = inferredNeeds(query).filter(id => !explicit.includes(id))
  return Object.freeze([...explicit, ...inferred].map((needId, index) => ({
    need_id: needId,
    label: NEED_LABELS[needId] || needId.replaceAll("_", " "),
    role: index === 0 ? "primary" : BARRIER_NEEDS.has(needId) ? "barrier" : "related",
    basis: explicit.includes(needId) ? "request_language" : "deterministic_context_rule",
  })))
}

function resourceText(resource) {
  return normalized([
    resource?.name, resource?.category, resource?.service_type, resource?.description,
    resource?.access_note, resource?.referral_note, resource?.funding_note,
    resource?.transportation_note, ...(resource?.tags || []),
  ].join(" "))
}

const MATCH_TERMS = Object.freeze({
  detox: ["detox", "withdrawal"], treatment: ["treatment", "residential", "outpatient"],
  oat: ["oat", "opioid agonist", "methadone", "suboxone", "buprenorphine"],
  counselling: ["counselling", "counseling", "therapy"], mental_health: ["mental health", "crisis", "psychiatric"],
  housing: ["housing", "shelter", "homeless"], transportation: ["transportation", "medical travel", "transit", "ride"],
  funding: ["funding", "financial", "benefit", "low cost", "free"], legal: ["legal", "tenancy", "rights", "advocacy"],
  harm_reduction: ["harm reduction", "naloxone", "overdose prevention"], meetings: ["peer support", "meeting", "smart recovery"],
  basic_needs: ["basic needs", "food", "income", "identification"], reentry: ["re entry", "reentry", "reintegration", "release planning"],
  family_support: ["family", "caregiver", "parent"], continuity: ["aftercare", "transition", "continuity"],
  access_navigation: ["navigation", "intake", "access line", "service finder"],
})

function matchesNeed(resource, needId) {
  const text = resourceText(resource)
  return (MATCH_TERMS[needId] || []).some(term => text.includes(normalized(term)))
}

function accessReason(resource) {
  const access = normalized(`${resource?.access_note || ""} ${resource?.referral_note || ""}`)
  if (access.includes("self referral") || access.includes("self refer")) return "Self-referral stated"
  if (access.includes("centralized intake") || access.includes("central intake")) return "Centralized intake"
  if (access.includes("provider referral") || access.includes("referral required") || access.includes("requires referral")) return "Referral required"
  if (access.includes("walk in")) return "Walk-in access stated"
  if (access.includes("call") || access.includes("phone")) return "Phone-first access"
  return ""
}

function resultGroup(matched, needs) {
  if (matched.includes(needs[0]?.need_id)) return "start_here"
  if (matched.some(id => needs.find(need => need.need_id === id)?.role === "barrier")) return "barrier_support"
  return "also_useful"
}

export function explainMillerProfessionalResults(results = [], needs = []) {
  return results.map(resource => {
    const matched = needs.filter(need => matchesNeed(resource, need.need_id)).map(need => need.need_id)
    const reasons = []
    if (resource.location_label) reasons.push(clean(resource.location_label))
    if (matched.length) reasons.push(`Matches ${NEED_LABELS[matched[0]] || matched[0].replaceAll("_", " ")}`)
    const access = accessReason(resource)
    if (access) reasons.push(access)
    else if (resource.transportation_note && needs.some(need => need.need_id === "transportation")) reasons.push("Transportation information available")
    else if (resource.funding_note && needs.some(need => need.need_id === "funding")) reasons.push("Funding information available")
    return { ...resource, why_shown: reasons.slice(0, 3), matched_needs: matched, result_group: resultGroup(matched, needs) }
  })
}

function pickFirst(results, predicate) {
  return results.find(predicate)
}

export function buildMillerAccessPathway({ results = [], needs = [], searchScope = {} } = {}) {
  const steps = []
  const primary = needs[0]?.need_id
  const start = pickFirst(results, resource => resource.result_group === "start_here") || results[0]
  if (searchScope.no_verified_local_facility) {
    const navigator = pickFirst(results, resource => resource.location_relationship === "located_here")
      || pickFirst(results, resource => ["regional_intake", "province_navigation"].includes(resource.location_relationship))
    if (navigator) steps.push({ step_id: "regional_intake", title: `Start with ${navigator.name}`, detail: navigator.location_label || "Use the verified regional navigation pathway.", resource_ids: [navigator.canonical_id], basis: "verified_service_scope" })
  }
  if (start && !steps.some(step => step.resource_ids.includes(start.canonical_id))) {
    const access = clean(start.referral_note || start.access_note)
    steps.push({ step_id: "first_contact", title: `Contact ${start.name}`, detail: access || "Confirm the current intake pathway directly with the service.", resource_ids: [start.canonical_id], basis: access ? "verified_access_note" : "safety_confirmation" })
  }
  const requested = new Set(needs.map(need => need.need_id))
  for (const [needId, title] of [["housing", "Review housing options"], ["transportation", "Address the travel barrier"], ["funding", "Check cost and funding supports"], ["legal", "Use legal navigation if needed"]]) {
    if (!requested.has(needId) || needId === primary) continue
    const resource = pickFirst(results, item => item.matched_needs?.includes(needId))
    if (resource) steps.push({ step_id: needId, title, detail: `${resource.name} is included because its verified information matches this part of the request.`, resource_ids: [resource.canonical_id], basis: "deterministic_need_match" })
  }
  if (requested.has("continuity")) {
    const continuity = pickFirst(results, item => item.access_pathway?.return_home_support?.length)
      || pickFirst(results, item => item.matched_needs?.includes("continuity"))
      || pickFirst(results, item => /aftercare|continuity|follow up|follow-up|community support/i.test(`${item.description || ""} ${item.access_note || ""}`))
    if (continuity) {
      const detail = continuity.access_pathway?.return_home_support?.join("; ")
        || `${continuity.name} includes verified information relevant to support after returning home.`
      steps.push({ step_id: "return_home_support", title: "Plan the return-home connection", detail, resource_ids: [continuity.canonical_id], basis: continuity.access_pathway?.return_home_support?.length ? "verified_access_note" : "deterministic_need_match" })
    }
  }
  return steps.slice(0, 4).map((step, index) => ({ ...step, order: index + 1 }))
}

export function recommendedMillerPackIds(results = [], needs = []) {
  const selected = []
  for (const need of needs) {
    const resource = results.find(item => item.matched_needs?.includes(need.need_id) && (item.phone || item.website) && !selected.includes(item.canonical_id))
    if (resource) selected.push(resource.canonical_id)
    if (selected.length === 3) break
  }
  if (!selected.length && results[0] && (results[0].phone || results[0].website)) selected.push(results[0].canonical_id)
  return selected
}
