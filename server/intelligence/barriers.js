export const BARRIER_FIELDS = Object.freeze(["self_referral", "referral_required", "appointment_required", "walk_in", "identification_required", "health_card_required", "phone_required", "cost", "age_range", "geographic_eligibility", "population_restrictions", "wheelchair_accessible", "languages", "delivery_mode", "intoxication_restrictions", "sobriety_requirements", "pets", "transportation"])
export function barrierFact(value = "unknown", evidence = []) { return { value: value === undefined || value === null || value === "" ? "unknown" : value, evidence: evidence.slice(0, 10), confidence: evidence.length ? "bounded" : "unknown", freshness: evidence[0]?.retrievedAt || null } }
export function normalizeBarrierProfile(input = {}) { return Object.fromEntries(BARRIER_FIELDS.map((field) => [field, barrierFact(input[field]?.value ?? input[field], input[field]?.evidence || [])])) }
export function extractExplicitBarrierIntent(query) { const text = String(query || ""); return { noId: /\b(?:no|don['’]t have) (?:government )?id\b/i.test(text), noPhone: /\b(?:no|don['’]t have) (?:a )?phone\b/i.test(text), walkInNeeded: /\b(?:walk in|walk-in|without an appointment)\b/i.test(text), wheelchair: /\bwheelchair\b/i.test(text), cannotPay: /\b(?:can['’]t|cannot|unable to) pay|\bfree counselling\b/i.test(text) } }
export function barrierCompatibility(profile, intent) {
  const checks = []
  const add = (active, field, incompatible) => { if (!active) return; const fact = profile[field] || barrierFact(); checks.push({ field, status: fact.value === "unknown" ? "unknown" : incompatible(fact.value) ? "known_incompatible" : "known_compatible", fact }) }
  add(intent.noId, "identification_required", (v) => v === true || v === "required")
  add(intent.noPhone, "phone_required", (v) => v === true || v === "required")
  add(intent.walkInNeeded, "walk_in", (v) => v === false || v === "not_accepted")
  add(intent.wheelchair, "wheelchair_accessible", (v) => v === false || v === "not_accessible")
  add(intent.cannotPay, "cost", (v) => !["free", 0, "no_cost"].includes(v))
  return { checks, overall: checks.some((x) => x.status === "known_incompatible") ? "known_incompatible" : checks.length && checks.every((x) => x.status === "known_compatible") ? "known_compatible" : "unknown" }
}
