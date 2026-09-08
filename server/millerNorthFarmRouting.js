export const MILLER_NORTH_FARM_ROUTE_VERSION = "miller-north-farm-routing-v1"

const ROUTES = Object.freeze({
  structured_field_present: { worker: "deterministic_classifier", review: "automatic", reason: "Structured public evidence is already explicit." },
  explicit_phrase_match: { worker: "deterministic_classifier", review: "automatic", reason: "A versioned rule can retain the supporting phrase." },
  bounded_classification: { worker: "qwen_local_light", review: "evidence_threshold", reason: "Local structured extraction can propose a label while deterministic validation retains control." },
  ambiguous_classification: { worker: "qwen_local_review", review: "owner_or_stronger_reviewer", reason: "Ambiguity or disagreement requires review rather than silent acceptance." },
  event_reconciliation: { worker: "deterministic_event_reconciler_then_qwen", review: "owner_required_for_merge", reason: "Identity facts and fingerprints lead; a model may only suggest." },
  accountability_link: { worker: "deterministic_linker_then_qwen", review: "owner_required", reason: "A link is interpretive and must remain a proposal." },
  material_change: { worker: "deterministic_fingerprint_and_field_diff", review: "owner_if_material", reason: "Hash and field comparisons suppress repeat work; material interpretation remains reviewed." },
  query_expansion: { worker: "deterministic_aliases_optional_qwen", review: "deterministic_ranking", reason: "A model may add bounded concepts but cannot invent evidence or set final rank." },
  obscure_discovery_or_conflict: { worker: "bounded_stronger_research", review: "owner_required", reason: "Use stronger research only when local and deterministic stages cannot resolve a material gap." },
})

export function routeMillerNorthFarmTask(task) {
  if (!ROUTES[task]) throw new Error("miller_north_farm_route_unknown")
  return { version: MILLER_NORTH_FARM_ROUTE_VERSION, task, ...ROUTES[task], raw_evidence_write: false, publication_write: false }
}

export function millerNorthFarmRoutingTable() {
  return Object.keys(ROUTES).map(routeMillerNorthFarmTask)
}
