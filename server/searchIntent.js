const SUPPORT_PATTERNS = [["counselling", /\b(counsell?ing|therapy|therapist|talk to someone)\b/i], ["substance use support", /\b(substance use|addiction|help with (?:fentanyl|opioids?|alcohol|cocaine|meth(?:amphetamine)?|cannabis))\b/i], ["withdrawal management", /\b(detox|withdrawal|withdrawing)\b/i], ["harm reduction", /\b(harm reduction|naloxone|safer use|safe supply)\b/i]]
const SUBSTANCES = [["fentanyl", /\bfentanyl\b/i], ["opioids", /\bopioids?\b/i], ["alcohol", /\balcohol\b/i], ["cocaine", /\bcocaine\b/i], ["methamphetamine", /\b(?:meth|methamphetamine)\b/i], ["cannabis", /\bcannabis\b/i]]
const TIMING = [["now", /\b(?:right )?now\b/i], ["today", /\btoday\b/i], ["tonight", /\btonight\b/i], ["this weekend", /\bthis weekend\b/i]]
const KNOWN_COMMUNITIES = ["Surrey", "Vancouver", "Burnaby", "Richmond", "Coquitlam", "New Westminster", "Delta", "Langley", "Abbotsford", "Chilliwack", "Maple Ridge", "White Rock"]
function unique(values) { return [...new Set(values.filter(Boolean))] }
function cleanText(value, maximum = 120) { const text = String(value || "").replace(/\s+/g, " ").trim().replace(/[,.!?]+$/, ""); return text && text.length <= maximum ? text : null }
export function emptySearchIntent() { return { version: "1.0", explicit: { supportNeeds: [], substances: [], locationText: null, city: null, transport: { noCar: false, transitRelevant: false, walkingRelevant: false }, timing: [], practicalConstraints: [] }, normalized: { supportConcepts: [], substanceTopics: [] }, uncertain: [] } }
export function extractConservativeSearchIntent(query, selectedCity = "") {
  const text = String(query || "").slice(0, 2_000), intent = emptySearchIntent()
  intent.explicit.supportNeeds = SUPPORT_PATTERNS.filter(([, pattern]) => pattern.test(text)).map(([name]) => name)
  intent.explicit.substances = SUBSTANCES.filter(([, pattern]) => pattern.test(text)).map(([name]) => name)
  intent.normalized.supportConcepts = [...intent.explicit.supportNeeds]
  intent.normalized.substanceTopics = intent.explicit.substances.map((item) => item === "fentanyl" ? "opioids" : item)
  intent.explicit.timing = TIMING.filter(([, pattern]) => pattern.test(text)).map(([name]) => name)
  intent.explicit.transport.noCar = /\b(?:i (?:do not|don['’]t) drive|no car|without a car)\b/i.test(text)
  intent.explicit.transport.walkingRelevant = /\b(?:walk|walking|walkable)\b/i.test(text)
  intent.explicit.transport.transitRelevant = intent.explicit.transport.noCar || /\b(?:transit|bus|skytrain)\b/i.test(text)
  if (intent.explicit.transport.noCar) intent.explicit.practicalConstraints.push("no car")
  if (intent.explicit.transport.walkingRelevant) intent.explicit.practicalConstraints.push("walking")
  const city = KNOWN_COMMUNITIES.find((name) => new RegExp(`\\b${name.replace(" ", "\\s+")}\\b`, "i").test(text)) || (selectedCity && selectedCity !== "All Cities" ? cleanText(selectedCity, 80) : null)
  intent.explicit.city = city || null
  const near = text.match(/\bnear\s+([^,.!?]+?)(?=\s+(?:and|but|because|so)\b|[,.!?]|$)/i), inPlace = text.match(/\b(?:in|around)\s+([A-Z][A-Za-z .'-]{2,50})(?=[,.!?]|$)/)
  intent.explicit.locationText = cleanText(near?.[1] || inPlace?.[1] || city, 80)
  return intent
}
function grounded(value, query) { return cleanText(value, 120) && String(query).toLocaleLowerCase().includes(String(value).toLocaleLowerCase()) }
export function validateModelSearchIntent(value, query) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const allowed = new Set(["supportNeeds", "substances", "locationText", "city", "transport", "timing", "practicalConstraints", "uncertain"])
  if (Object.keys(value).some((key) => !allowed.has(key))) return null
  const arrays = ["supportNeeds", "substances", "timing", "practicalConstraints", "uncertain"]
  if (arrays.some((key) => value[key] != null && (!Array.isArray(value[key]) || value[key].length > 8 || value[key].some((item) => !cleanText(item))))) return null
  if (value.transport != null && (typeof value.transport !== "object" || Array.isArray(value.transport) || Object.keys(value.transport).some((key) => !["noCar", "transitRelevant", "walkingRelevant"].includes(key)) || Object.values(value.transport).some((item) => typeof item !== "boolean"))) return null
  if (value.locationText && !grounded(value.locationText, query)) return null
  if (value.city && !grounded(value.city, query)) return null
  if (["supportNeeds", "substances", "timing", "practicalConstraints", "uncertain"].some((key) => (value[key] || []).some((item) => !grounded(item, query)))) return null
  return value
}
export function buildSearchIntent(query, modelValue, selectedCity = "") {
  const base = extractConservativeSearchIntent(query, selectedCity), model = validateModelSearchIntent(modelValue, query)
  if (!model) return base
  base.explicit.supportNeeds = unique([...base.explicit.supportNeeds, ...(model.supportNeeds || [])]).slice(0, 8)
  base.explicit.substances = unique([...base.explicit.substances, ...(model.substances || [])]).slice(0, 8)
  base.explicit.timing = unique([...base.explicit.timing, ...(model.timing || [])]).slice(0, 8)
  base.explicit.practicalConstraints = unique([...base.explicit.practicalConstraints, ...(model.practicalConstraints || [])]).slice(0, 8)
  base.uncertain = unique(model.uncertain || []).slice(0, 8)
  return base
}
export async function resolveSearchLocation(intent, { geocode = null } = {}) {
  const phrase = intent?.explicit?.locationText
  if (!phrase) return { status: "none" }
  if (intent.explicit.city && phrase.toLocaleLowerCase() === intent.explicit.city.toLocaleLowerCase()) return { status: "community", label: intent.explicit.city, city: intent.explicit.city, origin: null, provenance: { source: "user_text" } }
  if (!geocode) return { status: "ambiguous", label: phrase, clarification: `Which address or intersection near ${phrase} should Miller use?`, provenance: { source: "user_text" } }
  const result = await geocode(phrase)
  if (!result?.ok) return { status: "ambiguous", label: phrase, clarification: `Which address or intersection near ${phrase} should Miller use?`, provenance: { source: "user_text" } }
  return { status: "resolved", label: result.origin.label || phrase, city: intent.explicit.city, origin: { latitude: result.origin.latitude, longitude: result.origin.longitude, provenance: result.origin.provenance }, provenance: { source: "bc_address_geocoder" } }
}
