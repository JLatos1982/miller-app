const text = value => String(value ?? "").replace(/\s+/g, " ").trim()
const normalized = value => text(value).toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9]+/g, " ").trim()

export const MILLER_NEXT_STEP_INTENTS = Object.freeze([
  "housing",
  "detox",
  "treatment",
  "oat",
  "counselling",
  "harm_reduction",
  "meetings",
  "legal",
  "funding",
  "mental_health",
  "basic_needs",
  "transportation",
])

const intentRules = Object.freeze([
  ["detox", /\b(detox|withdrawal|withdrawing|withdrawal management)\b/],
  ["oat", /\b(oat|opioid agonist|methadone|suboxone|sublocade|buprenorphine)\b/],
  ["harm_reduction", /\b(harm reduction|naloxone|safer use|safe use|supplies|needle|overdose prevention)\b/],
  ["housing", /\b(housing|shelter|homeless|homelessness|recovery housing|supportive housing)\b/],
  ["legal", /\b(legal|lawyer|legal aid|rights|tenant|tenancy|advocacy|complaint)\b/],
  ["funding", /\b(funding|financial|grant|benefit|income assistance|disability assistance|subsidy|bursary)\b/],
  ["transportation", /\b(transportation|transport|transit|bus pass|medical travel|handydart|ride)\b/],
  ["basic_needs", /\b(food|meal|clothing|hygiene|basic needs|identification|birth certificate)\b/],
  ["meetings", /\b(aa|na|smart recovery|meeting|meetings|peer support|support group)\b/],
  ["counselling", /\b(counselling|counseling|therapy|therapist|talk to someone)\b/],
  ["mental_health", /\b(mental health|anxiety|depression|psychiatr|emotional support)\b/],
  ["treatment", /\b(treatment|rehab|residential|recovery program|outpatient)\b/],
])

const templates = Object.freeze({
  housing: "You could start with a housing-navigation service or contact one of the local providers below.",
  detox: "A good next step might be to call a withdrawal-management service and confirm its current intake instructions.",
  treatment: "You could start by contacting a treatment program to ask about its intake process and current requirements.",
  oat: "You could start by contacting an OAT or medication-support service and asking how its intake process works.",
  counselling: "You could start with a counselling option below and check whether you can contact it directly or need a referral.",
  harm_reduction: "You could start with a harm-reduction service below and check its current access details before you go.",
  meetings: "You could start by checking the meeting or peer-support details below for the current time and access information.",
  legal: "You could start with a legal-navigation service to understand what kind of information, referral, or advocacy it provides.",
  funding: "You could start by checking the program's eligibility, deadline, and application details on its official page.",
  mental_health: "You could start with a mental-health support below and check whether it accepts direct contact or requires a referral.",
  basic_needs: "You could start with one practical support below and check its current access details before visiting.",
  transportation: "You could start by checking the service area and booking or eligibility details for the transportation options below.",
})

const structuredConcepts = intent => [
  ...(intent?.explicit?.supportNeeds || []),
  ...(intent?.normalized?.supportConcepts || []),
].map(normalized).join(" ")

export function inferMillerNextStepIntent({ query = "", intent = null } = {}) {
  const haystack = `${normalized(query)} ${structuredConcepts(intent)}`.trim()
  if (!haystack) return null
  return intentRules.find(([, pattern]) => pattern.test(haystack))?.[0] || null
}

function sourceBackedAccessNote(results = []) {
  for (const resource of results.slice(0, 8)) {
    const access = normalized(resource?.accessType)
    if (!access) continue
    if (/\b(self referral|self refer|no referral|contact directly|call directly|walk in)\b/.test(access)) {
      return {
        text: `${text(resource.name)} lists direct or self-referral access; check its Access details before contacting it.`,
        basis: "resource_access_direct",
        resource_id: text(resource.id),
      }
    }
    if (/\b(referral required|requires a referral|physician referral|doctor referral|provider referral)\b/.test(access)) {
      return {
        text: `${text(resource.name)} lists a referral requirement; check its Access details for the current process.`,
        basis: "resource_access_referral",
        resource_id: text(resource.id),
      }
    }
  }
  if (results.slice(0, 8).some(resource => text(resource?.phone))) {
    return { text: "Calling a listed service first can help you confirm its current intake or access instructions.", basis: "published_phone_present", resource_id: null }
  }
  return null
}

export function buildMillerNextStepGuidance({ query = "", intent = null, results = [] } = {}) {
  const intentId = inferMillerNextStepIntent({ query, intent })
  if (!intentId || !templates[intentId] || !Array.isArray(results) || results.length === 0) return null
  return Object.freeze({
    intent: intentId,
    heading: "A good next step",
    text: templates[intentId],
    access_note: sourceBackedAccessNote(results),
    source: "deterministic_controlled_template",
  })
}
